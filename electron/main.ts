import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, nativeImage, screen } from 'electron';
import path from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as childProcess from 'node:child_process';
import { scanInstalledApps, applyAiCategories, startAppWatcher, stopAppWatcher, type ScannedApp, type ScannedCategory } from './scanner';
import { startMonitor, stopMonitor } from './monitor';
import { getStats, getUsageSummary, getCoUsage, getCoUsageBySegment, getHourlyUsage, getSegmentUsageByApp, recordLaunch, closeDb } from './database';
import {
  syncProviders,
  getProviders,
  getActiveProvider,
  complete,
  classifyApps,
  suggestWorkflows,
  semanticSearch,
  semanticSearchStream,
  generateSoftwareDescription,
  recommendApps,
  type AiChatMessage,
  type SearchCandidate,
  type RecommendAppInput,
  type UserProfileInput,
} from './ai';
import { register as authRegister, login as authLogin, logout as authLogout, getSession as authGetSession, getTokens as authGetTokens, updateProfile as authUpdateProfile } from './auth';
import { getAppWindowBounds, warpCursor, focusExistingAppWindow } from './window-locator';
import { createLogger } from './lib/logger';
import { startAutoUpdater, stopAutoUpdater } from './updater';

const logger = createLogger('main');

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

// Windows 必须在 app.ready 之前设置 AppUserModelID,任务栏才会把窗口和 exe 正确关联,
// 否则会退回到 Electron 默认的 AUMID(electron.app.Electron),任务栏图标永远是 Electron 默认图。
// 取值与 package.json 里 build.appId 一致,保证与安装包/桌面快捷方式的 AUMID 匹配。
if (process.platform === 'win32') {
  app.setAppUserModelId('com.softdesk.app');
}

// 仅开发模式把 userData 重定向到项目目录,便于调试查看落盘数据;
// 打包模式必须使用 Electron 默认 userData(~/Library/Application Support/<productName>),
// 否则会指向只读的 app.asar 内部路径,导致 radial-config.json 等配置无法落盘,
// 进而出现"中键唤出径向菜单的开关重启后丢失/监听从不启动"的问题。
if (VITE_DEV_SERVER_URL) {
  app.setPath('userData', path.join(process.env.APP_ROOT, '.electron-data'));
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let radialWin: BrowserWindow | null = null;

// ============ softdesk:// 深链(分享导入) ============
// 客户端通过 `softdesk://share/:token` 唤起,主进程解析后把 token 推给渲染层。
// 渲染层未挂载(冷启动)时把 token 缓存到 pendingShareToken,渲染层挂载后主动拉取一次。
let pendingShareToken: string | null = null;

function parseShareToken(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const m = /^softdesk:\/\/share\/([A-Za-z0-9_-]{1,64})/i.exec(url.trim());
  return m ? m[1] : null;
}

function dispatchShareToken(token: string): void {
  // 关键: 任何路径都必须先判断 app.isReady()。
  // 冷启动路径 (macOS 双击深链) 会在 app ready 之前触发 open-url,
  // 此时直接调用 createWindow() 会抛出 "Cannot create BrowserWindow before app is ready"。
  // 正确姿势: 先把 token 缓存,等 app.whenReady() 内的初始化流程创建窗口后,
  // 再由 whenReady 尾部主动 flush 到渲染层。
  if (!app.isReady()) {
    pendingShareToken = token;
    return;
  }
  if (win && !win.isDestroyed()) {
    showWindow();
    win.webContents.send('deep-link:share', token);
  } else {
    // 主窗口尚未创建 (被托盘关闭状态下,通过深链再次唤起):
    // 缓存 token,新建窗口后再由渲染层拉取
    pendingShareToken = token;
    createWindow();
  }
}

// 窗口行为偏好,由渲染进程(设置页)通过 settings:sync 同步,并落盘持久化,
// 以便下次冷启动前(创建窗口时)即可读取 startMinimized。
interface WindowPrefs {
  startMinimized: boolean;
  minimizeToTray: boolean;
}

const DEFAULT_WINDOW_PREFS: WindowPrefs = {
  startMinimized: false,
  minimizeToTray: true,
};

let windowPrefs: WindowPrefs = { ...DEFAULT_WINDOW_PREFS };

function windowPrefsPath(): string {
  return path.join(app.getPath('userData'), 'window-prefs.json');
}

function loadWindowPrefs(): void {
  try {
    const raw = readFileSync(windowPrefsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WindowPrefs>;
    windowPrefs = {
      startMinimized:
        typeof parsed.startMinimized === 'boolean'
          ? parsed.startMinimized
          : DEFAULT_WINDOW_PREFS.startMinimized,
      minimizeToTray:
        typeof parsed.minimizeToTray === 'boolean'
          ? parsed.minimizeToTray
          : DEFAULT_WINDOW_PREFS.minimizeToTray,
    };
  } catch {
    // 首次启动或文件损坏,沿用默认值
  }
}

function persistWindowPrefs(): void {
  try {
    writeFileSync(windowPrefsPath(), JSON.stringify(windowPrefs), 'utf-8');
  } catch {
    // 落盘失败不阻断主流程
  }
}

// 主进程可访问的 SoftDesk 品牌图标(dev/打包两种模式下都能命中):
// - dev: APP_ROOT = 项目根,直接读 build/icon.png
// - 打包: files 白名单已把 build/icon.* 打进 app.asar,APP_ROOT 指向 asar 根,同样可读
function resolveBrandIconPath(): string {
  const root = process.env.APP_ROOT ?? path.join(__dirname, '..');
  return path.join(root, 'build', 'icon.png');
}

function resolveMacTrayTemplatePath(): string {
  const root = process.env.APP_ROOT ?? path.join(__dirname, '..');
  // Prefer @2x (44x44) on Retina displays; Electron auto-picks best representation when
  // both files live side by side with Apple's "@2x" suffix convention.
  const scale = screen.getPrimaryDisplay().scaleFactor || 1;
  if (scale >= 2) {
    const hi = path.join(root, 'build', 'trayTemplate@2x.png');
    if (existsSync(hi)) return hi;
  }
  return path.join(root, 'build', 'trayTemplate.png');
}

function createTrayIcon(): Electron.NativeImage {
  if (process.platform === 'darwin') {
    // macOS 菜单栏使用黑色单色 template PNG(带透明通道):
    // - 由 scripts/build-tray-icon.mjs 预生成 build/trayTemplate.png 与 @2x 版本,
    //   纯 Node (zlib + 软件光栅化),无外部依赖。
    // - setTemplateImage(true) 后系统按菜单栏深浅自动渲染为白色/黑色,
    //   深色菜单栏下即显示白色图标,与 Wi-Fi/电池等系统图标一致。
    const tplPath = resolveMacTrayTemplatePath();
    const tpl = nativeImage.createFromPath(tplPath);
    if (!tpl.isEmpty()) {
      tpl.setTemplateImage(true);
      return tpl;
    }
  }
  const iconPath = resolveBrandIconPath();
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    return nativeImage.createEmpty();
  }
  return img.resize({ width: 32, height: 32 });
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
  win?.webContents.send('launcher:open', undefined);
}

// ============ 径向菜单(Radial Menu) ============
// 渲染层(settings.store)resolve 后通过 radial:syncConfig 把完整配置(含 path/icon)
// 同步进来并落盘;热键唤出时下发剔除 path 的展示项,启动时用 path 经白名单二次校验。

interface RadialSyncItem {
  slot: number;
  type: 'app' | 'workflow';
  targetId: string;
  name: string;
  icon?: string;
  color?: string;
  appPath?: string;
  workflowPaths?: string[];
  /** 跨设备本机不可用(未安装等):渲染层灰显,启动时拒绝 */
  unavailable?: boolean;
  /** 仅 appCatalog 项使用:用于按最近使用倒序选取 top-N */
  lastUsed?: string;
}

interface RadialConfigState {
  enabled: boolean;
  hotkey: string;
  mouseWheelToggle: boolean;
  sectors: number;
  items: RadialSyncItem[];
  /** 是否启用「最近使用」页 */
  showRecent: boolean;
  /** 视觉风格(透传给径向窗口);未知值会被重置为 'default' */
  style: 'default' | 'glass' | 'neumorph' | 'neon' | 'material' | 'minimal';
  /** 全量可用应用目录(仅 showRecent=true 时由渲染层下发),供 open 时挑 top-N */
  appCatalog: RadialSyncItem[];
}

const VALID_RADIAL_STYLES: RadialConfigState['style'][] = [
  'default',
  'glass',
  'neumorph',
  'neon',
  'material',
  'minimal',
];

function normalizeRadialStyle(raw: unknown): RadialConfigState['style'] {
  return typeof raw === 'string' &&
    (VALID_RADIAL_STYLES as string[]).includes(raw)
    ? (raw as RadialConfigState['style'])
    : 'default';
}

const DEFAULT_RADIAL_CONFIG: RadialConfigState = {
  enabled: false,
  hotkey: 'CommandOrControl+Shift+R',
  mouseWheelToggle: false,
  sectors: 6,
  items: [],
  showRecent: false,
  style: 'default',
  appCatalog: [],
};

let radialConfig: RadialConfigState = { ...DEFAULT_RADIAL_CONFIG };
let radialRegisteredHotkey: string | null = null;
// 记录最近一次唤出径向菜单时光标所在显示器的 id。启动软件后据此判断:
// 若目标软件的已有窗口在其它显示器,则把光标移到该显示器中央;若就在本显示器则不动。
let radialTriggerDisplayId: number | null = null;

function radialConfigPath(): string {
  return path.join(app.getPath('userData'), 'radial-config.json');
}

function loadRadialConfig(): void {
  try {
    const raw = readFileSync(radialConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RadialConfigState>;
    radialConfig = {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_RADIAL_CONFIG.enabled,
      hotkey: typeof parsed.hotkey === 'string' && parsed.hotkey ? parsed.hotkey : DEFAULT_RADIAL_CONFIG.hotkey,
      mouseWheelToggle:
        typeof parsed.mouseWheelToggle === 'boolean'
          ? parsed.mouseWheelToggle
          : DEFAULT_RADIAL_CONFIG.mouseWheelToggle,
      sectors: typeof parsed.sectors === 'number' ? parsed.sectors : DEFAULT_RADIAL_CONFIG.sectors,
      items: Array.isArray(parsed.items) ? (parsed.items as RadialSyncItem[]) : [],
      showRecent: typeof parsed.showRecent === 'boolean' ? parsed.showRecent : DEFAULT_RADIAL_CONFIG.showRecent,
      style: normalizeRadialStyle(parsed.style),
      appCatalog: Array.isArray(parsed.appCatalog) ? (parsed.appCatalog as RadialSyncItem[]) : [],
    };
  } catch {
    // 首次启动或文件损坏,沿用默认值
  }
}

function persistRadialConfig(): void {
  try {
    writeFileSync(radialConfigPath(), JSON.stringify(radialConfig), 'utf-8');
  } catch {
    // 落盘失败不阻断主流程
  }
}

// 按当前 radialConfig.enabled/hotkey 注册或反注册全局热键;返回热键是否处于已注册状态
function applyRadialHotkey(): boolean {
  // 先清掉旧的 radial 热键,再按需重注册
  if (radialRegisteredHotkey && globalShortcut.isRegistered(radialRegisteredHotkey)) {
    globalShortcut.unregister(radialRegisteredHotkey);
  }
  radialRegisteredHotkey = null;
  if (!radialConfig.enabled) return true;
  try {
    const ok = globalShortcut.register(radialConfig.hotkey, () => openRadial());
    if (ok) {
      radialRegisteredHotkey = radialConfig.hotkey;
      return true;
    }
    logger.error('radial hotkey register failed (occupied):', radialConfig.hotkey);
    return false;
  } catch (err) {
    logger.error('radial hotkey register error:', err);
    return false;
  }
}

// ——— 鼠标中键(滚轮键)全局监听:uiohook-napi 原生模块,需 macOS 辅助功能权限 ———
// 懒加载:仅在首次需要时 require,加载失败(模块缺失/ABI 不匹配)静默降级为不支持。
type UiohookModule = {
  uIOhook: {
    on: (event: 'mousedown', cb: (e: { button: unknown }) => void) => void;
    start: () => void;
    stop: () => void;
  };
};

// libuiohook 的鼠标按键编号:1=左键 2=右键 3=中键(滚轮键)。
// 注意 uiohook-napi 并不导出 UiohookMouseButton 常量,只能用裸数值判断。
const UIOHOOK_MOUSE_BUTTON_MIDDLE = 3;
// 中键去抖窗口(ms):规避 uiohook-napi 在 macOS 上对单次中键重复派发的问题。
const MIDDLE_CLICK_DEBOUNCE_MS = 250;
let lastMiddleClickAt = 0;
let uiohook: UiohookModule | null = null;
let uiohookLoaded = false;
let uiohookListening = false;
let mouseListenerBound = false;

function loadUiohook(): UiohookModule | null {
  if (uiohookLoaded) return uiohook;
  uiohookLoaded = true;
  try {
    // 用动态 require 避免打包期解析;external 已声明 uiohook-napi
    const req = createRequire(import.meta.url);
    uiohook = req('uiohook-napi') as UiohookModule;
  } catch (err) {
    logger.error('load uiohook-napi failed (鼠标中键唤出不可用):', err);
    uiohook = null;
  }
  return uiohook;
}

// 按 enabled + mouseWheelToggle 启停鼠标中键监听
function applyRadialMouse(): void {
  const want = radialConfig.enabled && radialConfig.mouseWheelToggle;
  const mod = want ? loadUiohook() : uiohook;
  if (!mod) return;

  if (want && !uiohookListening) {
    if (!mouseListenerBound) {
      // 重要:此回调运行在 uiohook-napi 的 tsfn 调用栈里。一旦在此抛出异常,
      // uiohook-napi 会直接 abort 整个进程(FATAL: tsfn_to_js_proxy)。
      // 因此这里必须绝不抛异常,且把真正的工作(openRadial 涉及 Electron API)
      // 用 setImmediate 推迟到下一个事件循环 tick,彻底脱离 tsfn 栈。
      mod.uIOhook.on('mousedown', (e) => {
        try {
          if (Number(e.button) !== UIOHOOK_MOUSE_BUTTON_MIDDLE) return;
          if (!radialConfig.enabled || !radialConfig.mouseWheelToggle) return;
          // uiohook-napi 在 macOS 上会把一次中键按下重复派发两个 mousedown
          // (间隔约 100ms),导致径向菜单"额外弹出一次"。这里做去抖:
          // 250ms 内的重复中键事件只响应第一次。
          const now = Date.now();
          if (now - lastMiddleClickAt < MIDDLE_CLICK_DEBOUNCE_MS) return;
          lastMiddleClickAt = now;
          setImmediate(() => {
            try {
              openRadial();
            } catch (err) {
              logger.error('openRadial from mouse failed:', err);
            }
          });
        } catch {
          // 回调内绝不允许异常逃逸到 napi 层
        }
      });
      mouseListenerBound = true;
    }
    try {
      mod.uIOhook.start();
      uiohookListening = true;
      logger.info('uiohook started (鼠标中键监听已开启)');
    } catch (err) {
      logger.error('uiohook start failed:', err);
    }
  } else if (!want && uiohookListening) {
    try {
      mod.uIOhook.stop();
    } catch (err) {
      logger.error('uiohook stop failed:', err);
    }
    uiohookListening = false;
  }
}

// ============ 前台应用 LRU(最近使用页数据源) ============
// 每 ACTIVE_WIN_POLL_MS 跑一次 macOS 内置 `lsappinfo front` + `lsappinfo info -only bundlepath`,
// 拿到当前前台应用的 .app 路径。lsappinfo 是系统自带工具,无需任何权限、不弹辅助功能授权窗,
// 进程开销极低(单次约 5ms)。若路径与队列头不同,unshift 进 LRU,同应用连续聚焦不重复入队。
const ACTIVE_WIN_POLL_MS = 1500;
const LRU_MAX = 16;
let activeWinTimer: ReturnType<typeof setInterval> | null = null;
let lastForegroundPath: string | null = null;
/** LRU 队列:队首=刚切到/正在用的应用,队尾=最久未使用 */
let recentLru: string[] = [];

/** 调用 macOS lsappinfo 取得当前前台应用的 .app bundle 路径。失败返回 null。 */
function getForegroundAppPath(): Promise<string | null> {
  return new Promise((resolve) => {
    // 一步到位:取出 front ASN 的 LSBundlePath 字段
    const child = childProcess.spawn(
      '/bin/sh',
      ['-c', 'lsappinfo info -only bundlepath "$(lsappinfo front)"'],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      // 输出形如:  "LSBundlePath"="/Applications/Foo.app"
      const m = /"LSBundlePath"="([^"]+)"/.exec(stdout);
      resolve(m ? m[1] : null);
    });
  });
}

/** 把一个前台 path 推进 LRU。不在 appCatalog 中的路径(SoftDesk 不识别)直接忽略。 */
function pushRecent(rawPath: string | null | undefined): void {
  if (!rawPath) return;
  // 兼容 .app/Contents/MacOS/xxx 类可执行路径,截回到 .app bundle 路径
  const m = /^(.+?\.app)(\/|$)/.exec(rawPath);
  const appPath = m ? m[1] : rawPath;

  // 必须在 appCatalog 中(SoftDesk 扫描到 + 可用)才计入
  const known = radialConfig.appCatalog.some((it) => it.appPath === appPath);
  if (!known) return;

  if (recentLru[0] === appPath) return;
  recentLru = [appPath, ...recentLru.filter((p) => p !== appPath)];
  if (recentLru.length > LRU_MAX) recentLru.length = LRU_MAX;
}

async function pollActiveWindow(): Promise<void> {
  try {
    const fgPath = await getForegroundAppPath();
    if (fgPath && fgPath !== lastForegroundPath) {
      lastForegroundPath = fgPath;
      pushRecent(fgPath);
    }
  } catch (err) {
    logger.error('lsappinfo poll error:', err);
  }
}

/** 按 showRecent 启停前台轮询。关闭时清空队列(无意义保留)。 */
function applyRadialRecentWatcher(): void {
  const want = radialConfig.enabled && radialConfig.showRecent;
  if (want && !activeWinTimer) {
    void pollActiveWindow();
    activeWinTimer = setInterval(() => {
      void pollActiveWindow();
    }, ACTIVE_WIN_POLL_MS);
    logger.info('radial recent watcher started');
  } else if (!want && activeWinTimer) {
    clearInterval(activeWinTimer);
    activeWinTimer = null;
    recentLru = [];
    lastForegroundPath = null;
    logger.info('radial recent watcher stopped');
  }
}

function loadRadialWindow(w: BrowserWindow): void {
  if (VITE_DEV_SERVER_URL) {
    w.loadURL(new URL('radial.html', VITE_DEV_SERVER_URL).toString());
  } else {
    w.loadFile(path.join(RENDERER_DIST, 'radial.html'));
  }
}

function createRadialWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !SANDBOX_DISABLED,
    },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  // skipTransformProcessType: true 关键——默认调用会把整个 app 的进程类型在
  // ForegroundApplication ↔ UIElementApplication(accessory)之间切换。一旦 app 变成
  // UIElementApplication 类型,主窗口就不再被 macOS 台前调度(Stage Manager)纳管堆叠。
  // 这里跳过进程类型转换,保持 app 始终为 ForegroundApplication,使主窗口正常参与台前调度。
  w.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  // 失焦即隐藏(点击其它应用/桌面时收起)
  w.on('blur', () => hideRadial());
  loadRadialWindow(w);
  return w;
}

function hideRadial(): void {
  if (radialWin && !radialWin.isDestroyed()) {
    radialWin.hide();
  }
}

// 下发给渲染层的展示项:剔除 path(渲染层只需 name/icon/color + targetId/type)
function radialRenderItems() {
  return radialConfig.items.map((it) => ({
    slot: it.slot,
    type: it.type,
    targetId: it.targetId,
    name: it.name,
    icon: it.icon,
    color: it.color,
    unavailable: it.unavailable,
  }));
}

/** 构造「最近使用」页:
 *  数据源 = LRU 队列(前台应用切换记录),队首 = 当前/最新一次聚焦的应用。
 *  - slot 0(12 点钟)= 队首 = 正在/刚切到的应用;
 *  - slot 1..N-1 顺时针 = 之前依次使用过的应用;
 *  - LRU 不足 sectors 个时返回少于 sectors 的列表(渲染层留白);
 *  - 队列里的 appPath 必须能在 appCatalog 找到,否则跳过(应用已被 SoftDesk 删除/卸载)。 */
function radialRecentItems() {
  if (!radialConfig.showRecent || recentLru.length === 0) return [];
  const items: ReturnType<typeof radialRenderItems> = [];
  for (const appPath of recentLru) {
    if (items.length >= radialConfig.sectors) break;
    const entry = radialConfig.appCatalog.find((it) => it.appPath === appPath);
    if (!entry) continue;
    items.push({
      slot: items.length,
      type: 'app',
      targetId: entry.targetId,
      name: entry.name,
      icon: entry.icon,
      color: entry.color,
      unavailable: entry.unavailable,
    });
  }
  return items;
}

function openRadial(atCenter = false): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  // 记录唤出时光标所在显示器,供 radial:launch 后判断目标软件窗口是否需要跨屏移动光标
  radialTriggerDisplayId = display.id;

  if (!radialWin || radialWin.isDestroyed()) {
    radialWin = createRadialWindow();
  }
  radialWin.setBounds({ x, y, width, height });

  const localCursor = atCenter
    ? { x: Math.round(width / 2), y: Math.round(height / 2) }
    : { x: cursor.x - x, y: cursor.y - y };
  const send = () => {
    radialWin?.webContents.send('radial:open', {
      cursor: localCursor,
      sectors: radialConfig.sectors,
      items: radialRenderItems(),
      showRecent: radialConfig.showRecent,
      recentItems: radialRecentItems(),
      style: radialConfig.style,
    });
  };

  radialWin.showInactive();
  radialWin.focus();

  if (radialWin.webContents.isLoading()) {
    radialWin.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

/**
 * 跨屏移动光标时的爆炸效果:
 * - 预创建一个固定大小的透明置顶窗口(500x500)
 * - 到达目标位置后播放小球膨胀爆炸动画
 * - 颜色:白/橙黄中心 -> 粉 -> 紫边缘(logo 色系)
 */
class AnimationCursor {
  private win: Electron.BrowserWindow | null = null;
  private ready = false;
  private readonly size = 500;

  /** 预创建窗口,应用启动时调用一次 */
  async init(): Promise<void> {
    if (this.win) return;
    try {
      this.win = new BrowserWindow({
        x: -10000, y: -10000,
        width: this.size, height: this.size,
        frame: false, transparent: true, alwaysOnTop: true,
        skipTaskbar: true, resizable: false, movable: false,
        focusable: false, hasShadow: false, roundedCorners: false,
        show: false, backgroundColor: '#00000000',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      this.win.setAlwaysOnTop(true, 'screen-saver');
      this.win.setIgnoreMouseEvents(true);

      if (VITE_DEV_SERVER_URL) {
        await this.win.loadURL(new URL('animation.html', VITE_DEV_SERVER_URL).toString());
      } else {
        await this.win.loadFile(path.join(RENDERER_DIST, 'animation.html'));
      }
      this.ready = true;
      logger.info('animation cursor window initialized');
    } catch (err) {
      logger.error('animation init failed:', err);
      this.ready = false;
    }
  }

  /**
   * 在目标位置播放爆炸动画。
   * 窗口中心对齐到 (screenX, screenY)。
   */
  async explodeAt(screenX: number, screenY: number, durationMs = 400): Promise<void> {
    if (!this.win || !this.ready) return;

    const half = this.size / 2;
    this.win.setBounds({
      x: Math.round(screenX - half),
      y: Math.round(screenY - half),
      width: this.size,
      height: this.size,
    });
    this.win.showInactive();

    // 给 compositor 一点时间确保窗口可见
    await new Promise((r) => setTimeout(r, 50));

    // 播放爆炸(窗口中心)
    this.win.webContents.executeJavaScript(
      `window.__animation && window.__animation.explodeAt(${half}, ${half}, ${durationMs})`
    ).catch((err) => logger.error('explodeAt failed:', err));

    // 等动画结束
    await new Promise((r) => setTimeout(r, durationMs + 100));

    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }
}

let animationCursor: AnimationCursor | null = null;

/**
 * 通过径向菜单启动某软件后调用:
 * - 若该软件已有可见窗口且窗口所在显示器与唤出径向菜单时光标所在显示器不同,
 *   把光标移到目标窗口所在显示器的中央(方便用户立刻在该屏继续操作);
 * - 若窗口就在唤出时的同一显示器(或软件未运行/无窗口/无法定位),光标保持不动。
 * triggerDisplayId 为唤出径向菜单那一刻记录的显示器 id。
 * 软件刚被 open 时窗口可能尚未创建,这里带几次轮询重试等待窗口出现。
 */
async function relocateCursorToAppWindow(
  appPath: string,
  triggerDisplayId: number | null
): Promise<void> {
  if (process.platform !== 'darwin' || triggerDisplayId == null) return;

  let bounds: Awaited<ReturnType<typeof getAppWindowBounds>> = null;
  // 启动已运行应用通常立刻有窗口;冷启动的应用窗口可能延迟出现,重试若干次。
  for (let attempt = 0; attempt < 6; attempt++) {
    bounds = await getAppWindowBounds(appPath);
    if (bounds) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!bounds) return;

  const windowCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const targetDisplay = screen.getDisplayNearestPoint(windowCenter);
  // 窗口已在唤出径向菜单时所在的显示器:无需移动光标
  if (targetDisplay.id === triggerDisplayId) return;

  const { x, y, width, height } = targetDisplay.workArea;
  const targetX = x + width / 2;
  const targetY = y + height / 2;
  const cursor = screen.getCursorScreenPoint();
  const cursorDisplay = screen.getDisplayNearestPoint(cursor);

  // 光标移动和爆炸效果各自独立,同时启动,不互相等待
  // 若鼠标当前已在目标屏幕,则不再强制移动到屏幕中心
  if (cursorDisplay.id !== targetDisplay.id) {
    warpCursor(targetX, targetY, { animate: true, fromX: cursor.x, fromY: cursor.y, durationMs: 50 }).catch(() => {});
  }
  if (animationCursor) {
    animationCursor.explodeAt(targetX, targetY, 500).catch(() => {});
  }
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
    backgroundColor: '#161618',
    show: !windowPrefs.startMinimized,
    titleBarStyle: 'hiddenInset',
    // Windows/Linux 通过窗口 icon 决定任务栏初始图标(macOS 走 .icns,不需要这里指定)
    icon: resolveBrandIconPath(),
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

  // 点击关闭按钮:开启"最小化到托盘"时隐藏到托盘而非退出;关闭该偏好时直接退出应用
  win.on('close', (event) => {
    if (isQuitting) return;
    if (windowPrefs.minimizeToTray) {
      event.preventDefault();
      win?.hide();
    } else {
      // 未开启最小化到托盘:关窗即退出整个应用(含 macOS)
      isQuitting = true;
      app.quit();
    }
  });
}

ipcMain.handle('software:scan', async (_event, smartGrouping?: boolean) => {
  if (typeof smartGrouping === 'boolean') {
    lastSmartGrouping = smartGrouping;
  }
  return scanWithUsage();
});

// 维护一份合法 app 路径白名单,launch/remove 仅允许操作扫描得到的真实应用,
// 防止渲染进程被注入后传入任意路径启动/删除文件
const knownAppPaths = new Set<string>();

function normalizeAppPathKey(p: string): string {
  // Windows 文件系统对大小写不敏感（NTFS 也默认不区分），路径大小写在不同
  // 数据源（注册表 / .lnk / DisplayIcon）之间常常混杂，这里统一小写做 key。
  // macOS 保留原路径大小写以匹配 case-sensitive 卷。
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

// 记录最近一次渲染层传入的"智能分类"开关,供 FSEvents 监听到变化后的重扫沿用
let lastSmartGrouping = true;

// 记录已用 AI 兜底分类过的应用 id,避免同一会话内对同一应用反复调用模型(省钱)
const aiClassifiedIds = new Set<string>();

function isAllowedAppPath(appPath: unknown): appPath is string {
  return typeof appPath === 'string' && knownAppPaths.has(normalizeAppPathKey(appPath));
}

/**
 * 启动或聚焦一个已授权的应用路径。
 *
 * 平台差异:
 * - macOS: `shell.openPath` 底层走 LaunchServices,若目标 .app 已运行,LS 会自动
 *   把已有实例切到前台(等价于 Dock 点击),因此不需要额外聚焦逻辑。
 * - Windows: `shell.openPath` 相当于 ShellExecute `open` 动词,对绝大部分应用等于
 *   "运行一次 exe",默认会另起进程/窗口。要复用已有实例必须先通过 user32 的
 *   SetForegroundWindow / SwitchToThisWindow 把主窗口切到前台,拿不到窗口(未运行
 *   或纯托盘应用)时才回退到 openPath。
 *
 * 返回同 shell.openPath 一致的字符串(空串代表成功,非空为错误信息),方便调用方复用。
 */
async function launchOrFocusApp(appPath: string): Promise<string> {
  if (process.platform === 'win32') {
    try {
      const result = await focusExistingAppWindow(appPath);
      if (result.activated) return '';
      // running===true 但 activated===false 时,通常是纯托盘/无窗口应用,再走 openPath
      // 让应用自己处理"二次启动"(多数会显示托盘菜单或还原主窗口)。
    } catch (err) {
      logger.error('focusExistingAppWindow error, fallback to openPath:', err);
    }
  }
  return shell.openPath(appPath);
}

/**
 * 对规则判不出(categorySource==='default')且尚未 AI 分类过的应用,批量送模型兜底分类。
 * 仅在存在启用的 AI provider 且开启智能分类时触发;结果写回扫描缓存并就地修正本次返回值。
 * 任何失败都静默回退(保留 utilities),不阻断扫描主流程。
 */
async function classifyUncategorized(apps: ScannedApp[]): Promise<ScannedApp[]> {
  if (!lastSmartGrouping || !getActiveProvider()) return apps;

  const pending = apps.filter(
    (a) => a.categorySource === 'default' && !aiClassifiedIds.has(a.id)
  );
  if (pending.length === 0) return apps;

  try {
    const mapping = await classifyApps(
      pending.map((a) => ({
        id: a.id,
        name: a.name,
        bundleId: a.bundleId,
        description: a.description,
      }))
    );
    for (const a of pending) aiClassifiedIds.add(a.id);
    if (Object.keys(mapping).length === 0) {
      logger.info(`AI classify: ${pending.length} 个待分类应用，模型未返回有效结果`);
      return apps;
    }

    logger.info(
      `AI classify: ${pending.length} 个待分类，命中 ${Object.keys(mapping).length} 个`,
      mapping
    );
    await applyAiCategories(mapping as Record<string, ScannedCategory>);
    return apps.map((a) => {
      const next = mapping[a.id];
      if (next && a.categorySource === 'default') {
        return { ...a, category: next, categorySource: 'ai' as const };
      }
      return a;
    });
  } catch (err) {
    logger.error('AI classify failed:', err);
    return apps;
  }
}

async function scanWithUsage(): Promise<ScannedApp[]> {
  const apps = await scanInstalledApps(lastSmartGrouping);
  knownAppPaths.clear();
  for (const a of apps) knownAppPaths.add(normalizeAppPathKey(a.path));
  const classified = await classifyUncategorized(apps);
  let summary: ReturnType<typeof getUsageSummary> = [];
  try {
    summary = getUsageSummary();
  } catch (dbErr) {
    logger.error('getUsageSummary failed:', dbErr);
  }
  const byId = new Map(summary.map((s) => [s.softwareId, s]));
  return classified.map((appItem) => {
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

// 返回基于 sessions 共现分析的软件对(降序),供 Dashboard 生成工作流建议
ipcMain.handle('usage:getSuggestions', async () => {
  try {
    return getCoUsage();
  } catch (err) {
    logger.error('getCoUsage failed:', err);
    return [];
  }
});

// 返回按时段(早上/下午/晚上/深夜)拆分的共现分析,供 Dashboard 做场景化工作流推荐
ipcMain.handle('usage:getSegmentSuggestions', async () => {
  try {
    return getCoUsageBySegment();
  } catch (err) {
    logger.error('getCoUsageBySegment failed:', err);
    return [];
  }
});

// 返回近 windowDays 天的全天 24 小时活跃节律(每小时使用时长与会话数),供统计页节律图
ipcMain.handle('usage:getHourlyUsage', async (_event, windowDays?: unknown) => {
  try {
    const days = typeof windowDays === 'number' && windowDays > 0 ? windowDays : 30;
    return getHourlyUsage(days);
  } catch (err) {
    logger.error('getHourlyUsage failed:', err);
    return [];
  }
});

// 返回每个软件在四时段的使用时长分布,供统计页"软件活跃时段"堆叠条形图
ipcMain.handle('usage:getSegmentByApp', async (_event, windowDays?: unknown) => {
  try {
    const days = typeof windowDays === 'number' && windowDays > 0 ? windowDays : 30;
    return getSegmentUsageByApp(days);
  } catch (err) {
    logger.error('getSegmentUsageByApp failed:', err);
    return [];
  }
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

// 径向菜单关闭(隐藏)
ipcMain.handle('radial:close', () => {
  hideRadial();
});

// 设置页"试一下":无视 enabled,在当前光标所在显示器的中央弹一次径向菜单预览
ipcMain.handle('radial:preview', () => {
  openRadial(true);
  return { success: true };
});

// 渲染层主动拉取当前配置(冷启动兜底):只回展示项,不含 path
ipcMain.handle('radial:getItems', () => ({
  enabled: radialConfig.enabled,
  hotkey: radialConfig.hotkey,
  sectors: radialConfig.sectors,
  items: radialRenderItems(),
}));

// 渲染层查询当前 LRU 最近使用队列(供设置面板的预览面板使用)
// 返回值与运行时径向菜单的 recentItems 完全一致(同序、同结构)
ipcMain.handle('radial:getRecent', () => radialRecentItems());

// 渲染层在配置变更时把 resolve 后的完整配置(含 path/icon)同步进来:缓存 + 落盘 + 重注册热键
ipcMain.handle('radial:syncConfig', (_event, raw: unknown) => {
  if (!raw || typeof raw !== 'object') return { success: false, error: '无效配置' };
  const input = raw as Partial<RadialConfigState>;
  radialConfig = {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : radialConfig.enabled,
    hotkey: typeof input.hotkey === 'string' && input.hotkey ? input.hotkey : radialConfig.hotkey,
    mouseWheelToggle:
      typeof input.mouseWheelToggle === 'boolean'
        ? input.mouseWheelToggle
        : radialConfig.mouseWheelToggle,
    sectors: typeof input.sectors === 'number' ? input.sectors : radialConfig.sectors,
    items: Array.isArray(input.items) ? (input.items as RadialSyncItem[]) : [],
    showRecent: typeof input.showRecent === 'boolean' ? input.showRecent : radialConfig.showRecent,
    style: input.style !== undefined ? normalizeRadialStyle(input.style) : radialConfig.style,
    // appCatalog 仅在 showRecent=true 时由渲染层下发;关闭则清空以节省落盘体积
    appCatalog:
      typeof input.showRecent === 'boolean' && !input.showRecent
        ? []
        : Array.isArray(input.appCatalog)
          ? (input.appCatalog as RadialSyncItem[])
          : radialConfig.appCatalog,
  };
  persistRadialConfig();
  const hotkeyRegistered = applyRadialHotkey();
  applyRadialMouse();
  applyRadialRecentWatcher();
  return { success: true, hotkeyRegistered };
});

// 径向菜单选中扇区后启动:只接受 targetId,主进程用同步进来的 path 并经扫描白名单二次校验
ipcMain.handle('radial:launch', async (_event, raw: unknown) => {
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    type?: 'app' | 'workflow';
    targetId?: string;
  };
  // 在隐藏窗口前抓取唤出时的显示器 id(hideRadial 不会改它,但用局部变量更稳妥)
  const triggerDisplayId = radialTriggerDisplayId;
  hideRadial();

  const item =
    radialConfig.items.find(
      (it) => it.type === input.type && it.targetId === input.targetId
    ) ??
    // 兜底:最近使用页的扇区项不在 items 里,但会出现在 appCatalog
    (input.type === 'app'
      ? radialConfig.appCatalog.find((it) => it.targetId === input.targetId)
      : undefined);
  if (!item) return { success: false, error: '未找到对应扇区配置' };
  if (item.unavailable) return { success: false, error: '该软件在本设备不可用' };

  if (item.type === 'app') {
    const appPath = item.appPath;
    if (!isAllowedAppPath(appPath)) {
      return { success: false, error: '无效或未授权的软件路径' };
    }
    const error = await launchOrFocusApp(appPath);
    if (error) return { success: false, error };
    if (item.targetId.length > 0 && item.targetId.length <= 256) {
      try {
        recordLaunch(item.targetId, todayKey());
      } catch (dbErr) {
        logger.error('recordLaunch failed:', dbErr);
      }
    }
    // 主动把该应用推到 LRU 队首,避免等下一次 active-win 轮询(1.5s)才反映出来
    pushRecent(appPath);
    // 若该软件已有窗口且不在唤出径向菜单的那块显示器,把光标移到目标窗口所在显示器中央
    void relocateCursorToAppWindow(appPath, triggerDisplayId);
    return { success: true };
  }

  // workflow:逐个启动(过滤白名单)并间隔 400ms,与 software:launchBatch 行为一致
  const paths = (item.workflowPaths ?? []).filter((p): p is string => isAllowedAppPath(p));
  let launched = 0;
  for (let i = 0; i < paths.length; i++) {
    const error = await launchOrFocusApp(paths[i]);
    if (!error) launched++;
    if (i < paths.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return { success: launched > 0, error: launched === 0 ? '工作流内无可启动的应用' : undefined };
});

ipcMain.handle('software:launch', async (_event, appPath: string, softwareId?: string) => {
  if (!isAllowedAppPath(appPath)) {
    return { success: false, error: '无效或未授权的软件路径' };
  }
  const error = await launchOrFocusApp(appPath);
  if (error) {
    return { success: false, error };
  }
  if (typeof softwareId === 'string' && softwareId.length > 0 && softwareId.length <= 256) {
    try {
      recordLaunch(softwareId, todayKey());
    } catch (dbErr) {
      logger.error('recordLaunch failed:', dbErr);
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
    const error = await launchOrFocusApp(appPath);
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

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    return { success: false, error: 'Invalid URL' };
  }
  await shell.openExternal(url);
  return { success: true };
});

// 测试 AI provider 连通性:对 OpenAI 兼容接口发一个最小 /chat/completions 请求,
// 由主进程发出,避免渲染层 CORS 限制且不在页面暴露 apiKey。
interface AiTestInput {
  provider?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

function joinChatCompletionsUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) return base;
  return `${base}/chat/completions`;
}

ipcMain.handle('ai:test', async (_event, raw: unknown) => {
  const input = (raw && typeof raw === 'object' ? raw : {}) as AiTestInput;
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const model = typeof input.model === 'string' ? input.model.trim() : '';

  if (!endpoint) return { success: false, error: '请填写 Endpoint' };
  if (!apiKey) return { success: false, error: '请填写 API Key' };
  if (!model) return { success: false, error: '请填写模型 ID' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(joinChatCompletionsUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      return { success: true };
    }

    let detail = '';
    try {
      const data = (await res.json()) as { error?: { message?: string }; message?: string };
      detail = data?.error?.message || data?.message || '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    return {
      success: false,
      error: `HTTP ${res.status}${detail ? `：${String(detail).slice(0, 200)}` : ''}`,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? '请求超时（20s）'
          : err.message
        : '请求失败';
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
});

// 渲染层在 AI provider 配置变更时,把含 apiKey 的完整列表同步进主进程并落盘;
// 之后所有业务推理在主进程发起,apiKey 不再随业务 IPC 往返暴露给页面。
ipcMain.handle('ai:syncProviders', (_event, raw: unknown) => {
  try {
    syncProviders(raw);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '同步失败' };
  }
});

// 渲染层启动时读取主进程落盘的 provider 列表回填 store(主进程是唯一权威数据源),
// 避免因 localStorage 按 origin 隔离/被清空而丢失配置。
ipcMain.handle('ai:getProviders', () => {
  try {
    return { providers: getProviders() };
  } catch {
    return { providers: [] };
  }
});

// 通用推理入口:用当前启用的 provider 发起一次对话补全,返回文本(无 provider 时报错)。
ipcMain.handle('ai:complete', async (_event, raw: unknown) => {
  const config = getActiveProvider();
  if (!config) return { success: false, error: '未配置或未启用 AI 模型' };
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    messages?: AiChatMessage[];
    maxTokens?: number;
    temperature?: number;
    expectJson?: boolean;
  };
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    return { success: false, error: '缺少 messages' };
  }
  return complete(config, {
    messages: input.messages,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    expectJson: input.expectJson,
  });
});

// 主动触发 AI 工作流建议:汇总已安装应用 + 共现统计后送模型,返回结构化建议(无 provider 返回空)。
ipcMain.handle('ai:suggestWorkflows', async (_event, raw: unknown) => {
  if (!getActiveProvider()) return { suggestions: [] };
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    apps?: { id: string; name: string; category: string; usageMinutes: number }[];
  };
  const apps = Array.isArray(input.apps) ? input.apps : [];
  if (apps.length < 2) return { suggestions: [] };
  let coUsage: ReturnType<typeof getCoUsage> = [];
  try {
    coUsage = getCoUsage();
  } catch {
    coUsage = [];
  }
  let segments: ReturnType<typeof getCoUsageBySegment> = [];
  try {
    segments = getCoUsageBySegment();
  } catch {
    segments = [];
  }
  const suggestions = await suggestWorkflows(apps, coUsage, segments);
  return { suggestions };
});

// 报告当前是否有启用的 AI 模型,供渲染层决定是否展示 AI 入口
ipcMain.handle('ai:hasProvider', () => {
  return { hasProvider: getActiveProvider() !== null };
});

// 生成软件核心功能简介;无启用模型/失败时返回 { description: null }
ipcMain.handle('ai:generateDescription', async (_event, raw: unknown) => {
  if (!getActiveProvider()) return { description: null };
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    name?: string;
    bundleId?: string;
    category?: string;
  };
  const name = typeof input.name === 'string' ? input.name : '';
  const bundleId = typeof input.bundleId === 'string' ? input.bundleId : '';
  const category = typeof input.category === 'string' ? input.category : '';
  if (!name) return { description: null };
  const description = await generateSoftwareDescription(name, bundleId, category);
  return { description };
});

// 智能推荐:基于需求语义 + 用户画像 + 活跃应用，返回推荐软件列表
ipcMain.handle('ai:recommend', async (_event, raw: unknown) => {
  if (!getActiveProvider()) return { recommendations: [] };
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    query?: string;
    apps?: RecommendAppInput[];
    profile?: UserProfileInput;
  };
  const apps = Array.isArray(input.apps) ? input.apps : [];
  const profile = input.profile ?? { topApps: [], frequentPairs: [], activeApps: [] };
  const recommendations = await recommendApps(input.query, apps, profile);
  return { recommendations };
});

// 自然语言语义搜索:把查询 + 精简候选送模型,返回按相关度排序的软件 id;
// 无启用模型 / 失败时返回 { ids: null },由渲染层回退到本地字面匹配。
ipcMain.handle('ai:semanticSearch', async (_event, raw: unknown) => {
  if (!getActiveProvider()) return { ids: null };
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    query?: string;
    candidates?: SearchCandidate[];
  };
  const query = typeof input.query === 'string' ? input.query : '';
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (!query.trim() || candidates.length === 0) return { ids: null };
  const ids = await semanticSearch(query, candidates);
  return { ids };
});

// 流式语义搜索:边推理边把模型思考增量(reasoning/content)通过 'ai:searchStream:delta'
// 推回发起的渲染进程,最终返回相关软件 id;无启用模型/失败时返回 { ids: null }。
// streamId 用于渲染层区分并发的多次搜索,只消费属于自己的增量。
ipcMain.handle('ai:semanticSearchStream', async (event, raw: unknown) => {
  if (!getActiveProvider()) return { ids: null };
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    streamId?: string;
    query?: string;
    candidates?: SearchCandidate[];
  };
  const streamId = typeof input.streamId === 'string' ? input.streamId : '';
  const query = typeof input.query === 'string' ? input.query : '';
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (!streamId || !query.trim() || candidates.length === 0) return { ids: null };

  const sender = event.sender;
  const ids = await semanticSearchStream(query, candidates, (chunk) => {
    if (sender.isDestroyed()) return;
    sender.send('ai:searchStream:delta', {
      streamId,
      content: chunk.content,
      reasoning: chunk.reasoning,
    });
  });
  return { ids };
});

// 渲染进程(设置页)同步窗口行为偏好;落盘后下次冷启动即可在 createWindow 前读取
ipcMain.handle('settings:sync', (_event, prefs: unknown) => {
  if (!prefs || typeof prefs !== 'object') {
    return { success: false };
  }
  const next = prefs as Partial<WindowPrefs>;
  if (typeof next.startMinimized === 'boolean') {
    windowPrefs.startMinimized = next.startMinimized;
  }
  if (typeof next.minimizeToTray === 'boolean') {
    windowPrefs.minimizeToTray = next.minimizeToTray;
  }
  persistWindowPrefs();
  return { success: true };
});

// 账号登录(邮箱/密码):凭证校验、密码哈希、Token 加密落盘均在主进程完成,
// 渲染层只拿到登录态与脱敏资料(见 Technical-Architecture.md §6.5)。
ipcMain.handle('auth:register', (_event, raw: unknown) => {
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    email?: string;
    password?: string;
    nickname?: string;
  };
  return authRegister(input.email, input.password, input.nickname);
});

ipcMain.handle('auth:login', (_event, raw: unknown) => {
  const input = (raw && typeof raw === 'object' ? raw : {}) as {
    email?: string;
    password?: string;
  };
  return authLogin(input.email, input.password);
});

ipcMain.handle('auth:logout', async () => {
  await authLogout();
  return { success: true };
});

ipcMain.handle('auth:getSession', async () => {
  return authGetSession();
});

ipcMain.handle('auth:getTokens', () => {
  return authGetTokens();
});

ipcMain.handle('auth:updateProfile', (_event, raw: unknown) => {
  const input = (raw && typeof raw === 'object' ? raw : {}) as { nickname?: string; avatar?: number };
  return authUpdateProfile(input);
});

// 渲染层挂载后主动拉取:如果冷启动带了 softdesk:// 深链,这里把 token 取回并清空
ipcMain.handle('deep-link:getPending', () => {
  const token = pendingShareToken;
  pendingShareToken = null;
  return { token };
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

// 单实例锁(Single Instance Lock):防止用户双击 Dock 图标 / 从两处不同路径
// 启动 SoftDesk 时出现多进程并存(共用同一份 userData 会导致 LevelDB 锁冲突
// 直至 SIGTRAP 崩溃)。第二个实例启动时:
//   1. requestSingleInstanceLock() 返回 false → 立刻 app.quit() 退出
//   2. 已运行的首实例收到 'second-instance' 事件 → 唤起主窗口
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // 用户再次启动 / 双击 Dock 图标时,把已有主窗口拉回前台
    // Windows / Linux 上深链会作为命令行参数传入,遍历找到 softdesk:// 协议参数
    const linkArg = argv.find((a) => typeof a === 'string' && a.startsWith('softdesk://'));
    const token = parseShareToken(linkArg);
    if (token) {
      dispatchShareToken(token);
    } else {
      showWindow();
    }
  });
}

// macOS 下双击 softdesk:// 链接会走 open-url 事件(而非命令行参数)
app.on('open-url', (event, url) => {
  event.preventDefault();
  const token = parseShareToken(url);
  if (token) dispatchShareToken(token);
});

app.whenReady().then(() => {
  // 显式锁定为常规(ForegroundApplication)激活策略:这是 macOS 台前调度
  // (Stage Manager)纳管 app 窗口的前提。防止 radialWin 等浮层窗口的副作用
  // 把 app 漂移成 accessory(UIElementApplication)类型而脱离台前调度堆叠。
  if (process.platform === 'darwin') {
    app.setActivationPolicy('regular');
  }
  // 注册 softdesk:// 协议为本应用默认打开处理器
  // 开发模式下 Electron 二进制无法直接绑定协议,需要额外传入 exec path + argv
  try {
    if (VITE_DEV_SERVER_URL && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('softdesk', process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient('softdesk');
    }
  } catch (err) {
    logger.error('setAsDefaultProtocolClient failed:', err);
  }
  // Windows/Linux 冷启动时,深链会直接作为进程 argv 传入,这里解析一次
  const initialLinkArg = process.argv.find(
    (a) => typeof a === 'string' && a.startsWith('softdesk://')
  );
  const initialToken = parseShareToken(initialLinkArg);
  if (initialToken) {
    pendingShareToken = initialToken;
  }
  loadWindowPrefs();
  loadRadialConfig();
  createWindow();
  createTray();
  globalShortcut.register('CommandOrControl+Shift+Space', openLauncher);
  applyRadialHotkey();
  applyRadialMouse();
  applyRadialRecentWatcher();
  startMonitor();
  // 预创建动画光标窗口(后台加载,不阻塞启动)
  animationCursor = new AnimationCursor();
  animationCursor.init().catch((err) => {
    logger.error('animationCursor init failed (non-fatal):', err);
  });
  // FSEvents 监听应用目录的安装/卸载,变化时重扫(命中缓存极快)并推送给渲染进程
  startAppWatcher(async () => {
    try {
      const apps = await scanWithUsage();
      win?.webContents.send('software:changed', apps);
    } catch (err) {
      logger.error('watcher rescan failed:', err);
    }
  });

  // 只有打包后的正式版才启用 electron-updater;dev 模式内部会短路。
  // 传入主窗口以便把 checking / progress / downloaded 事件推给渲染层。
  if (win) {
    startAutoUpdater(win).catch((err) => {
      logger.error('startAutoUpdater failed (non-fatal):', err);
    });
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (uiohookListening && uiohook) {
    try {
      uiohook.uIOhook.stop();
    } catch {
      // 退出时停止失败可忽略
    }
    uiohookListening = false;
  }
  if (radialWin && !radialWin.isDestroyed()) {
    radialWin.destroy();
    radialWin = null;
  }
  stopMonitor();
  stopAppWatcher();
  stopAutoUpdater();
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
