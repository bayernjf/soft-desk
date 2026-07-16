import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type {
  Announcement,
  AnnouncementReadState,
  AnnouncementSeverity,
  AnnouncementTarget,
  AnnouncementWithState,
} from '@/types/announcement';

const logger = createLogger('announcement');

/** Supabase announcements 表原始行(snake_case) */
interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  severity: AnnouncementSeverity;
  target_platform: AnnouncementTarget;
  publish_at: string;
  expire_at: string | null;
  is_pinned: boolean;
  is_dismissible: boolean;
  action_url: string | null;
  created_at: string;
  updated_at: string;
}

const VALID_SEVERITIES: ReadonlySet<AnnouncementSeverity> = new Set([
  'info',
  'warning',
  'critical',
]);
const VALID_TARGETS: ReadonlySet<AnnouncementTarget> = new Set([
  'all',
  'mac',
  'win',
]);

function coerceRow(row: Partial<AnnouncementRow>): Announcement | null {
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.title !== 'string' || !row.title) return null;
  const severity = VALID_SEVERITIES.has(row.severity as AnnouncementSeverity)
    ? (row.severity as AnnouncementSeverity)
    : 'info';
  const targetPlatform = VALID_TARGETS.has(
    row.target_platform as AnnouncementTarget
  )
    ? (row.target_platform as AnnouncementTarget)
    : 'all';
  return {
    id: row.id,
    title: row.title,
    content: typeof row.content === 'string' ? row.content : '',
    severity,
    targetPlatform,
    publishAt: row.publish_at ?? new Date().toISOString(),
    expireAt: row.expire_at ?? null,
    isPinned: !!row.is_pinned,
    isDismissible: row.is_dismissible !== false,
    actionUrl: row.action_url ?? null,
    createdAt: row.created_at ?? row.publish_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

/**
 * 从 Supabase 拉取当前生效的公告(publish_at <= now 且未过期),
 * 按平台过滤(all 或匹配当前平台),置顶优先、发布时间倒序。
 * 云端未配置/失败时返回空数组,不阻断 UI。
 */
export async function fetchActiveAnnouncements(
  platform: 'mac' | 'win' | 'other'
): Promise<Announcement[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select(
        'id, title, content, severity, target_platform, publish_at, expire_at, is_pinned, is_dismissible, action_url, created_at, updated_at'
      )
      .lte('publish_at', new Date().toISOString())
      .order('is_pinned', { ascending: false })
      .order('publish_at', { ascending: false });

    if (error) {
      logger.error('fetch announcements error:', error);
      return [];
    }
    if (!Array.isArray(data)) return [];

    const now = Date.now();
    return data
      .map((r) => coerceRow(r as Partial<AnnouncementRow>))
      .filter((a): a is Announcement => a !== null)
      .filter((a) => {
        // 过期过滤:expire_at 为空表示永不过期
        if (a.expireAt && new Date(a.expireAt).getTime() <= now) return false;
        // 平台过滤:all 对所有平台生效;否则必须匹配当前平台
        if (a.targetPlatform === 'all') return true;
        return a.targetPlatform === platform;
      });
  } catch (err) {
    logger.error('fetch announcements exception:', err);
    return [];
  }
}

/** 拉取本地全部公告的已读/关闭状态,转成 id -> state 映射 */
export async function fetchReadStateMap(): Promise<
  Map<string, AnnouncementReadState>
> {
  const map = new Map<string, AnnouncementReadState>();
  if (typeof window === 'undefined' || !window.softdesk?.getAnnouncementReads) {
    return map;
  }
  try {
    const rows = await window.softdesk.getAnnouncementReads();
    for (const row of rows) {
      map.set(row.announcementId, {
        announcementId: row.announcementId,
        readAt: row.readAt,
        dismissedAt: row.dismissedAt,
      });
    }
  } catch (err) {
    logger.error('fetchReadStateMap failed:', err);
  }
  return map;
}

/** 把云端公告与本地已读状态合并为 UI 直接消费的形态 */
export function mergeWithState(
  announcements: Announcement[],
  readMap: Map<string, AnnouncementReadState>
): AnnouncementWithState[] {
  return announcements.map((a) => {
    const state = readMap.get(a.id);
    return {
      ...a,
      read: !!state?.readAt,
      dismissed: !!state?.dismissedAt,
    };
  });
}

/** 标记某条公告为已读(走主进程 IPC 落本地 SQLite) */
export async function markAnnouncementRead(
  announcementId: string
): Promise<boolean> {
  if (typeof window === 'undefined' || !window.softdesk?.markAnnouncementRead) {
    return false;
  }
  try {
    const res = await window.softdesk.markAnnouncementRead(announcementId);
    return !!res?.success;
  } catch (err) {
    logger.error('markAnnouncementRead failed:', err);
    return false;
  }
}

/** 标记某条公告的 banner 已关闭(走主进程 IPC 落本地 SQLite) */
export async function markBannerDismissed(
  announcementId: string
): Promise<boolean> {
  if (typeof window === 'undefined' || !window.softdesk?.markBannerDismissed) {
    return false;
  }
  try {
    const res = await window.softdesk.markBannerDismissed(announcementId);
    return !!res?.success;
  } catch (err) {
    logger.error('markBannerDismissed failed:', err);
    return false;
  }
}
