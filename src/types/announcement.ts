/**
 * 公告系统领域类型。
 * 枚举值必须是稳定的英文机器值,与 Supabase `announcements` 表的 CHECK 约束保持一致,
 * 禁止保存中文展示文案(展示文案走 i18n key)。
 */

export const ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

export const ANNOUNCEMENT_TARGETS = ['all', 'mac', 'win'] as const;
export type AnnouncementTarget = (typeof ANNOUNCEMENT_TARGETS)[number];

/** 云端公告原始记录(Supabase `announcements` 表行) */
export interface Announcement {
  id: string;
  title: string;
  content: string;
  severity: AnnouncementSeverity;
  targetPlatform: AnnouncementTarget;
  publishAt: string;
  expireAt: string | null;
  isPinned: boolean;
  isDismissible: boolean;
  actionUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 本地已读/关闭状态(主进程 SQLite `announcement_reads` 行) */
export interface AnnouncementReadState {
  announcementId: string;
  /** 已读时间(unix 秒),null 表示未读 */
  readAt: number | null;
  /** banner 关闭时间(unix 秒),null 表示未关闭 */
  dismissedAt: number | null;
}

/** 合并本地状态后的公告(供 UI 直接消费) */
export interface AnnouncementWithState extends Announcement {
  read: boolean;
  dismissed: boolean;
}
