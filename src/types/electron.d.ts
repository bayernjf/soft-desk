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

export interface SoftdeskBridge {
  scanSoftware: () => Promise<Software[]>;
  launchSoftware: (appPath: string) => Promise<{ success: boolean; error?: string }>;
  launchBatch: (appPaths: string[]) => Promise<BatchLaunchResult>;
}

declare global {
  interface Window {
    softdesk?: SoftdeskBridge;
  }
}

export {};
