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
  getSegmentSuggestions: () => ipcRenderer.invoke('usage:getSegmentSuggestions'),
  getHourlyUsage: (windowDays?: number) => ipcRenderer.invoke('usage:getHourlyUsage', windowDays),
  getSegmentByApp: (windowDays?: number) => ipcRenderer.invoke('usage:getSegmentByApp', windowDays),
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
  semanticSearchStream: (input: {
    streamId: string;
    query: string;
    candidates: { id: string; name: string; description?: string; category?: string; tags?: string[] }[];
  }) => ipcRenderer.invoke('ai:semanticSearchStream', input),
  onSearchStreamDelta: (
    callback: (delta: { streamId: string; content?: string; reasoning?: string }) => void
  ) => {
    const handler = (
      _e: unknown,
      delta: { streamId: string; content?: string; reasoning?: string }
    ) => callback(delta);
    ipcRenderer.on('ai:searchStream:delta', handler);
    return () => ipcRenderer.removeListener('ai:searchStream:delta', handler);
  },
  hasAiProvider: () => ipcRenderer.invoke('ai:hasProvider'),
  generateDescription: (input: { name: string; bundleId: string; category: string }) =>
    ipcRenderer.invoke('ai:generateDescription', input),
  recommendApps: (input: {
    query?: string;
    apps: { id: string; name: string; category: string; aiDescription?: string; usageMinutes: number }[];
    profile: { topApps: string[]; frequentPairs: { a: string; b: string; count: number }[]; activeApps: string[] };
  }) => ipcRenderer.invoke('ai:recommend', input),
  registerAccount: (input: { email: string; password: string; nickname?: string }) =>
    ipcRenderer.invoke('auth:register', input),
  loginAccount: (input: { email: string; password: string }) =>
    ipcRenderer.invoke('auth:login', input),
  logoutAccount: () => ipcRenderer.invoke('auth:logout'),
  getAuthSession: () => ipcRenderer.invoke('auth:getSession'),
  getAuthTokens: () => ipcRenderer.invoke('auth:getTokens'),
  updateProfile: (input: { nickname?: string; avatar?: number }) =>
    ipcRenderer.invoke('auth:updateProfile', input),
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
  onOpenRadial: (
    callback: (payload: {
      cursor: { x: number; y: number };
      sectors: number;
      items: unknown[];
    }) => void
  ) => {
    const handler = (
      _e: unknown,
      payload: { cursor: { x: number; y: number }; sectors: number; items: unknown[] }
    ) => callback(payload);
    ipcRenderer.on('radial:open', handler);
    return () => ipcRenderer.removeListener('radial:open', handler);
  },
  radialLaunch: (input: { type: 'app' | 'workflow'; targetId: string }) =>
    ipcRenderer.invoke('radial:launch', input),
  radialClose: () => ipcRenderer.invoke('radial:close'),
  radialGetItems: () => ipcRenderer.invoke('radial:getItems'),
  radialSyncConfig: (config: unknown) => ipcRenderer.invoke('radial:syncConfig', config),
  radialPreview: () => ipcRenderer.invoke('radial:preview'),
});
