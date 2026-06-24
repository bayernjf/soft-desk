import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppPreferences {
  startMinimized: boolean;
  minimizeToTray: boolean;
  autoUpdates: boolean;
  launchNotifications: boolean;
  weeklyReport: boolean;
  smartGrouping: boolean;
  aiSuggestions: boolean;
  sendAnalytics: boolean;
  anonymizeData: boolean;
  scanOnStartup: boolean;
}

interface SettingsStore {
  theme: ThemeMode;
  prefs: AppPreferences;
  setTheme: (theme: ThemeMode) => void;
  togglePref: (key: keyof AppPreferences) => void;
}

const DEFAULT_PREFS: AppPreferences = {
  startMinimized: false,
  minimizeToTray: true,
  autoUpdates: true,
  launchNotifications: true,
  weeklyReport: true,
  smartGrouping: true,
  aiSuggestions: true,
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

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      prefs: DEFAULT_PREFS,
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
    }),
    {
      name: 'softdesk-settings',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
