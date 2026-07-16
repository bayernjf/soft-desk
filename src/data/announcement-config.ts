import type { AnnouncementSeverity } from '@/types/announcement';

/**
 * severity -> 展示配置(颜色/图标/文案 key)的唯一定义。
 * 禁止在页面里重复定义这些映射,所有 severity 视觉差异集中在此处。
 */
export const SEVERITY_CONFIG: Record<
  AnnouncementSeverity,
  {
    labelKey: string;
    color: string;
    bgColor: string;
    borderColor: string;
    iconName: 'Info' | 'AlertTriangle' | 'AlertOctagon';
  }
> = {
  info: {
    labelKey: 'announcement.severity.info',
    color: '#58a6ff',
    bgColor: 'rgba(88,166,255,0.12)',
    borderColor: 'rgba(88,166,255,0.30)',
    iconName: 'Info',
  },
  warning: {
    labelKey: 'announcement.severity.warning',
    color: '#d29922',
    bgColor: 'rgba(210,153,34,0.12)',
    borderColor: 'rgba(210,153,34,0.30)',
    iconName: 'AlertTriangle',
  },
  critical: {
    labelKey: 'announcement.severity.critical',
    color: '#f85149',
    bgColor: 'rgba(248,81,73,0.12)',
    borderColor: 'rgba(248,81,73,0.30)',
    iconName: 'AlertOctagon',
  },
};

/** 把 process.platform(darwin/win32/...) 映射到公告投放平台维度 */
export function resolveAnnouncementPlatform(
  platform: string
): 'mac' | 'win' | 'other' {
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'win';
  return 'other';
}
