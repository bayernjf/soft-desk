import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  RefreshCw,
  Loader2,
  ExternalLink,
  Pin,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAnnouncementStore } from '@/stores/announcement.store';
import type { AnnouncementWithState } from '@/types/announcement';
import { SEVERITY_CONFIG } from '@/data/announcement-config';
import { AnnouncementSeverityBadge } from '@/components/features/announcement/AnnouncementSeverityBadge';
import { severityIcon } from '@/components/features/announcement/severity-icons';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'unread';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function AnnouncementsPage() {
  const { t } = useTranslation();
  const { announcements, loading, fetchAnnouncements, markRead } =
    useAnnouncementStore();
  const [tab, setTab] = useState<Tab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  const filtered = useMemo(() => {
    if (tab === 'unread') return announcements.filter((a) => !a.read);
    return announcements;
  }, [announcements, tab]);

  const selected = useMemo(
    () => announcements.find((a) => a.id === selectedId) ?? null,
    [announcements, selectedId]
  );

  const handleOpen = useCallback(
    (item: AnnouncementWithState) => {
      setSelectedId(item.id);
      if (!item.read) void markRead(item.id);
    },
    [markRead]
  );

  const handleOpenAction = (url: string) => {
    void window.softdesk?.openExternal(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {t('announcement.pageTitle')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('announcement.pageSubtitle')}
          </p>
        </div>
        <button
          onClick={() => void fetchAnnouncements()}
          disabled={loading}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors disabled:opacity-50"
          title={t('announcement.refresh')}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-800/40 w-fit">
        {(
          [
            { id: 'all' as const, label: t('announcement.tabAll') },
            { id: 'unread' as const, label: t('announcement.tabUnread') },
          ]
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setTab(opt.id)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
              tab === opt.id
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading && announcements.length === 0 ? (
        <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('announcement.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-4">
            <Megaphone className="w-7 h-7 text-slate-600" />
          </div>
          <h3 className="text-sm font-medium text-slate-300 mb-1">
            {tab === 'unread'
              ? t('announcement.noUnread')
              : t('announcement.empty')}
          </h3>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => {
            const config = SEVERITY_CONFIG[item.severity];
            const Icon = severityIcon(item.severity);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpen(item)}
                className={cn(
                  'w-full text-left p-4 rounded-2xl border transition-colors',
                  'bg-slate-900/40 hover:border-slate-700/80',
                  item.read
                    ? 'border-slate-800/60'
                    : 'border-slate-700/60 hover:border-violet-500/40'
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: config.bgColor }}
                  >
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.isPinned && (
                        <Pin
                          className="w-3 h-3 text-amber-400 shrink-0"
                          fill="currentColor"
                        />
                      )}
                      <AnnouncementSeverityBadge severity={item.severity} />
                      {!item.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                      )}
                      <span className="text-[11px] text-slate-500 ml-auto shrink-0">
                        {formatDate(item.publishAt)}
                      </span>
                    </div>
                    <h3
                      className={cn(
                        'text-sm truncate mb-1',
                        item.read
                          ? 'font-medium text-slate-300'
                          : 'font-semibold text-white'
                      )}
                    >
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {item.content.split('\n')[0]}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[90] flex justify-end">
          <div
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px] dark:bg-slate-950/70"
            onClick={() => setSelectedId(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-detail-title"
            className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-[#fffdf8] shadow-2xl shadow-slate-900/20 animate-in slide-in-from-right dark:border-slate-800/60 dark:bg-[#1a1a1c] dark:shadow-black/50"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                aria-label={t('announcement.back')}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {t('announcement.detail')}
              </span>
              {selected.read && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  {t('announcement.readMark')}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mb-3 flex items-center gap-2">
                {selected.isPinned && (
                  <Pin
                    className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400"
                    fill="currentColor"
                  />
                )}
                <AnnouncementSeverityBadge severity={selected.severity} />
                <span className="ml-auto text-[11px] text-slate-500">
                  {formatDate(selected.publishAt)}
                </span>
              </div>
              <h2
                id="announcement-detail-title"
                className="mb-4 text-lg font-semibold text-slate-900 dark:text-white"
              >
                {selected.title}
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-300">
                {selected.content}
              </p>
            </div>

            {selected.actionUrl && (
              <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={() => handleOpenAction(selected.actionUrl!)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all hover:brightness-95 active:scale-[0.99] dark:hover:brightness-110"
                  style={{
                    backgroundColor: SEVERITY_CONFIG[selected.severity].color,
                    color: '#ffffff',
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('announcement.learnMore')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
