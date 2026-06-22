import { create } from 'zustand';
import type { Software, Workflow, SoftwareCategory } from '@/types';
import { MOCK_SOFTWARE, MOCK_WORKFLOWS } from '@/data/software.mock';

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
  launchWorkflow: (id: string) => void;
  toggleWorkflowFavorite: (id: string) => void;
  uninstallSoftware: (id: string) => void;
}

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

  launchWorkflow: (id) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (window.softdesk && wf) {
      for (const sid of wf.softwareIds) {
        const sw = get().software.find((s) => s.id === sid);
        if (sw?.path) window.softdesk.launchSoftware(sw.path);
      }
    }
    const workflows = get().workflows.map((w) =>
      w.id === id
        ? { ...w, usageCount: w.usageCount + 1, lastUsed: new Date().toISOString() }
        : w
    );
    set({ workflows });
  },

  toggleWorkflowFavorite: (id) => {
    const workflows = get().workflows.map((w) =>
      w.id === id ? { ...w, isFavorite: !w.isFavorite } : w
    );
    set({ workflows });
  },

  uninstallSoftware: (id) => {
    const software = get().software.filter((s) => s.id !== id);
    set({ software });
  },
}));
