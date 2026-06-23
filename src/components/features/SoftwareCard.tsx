import { useEffect, useRef, useState, memo } from 'react';
import { Play, Clock, HardDrive, Download, Trash2, RotateCcw } from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import type { Software } from '@/types';
import { useSoftwareStore } from '@/stores/software.store';
import { formatMinutes, formatTimeAgo } from '@/services/software.service';
import { AppIcon } from './AppIcon';
import { cn } from '@/lib/utils';

interface SoftwareCardProps {
  software: Software;
  variant?: 'default' | 'compact' | 'large';
  context?: 'library' | 'uninstall';
}

export function SoftwareCard({ software, variant = 'default', context = 'library' }: SoftwareCardProps) {
  return <SoftwareCardImpl software={software} variant={variant} context={context} />;
}

const SoftwareCardImpl = memo(function SoftwareCardImpl({ software, variant = 'default', context = 'library' }: SoftwareCardProps) {
  const launchSoftware = useSoftwareStore((s) => s.launchSoftware);
  const removeSoftware = useSoftwareStore((s) => s.removeSoftware);
  const reinstallSoftware = useSoftwareStore((s) => s.reinstallSoftware);
  const uninstallSoftware = useSoftwareStore((s) => s.uninstallSoftware);
  const purgeSoftware = useSoftwareStore((s) => s.purgeSoftware);
  const scanSoftware = useSoftwareStore((s) => s.scanSoftware);
  const categoryMeta = CATEGORIES.find((c) => c.id === software.category);

  const isDeleted = !!software.deleted;
  const isUninstalled = !!software.uninstalled;
  const inactive = isDeleted || isUninstalled;
  const statusLabel = isDeleted ? '已从本地电脑删除' : '已弃用';
  const [prompt, setPrompt] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!prompt) return;
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPrompt(false);
        setRemoveError(null);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [prompt]);

  const handleClick = () => {
    if (isDeleted) {
      setPrompt((v) => !v);
      return;
    }
    if (context === 'uninstall') {
      setPrompt((v) => !v);
      return;
    }
    if (isUninstalled) {
      setPrompt((v) => !v);
    } else {
      launchSoftware(software.id);
    }
  };

  const close = () => {
    setPrompt(false);
    setRemoveError(null);
  };

  const handleReinstall = () => {
    void scanSoftware();
    close();
  };

  const handleRemove = async () => {
    if (isDeleted) {
      purgeSoftware(software.id);
      close();
      return;
    }
    const result = await removeSoftware(software.id);
    if (result.success) {
      close();
    } else {
      setRemoveError(result.error ?? '移除失败');
    }
  };

  let overlay: React.ReactNode = null;
  if (prompt) {
    if (isDeleted) {
      overlay = (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-slate-950/90 backdrop-blur-sm px-4">
          <p className="text-xs text-slate-300 text-center truncate max-w-full">
            {software.name}已从本地删除
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleReinstall();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重新安装
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleRemove();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              从 SoftDesk 移除
            </button>
          </div>
        </div>
      );
    } else if (context === 'library' && isUninstalled) {
      overlay = (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-slate-950/90 backdrop-blur-sm px-4">
          <p className="text-xs text-slate-300 text-center">
            重新使用「{software.name}」？
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                reinstallSoftware(software.id);
                close();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              确认重新使用
            </button>
          </div>
        </div>
      );
    } else if (context === 'uninstall' && isUninstalled) {
      overlay = (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-slate-950/90 backdrop-blur-sm px-4">
          <p className="text-xs text-slate-300 text-center truncate max-w-full">{software.name}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                reinstallSoftware(software.id);
                close();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重新使用
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleRemove();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              移到废纸篓
            </button>
          </div>
          {removeError && (
            <p className="text-[11px] text-rose-400 text-center leading-snug">{removeError}</p>
          )}
        </div>
      );
    } else if (context === 'uninstall' && !isUninstalled) {
      overlay = (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-slate-950/90 backdrop-blur-sm px-4">
          <p className="text-xs text-slate-300 text-center">
            弃用「{software.name}」？
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                uninstallSoftware(software.id);
                close();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              确认弃用
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500 text-white hover:bg-rose-600 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      );
    }
  }

  if (variant === 'compact') {
    return (
      <div ref={wrapperRef} className="relative">
        <button
          onClick={handleClick}
          className={cn(
            'w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all duration-200',
            'bg-slate-900/40 hover:bg-slate-800/70 border border-slate-800/60 hover:border-slate-700',
            inactive && 'grayscale opacity-50 hover:opacity-70'
          )}
        >
          <AppIcon software={software} size={36} rounded="rounded-lg" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-100 truncate">{software.name}</div>
            <div className="text-xs text-slate-500 truncate">
              {inactive ? statusLabel : categoryMeta?.name}
            </div>
          </div>
          <Play className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        </button>
        {overlay}
      </div>
    );
  }

  if (variant === 'large') {
    return (
      <div ref={wrapperRef} className="relative">
        <button
          onClick={handleClick}
          className={cn(
            'w-full p-4 rounded-2xl text-left transition-all duration-300 group',
            'bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700/60',
            'hover:shadow-lg hover:shadow-slate-900/50 hover:-translate-y-0.5',
            inactive && 'grayscale opacity-50 hover:opacity-70 hover:translate-y-0'
          )}
        >
          <div className="flex items-start gap-4">
            <AppIcon software={software} size={48} rounded="rounded-xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white truncate group-hover:text-white">
                    {software.name}
                    {inactive && (
                      <span className="ml-2 text-xs font-medium text-slate-500">{statusLabel}</span>
                    )}
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
        {overlay}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={handleClick}
        className={cn(
          'w-full p-3.5 rounded-2xl text-left transition-all duration-200 group',
          'bg-slate-900/40 hover:bg-slate-800/70 border border-slate-800/60 hover:border-slate-700/80',
          inactive && 'grayscale opacity-50 hover:opacity-70'
        )}
      >
        <div className="flex items-center gap-3">
          <AppIcon
            software={software}
            size={40}
            rounded="rounded-xl"
            className="transition-transform duration-200 group-hover:scale-105"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 truncate">
              {software.name}
              {inactive && (
                <span className="ml-2 text-xs font-medium text-slate-500">{statusLabel}</span>
              )}
            </h3>
            <p className="text-xs text-slate-500 truncate mt-0.5">{software.description}</p>
            <div className="flex items-center gap-2.5 mt-1.5 text-xs text-slate-500">
              <span>{categoryMeta?.name}</span>
              <span className="text-slate-700">•</span>
              <span>{formatMinutes(software.usageMinutes)}</span>
            </div>
          </div>
          {isDeleted ? (
            <Download className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0" />
          ) : context === 'uninstall' ? (
            isUninstalled ? (
              <Download className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0" />
            ) : (
              <Trash2 className="w-4 h-4 text-slate-600 group-hover:text-rose-400 transition-colors shrink-0" />
            )
          ) : (
            <Play className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" />
          )}
        </div>
      </button>
      {overlay}
    </div>
  );
});
