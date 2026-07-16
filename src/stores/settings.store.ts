import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  buildApiKeyHint,
  normalizeProvider,
  type AiProviderConfig,
  type AiProviderInput,
} from '@/data/aiProviders';
import { useAuthStore } from '@/stores/auth.store';
import { syncAiConfigsToCloud, fetchCloudAiConfigs, mergeWithLocal } from '@/services/ai-configs.service';
import {
  syncRadialConfigToCloud,
  fetchCloudRadialConfig,
  mergeRadialConfig,
} from '@/services/radial-config.service';
import type { RadialMenuConfig, RadialItem } from '@/types';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppPreferences {
  startMinimized: boolean;
  minimizeToTray: boolean;
  autoUpdates: boolean;
  launchNotifications: boolean;
  weeklyReport: boolean;
  smartGrouping: boolean;
  aiSuggestions: boolean;
  aiSearch: boolean;
  sendAnalytics: boolean;
  anonymizeData: boolean;
  scanOnStartup: boolean;
}

interface SettingsStore {
  theme: ThemeMode;
  prefs: AppPreferences;
  aiProviders: AiProviderConfig[];
  radial: RadialMenuConfig;
  setTheme: (theme: ThemeMode) => void;
  togglePref: (key: keyof AppPreferences) => void;
  setPref: (key: keyof AppPreferences, value: boolean) => void;
  setRadialConfig: (patch: Partial<Omit<RadialMenuConfig, 'items'>>) => void;
  setRadialItem: (slot: number, item: Omit<RadialItem, 'slot'> | null) => void;
  resetRadial: () => void;
  addAiProvider: (input: AiProviderInput) => void;
  updateAiProvider: (id: string, input: AiProviderInput) => void;
  deleteAiProvider: (id: string) => void;
  toggleAiProvider: (id: string) => void;
  hydrateAiProviders: () => void;
  mergeCloudAiProviders: () => Promise<void>;
  mergeCloudRadialConfig: () => Promise<void>;
}

const DEFAULT_PREFS: AppPreferences = {
  startMinimized: false,
  minimizeToTray: true,
  autoUpdates: true,
  launchNotifications: true,
  weeklyReport: true,
  smartGrouping: true,
  aiSuggestions: true,
  aiSearch: true,
  sendAnalytics: false,
  anonymizeData: true,
  scanOnStartup: true,
};

const DEFAULT_RADIAL: RadialMenuConfig = {
  enabled: false,
  hotkey: 'CommandOrControl+Shift+R',
  mouseWheelToggle: false,
  sectors: 6,
  items: [],
  showRecent: false,
  style: 'default',
};

/** 把渲染层 radial 配置 resolve(补 name/icon/path)后同步进主进程。
 *  resolve 依赖 software/workflow,放在 software.store 里订阅触发,这里只暴露占位 hook。 */
export let radialSyncBridge: ((config: RadialMenuConfig) => void) | null = null;
export function registerRadialSyncBridge(fn: (config: RadialMenuConfig) => void) {
  radialSyncBridge = fn;
}
function triggerRadialSync(config: RadialMenuConfig) {
  radialSyncBridge?.(config);
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(isDark ? 'dark' : 'light');
}

let systemThemeWatching = false;
export function watchSystemTheme() {
  if (systemThemeWatching || typeof window === 'undefined' || !window.matchMedia) return;
  systemThemeWatching = true;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    if (useSettingsStore.getState().theme === 'system') applyTheme('system');
  });
}

export function syncWindowPrefs(prefs: AppPreferences) {
  if (typeof window === 'undefined' || !window.softdesk?.syncSettings) return;
  void window.softdesk.syncSettings({
    startMinimized: prefs.startMinimized,
    minimizeToTray: prefs.minimizeToTray,
  });
}

export function syncAiProviders(providers: AiProviderConfig[]) {
  if (typeof window === 'undefined' || !window.softdesk?.syncAiProviders) return;
  void window.softdesk.syncAiProviders(providers);
}

function reviveProviderConfig(raw: unknown): AiProviderConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  const apiKey = typeof o.apiKey === 'string' ? o.apiKey : undefined;
  const now = new Date().toISOString();
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : 'AI Provider',
    provider: normalizeProvider(typeof o.provider === 'string' ? o.provider : undefined),
    model: typeof o.model === 'string' ? o.model : '',
    endpoint: typeof o.endpoint === 'string' ? o.endpoint : undefined,
    apiKey,
    apiKeyHint:
      typeof o.apiKeyHint === 'string'
        ? o.apiKeyHint
        : apiKey
          ? buildApiKeyHint(apiKey)
          : '',
    isActive: o.isActive === true,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : now,
  };
}

function buildProviderConfig(input: AiProviderInput, base?: AiProviderConfig): AiProviderConfig {
  const now = new Date().toISOString();
  const provider = normalizeProvider(input.provider);
  const apiKey = input.apiKey?.trim() ? input.apiKey.trim() : base?.apiKey;
  return {
    id: base?.id ?? `aip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim() || 'AI Provider',
    provider,
    model: input.model.trim(),
    endpoint: input.endpoint?.trim() || undefined,
    apiKey: apiKey || undefined,
    apiKeyHint: apiKey ? buildApiKeyHint(apiKey) : base?.apiKeyHint ?? '',
    isActive: base?.isActive ?? false,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

function syncToCloudIfLoggedIn(providers: AiProviderConfig[]) {
  const userId = useAuthStore.getState().profile?.userId;
  if (userId) {
    void syncAiConfigsToCloud(userId, providers);
  }
}

function syncRadialToCloudIfLoggedIn(radial: RadialMenuConfig) {
  const userId = useAuthStore.getState().profile?.userId;
  if (userId) {
    void syncRadialConfigToCloud(userId, radial);
  }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      prefs: DEFAULT_PREFS,
      aiProviders: [],
      radial: DEFAULT_RADIAL,
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      togglePref: (key) => {
        const prefs = { ...get().prefs, [key]: !get().prefs[key] };
        set({ prefs });
        if (key === 'startMinimized' || key === 'minimizeToTray') {
          syncWindowPrefs(prefs);
        }
      },
      setPref: (key, value) => {
        const prefs = { ...get().prefs, [key]: value };
        set({ prefs });
        if (key === 'startMinimized' || key === 'minimizeToTray') {
          syncWindowPrefs(prefs);
        }
      },
      setRadialConfig: (patch) => {
        const radial = { ...get().radial, ...patch, updatedAt: new Date().toISOString() };
        set({ radial });
        triggerRadialSync(radial);
        syncRadialToCloudIfLoggedIn(radial);
      },
      setRadialItem: (slot, item) => {
        const others = get().radial.items.filter((it) => it.slot !== slot);
        const items = item ? [...others, { slot, ...item }] : others;
        const radial = { ...get().radial, items, updatedAt: new Date().toISOString() };
        set({ radial });
        triggerRadialSync(radial);
        syncRadialToCloudIfLoggedIn(radial);
      },
      resetRadial: () => {
        const radial = { ...DEFAULT_RADIAL };
        set({ radial });
        // 推主进程:反注册热键、停止中键监听;不回写云端(退出登录不改云端数据)
        triggerRadialSync(radial);
      },
      addAiProvider: (input) => {
        const aiProviders = [...get().aiProviders, buildProviderConfig(input)];
        set({ aiProviders });
        syncAiProviders(aiProviders);
        syncToCloudIfLoggedIn(aiProviders);
      },
      updateAiProvider: (id, input) => {
        const aiProviders = get().aiProviders.map((p) =>
          p.id === id ? buildProviderConfig(input, p) : p
        );
        set({ aiProviders });
        syncAiProviders(aiProviders);
        syncToCloudIfLoggedIn(aiProviders);
      },
      deleteAiProvider: (id) => {
        const aiProviders = get().aiProviders.filter((p) => p.id !== id);
        set({ aiProviders });
        syncAiProviders(aiProviders);
        syncToCloudIfLoggedIn(aiProviders);
      },
      toggleAiProvider: (id) => {
        const aiProviders = get().aiProviders.map((p) =>
          p.id === id ? { ...p, isActive: !p.isActive, updatedAt: new Date().toISOString() } : p
        );
        set({ aiProviders });
        syncAiProviders(aiProviders);
        syncToCloudIfLoggedIn(aiProviders);
      },
      hydrateAiProviders: () => {
        if (typeof window === 'undefined' || !window.softdesk?.getAiProviders) return;
        void window.softdesk.getAiProviders().then((res) => {
          const list = Array.isArray(res?.providers) ? res.providers : [];
          const revived = list
            .map(reviveProviderConfig)
            .filter((p): p is AiProviderConfig => p !== null);
          if (revived.length > 0) {
            set({ aiProviders: revived });
          } else if (get().aiProviders.length > 0) {
            syncAiProviders(get().aiProviders);
          }
          // 本地回填完成后，异步合并云端配置
          void get().mergeCloudAiProviders();
        });
      },
      mergeCloudAiProviders: async () => {
        const userId = useAuthStore.getState().profile?.userId;
        if (!userId) return;
        const cloudConfigs = await fetchCloudAiConfigs(userId);
        const merged = mergeWithLocal(cloudConfigs, get().aiProviders);
        set({ aiProviders: merged });
        syncAiProviders(merged);
        // 登录后将本地配置（含之前未登录时添加的）同步到云端
        void syncAiConfigsToCloud(userId, merged);
      },
      mergeCloudRadialConfig: async () => {
        const userId = useAuthStore.getState().profile?.userId;
        if (!userId) return;
        const cloud = await fetchCloudRadialConfig(userId);
        const merged = mergeRadialConfig(get().radial, cloud);
        set({ radial: merged });
        // 合并结果推主进程(落盘 + 重注册热键/中键监听)
        triggerRadialSync(merged);
        // 回写云端,统一两端(本地更新或首次上云)
        void syncRadialConfigToCloud(userId, merged);
      },
    }),
    {
      name: 'softdesk-settings',
      partialize: (state) => ({
        theme: state.theme,
        prefs: state.prefs,
        radial: state.radial,
        aiProviders: state.aiProviders.map((p) => {
          const rest = { ...p };
          delete rest.apiKey;
          return rest;
        }),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 兼容旧版本持久化(没有 showRecent 字段)
          if (typeof state.radial.showRecent !== 'boolean') {
            state.radial = { ...state.radial, showRecent: false };
          }
          // 兼容旧版本持久化(没有 style 字段)
          if (typeof state.radial.style !== 'string') {
            state.radial = { ...state.radial, style: 'default' };
          }
          applyTheme(state.theme);
          state.hydrateAiProviders();
        }
      },
    }
  )
);
