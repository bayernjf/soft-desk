import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthProfile } from '@/types/electron';
import { setSupabaseSession, clearSupabaseSession } from '@/lib/supabase';

// 渲染层会话状态(见 Technical-Architecture.md §6.5.3):
// - 登录态 + 脱敏资料(profile)= 运行时内存态,以主进程会话为权威,启动时拉取回填;
// - localStorage 仅持久化"体验类"数据:上次登录邮箱、是否记住我;
// - 绝不在 localStorage 存放 Token 或明文密码,Token 仅由主进程经 safeStorage 加密落盘。

interface AuthStore {
  loggedIn: boolean;
  profile: AuthProfile | null;
  /** 会话回填是否已完成,避免登录入口在判定前闪烁 */
  ready: boolean;
  lastEmail: string;
  rememberMe: boolean;
  setRememberMe: (value: boolean) => void;
  hydrateSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    nickname?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: { nickname?: string; avatar?: number }) => Promise<{ ok: boolean; error?: string }>;
}

async function syncSupabaseSession(): Promise<void> {
  if (typeof window === 'undefined' || !window.softdesk?.getAuthTokens) return;
  const tokens = await window.softdesk.getAuthTokens();
  if (tokens) {
    await setSupabaseSession(tokens.accessToken, tokens.refreshToken);
  }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      loggedIn: false,
      profile: null,
      ready: false,
      lastEmail: '',
      rememberMe: true,
      setRememberMe: (value) => set({ rememberMe: value }),

      // 启动时向主进程查询登录态(主进程为权威),回填登录态与脱敏资料
      hydrateSession: async () => {
        if (typeof window === 'undefined' || !window.softdesk?.getAuthSession) {
          set({ ready: true });
          return;
        }
        try {
          const session = await window.softdesk.getAuthSession();
          if (session.loggedIn) {
            await syncSupabaseSession();
          }
          set({
            loggedIn: session.loggedIn,
            profile: session.profile ?? null,
            ready: true,
          });
          // 恢复登录后异步合并云端 AI 配置与工作流
          if (session.loggedIn && session.profile?.userId) {
            queueMicrotask(async () => {
              const { useSettingsStore } = await import('@/stores/settings.store');
              await useSettingsStore.getState().mergeCloudAiProviders();
              const { useSoftwareStore } = await import('@/stores/software.store');
              const { syncWorkflowsOnLogin } = await import('@/services/workflows.service');
              const localWorkflows = useSoftwareStore.getState().workflows;
              const merged = await syncWorkflowsOnLogin(session.profile!.userId, localWorkflows);
              useSoftwareStore.getState().setWorkflows(merged);
            });
          }
        } catch {
          set({ loggedIn: false, profile: null, ready: true });
        }
      },

      login: async (email, password) => {
        if (typeof window === 'undefined' || !window.softdesk?.loginAccount) {
          return { ok: false, error: '当前环境不支持登录' };
        }
        const res = await window.softdesk.loginAccount({ email, password });
        if (!res.success) {
          return { ok: false, error: 'error' in res ? res.error : '登录失败' };
        }
        await syncSupabaseSession();
        set({
          loggedIn: true,
          profile: res.profile,
          lastEmail: get().rememberMe ? email : '',
        });
        // 登录成功后异步拉取云端收藏、AI 配置与工作流，避免循环依赖
        queueMicrotask(async () => {
          const { useSoftwareStore } = await import('@/stores/software.store');
          const { fetchCloudFavorites } = await import('@/services/favorites.service');
          const cloudIds = await fetchCloudFavorites(res.profile.userId);
          if (cloudIds.length > 0) {
            useSoftwareStore.getState().setFavoriteIds(cloudIds);
          }
          const { useSettingsStore } = await import('@/stores/settings.store');
          await useSettingsStore.getState().mergeCloudAiProviders();
          const { syncWorkflowsOnLogin } = await import('@/services/workflows.service');
          const localWorkflows = useSoftwareStore.getState().workflows;
          const merged = await syncWorkflowsOnLogin(res.profile.userId, localWorkflows);
          useSoftwareStore.getState().setWorkflows(merged);
        });
        return { ok: true };
      },

      register: async (email, password, nickname) => {
        if (typeof window === 'undefined' || !window.softdesk?.registerAccount) {
          return { ok: false, error: '当前环境不支持注册' };
        }
        const res = await window.softdesk.registerAccount({ email, password, nickname });
        if (!res.success) {
          return { ok: false, error: 'error' in res ? res.error : '注册失败' };
        }
        await syncSupabaseSession();
        set({
          loggedIn: true,
          profile: res.profile,
          lastEmail: get().rememberMe ? email : '',
        });
        return { ok: true };
      },

      logout: async () => {
        if (typeof window !== 'undefined' && window.softdesk?.logoutAccount) {
          await window.softdesk.logoutAccount();
        }
        await clearSupabaseSession();
        // 退出后清空本地收藏与工作流（数据与账号绑定）
        const { useSoftwareStore } = await import('@/stores/software.store');
        useSoftwareStore.getState().setFavoriteIds([]);
        useSoftwareStore.getState().clearWorkflows();
        set({ loggedIn: false, profile: null });
      },

      updateProfile: async (data) => {
        if (typeof window === 'undefined' || !window.softdesk?.updateProfile) {
          return { ok: false, error: '当前环境不支持更新资料' };
        }
        const res = await window.softdesk.updateProfile(data);
        if (!res.success) {
          return { ok: false, error: 'error' in res ? res.error : '更新失败' };
        }
        set({ profile: res.profile });
        return { ok: true };
      },
    }),
    {
      name: 'softdesk-auth',
      // 仅持久化体验类数据;登录态与资料不落 localStorage,每次启动从主进程权威回填
      partialize: (state) => ({
        lastEmail: state.lastEmail,
        rememberMe: state.rememberMe,
      }),
    }
  )
);
