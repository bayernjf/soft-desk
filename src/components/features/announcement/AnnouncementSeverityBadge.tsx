import { Info, AlertTriangle, AlertOctagon, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnnouncementSeverity } from '@/types/announcement';
import { SEVERITY_CONFIG } from '@/data/announcement-config';
import { cn } from '@/lib/utils';

const ICONS: Record<AnnouncementSeverity, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

interface SeverityBadgeProps {
  severity: AnnouncementSeverity;
  className?: string;
}

export function AnnouncementSeverityBadge({
  severity,
  className,
}: SeverityBadgeProps) {
  const { t } = useTranslation();
  const config = SEVERITY_CONFIG[severity];
  const Icon = ICONS[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0',
        className
      )}
      style={{
        backgroundColor: config.bgColor,
        color: config.color,
      }}
    >
      <Icon className="w-3 h-3" />
      {t(config.labelKey)}
    </span>
  );
}
