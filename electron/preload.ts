import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('softdesk', {
  scanSoftware: () => ipcRenderer.invoke('software:scan'),
  launchSoftware: (appPath: string, softwareId?: string) =>
    ipcRenderer.invoke('software:launch', appPath, softwareId),
  launchBatch: (appPaths: string[]) => ipcRenderer.invoke('software:launchBatch', appPaths),
  removeSoftware: (appPath: string) => ipcRenderer.invoke('software:remove', appPath),
  getUsageStats: (period: 'day' | 'week' | 'month') =>
    ipcRenderer.invoke('usage:getStats', period),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
});
