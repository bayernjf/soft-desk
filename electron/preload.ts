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
  testAiProvider: (input: {
    provider?: string;
    endpoint?: string;
    apiKey?: string;
    model?: string;
  }) => ipcRenderer.invoke('ai:test', input),
  syncAiProviders: (providers: unknown) => ipcRenderer.invoke('ai:syncProviders', providers),
  getAiProviders: () => ipcRenderer.invoke('ai:getProviders'),
  completeAi: (input: {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    maxTokens?: number;
    temperature?: number;
    expectJson?: boolean;
  }) => ipcRenderer.invoke('ai:complete', input),
  suggestWorkflows: (input: {
    apps: { id: string; name: string; category: string; usageMinutes: number }[];
  }) => ipcRenderer.invoke('ai:suggestWorkflows', input),
  semanticSearch: (input: {
    query: string;
    candidates: { id: string; name: string; description?: string; category?: string; tags?: string[] }[];
  }) => ipcRenderer.invoke('ai:semanticSearch', input),
  hasAiProvider: () => ipcRenderer.invoke('ai:hasProvider'),
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
