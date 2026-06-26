import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import { createLogger } from './lib/logger';

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
    backgroundColor: '#161618',
    show: !windowPrefs.startMinimized,
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

// 记录最近一次渲染层传入的"智能分类"开关,供 FSEvents 监听到变化后的重扫沿用
let lastSmartGrouping = true;

// 记录已用 AI 兜底分类过的应用 id,避免同一会话内对同一应用反复调用模型(省钱)
const aiClassifiedIds = new Set<string>();

function isAllowedAppPath(appPath: unknown): appPath is string {
  return typeof appPath === 'string' && knownAppPaths.has(appPath);
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
  for (const a of apps) knownAppPaths.add(a.path);
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
  loadWindowPrefs();
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
      logger.error('watcher rescan failed:', err);
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
