import { Info, AlertTriangle, AlertOctagon, type LucideIcon } from 'lucide-react';
import type { AnnouncementSeverity } from '@/types/announcement';

const ICONS: Record<AnnouncementSeverity, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

export function severityIcon(severity: AnnouncementSeverity): LucideIcon {
  return ICONS[severity];
}
