import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  buildApiKeyHint,
  normalizeProvider,
  type AiProviderConfig,
  type AiProviderInput,
} from '@/data/aiProviders';

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
  setTheme: (theme: ThemeMode) => void;
  togglePref: (key: keyof AppPreferences) => void;
  addAiProvider: (input: AiProviderInput) => void;
  updateAiProvider: (id: string, input: AiProviderInput) => void;
  deleteAiProvider: (id: string) => void;
  toggleAiProvider: (id: string) => void;
  hydrateAiProviders: () => void;
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

// 持续监听系统明暗变化:仅当用户选择"跟随系统"时,系统切换主题会实时同步到应用
let systemThemeWatching = false;
export function watchSystemTheme() {
  if (systemThemeWatching || typeof window === 'undefined' || !window.matchMedia) return;
  systemThemeWatching = true;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    if (useSettingsStore.getState().theme === 'system') applyTheme('system');
  });
}

// 把与窗口行为相关的偏好推送到 Electron 主进程并持久化(浏览器环境下无 bridge,安全跳过)
export function syncWindowPrefs(prefs: AppPreferences) {
  if (typeof window === 'undefined' || !window.softdesk?.syncSettings) return;
  void window.softdesk.syncSettings({
    startMinimized: prefs.startMinimized,
    minimizeToTray: prefs.minimizeToTray,
  });
}

// 把含明文 apiKey 的 provider 列表同步到主进程落盘,使所有推理在主进程发起;
// 浏览器环境无 bridge 时安全跳过。任何 provider 变更后都应调用一次。
export function syncAiProviders(providers: AiProviderConfig[]) {
  if (typeof window === 'undefined' || !window.softdesk?.syncAiProviders) return;
  void window.softdesk.syncAiProviders(providers);
}

// 从落盘的原始对象还原前端 AiProviderConfig:容错校验关键字段,缺失项补默认值。
// 主进程保存的就是前端曾存入的完整对象,因此通常字段齐全。
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

// 把 AI provider 输入规整为本地存储用的配置;apiKey 以明文存本地(localStorage),
// 卡片仅展示 buildApiKeyHint 生成的脱敏提示,不上传任何服务器。
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

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      prefs: DEFAULT_PREFS,
      aiProviders: [],
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
      addAiProvider: (input) => {
        const aiProviders = [...get().aiProviders, buildProviderConfig(input)];
        set({ aiProviders });
        syncAiProviders(aiProviders);
      },
      updateAiProvider: (id, input) => {
        const aiProviders = get().aiProviders.map((p) =>
          p.id === id ? buildProviderConfig(input, p) : p
        );
        set({ aiProviders });
        syncAiProviders(aiProviders);
      },
      deleteAiProvider: (id) => {
        const aiProviders = get().aiProviders.filter((p) => p.id !== id);
        set({ aiProviders });
        syncAiProviders(aiProviders);
      },
      toggleAiProvider: (id) => {
        const aiProviders = get().aiProviders.map((p) =>
          p.id === id ? { ...p, isActive: !p.isActive, updatedAt: new Date().toISOString() } : p
        );
        set({ aiProviders });
        syncAiProviders(aiProviders);
      },
      // 启动时从主进程(唯一权威数据源)拉取已落盘的 provider 列表回填 store。
      // 主进程有数据则以主进程为准;主进程为空但本地尚存配置时,反向把本地补写回主进程,
      // 完成一次性数据迁移(兼容此前仅存在 localStorage 的旧配置)。
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
            // 主进程没有但本地有(旧版本遗留),迁移补写回主进程
            syncAiProviders(get().aiProviders);
          }
        });
      },
    }),
    {
      name: 'softdesk-settings',
      // apiKey 不持久化进 localStorage:provider 配置以主进程 ai-providers.json 为权威,
      // 启动时由 hydrateAiProviders 回填,避免敏感密钥冗余存放在渲染层存储。
      partialize: (state) => ({
        theme: state.theme,
        prefs: state.prefs,
        aiProviders: state.aiProviders.map((p) => {
          const rest = { ...p };
          delete rest.apiKey;
          return rest;
        }),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          // 不再用前端(可能为空的)localStorage 反向覆盖主进程;
          // 而是从主进程权威数据回填,彻底规避 origin 隔离/缓存清理导致的配置丢失。
          state.hydrateAiProviders();
        }
      },
    }
  )
);
