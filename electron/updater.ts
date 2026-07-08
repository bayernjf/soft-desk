import { app, BrowserWindow, ipcMain } from 'electron';
import type { AppUpdater } from 'electron-updater';
import { createLogger } from './lib/logger';

const logger = createLogger('updater');

/**
 * 主进程 → 渲染进程推送的更新事件负载。
 * 与 preload.ts / electron.d.ts 里的 UpdaterEvent 一一对应。
 */
export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseDate?: string; releaseNotes?: string }
  | { type: 'not-available'; version: string }
  | { type: 'error'; message: string }
  | { type: 'progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string; releaseDate?: string; releaseNotes?: string };

/**
 * 定时检查间隔。首次检测在窗口 ready 之后 30s 触发（避免和冷启动扫描抢 CPU），
 * 之后每 6 小时再检测一次。这是 electron-updater 官方推荐的最低频次。
 */
const INITIAL_CHECK_DELAY_MS = 30 * 1000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let autoUpdater: AppUpdater | null = null;
let broadcastWindow: BrowserWindow | null = null;
let recheckTimer: NodeJS.Timeout | null = null;
let downloadInProgress = false;
let updateReady = false;
let ipcRegistered = false;

function broadcast(event: UpdaterEvent): void {
  if (!broadcastWindow || broadcastWindow.isDestroyed()) return;
  broadcastWindow.webContents.send('updater:event', event);
}

/**
 * 让 electron-updater 在开发模式下也能加载配置（默认它会短路掉）。
 * 我们只在 CI 打的正式包里跑更新逻辑，所以开发模式一律禁用。
 */
function isDevelopment(): boolean {
  return !app.isPackaged;
}

async function ensureAutoUpdater(): Promise<AppUpdater | null> {
  if (autoUpdater) return autoUpdater;
  try {
    // 动态 import 避免 dev 模式打包时把 electron-updater 拉进 renderer bundle。
    const mod = await import('electron-updater');
    autoUpdater = mod.autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (msg: unknown) => logger.info('electron-updater', msg),
      warn: (msg: unknown) => logger.warn('electron-updater', msg),
      error: (msg: unknown) => logger.error('electron-updater', msg),
      debug: () => {},
    };

    autoUpdater.on('checking-for-update', () => broadcast({ type: 'checking' }));
    autoUpdater.on('update-available', (info) => {
      downloadInProgress = true;
      broadcast({
        type: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes:
          typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    });
    autoUpdater.on('update-not-available', (info) => {
      broadcast({ type: 'not-available', version: info.version });
    });
    autoUpdater.on('error', (err) => {
      downloadInProgress = false;
      const message = err instanceof Error ? err.message : String(err);
      logger.error('autoUpdater error:', message);
      broadcast({ type: 'error', message });
    });
    autoUpdater.on('download-progress', (p) => {
      broadcast({
        type: 'progress',
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      downloadInProgress = false;
      updateReady = true;
      broadcast({
        type: 'downloaded',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes:
          typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    });

    return autoUpdater;
  } catch (err) {
    logger.error('load electron-updater failed:', err);
    return null;
  }
}

function registerIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle('updater:check', async () => {
    if (isDevelopment()) {
      return { ok: false, reason: 'dev-mode' as const };
    }
    const updater = await ensureAutoUpdater();
    if (!updater) return { ok: false, reason: 'unavailable' as const };
    try {
      const result = await updater.checkForUpdates();
      return {
        ok: true,
        currentVersion: app.getVersion(),
        latestVersion: result?.updateInfo?.version ?? null,
        hasUpdate: !!result?.updateInfo && result.updateInfo.version !== app.getVersion(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('manual check failed:', message);
      return { ok: false, reason: 'error' as const, message };
    }
  });

  ipcMain.handle('updater:quitAndInstall', async () => {
    if (!updateReady) {
      return { ok: false, reason: 'not-ready' as const };
    }
    const updater = await ensureAutoUpdater();
    if (!updater) return { ok: false, reason: 'unavailable' as const };
    // isSilent=true 让 NSIS 在 Windows 上静默重启；isForceRunAfter=true 确保
    // Mac 上重启后自动重新拉起 SoftDesk。
    updater.quitAndInstall(true, true);
    return { ok: true };
  });

  ipcMain.handle('updater:getStatus', async () => ({
    currentVersion: app.getVersion(),
    downloadInProgress,
    updateReady,
    devMode: isDevelopment(),
  }));
}

/**
 * 由 main 在 app.whenReady 之后调用一次。传入主窗口以便向渲染进程推送
 * 更新事件。dev 模式下会直接短路：只注册 IPC 让 UI 能读到 dev-mode 状态。
 */
export async function startAutoUpdater(window: BrowserWindow): Promise<void> {
  broadcastWindow = window;
  registerIpc();

  if (isDevelopment()) {
    logger.info('dev mode, skipping auto update check');
    return;
  }

  const updater = await ensureAutoUpdater();
  if (!updater) return;

  const runCheck = () => {
    updater
      .checkForUpdates()
      .catch((err) => logger.warn('auto check error (non-fatal):', err));
  };

  setTimeout(runCheck, INITIAL_CHECK_DELAY_MS);
  recheckTimer = setInterval(runCheck, RECHECK_INTERVAL_MS);
}

export function stopAutoUpdater(): void {
  if (recheckTimer) {
    clearInterval(recheckTimer);
    recheckTimer = null;
  }
  broadcastWindow = null;
}
