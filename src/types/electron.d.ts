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

export interface SoftdeskBridge {
  scanSoftware: () => Promise<Software[]>;
  launchSoftware: (
    appPath: string,
    softwareId?: string
  ) => Promise<{ success: boolean; error?: string }>;
  launchBatch: (appPaths: string[]) => Promise<BatchLaunchResult>;
  removeSoftware: (appPath: string) => Promise<{ success: boolean; error?: string }>;
  openUserData: () => Promise<{ success: boolean }>;
  getUsageStats: (period: 'day' | 'week' | 'month' | 'all') => Promise<DailyUsageStat[]>;
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
