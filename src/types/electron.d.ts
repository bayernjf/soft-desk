import type { Software, RadialOpenPayload, RadialMenuConfig, RadialRenderItem } from './index';

export interface BatchLaunchItem {
  path: string;
  success: boolean;
  error?: string;
}

export interface BatchLaunchResult {
  results: BatchLaunchItem[];
  launched: number;
  failed: number;
}

export interface DailyUsageStat {
  softwareId: string;
  date: string;
  launchCount: number;
  usageTime: number;
}

export interface WindowPrefsInput {
  startMinimized?: boolean;
  minimizeToTray?: boolean;
}

export interface CoUsagePair {
  a: string;
  b: string;
  count: number;
}

export type TimeSegment = 'morning' | 'afternoon' | 'evening' | 'night';

export interface SegmentCoUsage {
  segment: TimeSegment;
  /** 该时段内的会话总数(反映该时段活跃度) */
  sessionCount: number;
  /** 该时段内按共现次数降序的软件对 */
  pairs: CoUsagePair[];
}

export interface HourlyUsage {
  /** 0-23 */
  hour: number;
  /** 该小时累计使用分钟数 */
  minutes: number;
  /** 该小时的会话数 */
  sessionCount: number;
}

export interface SegmentUsageByApp {
  softwareId: string;
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
  /** 全时段合计分钟数(降序排序依据) */
  total: number;
}

export interface AiTestInput {
  provider?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

export interface AiTestResult {
  success: boolean;
  error?: string;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompleteInput {
  messages: AiChatMessage[];
  maxTokens?: number;
  temperature?: number;
  expectJson?: boolean;
}

export type AiCompleteResult =
  | { success: true; content: string }
  | { success: false; error: string };

export interface AiSuggestAppInput {
  id: string;
  name: string;
  category: string;
  usageMinutes: number;
}

export interface AiWorkflowSuggestion {
  name: string;
  description: string;
  softwareIds: string[];
  reason: string;
}

export interface AiSearchCandidate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export interface AiSemanticSearchInput {
  query: string;
  candidates: AiSearchCandidate[];
}

export interface AiSemanticSearchStreamInput {
  /** 标识本次流式搜索,渲染层据此只消费属于自己的增量 */
  streamId: string;
  query: string;
  candidates: AiSearchCandidate[];
}

export interface AiSearchStreamDelta {
  streamId: string;
  /** 模型正文增量(含最终 JSON,UI 一般不直接展示) */
  content?: string;
  /** 模型思考过程增量(reasoning_content),用于实时展示思考 */
  reasoning?: string;
}

export interface AiSemanticSearchResult {
  /** 按相关度排序的软件 id;null 表示无模型/失败,调用方应回退本地匹配 */
  ids: string[] | null;
}

export interface AuthProfile {
  userId: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  avatar: number;
  plan: 'free' | 'pro';
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthSession {
  loggedIn: boolean;
  profile?: AuthProfile;
}

export type AuthResult =
  | { success: true; profile: AuthProfile }
  | { success: false; error: string };

/**
 * 主进程 electron-updater 推送给渲染层的更新事件。
 * 与 electron/updater.ts 里的 UpdaterEvent 保持字段一致。
 */
export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseDate?: string; releaseNotes?: string }
  | { type: 'not-available'; version: string }
  | { type: 'error'; message: string }
  | {
      type: 'progress';
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { type: 'downloaded'; version: string; releaseDate?: string; releaseNotes?: string };

export type UpdaterCheckResult =
  | { ok: false; reason: 'dev-mode' | 'unavailable' | 'error'; message?: string }
  | {
      ok: true;
      currentVersion: string;
      latestVersion: string | null;
      hasUpdate: boolean;
    };

export interface UpdaterStatus {
  currentVersion: string;
  downloadInProgress: boolean;
  updateReady: boolean;
  devMode: boolean;
}

export interface SoftdeskBridge {
  scanSoftware: (smartGrouping?: boolean) => Promise<Software[]>;
  launchSoftware: (
    appPath: string,
    softwareId?: string
  ) => Promise<{ success: boolean; error?: string }>;
  launchBatch: (appPaths: string[]) => Promise<BatchLaunchResult>;
  removeSoftware: (appPath: string) => Promise<{ success: boolean; error?: string }>;
  openUserData: () => Promise<{ success: boolean }>;
  /** 同步窗口行为偏好(启动时最小化 / 最小化到托盘)到主进程并持久化 */
  syncSettings: (prefs: WindowPrefsInput) => Promise<{ success: boolean }>;
  getUsageStats: (period: 'day' | 'week' | 'month' | 'all') => Promise<DailyUsageStat[]>;
  /** 基于 sessions 共现分析的软件对(降序),用于生成工作流建议 */
  getSuggestions: () => Promise<CoUsagePair[]>;
  /** 按时段(早上/下午/晚上/深夜)拆分的共现分析,用于场景化工作流推荐 */
  getSegmentSuggestions: () => Promise<SegmentCoUsage[]>;
  /** 全天 24 小时活跃节律(每小时使用时长与会话数),用于统计页节律图 */
  getHourlyUsage: (windowDays?: number) => Promise<HourlyUsage[]>;
  /** 每个软件在四时段的使用时长分布,用于统计页堆叠条形图 */
  getSegmentByApp: (windowDays?: number) => Promise<SegmentUsageByApp[]>;
  /** 测试 AI provider 连通性(主进程对 OpenAI 兼容接口发最小请求) */
  testAiProvider: (input: AiTestInput) => Promise<AiTestResult>;
  /** 把含 apiKey 的 provider 列表同步到主进程并落盘,推理在主进程发起 */
  syncAiProviders: (providers: unknown) => Promise<{ success: boolean; error?: string }>;
  /** 启动时读取主进程落盘的 provider 列表回填 store(主进程为唯一权威数据源) */
  getAiProviders: () => Promise<{ providers: unknown[] }>;
  /** 通用推理:用当前启用的 provider 发起一次对话补全 */
  completeAi: (input: AiCompleteInput) => Promise<AiCompleteResult>;
  /** 主动请求 AI 生成工作流建议(主进程合并共现统计后送模型) */
  suggestWorkflows: (input: {
    apps: AiSuggestAppInput[];
  }) => Promise<{ suggestions: AiWorkflowSuggestion[] }>;
  /** 自然语言语义搜索:返回按相关度排序的软件 id(null 表示回退本地匹配) */
  semanticSearch: (input: AiSemanticSearchInput) => Promise<AiSemanticSearchResult>;
  /** 流式自然语言语义搜索:实时通过 onSearchStreamDelta 推送思考增量,最终返回软件 id */
  semanticSearchStream: (
    input: AiSemanticSearchStreamInput
  ) => Promise<AiSemanticSearchResult>;
  /** 监听流式语义搜索的思考增量,返回取消监听函数 */
  onSearchStreamDelta: (callback: (delta: AiSearchStreamDelta) => void) => () => void;
  /** 查询当前是否有启用且配置完整的 AI 模型 */
  hasAiProvider: () => Promise<{ hasProvider: boolean }>;
  /** 生成软件核心功能简介 */
  generateDescription: (input: {
    name: string;
    bundleId: string;
    category: string;
  }) => Promise<{ description: string | null }>;
  /** 智能推荐:基于需求语义 + 用户画像 + 活跃应用 */
  recommendApps: (input: {
    query?: string;
    apps: { id: string; name: string; category: string; aiDescription?: string; usageMinutes: number }[];
    profile: { topApps: string[]; frequentPairs: { a: string; b: string; count: number }[]; activeApps: string[] };
  }) => Promise<{
    recommendations: { id: string; reason: string; type: 'query' | 'behavior' | 'workflow' | 'complement' }[];
  }>;
  /** 邮箱+密码注册账号;成功返回脱敏资料,Token 由主进程加密落盘 */
  registerAccount: (input: {
    email: string;
    password: string;
    nickname?: string;
  }) => Promise<AuthResult>;
  /** 邮箱+密码登录;成功返回脱敏资料 */
  loginAccount: (input: { email: string; password: string }) => Promise<AuthResult>;
  /** 退出登录,清除本机加密 Token */
  logoutAccount: () => Promise<{ success: boolean }>;
  /** 查询当前登录态与脱敏资料(渲染层无法拿到明文 Token) */
  getAuthSession: () => Promise<AuthSession>;
  /** 获取当前用户的 Supabase JWT Token(用于渲染层设置 Supabase 会话) */
  getAuthTokens: () => Promise<{ accessToken: string; refreshToken: string } | null>;
  /** 更新用户资料(昵称/头像) */
  updateProfile: (input: { nickname?: string; avatar?: number }) => Promise<AuthResult>;
  toggleMaximize: () => Promise<{ maximized: boolean }>;
  /** 监听由托盘菜单或全局快捷键触发的"打开快速启动器"事件,返回取消监听函数 */
  onOpenLauncher: (callback: () => void) => () => void;
  /** 监听 softdesk://share/:token 深链唤起事件,回调参数为分享 token */
  onDeepLink: (callback: (token: string) => void) => () => void;
  /** 拉取应用冷启动时若已有待处理的深链 token(避免渲染层未挂载时的事件丢失) */
  getPendingDeepLink: () => Promise<{ token: string | null }>;
  /** 监听主进程文件系统监听器(FSEvents)推送的"已安装软件发生变化"事件,返回取消监听函数 */
  onSoftwareChanged: (callback: (apps: Software[]) => void) => () => void;
  /** 监听由全局快捷键触发的"打开径向菜单"事件(带光标局部坐标与扇区配置),返回取消监听函数 */
  onOpenRadial: (callback: (payload: RadialOpenPayload) => void) => () => void;
  /** 径向菜单选中扇区后:启动单应用或整个工作流(只传 targetId,主进程映射白名单路径) */
  radialLaunch: (input: {
    type: 'app' | 'workflow';
    targetId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  /** 关闭(隐藏)径向菜单窗口 */
  radialClose: () => Promise<void>;
  /** 渲染层主动拉取当前径向菜单配置(冷启动兜底) */
  radialGetItems: () => Promise<RadialMenuConfig>;
  /** 渲染层查询当前最近使用 LRU 队列(已 resolve 成扇区项,顺序与运行时径向菜单一致) */
  radialGetRecent: () => Promise<RadialRenderItem[]>;
  /** 渲染层在径向菜单配置变更时把配置同步进主进程并落盘(热键/启用状态/扇区绑定) */
  radialSyncConfig: (
    config: RadialMenuConfig
  ) => Promise<{ success: boolean; error?: string; hotkeyRegistered?: boolean }>;
  /** 设置页"试一下":无视 enabled,在屏幕中央弹一次径向菜单预览 */
  radialPreview: () => Promise<{ success: boolean }>;
  /** 手动触发一次 electron-updater 检查更新 */
  checkForUpdates: () => Promise<UpdaterCheckResult>;
  /** 更新包已下载完成时,立刻退出并安装(Win 静默重启 / Mac 关闭后重开) */
  quitAndInstall: () => Promise<{ ok: boolean; reason?: string }>;
  /** 查询更新器当前状态(当前版本、是否在下载、是否已就绪、是否 dev 模式) */
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  /** 订阅更新器状态变化事件流,返回取消订阅函数 */
  onUpdaterEvent: (callback: (event: UpdaterEvent) => void) => () => void;
}

declare global {
  interface Window {
    softdesk?: SoftdeskBridge;
  }
}

export {};
