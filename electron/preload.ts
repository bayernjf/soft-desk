import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('softdesk', {
  scanSoftware: (smartGrouping?: boolean) => ipcRenderer.invoke('software:scan', smartGrouping),
  launchSoftware: (appPath: string, softwareId?: string) =>
    ipcRenderer.invoke('software:launch', appPath, softwareId),
  launchBatch: (appPaths: string[]) => ipcRenderer.invoke('software:launchBatch', appPaths),
  removeSoftware: (appPath: string) => ipcRenderer.invoke('software:remove', appPath),
  openUserData: () => ipcRenderer.invoke('app:openUserData'),
  syncSettings: (prefs: { startMinimized?: boolean; minimizeToTray?: boolean }) =>
    ipcRenderer.invoke('settings:sync', prefs),
  getUsageStats: (period: 'day' | 'week' | 'month' | 'all') =>
    ipcRenderer.invoke('usage:getStats', period),
  getSuggestions: () => ipcRenderer.invoke('usage:getSuggestions'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  onOpenLauncher: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('launcher:open', handler);
    return () => ipcRenderer.removeListener('launcher:open', handler);
  },
  onSoftwareChanged: (callback: (apps: unknown[]) => void) => {
    const handler = (_e: unknown, apps: unknown[]) => callback(apps);
    ipcRenderer.on('software:changed', handler);
    return () => ipcRenderer.removeListener('software:changed', handler);
  },
});
