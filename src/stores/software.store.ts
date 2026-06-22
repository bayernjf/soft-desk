import { create } from 'zustand';
import type { Software, Workflow, SoftwareCategory } from '@/types';
import { MOCK_SOFTWARE, MOCK_WORKFLOWS } from '@/data/software.mock';

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
  selectedCategory: SoftwareCategory | 'all';
  searchQuery: string;
  sortBy: 'name' | 'usage' | 'recent' | 'size';
  isScanning: boolean;
  isElectron: boolean;
  scanError: string | null;
  setSelectedCategory: (cat: SoftwareCategory | 'all') => void;
  setSearchQuery: (q: string) => void;
  setSortBy: (sort: 'name' | 'usage' | 'recent' | 'size') => void;
  scanSoftware: () => Promise<void>;
  launchSoftware: (id: string) => void;
  launchWorkflow: (id: string) => Promise<WorkflowLaunchResult>;
  toggleWorkflowFavorite: (id: string) => void;
  createWorkflow: (data: WorkflowInput) => Workflow;
  updateWorkflow: (id: string, data: WorkflowInput) => void;
  deleteWorkflow: (id: string) => void;
  uninstallSoftware: (id: string) => void;
}

export interface WorkflowInput {
  name: string;
  description: string;
  softwareIds: string[];
  color: string;
}

const WORKFLOW_COLORS = ['#00d4aa', '#a371f7', '#58a6ff', '#d29922', '#f85149', '#ec4899'];

const hasBridge = typeof window !== 'undefined' && !!window.softdesk;

export const useSoftwareStore = create<SoftwareStore>((set, get) => ({
  software: MOCK_SOFTWARE,
  workflows: MOCK_WORKFLOWS,
  selectedCategory: 'all',
  searchQuery: '',
  sortBy: 'recent',
  isScanning: false,
  isElectron: hasBridge,
  scanError: null,

  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSortBy: (sort) => set({ sortBy: sort }),

  scanSoftware: async () => {
    if (!window.softdesk) {
      set({ scanError: '当前不在 Electron 环境，使用示例数据' });
      return;
    }
    set({ isScanning: true, scanError: null });
    try {
      const apps = await window.softdesk.scanSoftware();
      set({ software: apps, isScanning: false });
    } catch (err) {
      set({
        isScanning: false,
        scanError: err instanceof Error ? err.message : '扫描失败',
      });
    }
  },

  launchSoftware: (id) => {
    const target = get().software.find((s) => s.id === id);
    if (window.softdesk && target?.path) {
      window.softdesk.launchSoftware(target.path);
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
    const software = get().software.filter((s) => s.id !== id);
    set({ software });
  },
}));
