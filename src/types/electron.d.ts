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
  getUsageStats: (period: 'day' | 'week' | 'month') => Promise<DailyUsageStat[]>;
  toggleMaximize: () => Promise<{ maximized: boolean }>;
}

declare global {
  interface Window {
    softdesk?: SoftdeskBridge;
  }
}

export {};
