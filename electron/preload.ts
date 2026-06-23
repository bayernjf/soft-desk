import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('softdesk', {
  scanSoftware: () => ipcRenderer.invoke('software:scan'),
  launchSoftware: (appPath: string, softwareId?: string) =>
    ipcRenderer.invoke('software:launch', appPath, softwareId),
  launchBatch: (appPaths: string[]) => ipcRenderer.invoke('software:launchBatch', appPaths),
  removeSoftware: (appPath: string) => ipcRenderer.invoke('software:remove', appPath),
  openUserData: () => ipcRenderer.invoke('app:openUserData'),
  getUsageStats: (period: 'day' | 'week' | 'month' | 'all') =>
    ipcRenderer.invoke('usage:getStats', period),
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
