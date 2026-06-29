import { useEffect, useRef, useState, memo } from 'react';
import { Play, Clock, HardDrive, Download, Trash2, RotateCcw, Star, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '@/data/categories';
import type { Software } from '@/types';
import { useSoftwareStore } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore } from '@/stores/settings.store';
import { formatMinutes, formatTimeAgo } from '@/services/software.service';
import { AppIcon } from './AppIcon';
import { SoftwareCardTooltip } from './SoftwareCardTooltip';
import { cn } from '@/lib/utils';

interface SoftwareCardProps {
  software: Software;
  variant?: 'default' | 'compact' | 'large';
  context?: 'library' | 'uninstall';
}

export function SoftwareCard({ software, variant = 'default', context = 'library' }: SoftwareCardProps) {
  return <SoftwareCardImpl software={software} variant={variant} context={context} />;
}

function RadialSlotPicker({ software, className }: { software: Software; className?: string }) {
  const [open, setOpen] = useState(false);
  const radial = useSettingsStore((s) => s.radial);
  const setRadialItem = useSettingsStore((s) => s.setRadialItem);
  const softwareList = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!loggedIn) {
      navigate('/account');
      return;
    }
    setOpen((v) => !v);
  };

  const handlePick = (slot: number) => {
    setRadialItem(slot, {
      type: 'app',
      targetId: software.id,
      name: software.name,
      icon: software.icon,
      color: software.color,
    });
    setOpen(false);
  };

  const softwareById = new Map(softwareList.map((s) => [s.id, s]));
  const workflowById = new Map(workflows.map((w) => [w.id, w]));

  const labelFor = (targetId: string, type: 'app' | 'workflow') => {
    if (type === 'app') return softwareById.get(targetId)?.name ?? '(已卸载)';
    return workflowById.get(targetId)?.name ?? '(已删除)';
  };

  const isInRadial = radial.items.some((it) => it.type === 'app' && it.targetId === software.id);

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={handleToggle}
        className={cn(
          'p-1.5 rounded-lg transition-all duration-200',
          isInRadial ? 'text-violet-400 hover:text-violet-300' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/60'
        )}
        title={isInRadial ? '已加入径向菜单' : '发送到径向菜单'}
      >
        <Target className="w-4 h-4" />
      </button>
      {open && (
        <div
          ref={panelRef}
          className="absolute top-full right-0 mt-2 z-30 w-56 rounded-xl bg-slate-900 border border-slate-700/80 shadow-xl shadow-black/40 p-3"
        >
          <div className="text-xs font-medium text-slate-300 mb-2">选择扇区</div>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: radial.sectors }).map((_, slot) => {
              const item = radial.items.find((it) => it.slot === slot);
              const isCurrent = item?.type === 'app' && item.targetId === software.id;
              return (
                <button
                  key={slot}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePick(slot);
                  }}
                  className={cn(
                    'relative flex flex-col items-center justify-center rounded-lg p-1.5 text-[10px] transition-colors border',
                    isCurrent
                      ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                      : item
                        ? 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:bg-slate-700/60'
                        : 'bg-slate-800/30 border-slate-700/40 text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
                  )}
                  title={item ? labelFor(item.targetId, item.type) : '空扇区'}
                >
                  <span className={cn('font-semibold', isCurrent && 'text-violet-300')}>{slot + 1}</span>
                  <span className="truncate max-w-full mt-0.5 leading-tight">
                    {item ? labelFor(item.targetId, item.type).slice(0, 4) : '+'}
                  </span>
                  {isCurrent && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-400" />}
                </button>
              );
            })}
          </div>
          {isInRadial && (
            <div className="mt-2 text-[10px] text-slate-500 text-center">该应用已在径向菜单中</div>
          )}
        </div>
      )}
    </div>
  );
}

const SoftwareCardImpl = memo(function SoftwareCardImpl({ software, variant = 'default', context = 'library' }: SoftwareCardProps) {
  const navigate = useNavigate();
  const launchSoftware = useSoftwareStore((s) => s.launchSoftware);
  const removeSoftware = useSoftwareStore((s) => s.removeSoftware);
  const reinstallSoftware = useSoftwareStore((s) => s.reinstallSoftware);
  const uninstallSoftware = useSoftwareStore((s) => s.uninstallSoftware);
  const purgeSoftware = useSoftwareStore((s) => s.purgeSoftware);
  const scanSoftware = useSoftwareStore((s) => s.scanSoftware);
  const favoriteIds = useSoftwareStore((s) => s.favoriteIds);
  const toggleFavorite = useSoftwareStore((s) => s.toggleFavorite);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const categoryMeta = CATEGORIES.find((c) => c.id === software.category);
  const isFavorite = favoriteIds.includes(software.id);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!loggedIn) {
      navigate('/account');
      return;
    }
    void toggleFavorite(software.id);
  };

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
      <div ref={wrapperRef} className="relative group/card">
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 transition-all duration-200 opacity-0 group-hover/card:opacity-100">
          <RadialSlotPicker software={software} />
          <button
            onClick={handleFavoriteClick}
            className={cn(
              'p-1 rounded-md transition-all duration-200',
              isFavorite ? 'opacity-100' : '',
              isFavorite ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/60'
            )}
            title={isFavorite ? '取消收藏' : loggedIn ? '收藏' : '请先登录后收藏'}
          >
            <Star className={cn('w-3 h-3', isFavorite && 'fill-amber-400')} />
          </button>
        </div>
        <SoftwareCardTooltip software={software}>
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
            <span data-no-tooltip className="shrink-0">
              <Play className="w-3.5 h-3.5 text-slate-500" />
            </span>
          </button>
        </SoftwareCardTooltip>
        {overlay}
      </div>
    );
  }

  if (variant === 'large') {
    return (
      <div ref={wrapperRef} className="relative group/card">
        <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 transition-all duration-200 opacity-0 group-hover/card:opacity-100">
          <RadialSlotPicker software={software} />
          <button
            onClick={handleFavoriteClick}
            className={cn(
              'p-1.5 rounded-lg transition-all duration-200',
              isFavorite ? 'opacity-100' : '',
              isFavorite ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/60'
            )}
            title={isFavorite ? '取消收藏' : loggedIn ? '收藏' : '请先登录后收藏'}
          >
            <Star className={cn('w-4 h-4', isFavorite && 'fill-amber-400')} />
          </button>
        </div>
        <SoftwareCardTooltip software={software}>
          <button
            onClick={handleClick}
            className={cn(
              'w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all duration-200 group',
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
              <span data-no-tooltip className="shrink-0">
                <div
                  className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200',
                    'bg-slate-800/60 text-slate-400 group-hover:bg-violet-500/20 group-hover:text-violet-300'
                  )}
                >
                  <Play className="w-5 h-5 ml-0.5" />
                </div>
              </span>
            </div>
          </button>
        </SoftwareCardTooltip>
        {overlay}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative group/card">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 transition-all duration-200 opacity-0 group-hover/card:opacity-100">
        <RadialSlotPicker software={software} />
        <button
          onClick={handleFavoriteClick}
          className={cn(
            'p-1.5 rounded-lg transition-all duration-200',
            isFavorite ? 'opacity-100' : '',
            isFavorite ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/60'
          )}
          title={isFavorite ? '取消收藏' : loggedIn ? '收藏' : '请先登录后收藏'}
        >
          <Star className={cn('w-4 h-4', isFavorite && 'fill-amber-400')} />
        </button>
      </div>
      <SoftwareCardTooltip software={software}>
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
            <span data-no-tooltip className="shrink-0">
              {isDeleted ? (
                <Download className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
              ) : context === 'uninstall' ? (
                isUninstalled ? (
                  <Download className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                ) : (
                  <Trash2 className="w-4 h-4 text-slate-600 group-hover:text-rose-400 transition-colors" />
                )
              ) : (
                <Play className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors" />
              )}
            </span>
          </div>
        </button>
      </SoftwareCardTooltip>
      {overlay}
    </div>
  );
});
