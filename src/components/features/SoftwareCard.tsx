import { Play, Clock, HardDrive } from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import type { Software } from '@/types';
import { useSoftwareStore } from '@/stores/software.store';
import { formatMinutes, formatTimeAgo } from '@/services/software.service';
import { cn } from '@/lib/utils';

interface SoftwareCardProps {
  software: Software;
  variant?: 'default' | 'compact' | 'large';
}

export function SoftwareCard({ software, variant = 'default' }: SoftwareCardProps) {
  const launchSoftware = useSoftwareStore((s) => s.launchSoftware);
  const categoryMeta = CATEGORIES.find((c) => c.id === software.category);

  if (variant === 'compact') {
    return (
      <button
        onClick={() => launchSoftware(software.id)}
        className={cn(
          'w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all duration-200',
          'bg-slate-900/40 hover:bg-slate-800/70 border border-slate-800/60 hover:border-slate-700'
        )}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-semibold shrink-0"
          style={{ backgroundColor: software.color + '25', color: software.color }}
        >
          {software.name.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-100 truncate">{software.name}</div>
          <div className="text-xs text-slate-500 truncate">{categoryMeta?.name}</div>
        </div>
        <Play className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      </button>
    );
  }

  if (variant === 'large') {
    return (
      <button
        onClick={() => launchSoftware(software.id)}
        className={cn(
          'w-full p-4 rounded-2xl text-left transition-all duration-300 group',
          'bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700/60',
          'hover:shadow-lg hover:shadow-slate-900/50 hover:-translate-y-0.5'
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
            style={{ backgroundColor: software.color + '25', color: software.color }}
          >
            {software.name.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-white truncate group-hover:text-white">
                  {software.name}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5 truncate">{software.description}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: software.color }} />
                {categoryMeta?.name}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {formatTimeAgo(software.lastUsed)}
              </span>
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3 h-3" />
                {software.size} MB
              </span>
              {software.tags.length > 0 && (
                <span className="flex items-center gap-1.5">
                  {software.tags.slice(0, 2).map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded-md bg-slate-800/60 text-slate-400">
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200',
              'bg-slate-800/60 text-slate-400 group-hover:bg-violet-500/20 group-hover:text-violet-300'
            )}
          >
            <Play className="w-5 h-5 ml-0.5" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={() => launchSoftware(software.id)}
      className={cn(
        'w-full p-3.5 rounded-2xl text-left transition-all duration-200 group',
        'bg-slate-900/40 hover:bg-slate-800/70 border border-slate-800/60 hover:border-slate-700/80'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold shrink-0 transition-transform duration-200 group-hover:scale-105"
          style={{ backgroundColor: software.color + '25', color: software.color }}
        >
          {software.name.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-100 truncate">{software.name}</h3>
          <p className="text-xs text-slate-500 truncate mt-0.5">{software.description}</p>
          <div className="flex items-center gap-2.5 mt-1.5 text-xs text-slate-500">
            <span>{categoryMeta?.name}</span>
            <span className="text-slate-700">•</span>
            <span>{formatMinutes(software.usageMinutes)}</span>
          </div>
        </div>
        <Play className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" />
      </div>
    </button>
  );
}
