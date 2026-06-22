import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('softdesk', {
  scanSoftware: () => ipcRenderer.invoke('software:scan'),
  launchSoftware: (appPath: string) => ipcRenderer.invoke('software:launch', appPath),
});
