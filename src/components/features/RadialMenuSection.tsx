import { useMemo, useRef, useState } from 'react';
import { Play, X, AppWindow, Layers, Keyboard, Mouse } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings.store';
import { useSoftwareStore } from '@/stores/software.store';
import { syncRadialToMain } from '@/services/radial.service';
import { AppIcon } from './AppIcon';
import { cn } from '@/lib/utils';
import type { RadialItem } from '@/types';

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

  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const recordBtnRef = useRef<HTMLButtonElement>(null);

  // 预览圆环是 SVG,颜色写死无法被 html.light 的工具类覆盖,故按当前主题切换两套配色
  const theme = useSettingsStore((s) => s.theme);
  const ring = useMemo(() => {
    void theme; // 依赖 theme,主题切换时重算
    const isLight =
      typeof document !== 'undefined' && document.documentElement.classList.contains('light');
    return isLight
      ? {
          sector: 'rgba(155,140,120,0.20)',
          sectorEditing: 'rgba(124,58,237,0.18)',
          stroke: 'rgba(124,100,75,0.35)',
          label: '#3b3127',
          labelEmpty: '#9b8c78',
          center: 'rgba(255,253,248,0.92)',
          centerStroke: 'rgba(124,100,75,0.30)',
        }
      : {
          sector: 'rgba(51,65,85,0.35)',
          sectorEditing: 'rgba(139,92,246,0.30)',
          stroke: 'rgba(148,163,184,0.3)',
          label: '#cbd5e1',
          labelEmpty: 'rgba(148,163,184,0.5)',
          center: 'rgba(21,21,28,0.6)',
          centerStroke: 'rgba(148,163,184,0.2)',
        };
  }, [theme]);

  const availableSoftware = useMemo(
    () => software.filter((s) => !s.uninstalled && !s.deleted).sort((a, b) => a.name.localeCompare(b.name)),
    [software]
  );
  const softwareById = useMemo(() => new Map(software.map((s) => [s.id, s])), [software]);
  const workflowById = useMemo(() => new Map(workflows.map((w) => [w.id, w])), [workflows]);
  const itemBySlot = useMemo(() => {
    const m = new Map<number, RadialItem>();
    radial.items.forEach((it) => m.set(it.slot, it));
    return m;
  }, [radial.items]);

  const cx = PREVIEW_SIZE / 2;
  const cy = PREVIEW_SIZE / 2;
  const sectorAngle = 360 / radial.sectors;

  const labelFor = (item: RadialItem | undefined): string => {
    if (!item) return '';
    if (item.type === 'app') return softwareById.get(item.targetId)?.name ?? '(已卸载)';
    return workflowById.get(item.targetId)?.name ?? '(已删除)';
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
      <h2 className="text-base font-semibold text-slate-100 mb-1">径向菜单</h2>
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
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
            radial.enabled ? 'bg-violet-500' : 'bg-slate-700'
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
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors min-w-[120px] justify-center',
              recording
                ? 'border-violet-500/60 bg-violet-500/15 text-violet-200 animate-pulse'
                : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800'
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
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
            radial.mouseWheelToggle ? 'bg-violet-500' : 'bg-slate-700'
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

      {radial.enabled && (
        <>
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
              <svg width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="overflow-visible">
                {Array.from({ length: radial.sectors }).map((_, slot) => {
                  const center = slot * sectorAngle - 90;
                  const start = center - sectorAngle / 2;
                  const end = center + sectorAngle / 2;
                  const item = itemBySlot.get(slot);
                  const isEditing = editingSlot === slot;
                  const labelPos = polar(cx, cy, (PREVIEW_INNER + PREVIEW_OUTER) / 2, center);
                  return (
                    <g key={slot} onClick={() => setEditingSlot(slot)} style={{ cursor: 'pointer' }}>
                      <path
                        d={sectorPath(cx, cy, start, end)}
                        fill={isEditing ? ring.sectorEditing : ring.sector}
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
                        {item ? labelFor(item).slice(0, 5) : '+'}
                      </text>
                    </g>
                  );
                })}
                <circle cx={cx} cy={cy} r={PREVIEW_INNER - 2} fill={ring.center} stroke={ring.centerStroke} />
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
              {editingSlot === null ? (
                <div className="text-sm text-slate-500 p-4 rounded-xl bg-slate-800/30">
                  点击左侧任一扇区，为它绑定一个应用或工作流
                </div>
              ) : (
                <SlotEditor
                  slot={editingSlot}
                  current={itemBySlot.get(editingSlot)}
                  availableSoftware={availableSoftware}
                  workflows={workflows}
                  onPick={(item) => setRadialItem(editingSlot, item)}
                  onClear={() => setRadialItem(editingSlot, null)}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface SlotEditorProps {
  slot: number;
  current: RadialItem | undefined;
  availableSoftware: ReturnType<typeof useSoftwareStore.getState>['software'];
  workflows: ReturnType<typeof useSoftwareStore.getState>['workflows'];
  onPick: (item: Omit<RadialItem, 'slot'>) => void;
  onClear: () => void;
}

function SlotEditor({ slot, current, availableSoftware, workflows, onPick, onClear }: SlotEditorProps) {
  const [tab, setTab] = useState<'app' | 'workflow'>(current?.type ?? 'app');
  const [query, setQuery] = useState('');

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? availableSoftware.filter((s) => s.name.toLowerCase().includes(q)) : availableSoftware;
    return list.slice(0, 50);
  }, [query, availableSoftware]);

  return (
    <div className="rounded-xl bg-slate-800/30 border border-slate-800/60 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-slate-200">扇区 {slot + 1} 绑定</div>
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
                  onClick={() => onPick({ type: 'app', targetId: s.id })}
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
                onClick={() => onPick({ type: 'workflow', targetId: w.id })}
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
