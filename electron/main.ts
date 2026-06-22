import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanInstalledApps } from './scanner';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
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
      preload: path.join(__dirname, 'preload.js'),
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
  return scanInstalledApps();
});

ipcMain.handle('software:launch', async (_event, appPath: string) => {
  if (!appPath || typeof appPath !== 'string') {
    return { success: false, error: 'invalid path' };
  }
  const error = await shell.openPath(appPath);
  if (error) {
    return { success: false, error };
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

app.whenReady().then(createWindow);

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
