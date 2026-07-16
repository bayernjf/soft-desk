import { create } from 'zustand';
import type { AnnouncementWithState } from '@/types/announcement';
import { resolveAnnouncementPlatform } from '@/data/announcement-config';
import {
  fetchActiveAnnouncements,
  fetchReadStateMap,
  mergeWithState,
  markAnnouncementRead as svcMarkRead,
  markBannerDismissed as svcDismissBanner,
} from '@/services/announcement.service';

type ResolvedPlatform = 'mac' | 'win' | 'other';

interface AnnouncementStore {
  announcements: AnnouncementWithState[];
  loading: boolean;
  error: string | null;
  /** 当前生效中需要展示的未读公告数(侧边栏徽章) */
  unreadCount: number;
  /** 已解析的平台维度,首次拉取时从主进程 systemInfo 获取并缓存 */
  platform: ResolvedPlatform | null;

  fetchAnnouncements: () => Promise<void>;
  markRead: (announcementId: string) => Promise<void>;
  dismissBanner: (announcementId: string) => Promise<void>;
}

async function resolvePlatform(): Promise<ResolvedPlatform> {
  if (typeof window === 'undefined' || !window.softdesk?.getSystemInfo) {
    return 'other';
  }
  try {
    const info = await window.softdesk.getSystemInfo();
    return resolveAnnouncementPlatform(info.platform);
  } catch {
    return 'other';
  }
}

function countUnread(list: AnnouncementWithState[]): number {
  return list.filter((a) => !a.read).length;
}

export const useAnnouncementStore = create<AnnouncementStore>((set, get) => ({
  announcements: [],
  loading: false,
  error: null,
  unreadCount: 0,
  platform: null,

  fetchAnnouncements: async () => {
    set({ loading: true, error: null });
    try {
      let platform = get().platform;
      if (!platform) {
        platform = await resolvePlatform();
        set({ platform });
      }
      const [remote, readMap] = await Promise.all([
        fetchActiveAnnouncements(platform),
        fetchReadStateMap(),
      ]);
      const merged = mergeWithState(remote, readMap);
      set({
        announcements: merged,
        unreadCount: countUnread(merged),
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '加载公告失败',
      });
    }
  },

  markRead: async (announcementId) => {
    const ok = await svcMarkRead(announcementId);
    if (!ok) return;
    const next = get().announcements.map((a) =>
      a.id === announcementId ? { ...a, read: true } : a
    );
    set({ announcements: next, unreadCount: countUnread(next) });
  },

  dismissBanner: async (announcementId) => {
    const ok = await svcDismissBanner(announcementId);
    if (!ok) return;
    const next = get().announcements.map((a) =>
      a.id === announcementId ? { ...a, dismissed: true } : a
    );
    set({ announcements: next });
  },
}));
