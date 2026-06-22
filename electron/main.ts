import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanInstalledApps } from './scanner';
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
  getUsageStats: (period) => ipcRenderer.invoke("usage:getStats", period),
  toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
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
}

ipcMain.handle('software:scan', async () => {
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
});

ipcMain.handle('usage:getStats', async (_event, period: 'day' | 'week' | 'month') => {
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
  startMonitor();
});

app.on('before-quit', () => {
  stopMonitor();
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
