import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanInstalledApps, startAppWatcher, stopAppWatcher, type ScannedApp } from './scanner';
import { startMonitor, stopMonitor } from './monitor';
import { getStats, getUsageSummary, recordLaunch, closeDb } from './database';

function todayKey(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');

// 默认启用 Chromium 沙箱(安全基线)。仅在 OS 沙箱无法初始化的受限/虚拟化环境中,
// 通过设置 SOFTDESK_NO_SANDBOX=1 临时关闭,避免开发时无法启动。
const SANDBOX_DISABLED = process.env.SOFTDESK_NO_SANDBOX === '1';
if (SANDBOX_DISABLED) {
  app.commandLine.appendSwitch('no-sandbox');
}

app.setPath('userData', path.join(process.env.APP_ROOT, '.electron-data'));

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const TRAY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 32 32" fill="none">
  <path d="M10 12L16 8L22 12L16 16L10 12Z" fill="black"/>
  <path d="M10 16L16 20L22 16" stroke="black" stroke-width="2" stroke-linecap="round" fill="none"/>
  <circle cx="16" cy="16" r="2" fill="black"/>
</svg>`;

function createTrayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(TRAY_ICON_SVG).toString('base64')}`
  );
  img.setTemplateImage(true);
  return img;
}

function showWindow(): void {
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function openLauncher(): void {
  showWindow();
  win?.webContents.send('launcher:open');
}

function buildTrayMenu(): Electron.Menu {
  return Menu.buildFromTemplate([
    { label: '显示 SoftDesk', click: showWindow },
    { label: '快速启动…', accelerator: 'CmdOrCtrl+Shift+Space', click: openLauncher },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray(): void {
  if (tray) return;
  tray = new Tray(createTrayIcon());
  tray.setToolTip('SoftDesk');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showWindow);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !SANDBOX_DISABLED,
    },
  });

  // 禁止页面打开新窗口/外链直接交给系统浏览器,并阻止应用内导航到外部地址
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = VITE_DEV_SERVER_URL ?? 'file://';
    if (!url.startsWith(allowed)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // 点击关闭按钮时隐藏到托盘而非退出(仅在用户未选择退出时)
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win?.hide();
    }
  });
}

ipcMain.handle('software:scan', async () => scanWithUsage());

// 维护一份合法 app 路径白名单,launch/remove 仅允许操作扫描得到的真实应用,
// 防止渲染进程被注入后传入任意路径启动/删除文件
const knownAppPaths = new Set<string>();

function isAllowedAppPath(appPath: unknown): appPath is string {
  return typeof appPath === 'string' && knownAppPaths.has(appPath);
}

async function scanWithUsage(): Promise<ScannedApp[]> {
  const apps = await scanInstalledApps();
  knownAppPaths.clear();
  for (const a of apps) knownAppPaths.add(a.path);
  let summary: ReturnType<typeof getUsageSummary> = [];
  try {
    summary = getUsageSummary();
  } catch (dbErr) {
    console.error('[softdesk] getUsageSummary failed:', dbErr);
  }
  const byId = new Map(summary.map((s) => [s.softwareId, s]));
  return apps.map((appItem) => {
    const usage = byId.get(appItem.id);
    if (!usage) return appItem;
    return {
      ...appItem,
      usageMinutes: Math.round(usage.usageTime / 60),
      launchCount: usage.launchCount,
      lastUsed: usage.lastUsed || appItem.lastUsed,
    };
  });
}

ipcMain.handle('usage:getStats', async (_event, period: 'day' | 'week' | 'month' | 'all') => {
  return getStats(period ?? 'week');
});

// 切换窗口最大化/还原(maximize 是填满工作区,非全屏 fullscreen),供顶部拖拽区双击调用
ipcMain.handle('window:toggleMaximize', () => {
  if (!win) return { maximized: false };
  if (win.isMaximized()) {
    win.unmaximize();
    return { maximized: false };
  }
  win.maximize();
  return { maximized: true };
});

ipcMain.handle('software:launch', async (_event, appPath: string, softwareId?: string) => {
  if (!isAllowedAppPath(appPath)) {
    return { success: false, error: '无效或未授权的软件路径' };
  }
  const error = await shell.openPath(appPath);
  if (error) {
    return { success: false, error };
  }
  if (typeof softwareId === 'string' && softwareId.length > 0 && softwareId.length <= 256) {
    try {
      recordLaunch(softwareId, todayKey());
    } catch (dbErr) {
      console.error('[softdesk] recordLaunch failed:', dbErr);
    }
  }
  return { success: true };
});

ipcMain.handle('software:launchBatch', async (_event, appPaths: string[]) => {
  if (!Array.isArray(appPaths)) {
    return { results: [], launched: 0, failed: 0 };
  }

  const results: { path: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < appPaths.length; i++) {
    const appPath = appPaths[i];
    if (!isAllowedAppPath(appPath)) {
      results.push({ path: String(appPath), success: false, error: '无效或未授权的软件路径' });
      continue;
    }
    const error = await shell.openPath(appPath);
    results.push(error ? { path: appPath, success: false, error } : { path: appPath, success: true });

    if (i < appPaths.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  return {
    results,
    launched: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };
});

ipcMain.handle('app:openUserData', async () => {
  await shell.openPath(app.getPath('userData'));
  return { success: true };
});

ipcMain.handle('software:remove', async (_event, appPath: string) => {
  if (!isAllowedAppPath(appPath)) {
    return { success: false, error: '无效或未授权的软件路径' };
  }
  try {
    await shell.trashItem(appPath);
    return { success: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const isPermission = /permission|许可|权限|not permitted|operation not permitted/i.test(raw);
    return {
      success: false,
      error: isPermission
        ? '没有系统权限移到废纸篓。请到「设置 → 帮助」按步骤为 SoftDesk 开启「App 管理 / 完全磁盘访问」权限。'
        : `移到废纸篓失败：${raw}`,
    };
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  globalShortcut.register('CommandOrControl+Shift+Space', openLauncher);
  startMonitor();
  // FSEvents 监听应用目录的安装/卸载,变化时重扫(命中缓存极快)并推送给渲染进程
  startAppWatcher(async () => {
    try {
      const apps = await scanWithUsage();
      win?.webContents.send('software:changed', apps);
    } catch (err) {
      console.error('[softdesk] watcher rescan failed:', err);
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  stopMonitor();
  stopAppWatcher();
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  showWindow();
});
