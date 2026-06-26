import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Software, Workflow, SoftwareCategory, FavoriteGroup } from '@/types';
import { WORKFLOW_COLORS } from '@/data/categories';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthStore } from '@/stores/auth.store';
import type { Recommendation } from '@/services/recommendation.service';
import {
  addCloudFavorite,
  removeCloudFavorite,
  addCloudFavoriteGroup,
  renameCloudFavoriteGroup,
  removeCloudFavoriteGroup,
  moveCloudFavoriteToGroup,
  moveCloudFavoritesToGroup,
  reorderCloudFavorites,
  reorderCloudFavoriteGroups,
} from '@/services/favorites.service';
import { upsertCloudWorkflow, deleteCloudWorkflow } from '@/services/workflows.service';

export interface WorkflowLaunchResult {
  total: number;
  launched: number;
  failed: number;
  missing: number;
  isElectron: boolean;
  error?: string;
}

interface SoftwareStore {
  software: Software[];
  workflows: Workflow[];
  uninstalledIds: string[];
  favoriteIds: string[];
  favoriteGroups: FavoriteGroup[];
  descriptionCache: Record<string, string>;
  descriptionMeta: Record<string, { version?: string }>;
  recommendations: Recommendation[];
  recommendationLoading: boolean;
  selectedCategory: SoftwareCategory | 'all';
  searchQuery: string;
  sortBy: 'name' | 'usage' | 'recent' | 'size';
  isScanning: boolean;
  isElectron: boolean;
  scanError: string | null;
  setSelectedCategory: (cat: SoftwareCategory | 'all') => void;
  setSearchQuery: (q: string) => void;
  setSortBy: (sort: 'name' | 'usage' | 'recent' | 'size') => void;
  setElectronReady: (ready: boolean) => void;
  scanSoftware: () => Promise<void>;
  applyScannedApps: (apps: Software[]) => void;
  launchSoftware: (id: string) => void;
  launchWorkflow: (id: string) => Promise<WorkflowLaunchResult>;
  toggleWorkflowFavorite: (id: string) => void;
  createWorkflow: (data: WorkflowInput) => Workflow;
  updateWorkflow: (id: string, data: WorkflowInput) => void;
  deleteWorkflow: (id: string) => void;
  uninstallSoftware: (id: string) => void;
  removeSoftware: (id: string) => Promise<{ success: boolean; error?: string }>;
  reinstallSoftware: (id: string) => void;
  purgeSoftware: (id: string) => void;
  setAiDescription: (id: string, description: string, version?: string) => void;
  setRecommendations: (recommendations: Recommendation[]) => void;
  setRecommendationLoading: (loading: boolean) => void;
  toggleFavorite: (id: string) => Promise<void>;
  setFavoriteIds: (ids: string[]) => void;
  setWorkflows: (workflows: Workflow[]) => void;
  clearWorkflows: () => void;
  createFavoriteGroup: (name: string) => { success: boolean; error?: string; group?: FavoriteGroup };
  renameFavoriteGroup: (id: string, name: string) => { success: boolean; error?: string };
  deleteFavoriteGroup: (id: string) => void;
  moveFavoriteToGroup: (softwareId: string, groupId: string | null) => void;
  moveFavoritesToGroup: (softwareIds: string[], groupId: string | null) => void;
  reorderFavoritesInGroup: (groupId: string, orderedIds: string[]) => void;
  reorderUngroupedFavorites: (orderedIds: string[]) => void;
  reorderFavoriteGroups: (orderedGroupIds: string[]) => void;
  setFavoriteGroups: (groups: FavoriteGroup[]) => void;
}

export interface WorkflowInput {
  name: string;
  description: string;
  softwareIds: string[];
  color: string;
}

const hasBridge = typeof window !== 'undefined' && !!window.softdesk;

export const useSoftwareStore = create<SoftwareStore>()(
  persist(
    (set, get) => ({
  software: [],
  workflows: [],
  uninstalledIds: [],
  favoriteIds: [],
  favoriteGroups: [],
  descriptionCache: {},
  descriptionMeta: {},
  recommendations: [],
  recommendationLoading: false,
  selectedCategory: 'all',
  searchQuery: '',
  sortBy: 'recent',
  isScanning: false,
  isElectron: hasBridge,
  scanError: null,

  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setElectronReady: (ready) => set({ isElectron: ready }),

  applyScannedApps: (apps) => {
    const prev = get().software;
    const uninstalledIds = get().uninstalledIds;
    const descriptionCache = get().descriptionCache;
    const scannedById = new Map(apps.map((a) => [a.id, a]));

    const merged: Software[] = apps.map((app) => ({
      ...app,
      uninstalled: uninstalledIds.includes(app.id),
      deleted: false,
      aiDescription: descriptionCache[app.id],
    }));

    for (const old of prev) {
      if (!scannedById.has(old.id)) {
        merged.push({ ...old, deleted: true });
      }
    }

    set({ software: merged });
  },

  scanSoftware: async () => {
    if (!window.softdesk) {
      set({ scanError: '当前不在 Electron 环境，无法扫描本机软件' });
      return;
    }
    set({ isScanning: true, scanError: null });
    try {
      const smartGrouping = useSettingsStore.getState().prefs.smartGrouping;
      const apps = await window.softdesk.scanSoftware(smartGrouping);
      get().applyScannedApps(apps);
      set({ isScanning: false });
    } catch (err) {
      set({
        isScanning: false,
        scanError: err instanceof Error ? err.message : '扫描失败',
      });
    }
  },

  launchSoftware: (id) => {
    const target = get().software.find((s) => s.id === id);
    if (target?.uninstalled || target?.deleted) return;
    if (window.softdesk && target?.path) {
      window.softdesk.launchSoftware(target.path, target.id);
    }
    const software = get().software.map((s) =>
      s.id === id
        ? { ...s, launchCount: s.launchCount + 1, lastUsed: new Date().toISOString() }
        : s
    );
    set({ software });
  },

  launchWorkflow: async (id) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (!wf) {
      return { total: 0, launched: 0, failed: 0, missing: 0, isElectron: get().isElectron };
    }

    const matched = wf.softwareIds.map((sid) => get().software.find((s) => s.id === sid));
    const paths = matched.filter((s): s is Software => !!s?.path).map((s) => s.path);
    const missing = wf.softwareIds.length - paths.length;

    const updateStats = () => {
      const now = new Date().toISOString();
      const workflows = get().workflows.map((w) =>
        w.id === id
          ? { ...w, usageCount: w.usageCount + 1, lastUsed: now, updatedAt: now }
          : w
      );
      set({ workflows });
    };

    if (!window.softdesk) {
      updateStats();
      return {
        total: wf.softwareIds.length,
        launched: 0,
        failed: 0,
        missing,
        isElectron: false,
        error: '当前不在 Electron 环境，无法实际启动软件',
      };
    }

    try {
      const { launched, failed } = await window.softdesk.launchBatch(paths);
      updateStats();
      return {
        total: wf.softwareIds.length,
        launched,
        failed,
        missing,
        isElectron: true,
      };
    } catch (err) {
      return {
        total: wf.softwareIds.length,
        launched: 0,
        failed: paths.length,
        missing,
        isElectron: true,
        error: err instanceof Error ? err.message : '批量启动失败',
      };
    }
  },

  toggleWorkflowFavorite: (id) => {
    const now = new Date().toISOString();
    const workflows = get().workflows.map((w) =>
      w.id === id ? { ...w, isFavorite: !w.isFavorite, updatedAt: now } : w
    );
    set({ workflows });

    const userId = useAuthStore.getState().profile?.userId;
    if (!userId) return;
    const updated = workflows.find((w) => w.id === id);
    if (updated) {
      void upsertCloudWorkflow(userId, updated);
    }
  },

  createWorkflow: (data) => {
    const existing = get().workflows;
    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: `wf-${Date.now()}`,
      name: data.name.trim(),
      description: data.description.trim(),
      softwareIds: data.softwareIds,
      color: data.color || WORKFLOW_COLORS[existing.length % WORKFLOW_COLORS.length],
      usageCount: 0,
      lastUsed: now,
      isFavorite: false,
      updatedAt: now,
    };
    set({ workflows: [...existing, workflow] });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void upsertCloudWorkflow(userId, workflow);
    }

    return workflow;
  },

  updateWorkflow: (id, data) => {
    const now = new Date().toISOString();
    const workflows = get().workflows.map((w) =>
      w.id === id
        ? {
            ...w,
            name: data.name.trim(),
            description: data.description.trim(),
            softwareIds: data.softwareIds,
            color: data.color || w.color,
            updatedAt: now,
          }
        : w
    );
    set({ workflows });

    const userId = useAuthStore.getState().profile?.userId;
    if (!userId) return;
    const updated = workflows.find((w) => w.id === id);
    if (updated) {
      void upsertCloudWorkflow(userId, updated);
    }
  },

  deleteWorkflow: (id) => {
    set({ workflows: get().workflows.filter((w) => w.id !== id) });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void deleteCloudWorkflow(userId, id);
    }
  },

  setWorkflows: (workflows) => set({ workflows }),
  clearWorkflows: () => set({ workflows: [] }),

  uninstallSoftware: (id) => {
    const software = get().software.map((s) =>
      s.id === id ? { ...s, uninstalled: true } : s
    );
    const uninstalledIds = get().uninstalledIds.includes(id)
      ? get().uninstalledIds
      : [...get().uninstalledIds, id];
    set({ software, uninstalledIds });
  },

  removeSoftware: async (id) => {
    const target = get().software.find((s) => s.id === id);
    if (window.softdesk && target?.path) {
      const result = await window.softdesk.removeSoftware(target.path);
      if (!result.success) {
        return { success: false, error: result.error ?? '移除失败' };
      }
    }
    set({ software: get().software.filter((s) => s.id !== id) });
    return { success: true };
  },

  reinstallSoftware: (id) => {
    const software = get().software.map((s) =>
      s.id === id ? { ...s, uninstalled: false } : s
    );
    set({ software, uninstalledIds: get().uninstalledIds.filter((x) => x !== id) });
  },

  purgeSoftware: (id) => {
    set({
      software: get().software.filter((s) => s.id !== id),
      uninstalledIds: get().uninstalledIds.filter((x) => x !== id),
    });
  },

  setAiDescription: (id, description, version) => {
    const software = get().software.map((s) =>
      s.id === id ? { ...s, aiDescription: description } : s
    );
    const descriptionCache = { ...get().descriptionCache, [id]: description };
    const descriptionMeta = { ...get().descriptionMeta };
    if (version) {
      descriptionMeta[id] = { ...descriptionMeta[id], version };
    }
    set({ software, descriptionCache, descriptionMeta });
  },

  setRecommendations: (recommendations) => set({ recommendations }),
  setRecommendationLoading: (recommendationLoading) => set({ recommendationLoading }),

  toggleFavorite: async (id) => {
    const nextIds = get().favoriteIds.includes(id)
      ? get().favoriteIds.filter((x) => x !== id)
      : [...get().favoriteIds, id];
    set({ favoriteIds: nextIds });

    const userId = useAuthStore.getState().profile?.userId;
    if (!userId) return;

    const software = get().software.find((s) => s.id === id);
    if (!software) return;

    if (nextIds.includes(id)) {
      void addCloudFavorite(userId, software);
    } else {
      void removeCloudFavorite(userId, id);
    }
  },

  setFavoriteIds: (ids) => set({ favoriteIds: ids }),

  createFavoriteGroup: (name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: '分组名称不能为空' };
    }
    const existing = get().favoriteGroups.find(
      (g) => g.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      return { success: false, error: '分组名称已存在' };
    }
    const group: FavoriteGroup = {
      id: `fg-${Date.now()}`,
      name: trimmed,
      softwareIds: [],
      createdAt: new Date().toISOString(),
    };
    set({ favoriteGroups: [...get().favoriteGroups, group] });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void addCloudFavoriteGroup(userId, group);
    }
    return { success: true, group };
  },

  renameFavoriteGroup: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: '分组名称不能为空' };
    }
    const existing = get().favoriteGroups.find(
      (g) => g.id !== id && g.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      return { success: false, error: '分组名称已存在' };
    }
    set({
      favoriteGroups: get().favoriteGroups.map((g) =>
        g.id === id ? { ...g, name: trimmed } : g
      ),
    });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void renameCloudFavoriteGroup(userId, id, trimmed);
    }
    return { success: true };
  },

  deleteFavoriteGroup: (id) => {
    const group = get().favoriteGroups.find((g) => g.id === id);
    if (!group) return;
    set({
      favoriteGroups: get().favoriteGroups.filter((g) => g.id !== id),
    });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void removeCloudFavoriteGroup(userId, id);
    }
  },

  moveFavoriteToGroup: (softwareId, groupId) => {
    const groups = get().favoriteGroups.map((g) => {
      const withoutCurrent = g.softwareIds.filter((sid) => sid !== softwareId);
      if (g.id === groupId) {
        return { ...g, softwareIds: [...withoutCurrent, softwareId] };
      }
      return { ...g, softwareIds: withoutCurrent };
    });
    set({ favoriteGroups: groups });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void moveCloudFavoriteToGroup(userId, softwareId, groupId);
    }
  },

  moveFavoritesToGroup: (softwareIds, groupId) => {
    const groups = get().favoriteGroups.map((g) => {
      const withoutSelected = g.softwareIds.filter((sid) => !softwareIds.includes(sid));
      if (g.id === groupId) {
        const toAdd = softwareIds.filter((sid) => !withoutSelected.includes(sid));
        return { ...g, softwareIds: [...withoutSelected, ...toAdd] };
      }
      return { ...g, softwareIds: withoutSelected };
    });
    set({ favoriteGroups: groups });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void moveCloudFavoritesToGroup(userId, softwareIds, groupId);
    }
  },

  reorderFavoritesInGroup: (groupId, orderedIds) => {
    set({
      favoriteGroups: get().favoriteGroups.map((g) =>
        g.id === groupId ? { ...g, softwareIds: orderedIds } : g
      ),
    });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void reorderCloudFavorites(userId, orderedIds);
    }
  },

  reorderUngroupedFavorites: (orderedIds) => {
    const groupedIds = new Set(get().favoriteGroups.flatMap((g) => g.softwareIds));
    const others = get().favoriteIds.filter((id) => groupedIds.has(id));
    set({ favoriteIds: [...orderedIds, ...others] });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void reorderCloudFavorites(userId, orderedIds);
    }
  },

  reorderFavoriteGroups: (orderedGroupIds) => {
    const byId = new Map(get().favoriteGroups.map((g) => [g.id, g]));
    const reordered = orderedGroupIds
      .map((id) => byId.get(id))
      .filter((g): g is FavoriteGroup => Boolean(g));
    const missing = get().favoriteGroups.filter((g) => !orderedGroupIds.includes(g.id));
    set({ favoriteGroups: [...reordered, ...missing] });

    const userId = useAuthStore.getState().profile?.userId;
    if (userId) {
      void reorderCloudFavoriteGroups(userId, orderedGroupIds);
    }
  },

  setFavoriteGroups: (groups) => set({ favoriteGroups: groups }),
}),
    {
      name: 'softdesk-store',
      partialize: (state) => ({
        workflows: state.workflows,
        uninstalledIds: state.uninstalledIds,
        favoriteIds: state.favoriteIds,
        favoriteGroups: state.favoriteGroups,
        descriptionCache: state.descriptionCache,
        descriptionMeta: state.descriptionMeta,
      }),
    }
  )
);
