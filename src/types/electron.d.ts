import type { Software } from './index';

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

export interface AiSemanticSearchResult {
  /** 按相关度排序的软件 id;null 表示无模型/失败,调用方应回退本地匹配 */
  ids: string[] | null;
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
  /** 查询当前是否有启用且配置完整的 AI 模型 */
  hasAiProvider: () => Promise<{ hasProvider: boolean }>;
  toggleMaximize: () => Promise<{ maximized: boolean }>;
  /** 监听由托盘菜单或全局快捷键触发的"打开快速启动器"事件,返回取消监听函数 */
  onOpenLauncher: (callback: () => void) => () => void;
  /** 监听主进程文件系统监听器(FSEvents)推送的"已安装软件发生变化"事件,返回取消监听函数 */
  onSoftwareChanged: (callback: (apps: Software[]) => void) => () => void;
}

declare global {
  interface Window {
    softdesk?: SoftdeskBridge;
  }
}

export {};
