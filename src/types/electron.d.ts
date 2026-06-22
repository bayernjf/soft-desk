import type { Software } from './index';

export interface SoftdeskBridge {
  scanSoftware: () => Promise<Software[]>;
  launchSoftware: (appPath: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    softdesk?: SoftdeskBridge;
  }
}

export {};
