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
