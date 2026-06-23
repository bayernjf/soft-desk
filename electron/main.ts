import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import path from 'node:path';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanInstalledApps, startAppWatcher, stopAppWatcher, type ScannedApp } from './scanner';
import { startMonitor, stopMonitor } from './monitor';
import { getStats, getUsageSummary, recordLaunch, closeDb } from './database';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

const PRELOAD_SOURCE = `"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("softdesk", {
  scanSoftware: () => ipcRenderer.invoke("software:scan"),
  launchSoftware: (appPath, softwareId) => ipcRenderer.invoke("software:launch", appPath, softwareId),
  launchBatch: (appPaths) => ipcRenderer.invoke("software:launchBatch", appPaths),
  removeSoftware: (appPath) => ipcRenderer.invoke("software:remove", appPath),
  openUserData: () => ipcRenderer.invoke("app:openUserData"),
  getUsageStats: (period) => ipcRenderer.invoke("usage:getStats", period),
  toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
  onOpenLauncher: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("launcher:open", handler);
    return () => ipcRenderer.removeListener("launcher:open", handler);
  },
  onSoftwareChanged: (callback) => {
    const handler = (_e, apps) => callback(apps);
    ipcRenderer.on("software:changed", handler);
    return () => ipcRenderer.removeListener("software:changed", handler);
  },
});
`;

function ensurePreload(): string {
  const preloadPath = path.join(__dirname, 'preload.runtime.cjs');
  fsSync.writeFileSync(preloadPath, PRELOAD_SOURCE, 'utf-8');
  return preloadPath;
}

app.commandLine.appendSwitch('no-sandbox');
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
      preload: ensurePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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

async function scanWithUsage(): Promise<ScannedApp[]> {
  const apps = await scanInstalledApps();
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
  if (!appPath || typeof appPath !== 'string') {
    return { success: false, error: 'invalid path' };
  }
  const error = await shell.openPath(appPath);
  if (error) {
    return { success: false, error };
  }
  if (softwareId) {
    recordLaunch(softwareId, todayKey());
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
    if (!appPath || typeof appPath !== 'string') {
      results.push({ path: String(appPath), success: false, error: 'invalid path' });
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
  if (!appPath || typeof appPath !== 'string') {
    return { success: false, error: '无效的软件路径' };
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
