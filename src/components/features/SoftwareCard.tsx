import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
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
  extraActions?: React.ReactNode;
}

export function SoftwareCard({ software, variant = 'default', context = 'library', extraActions }: SoftwareCardProps) {
  return <SoftwareCardImpl software={software} variant={variant} context={context} extraActions={extraActions} />;
}

const POPUP_SIZE = 240;
const POPUP_INNER = 36;
const POPUP_OUTER = 96;

function popupPolar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function popupSectorPath(cx: number, cy: number, startDeg: number, endDeg: number) {
  const oStart = popupPolar(cx, cy, POPUP_OUTER, startDeg);
  const oEnd = popupPolar(cx, cy, POPUP_OUTER, endDeg);
  const iEnd = popupPolar(cx, cy, POPUP_INNER, endDeg);
  const iStart = popupPolar(cx, cy, POPUP_INNER, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${POPUP_OUTER} ${POPUP_OUTER} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${POPUP_INNER} ${POPUP_INNER} 0 ${largeArc} 0 ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
}

function usePopupTheme() {
  const theme = useSettingsStore((s) => s.theme);
  return useMemo(() => {
    void theme;
    const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light');
    return isLight
      ? {
          sector: 'rgba(155,140,120,0.20)',
          sectorHover: 'rgba(124,58,237,0.18)',
          sectorCurrent: 'rgba(124,58,237,0.30)',
          stroke: 'rgba(124,100,75,0.35)',
          label: '#3b3127',
          labelEmpty: '#9b8c78',
          center: 'rgba(255,253,248,0.92)',
          centerStroke: 'rgba(124,100,75,0.30)',
          indicator: '#7c3aed',
        }
      : {
          sector: 'rgba(51,65,85,0.35)',
          sectorHover: 'rgba(139,92,246,0.20)',
          sectorCurrent: 'rgba(139,92,246,0.35)',
          stroke: 'rgba(148,163,184,0.3)',
          label: '#cbd5e1',
          labelEmpty: 'rgba(148,163,184,0.5)',
          center: 'rgba(21,21,28,0.6)',
          centerStroke: 'rgba(148,163,184,0.2)',
          indicator: '#8b5cf6',
        };
  }, [theme]);
}

function RadialSlotPicker({ software, className }: { software: Software; className?: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [justPicked, setJustPicked] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const radial = useSettingsStore((s) => s.radial);
  const setRadialItem = useSettingsStore((s) => s.setRadialItem);
  const softwareList = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const navigate = useNavigate();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (pickTimer.current) clearTimeout(pickTimer.current);
    };
  }, []);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!loggedIn) {
      navigate('/account');
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPopupPos({ x: rect.right, y: rect.bottom });
    }
    setOpen((v) => !v);
  };

  const handlePick = (visualSlot: number) => {
    const actualSlot = visualSlot + page * radial.sectors;
    setRadialItem(actualSlot, {
      type: 'app',
      targetId: software.id,
      name: software.name,
      icon: software.icon,
      color: software.color,
      bundleId: software.bundleId,
    });
    setJustPicked(true);
    if (pickTimer.current) clearTimeout(pickTimer.current);
    pickTimer.current = setTimeout(() => setJustPicked(false), 2000);
    setOpen(false);
    setToastMsg(`已添加到第${page + 1}页扇区 ${actualSlot + 1}`);
    window.setTimeout(() => setToastMsg(null), 2600);
  };

  const softwareById = new Map(softwareList.map((s) => [s.id, s]));
  const workflowById = new Map(workflows.map((w) => [w.id, w]));

  const labelFor = (targetId: string, type: 'app' | 'workflow', snapshotName?: string) => {
    if (type === 'app') return softwareById.get(targetId)?.name ?? snapshotName ?? '';
    return workflowById.get(targetId)?.name ?? snapshotName ?? '(已删除)';
  };

  const isInRadial = radial.items.some((it) => it.type === 'app' && it.targetId === software.id);

  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light');
  const ring = usePopupTheme();
  const cx = POPUP_SIZE / 2;
  const cy = POPUP_SIZE / 2;
  const sectorAngle = 360 / radial.sectors;

  const panelWidth = 256;
  const panelHeight = 320;
  let panelLeft = popupPos.x - panelWidth + 8;
  let panelTop = popupPos.y + 8;
  if (panelLeft < 8) panelLeft = 8;
  if (panelTop + panelHeight > window.innerHeight - 8) {
    panelTop = popupPos.y - panelHeight - 8;
  }

  const popupContent = open ? (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-[9999] w-64 rounded-xl border shadow-xl p-3',
        isLight
          ? 'bg-white border-slate-200 shadow-slate-300/20'
          : 'bg-slate-900 border-slate-700/80 shadow-black/40'
      )}
      style={{ left: panelLeft, top: panelTop }}
    >
      {/* 页面切换 */}
      <div className={cn('flex items-center gap-1 p-1 rounded-lg mb-3', isLight ? 'bg-slate-100' : 'bg-slate-800/40')}>
        <button
          onClick={(e) => { e.stopPropagation(); setPage(0); }}
          className={cn(
            'flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
            page === 0
              ? (isLight ? 'bg-violet-100 text-violet-600' : 'bg-violet-500/20 text-violet-300')
              : (isLight ? 'text-slate-500 hover:text-slate-700' : 'text-slate-400 hover:text-slate-300')
          )}
        >
          第一页
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setPage(1); }}
          className={cn(
            'flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
            page === 1
              ? (isLight ? 'bg-violet-100 text-violet-600' : 'bg-violet-500/20 text-violet-300')
              : (isLight ? 'text-slate-500 hover:text-slate-700' : 'text-slate-400 hover:text-slate-300')
          )}
        >
          第二页
        </button>
      </div>

      {/* SVG 圆形径向菜单 */}
      <div className="flex justify-center">
        <svg width={POPUP_SIZE} height={POPUP_SIZE} className="overflow-visible">
          {Array.from({ length: radial.sectors }).map((_, visualSlot) => {
            const actualSlot = visualSlot + page * radial.sectors;
            const center = visualSlot * sectorAngle - 90;
            const start = center - sectorAngle / 2;
            const end = center + sectorAngle / 2;
            const item = radial.items.find((it) => it.slot === actualSlot);
            const isCurrent = item?.type === 'app' && item.targetId === software.id;
            const labelPos = popupPolar(cx, cy, (POPUP_INNER + POPUP_OUTER) / 2, center);
            return (
              <g
                key={visualSlot}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePick(visualSlot);
                }}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d={popupSectorPath(cx, cy, start, end)}
                  fill={isCurrent ? ring.sectorCurrent : item ? ring.sector : ring.sector}
                  stroke={ring.stroke}
                  strokeWidth={1}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fill={item ? ring.label : ring.labelEmpty}
                >
                  {item ? labelFor(item.targetId, item.type, item.name).slice(0, 5) : '+'}
                </text>
                {isCurrent && (
                  <circle
                    cx={labelPos.x + 16}
                    cy={labelPos.y - 16}
                    r={3}
                    fill={ring.indicator}
                  />
                )}
              </g>
            );
          })}
          <circle
            cx={cx}
            cy={cy}
            r={POPUP_INNER - 2}
            fill={ring.center}
            stroke={ring.centerStroke}
          />
        </svg>
      </div>

      {isInRadial && (
        <div className={cn('mt-2 text-[10px] text-center', isLight ? 'text-slate-400' : 'text-slate-500')}>
          该应用已在径向菜单中
        </div>
      )}
    </div>
  ) : null;

  const toastContent = toastMsg ? (
    <div className="fixed top-6 right-6 z-[9999] animate-in">
      <div className={cn(
        'flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium whitespace-nowrap',
        isLight
          ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
          : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50'
      )}>
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        {toastMsg}
      </div>
    </div>
  ) : null;

  return (
    <div className={cn('relative', className)}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={cn(
          'p-1.5 rounded-lg transition-all duration-200',
          isInRadial ? 'text-violet-400 hover:text-violet-300' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/60',
          justPicked && 'text-emerald-400'
        )}
        title={isInRadial ? '已加入径向菜单' : '发送到径向菜单'}
      >
        <Target className="w-4 h-4" />
      </button>
      {open && createPortal(popupContent, document.body)}
      {toastContent && createPortal(toastContent, document.body)}
    </div>
  );
}

const SoftwareCardImpl = memo(function SoftwareCardImpl({ software, variant = 'default', context = 'library', extraActions }: SoftwareCardProps) {
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
        {extraActions}
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
