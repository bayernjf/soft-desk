import { X, ExternalLink, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { AnnouncementWithState } from '@/types/announcement';
import { SEVERITY_CONFIG } from '@/data/announcement-config';
import { severityIcon } from './severity-icons';

interface AnnouncementBannerProps {
  announcement: AnnouncementWithState;
  onDismiss: (id: string) => void;
}

export function AnnouncementBanner({ announcement, onDismiss }: AnnouncementBannerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = SEVERITY_CONFIG[announcement.severity];
  const Icon = severityIcon(announcement.severity);

  const handleDismiss = () => onDismiss(announcement.id);

  const handleOpen = () => {
    if (announcement.actionUrl) {
      void window.softdesk?.openExternal(announcement.actionUrl);
    } else {
      navigate('/announcements');
    }
  };

  return (
    <div
      className="flex items-center gap-2.5 border-b px-6 py-2 text-xs"
      style={{
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.color }} />
      <button
        type="button"
        onClick={handleOpen}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span
          className="truncate font-semibold"
          style={{ color: config.color }}
        >
          {announcement.title}
        </span>
        <span className="hidden truncate text-slate-600 dark:text-slate-300 sm:inline">
          {announcement.content.split('\n')[0]}
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />
      </button>
      {announcement.actionUrl && (
        <button
          type="button"
          onClick={handleOpen}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/[0.06]"
          style={{ color: config.color }}
          title={t('announcement.learnMore')}
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
        aria-label={t('announcement.close')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
