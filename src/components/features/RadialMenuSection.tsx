import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, X, AppWindow, Layers, Keyboard, Mouse, LogIn, Clock, ChevronDown, Check, Share2 } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings.store';
import { useSoftwareStore } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { syncRadialToMain } from '@/services/radial.service';
import { serializeRadial } from '@/services/share-serializer';
import { ShareDialog } from './ShareDialog';
import { AppIcon } from './AppIcon';
import { cn } from '@/lib/utils';
import type { RadialItem, RadialRenderItem, RadialStyle } from '@/types';
import { getRadialStyleTokens, RADIAL_STYLE_OPTIONS } from './radial-styles';

const PREVIEW_SIZE = 240;
const PREVIEW_INNER = 44;
const PREVIEW_OUTER = 108;

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

/** 把键盘事件转成 Electron accelerator(如 'Command+Shift+R' / 'Control+Alt+P');
 *  Command 与 Control 分别独立识别(mac 上是两个不同的键),
 *  必须包含至少一个修饰键 + 一个主键,否则返回 null(不接受裸键作为全局热键)。 */
function eventToAccelerator(e: React.KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.metaKey) mods.push('Command');
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  const key = e.key;
  // 纯修饰键本身不作为主键
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;

  let main = '';
  if (/^[a-zA-Z]$/.test(key)) main = key.toUpperCase();
  else if (/^[0-9]$/.test(key)) main = key;
  else if (key === ' ') main = 'Space';
  else if (key.startsWith('F') && /^F\d{1,2}$/.test(key)) main = key;
  else if (key === 'ArrowUp') main = 'Up';
  else if (key === 'ArrowDown') main = 'Down';
  else if (key === 'ArrowLeft') main = 'Left';
  else if (key === 'ArrowRight') main = 'Right';
  else if (key.length === 1) main = key.toUpperCase();

  // macOS 上 Control+字母 的 e.key 可能是控制字符,用 e.code 兜底解析主键
  if (!main && e.code) {
    const m = /^Key([A-Z])$/.exec(e.code) || /^Digit([0-9])$/.exec(e.code);
    if (m) main = m[1];
    else if (e.code === 'Space') main = 'Space';
  }

  if (!main || mods.length === 0) return null;
  return [...mods, main].join('+');
}

/** 把 accelerator 渲染成 mac 风格符号(⌘⌃⌥⇧)或 Win 风格文本 */
function formatAccelerator(accel: string): string {
  return accel
    .split('+')
    .map((part) => {
      // 兼容历史配置里的 CommandOrControl
      if (part === 'CommandOrControl') return IS_MAC ? '⌘' : 'Ctrl';
      if (part === 'Command' || part === 'Cmd' || part === 'Meta' || part === 'Super')
        return IS_MAC ? '⌘' : 'Win';
      if (part === 'Control' || part === 'Ctrl') return IS_MAC ? '⌃' : 'Ctrl';
      if (part === 'Alt' || part === 'Option') return IS_MAC ? '⌥' : 'Alt';
      if (part === 'Shift') return IS_MAC ? '⇧' : 'Shift';
      return part;
    })
    .join(IS_MAC ? '' : '+');
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function sectorPath(cx: number, cy: number, startDeg: number, endDeg: number) {
  const oStart = polar(cx, cy, PREVIEW_OUTER, startDeg);
  const oEnd = polar(cx, cy, PREVIEW_OUTER, endDeg);
  const iEnd = polar(cx, cy, PREVIEW_INNER, endDeg);
  const iStart = polar(cx, cy, PREVIEW_INNER, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${PREVIEW_OUTER} ${PREVIEW_OUTER} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${PREVIEW_INNER} ${PREVIEW_INNER} 0 ${largeArc} 0 ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
}

export function RadialMenuSection() {
  const radial = useSettingsStore((s) => s.radial);
  const setRadialConfig = useSettingsStore((s) => s.setRadialConfig);
  const setRadialItem = useSettingsStore((s) => s.setRadialItem);
  const software = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const navigate = useNavigate();

  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // 勾选「最近使用」时,设置面板默认也停在最近使用页(与运行时行为一致);
  // 未勾选则保持原行为,默认第一页。
  const [previewPage, setPreviewPage] = useState<0 | 1 | 'recent'>(() =>
    useSettingsStore.getState().radial.showRecent ? 'recent' : 0
  );
  const [recording, setRecording] = useState(false);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const recordBtnRef = useRef<HTMLButtonElement>(null);

  // 预览圆环是 SVG,颜色写死无法被 html.light 的工具类覆盖,故按当前主题切换两套配色
  const theme = useSettingsStore((s) => s.theme);
  const isLightPreview = useMemo(() => {
    void theme; // 依赖 theme,主题切换时重算
    return typeof document !== 'undefined' && document.documentElement.classList.contains('light');
  }, [theme]);
  // 风格 tokens(预览圆环 + 选中态背景共用),浅/深色由当前主题决定
  const previewStyle: RadialStyle = radial.style ?? 'default';
  const previewTokens = useMemo(
    () => getRadialStyleTokens(previewStyle, isLightPreview),
    [previewStyle, isLightPreview]
  );

  // 「风格」下拉栏:形态与 AiModelModal 内的 listbox 一致(button + role=listbox),
  // 主题适配走 html.light 全局重写,这里只写深色类。
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const currentStyleOption = useMemo(
    () => RADIAL_STYLE_OPTIONS.find((o) => o.value === previewStyle) ?? RADIAL_STYLE_OPTIONS[0],
    [previewStyle]
  );

  const availableSoftware = useMemo(
    () => software.filter((s) => !s.uninstalled && !s.deleted).sort((a, b) => a.name.localeCompare(b.name)),
    [software]
  );
  const softwareById = useMemo(() => new Map(software.map((s) => [s.id, s])), [software]);
  const workflowById = useMemo(() => new Map(workflows.map((w) => [w.id, w])), [workflows]);

  // 关闭最近使用后若当前停留在该页,自动回退到第一页;
  // 反之刚勾选最近使用时,自动跳到最近使用页(与运行时的"默认页"保持一致体验)。
  const prevShowRecentRef = useRef<boolean>(radial.showRecent);
  useEffect(() => {
    const prev = prevShowRecentRef.current;
    if (prev !== radial.showRecent) {
      if (radial.showRecent) {
        setPreviewPage('recent');
        setEditingSlot(null);
      } else if (previewPage === 'recent') {
        setPreviewPage(0);
      }
      prevShowRecentRef.current = radial.showRecent;
    }
  }, [previewPage, radial.showRecent]);

  // 最近使用页的应用列表:从主进程拉 LRU 队列(与运行时径向菜单完全一致)。
  // 切到该 tab 时每秒轮询一次,使预览实时跟随你切换前台应用的动作。
  const [recentRenderItems, setRecentRenderItems] = useState<RadialRenderItem[]>([]);
  useEffect(() => {
    if (!radial.showRecent || previewPage !== 'recent') return;
    let cancelled = false;
    const fetchRecent = async () => {
      try {
        const list = (await window.softdesk?.radialGetRecent?.()) ?? [];
        if (!cancelled) setRecentRenderItems(list);
      } catch {
        // 静默:取不到时保留上一次结果
      }
    };
    void fetchRecent();
    const t = setInterval(fetchRecent, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [radial.showRecent, previewPage, radial.sectors]);

  const itemBySlot = useMemo(() => {
    const m = new Map<number, RadialItem>();
    if (previewPage === 'recent') {
      // 把主进程下发的 RadialRenderItem 当作 RadialItem 形态填充(只用于展示名称/图标)
      recentRenderItems.forEach((it, idx) => {
        m.set(idx, {
          slot: idx,
          type: it.type,
          targetId: it.targetId,
          name: it.name,
          icon: it.icon,
          color: it.color,
        });
      });
      return m;
    }
    radial.items.forEach((it) => {
      const page = Math.floor(it.slot / radial.sectors);
      const visualSlot = it.slot % radial.sectors;
      if (page === previewPage) {
        m.set(visualSlot, it);
      }
    });
    return m;
  }, [radial.items, radial.sectors, previewPage, recentRenderItems]);

  const cx = PREVIEW_SIZE / 2;
  const cy = PREVIEW_SIZE / 2;
  const sectorAngle = 360 / radial.sectors;

  const labelFor = (item: RadialItem | undefined): string => {
    if (!item) return '';
    if (item.type === 'app') return softwareById.get(item.targetId)?.name ?? item.name ?? '';
    return workflowById.get(item.targetId)?.name ?? item.name ?? '(已删除)';
  };

  const handlePreview = () => {
    window.softdesk?.radialPreview?.();
  };

  const startRecording = () => {
    setHotkeyError(null);
    setRecording(true);
    requestAnimationFrame(() => recordBtnRef.current?.focus());
  };

  const handleRecordKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }
    const accel = eventToAccelerator(e);
    if (!accel) {
      setHotkeyError('请至少包含一个修饰键（⌘/⌃/⌥/⇧）和一个主键');
      return;
    }
    setRecording(false);
    setHotkeyError(null);
    // 先更新本地配置(乐观),再根据主进程注册结果回滚提示
    const prev = radial.hotkey;
    setRadialConfig({ hotkey: accel });
    void syncRadialToMain({ ...radial, hotkey: accel }, software, workflows).then((res) => {
      if (res && res.hotkeyRegistered === false) {
        setHotkeyError(`快捷键 ${formatAccelerator(accel)} 已被占用，已恢复原快捷键`);
        setRadialConfig({ hotkey: prev });
      }
    });
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-base font-semibold text-slate-100">径向菜单</h2>
        {loggedIn && radial.items.length > 0 && (
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-violet-300 hover:bg-violet-500/15 border border-violet-500/30 transition-colors"
            title="分享当前径向菜单配置"
          >
            <Share2 className="w-3.5 h-3.5" />
            分享配置
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        按下全局快捷键，在光标处弹出圆形快捷菜单，快速启动应用或工作流
      </p>

      <div className="flex items-start justify-between gap-4 p-4 rounded-xl hover:bg-slate-800/30 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-200">启用径向菜单</div>
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            开启后可用快捷键{' '}
            <kbd className="px-1 py-0.5 rounded bg-slate-800 font-mono text-[10px]">
              {formatAccelerator(radial.hotkey)}
            </kbd>{' '}
            在光标处唤出
          </div>
        </div>
        <button
          onClick={() => setRadialConfig({ enabled: !radial.enabled })}
          role="switch"
          aria-checked={radial.enabled}
          aria-label="启用径向菜单"
          disabled={!loggedIn}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
            radial.enabled ? 'bg-violet-500' : 'bg-slate-700',
            !loggedIn && 'opacity-40 cursor-not-allowed'
          )}
        >
          <span
            className={cn(
              'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all',
              radial.enabled ? 'left-6' : 'left-1'
            )}
          />
        </button>
      </div>

      {/* 唤出快捷键自定义:点击进入录制态,按下组合键即设置并实时生效 */}
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="text-sm text-slate-300">唤出快捷键</div>
        <div className="flex flex-col items-end gap-1">
          <button
            ref={recordBtnRef}
            onClick={startRecording}
            onKeyDown={handleRecordKeyDown}
            onBlur={() => setRecording(false)}
            disabled={!loggedIn}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors min-w-[120px] justify-center',
              recording
                ? 'border-violet-500/60 bg-violet-500/15 text-violet-200 animate-pulse'
                : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800',
              !loggedIn && 'opacity-40 cursor-not-allowed hover:bg-slate-800/60'
            )}
          >
            <Keyboard className="w-3.5 h-3.5" />
            {recording ? '请按下快捷键…' : formatAccelerator(radial.hotkey)}
          </button>
          {hotkeyError && <span className="text-[11px] text-rose-400">{hotkeyError}</span>}
          {recording && !hotkeyError && (
            <span className="text-[11px] text-slate-500">Esc 取消</span>
          )}
        </div>
      </div>

      {/* 鼠标中键(滚轮)唤出:需 macOS 辅助功能权限,首次开启系统会提示授权 */}
      <div className="flex items-start justify-between gap-4 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-300 flex items-center gap-1.5">
            <Mouse className="w-3.5 h-3.5" /> 按下鼠标滚轮唤出
          </div>
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            开启后，在任意位置按下鼠标中键(滚轮)即可唤出。需在「系统设置 → 隐私与安全性 → 辅助功能」中授权 SoftDesk
          </div>
        </div>
        <button
          onClick={() => setRadialConfig({ mouseWheelToggle: !radial.mouseWheelToggle })}
          role="switch"
          aria-checked={radial.mouseWheelToggle}
          aria-label="按下鼠标滚轮唤出"
          disabled={!loggedIn}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
            radial.mouseWheelToggle ? 'bg-violet-500' : 'bg-slate-700',
            !loggedIn && 'opacity-40 cursor-not-allowed'
          )}
        >
          <span
            className={cn(
              'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all',
              radial.mouseWheelToggle ? 'left-6' : 'left-1'
            )}
          />
        </button>
      </div>

      {/* 添加「最近使用」页:开启后径向菜单在第一/第二页之外追加一个动态页,
          展示按 lastUsed 倒序的 sectors 个最近启动的应用,翻页循环 第一页→第二页→最近使用。 */}
      <div className="flex items-start justify-between gap-4 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> 添加「最近使用」页
          </div>
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            开启后，径向菜单会在第一页/第二页之后追加一个动态页，自动展示最近启动的 {radial.sectors} 个应用
          </div>
        </div>
        <button
          onClick={() => setRadialConfig({ showRecent: !radial.showRecent })}
          role="switch"
          aria-checked={radial.showRecent}
          aria-label="添加最近使用"
          disabled={!loggedIn}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
            radial.showRecent ? 'bg-violet-500' : 'bg-slate-700',
            !loggedIn && 'opacity-40 cursor-not-allowed'
          )}
        >
          <span
            className={cn(
              'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all',
              radial.showRecent ? 'left-6' : 'left-1'
            )}
          />
        </button>
      </div>

      {radial.enabled && (
        <>
          {/* 「风格」下拉栏:与「扇区数量」上下排列,放在扇区数量上方;选中后预览圆环立即联动 */}
          <div className="px-4 py-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">风格</div>
            <div
              className="relative w-fit min-w-[200px]"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setStyleMenuOpen(false);
              }}
            >
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={styleMenuOpen}
                onClick={() => setStyleMenuOpen((o) => !o)}
                className={cn(
                  'flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800',
                  'text-sm text-slate-100 hover:border-slate-700 focus:outline-none focus:border-violet-500/50',
                  'focus:ring-2 focus:ring-violet-500/20 transition-all min-w-[200px]'
                )}
              >
                <span className="flex flex-col items-start min-w-0 text-left">
                  <span className="truncate">{currentStyleOption.label}</span>
                  <span className="text-[10px] text-slate-500 truncate">{currentStyleOption.hint}</span>
                </span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform shrink-0', styleMenuOpen && 'rotate-180')} />
              </button>
              {styleMenuOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-1 shadow-2xl shadow-slate-950/50"
                >
                  {RADIAL_STYLE_OPTIONS.map((opt) => {
                    const selected = opt.value === previewStyle;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setRadialConfig({ style: opt.value });
                          setStyleMenuOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                          selected
                            ? 'bg-violet-500/20 text-violet-200'
                            : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
                        )}
                      >
                        <span className="flex flex-col min-w-0">
                          <span className="truncate">{opt.label}</span>
                          <span className="text-[10px] text-slate-500 truncate font-normal">{opt.hint}</span>
                        </span>
                        {selected && <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">扇区数量</div>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-800/40 rounded-xl w-fit">
              {([4, 6, 8] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setRadialConfig({ sectors: n })}
                  className={cn(
                    'px-5 py-2 rounded-lg text-xs font-medium transition-all border',
                    radial.sectors === n
                      ? 'bg-violet-500/15 text-violet-300 border-violet-500/20'
                      : 'text-slate-400 border-transparent hover:text-slate-300'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 grid sm:grid-cols-[260px_1fr] gap-6 items-start">
            {/* 圆环预览：点扇区进入编辑 */}
            <div className="flex flex-col items-center">
              {/* 页面切换:勾选「最近使用」时把它放到最前,与运行时唤出菜单的默认页保持一致 */}
              <div className="flex items-center gap-1 p-1 bg-slate-800/40 rounded-lg mb-3">
                {radial.showRecent && (
                  <button
                    onClick={() => { setPreviewPage('recent'); setEditingSlot(null); }}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                      previewPage === 'recent' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:text-slate-300'
                    )}
                  >
                    <Clock className="w-3 h-3" /> 最近使用
                  </button>
                )}
                <button
                  onClick={() => { setPreviewPage(0); setEditingSlot(null); }}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    previewPage === 0 ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:text-slate-300'
                  )}
                >
                  第一页
                </button>
                <button
                  onClick={() => { setPreviewPage(1); setEditingSlot(null); }}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    previewPage === 1 ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:text-slate-300'
                  )}
                >
                  第二页
                </button>
              </div>
              <svg width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="overflow-visible">
                {previewTokens.defs && <defs>{previewTokens.defs(cx, cy)}</defs>}
                {Array.from({ length: radial.sectors }).map((_, slot) => {
                  const center = slot * sectorAngle - 90;
                  const start = center - sectorAngle / 2;
                  const end = center + sectorAngle / 2;
                  const item = itemBySlot.get(slot);
                  const isEditing = editingSlot === slot && previewPage !== 'recent';
                  const labelPos = polar(cx, cy, (PREVIEW_INNER + PREVIEW_OUTER) / 2, center);
                  // 最近使用页是只读预览,扇区不可点
                  const clickable = previewPage !== 'recent';
                  return (
                    <g
                      key={slot}
                      onClick={clickable ? () => setEditingSlot(slot) : undefined}
                      style={{ cursor: clickable ? 'pointer' : 'default' }}
                    >
                      <path
                        d={sectorPath(cx, cy, start, end)}
                        fill={previewTokens.sectorFill(isEditing, item?.color)}
                        stroke={previewTokens.sectorStroke(isEditing)}
                        strokeWidth={previewTokens.sectorStrokeWidth(isEditing)}
                        filter={previewTokens.sectorFilter?.(isEditing)}
                      />
                      <text
                        x={labelPos.x}
                        y={labelPos.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={10}
                        fill={item ? previewTokens.textFill(isEditing) : previewTokens.emptyMarkFill}
                      >
                        {item ? labelFor(item).slice(0, 5) : previewPage === 'recent' ? '' : '+'}
                      </text>
                    </g>
                  );
                })}
                <circle
                  cx={cx}
                  cy={cy}
                  r={PREVIEW_INNER - 2}
                  fill={previewTokens.centerFill}
                  stroke={previewTokens.centerStroke}
                />
                {previewPage === 'recent' && (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={600}
                    fill={previewTokens.textFill(false)}
                    style={{ pointerEvents: 'none' }}
                  >
                    最近使用
                  </text>
                )}
              </svg>
              <button
                onClick={handlePreview}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/70 text-slate-200 text-xs font-medium hover:bg-slate-700 transition-colors"
              >
                <Play className="w-3.5 h-3.5" /> 试一下
              </button>
            </div>

            {/* 扇区编辑面板 */}
            <div className="min-w-0">
              {previewPage === 'recent' ? (
                <div className="text-sm text-slate-500 p-4 rounded-xl bg-slate-800/30 leading-relaxed">
                  <div className="text-slate-300 font-medium mb-1">最近使用（只读预览）</div>
                  这一页由系统自动按软件最近使用时间倒序填充，不需要也不可以手动绑定扇区。
                  关闭上方「添加『最近使用』页」开关即可隐藏该页。
                </div>
              ) : editingSlot === null ? (
                <div className="text-sm text-slate-500 p-4 rounded-xl bg-slate-800/30">
                  点击左侧任一扇区，为它绑定一个应用或工作流
                </div>
              ) : (
                <SlotEditor
                  slot={editingSlot}
                  page={previewPage}
                  sectors={radial.sectors}
                  current={itemBySlot.get(editingSlot)}
                  availableSoftware={availableSoftware}
                  workflows={workflows}
                  onPick={(item) => setRadialItem(editingSlot + previewPage * radial.sectors, item)}
                  onClear={() => setRadialItem(editingSlot + previewPage * radial.sectors, null)}
                />
              )}
            </div>
          </div>
        </>
      )}

      {!loggedIn && (
        <div className="flex flex-col items-center justify-center pt-8 pb-2 text-center">
          <p className="text-xs text-slate-500 mb-3">登录账号后即可开启径向菜单，并在多设备间同步配置</p>
          <button
            onClick={() => navigate('/account')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500/15 text-violet-500 dark:text-violet-300 hover:bg-violet-500/25 border border-violet-500/20 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            去登录
          </button>
        </div>
      )}

      {shareOpen && (
        <ShareDialog
          kind="radial"
          defaultTitle="我的径向菜单"
          buildPayload={() => serializeRadial(radial, software)}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

interface SlotEditorProps {
  slot: number;
  page: number;
  sectors: number;
  current: RadialItem | undefined;
  availableSoftware: ReturnType<typeof useSoftwareStore.getState>['software'];
  workflows: ReturnType<typeof useSoftwareStore.getState>['workflows'];
  onPick: (item: Omit<RadialItem, 'slot'>) => void;
  onClear: () => void;
}

function SlotEditor({ slot, page, sectors, current, availableSoftware, workflows, onPick, onClear }: SlotEditorProps) {
  const [tab, setTab] = useState<'app' | 'workflow'>(current?.type ?? 'app');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // 点击扇区进入编辑(slot 变化)或切到「应用」tab 时,自动对焦搜索框,方便直接搜索
  useEffect(() => {
    if (tab === 'app') {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [slot, tab]);

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? availableSoftware.filter((s) => s.name.toLowerCase().includes(q)) : availableSoftware;
    return list.slice(0, 50);
  }, [query, availableSoftware]);

  const pageLabel = page === 0 ? '第一页' : '第二页';
  const actualSlot = slot + page * sectors;

  return (
    <div className="rounded-xl bg-slate-800/30 border border-slate-800/60 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-slate-200">
          {pageLabel} 扇区 {slot + 1} 绑定
          <span className="ml-2 text-[10px] text-slate-500 font-normal">实际槽位 #{actualSlot + 1}</span>
        </div>
        {current && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"
          >
            <X className="w-3.5 h-3.5" /> 清除
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900/50 rounded-lg w-fit mb-3">
        {([
          { id: 'app' as const, icon: AppWindow, label: '应用' },
          { id: 'workflow' as const, icon: Layers, label: '工作流' },
        ]).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                tab === t.id ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:text-slate-300'
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'app' ? (
        <>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索应用…"
            className="w-full mb-2 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-violet-500/40"
          />
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {filteredApps.map((s) => {
              const active = current?.type === 'app' && current.targetId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onPick({ type: 'app', targetId: s.id, name: s.name, icon: s.icon, color: s.color })}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors',
                    active ? 'bg-violet-500/15' : 'hover:bg-slate-800/50'
                  )}
                >
                  <AppIcon software={s} size={28} />
                  <span className="text-sm text-slate-200 truncate">{s.name}</span>
                </button>
              );
            })}
            {filteredApps.length === 0 && (
              <div className="text-xs text-slate-500 px-2 py-4 text-center">没有匹配的应用</div>
            )}
          </div>
        </>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {workflows.map((w) => {
            const active = current?.type === 'workflow' && current.targetId === w.id;
            return (
              <button
                key={w.id}
                onClick={() => onPick({ type: 'workflow', targetId: w.id, name: w.name, color: w.color })}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors',
                  active ? 'bg-violet-500/15' : 'hover:bg-slate-800/50'
                )}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: w.color + '25', color: w.color }}
                >
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm text-slate-200 truncate">{w.name}</span>
                <span className="text-xs text-slate-500 ml-auto shrink-0">{w.softwareIds.length} 个应用</span>
              </button>
            );
          })}
          {workflows.length === 0 && (
            <div className="text-xs text-slate-500 px-2 py-4 text-center">还没有工作流，去「工作流」页创建</div>
          )}
        </div>
      )}
    </div>
  );
}
