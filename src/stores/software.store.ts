import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Software, Workflow, SoftwareCategory } from '@/types';
import { WORKFLOW_COLORS } from '@/data/categories';
import { useSettingsStore } from '@/stores/settings.store';

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
  descriptionCache: Record<string, string>;
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
  setAiDescription: (id: string, description: string) => void;
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
  descriptionCache: {},
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
      const workflows = get().workflows.map((w) =>
        w.id === id
          ? { ...w, usageCount: w.usageCount + 1, lastUsed: new Date().toISOString() }
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
    const workflows = get().workflows.map((w) =>
      w.id === id ? { ...w, isFavorite: !w.isFavorite } : w
    );
    set({ workflows });
  },

  createWorkflow: (data) => {
    const existing = get().workflows;
    const workflow: Workflow = {
      id: `wf-${Date.now()}`,
      name: data.name.trim(),
      description: data.description.trim(),
      softwareIds: data.softwareIds,
      color: data.color || WORKFLOW_COLORS[existing.length % WORKFLOW_COLORS.length],
      usageCount: 0,
      lastUsed: new Date().toISOString(),
      isFavorite: false,
    };
    set({ workflows: [...existing, workflow] });
    return workflow;
  },

  updateWorkflow: (id, data) => {
    const workflows = get().workflows.map((w) =>
      w.id === id
        ? {
            ...w,
            name: data.name.trim(),
            description: data.description.trim(),
            softwareIds: data.softwareIds,
            color: data.color || w.color,
          }
        : w
    );
    set({ workflows });
  },

  deleteWorkflow: (id) => {
    set({ workflows: get().workflows.filter((w) => w.id !== id) });
  },

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

  setAiDescription: (id, description) => {
    const software = get().software.map((s) =>
      s.id === id ? { ...s, aiDescription: description } : s
    );
    const descriptionCache = { ...get().descriptionCache, [id]: description };
    set({ software, descriptionCache });
  },
}),
    {
      name: 'softdesk-store',
      partialize: (state) => ({
        workflows: state.workflows,
        uninstalledIds: state.uninstalledIds,
        descriptionCache: state.descriptionCache,
      }),
    }
  )
);
