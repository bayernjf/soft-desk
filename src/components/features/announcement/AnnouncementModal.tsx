import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnnouncementWithState } from '@/types/announcement';
import { SEVERITY_CONFIG } from '@/data/announcement-config';
import { severityIcon } from './severity-icons';
import { AnnouncementSeverityBadge } from './AnnouncementSeverityBadge';

interface AnnouncementModalProps {
  announcement: AnnouncementWithState;
  onClose: () => void;
}

export function AnnouncementModal({ announcement, onClose }: AnnouncementModalProps) {
  const { t } = useTranslation();
  const config = SEVERITY_CONFIG[announcement.severity];
  const Icon = severityIcon(announcement.severity);

  // ESC 关闭(仅可关闭的公告生效)
  useEffect(() => {
    if (!announcement.isDismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [announcement.isDismissible, onClose]);

  const handleAction = () => {
    if (announcement.actionUrl) {
      void window.softdesk?.openExternal(announcement.actionUrl);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/45 dark:bg-slate-950/75 backdrop-blur-sm"
        onClick={announcement.isDismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-modal-title"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border bg-[#fffdf8] shadow-2xl shadow-slate-900/20 dark:bg-[#1a1a1c] dark:shadow-black/50"
        style={{ borderColor: config.borderColor }}
      >
        <div
          className="flex items-center gap-3 border-b px-5 py-4"
          style={{
            backgroundColor: config.bgColor,
            borderColor: config.borderColor,
          }}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 shadow-sm dark:bg-white/[0.06] dark:shadow-none">
            <Icon className="h-5 w-5" style={{ color: config.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <AnnouncementSeverityBadge severity={announcement.severity} />
            </div>
            <h2
              id="announcement-modal-title"
              className="truncate text-lg font-semibold text-slate-900 dark:text-white"
            >
              {announcement.title}
            </h2>
          </div>
          {announcement.isDismissible && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              aria-label={t('announcement.close')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-5 py-5">
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-300">
            {announcement.content}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
          >
            {t('announcement.gotIt')}
          </button>
          {announcement.actionUrl && (
            <button
              type="button"
              onClick={handleAction}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:brightness-95 active:scale-[0.98] dark:hover:brightness-110"
              style={{ backgroundColor: config.color, color: '#ffffff' }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('announcement.learnMore')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
