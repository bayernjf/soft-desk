import { useEffect, useMemo, useRef, useState } from 'react';
import type { RadialOpenPayload, RadialRenderItem } from '@/types';

const INNER_R = 56;
const OUTER_R = 140;
const ACTIVE_OUTER_R = 152;
const LABEL_R = (INNER_R + OUTER_R) / 2;

interface RadialState {
  cursor: { x: number; y: number };
  sectors: number;
  items: RadialRenderItem[];
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** 构造一个环形扇区(donut sector)的 SVG path。角度以度为单位,0=正右,顺时针为正(屏幕坐标 y 向下)。 */
function sectorPath(cx: number, cy: number, startDeg: number, endDeg: number, outerR = OUTER_R) {
  const oStart = polar(cx, cy, outerR, startDeg);
  const oEnd = polar(cx, cy, outerR, endDeg);
  const iEnd = polar(cx, cy, INNER_R, endDeg);
  const iStart = polar(cx, cy, INNER_R, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
}

type AnimPhase = 'idle' | 'out' | 'switch' | 'in';

export function RadialMenu() {
  const [state, setState] = useState<RadialState | null>(null);
  const [active, setActive] = useState<number | null>(null);
  // 入场动画:state 就绪后下一帧置 true,触发 scale/opacity 过渡
  const [mounted, setMounted] = useState(false);

  // 分页
  const [page, setPage] = useState(0);
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
  const wheelDirRef = useRef(1);

  // 监听主进程的 radial:open 推送
  useEffect(() => {
    const bridge = window.softdesk;
    if (!bridge?.onOpenRadial) return;
    const unsub = bridge.onOpenRadial((payload: RadialOpenPayload) => {
      setState({ cursor: payload.cursor, sectors: payload.sectors, items: payload.items });
      setActive(null);
      setMounted(false);
      setPage(0);
      setAnimPhase('idle');
      requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    });
    return () => unsub?.();
  }, []);

  // radial 窗口为复用窗口(关闭仅 hide 不销毁)。再次唤出时窗口会先 show、
  // 之后 radial:open 才异步到达;若不清空旧 state,窗口会先按上一次的光标位置
  // 画出菜单(完整态)再跳到新位置重播入场动画,即"跳动一下"。
  // 这里在窗口隐藏时清空 state,使下次 show 时为透明空白,等新 payload 到达再弹出。
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setState(null);
        setActive(null);
        setMounted(false);
        setPage(0);
        setAnimPhase('idle');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.softdesk?.radialClose?.();
        setState(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 页面切换动画状态机
  useEffect(() => {
    if (animPhase === 'out') {
      const t = setTimeout(() => {
        setPage((p) => (p + wheelDirRef.current + 2) % 2);
        setAnimPhase('switch');
      }, 220);
      return () => clearTimeout(t);
    }
    if (animPhase === 'switch') {
      const t = setTimeout(() => {
        setAnimPhase('in');
      }, 40);
      return () => clearTimeout(t);
    }
    if (animPhase === 'in') {
      const t = setTimeout(() => {
        setAnimPhase('idle');
      }, 300);
      return () => clearTimeout(t);
    }
  }, [animPhase]);

  const sectorAngle = state ? 360 / state.sectors : 0;
  const centerAngleOf = (slot: number) => slot * sectorAngle - 90;

  const hasPage2 = useMemo(() => {
    if (!state) return false;
    return state.items.some((it) => it.slot >= state.sectors);
  }, [state]);

  const currentItems = useMemo(() => {
    if (!state) return [];
    return state.items
      .filter((it) => {
        const itemPage = Math.floor(it.slot / state.sectors);
        return itemPage === page;
      })
      .map((it) => ({ ...it, slot: it.slot % state.sectors }));
  }, [state, page]);

  const itemBySlot = useMemo(() => {
    const map = new Map<number, RadialRenderItem>();
    currentItems.forEach((it) => map.set(it.slot, it));
    return map;
  }, [currentItems]);

  if (!state) return null;

  const { cursor, sectors } = state;

  const close = () => {
    window.softdesk?.radialClose?.();
    setState(null);
  };

  // 鼠标移动 → 仅当落在扇形环带内(内半径~外半径之间)才高亮;
  // 中心死区 或 圆环外侧空白 都不高亮(点击时等同点中心:仅关闭、不启动)
  const slotAt = (clientX: number, clientY: number): number | null => {
    const dx = clientX - cursor.x;
    const dy = clientY - cursor.y;
    const dist = Math.hypot(dx, dy);
    if (dist < INNER_R || dist > OUTER_R) return null;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0=右
    let rel = deg - (-90 - sectorAngle / 2);
    rel = ((rel % 360) + 360) % 360;
    return Math.floor(rel / sectorAngle) % sectors;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    setActive(slotAt(e.clientX, e.clientY));
  };

  // 启动指定扇区的项目;扇区为空、不可用或无项目则仅关闭(不启动)。
  const launchSlot = (slot: number | null) => {
    if (slot === null) {
      close();
      return;
    }
    const item = itemBySlot.get(slot);
    if (item && !item.unavailable) {
      window.softdesk?.radialLaunch?.({ type: item.type, targetId: item.targetId });
    }
    close();
  };

  const onClick = () => launchSlot(active);

  // 右键:在扇区内按下即启动该扇区(命中规则与左键一致),并屏蔽系统右键菜单。
  // 右键路径走渲染层 DOM 事件,不经过全局 uiohook,无重复派发/去抖问题。
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    launchSlot(slotAt(e.clientX, e.clientY));
  };

  // 滚轮切换页面:向下滑(顺时针)切下一页,向上滑(逆时针)切上一页
  const onWheel = (e: React.WheelEvent) => {
    if (!hasPage2 || animPhase !== 'idle') return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    wheelDirRef.current = dir;
    setAnimPhase('out');
  };

  const isAnimating = animPhase !== 'idle';
  const animRotate =
    animPhase === 'out'
      ? wheelDirRef.current * sectorAngle
      : animPhase === 'switch'
        ? -wheelDirRef.current * sectorAngle
        : 0;
  const animOpacity = animPhase === 'out' || animPhase === 'switch' ? 0.12 : 1;
  const animScale = animPhase === 'out' || animPhase === 'switch' ? 0.9 : 1;

  return (
    <div
      className="fixed inset-0"
      onMouseMove={onMouseMove}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onWheel={onWheel}
      style={{ background: 'transparent' }}
    >
      <svg className="absolute inset-0 w-full h-full overflow-visible">
        <g
          style={{
            transformOrigin: `${cursor.x}px ${cursor.y}px`,
            transform: mounted ? `rotate(${animRotate}deg) scale(${animScale})` : `rotate(${animRotate}deg) scale(0.82)`,
            opacity: mounted ? animOpacity : 0,
            transition: isAnimating
              ? 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease-in-out'
              : 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease-out',
          }}
        >
          {Array.from({ length: sectors }).map((_, slot) => {
            const center = centerAngleOf(slot);
            const start = center - sectorAngle / 2;
            const end = center + sectorAngle / 2;
            const isActive = active === slot;
            const item = itemBySlot.get(slot);
            const isUnavailable = !!item?.unavailable;
            // 高亮扇区:外扩 + 图标/文字略微外移,增强"跟手"反馈
            const labelR = isActive ? LABEL_R + 6 : LABEL_R;
            const labelPos = polar(cursor.x, cursor.y, labelR, center);
            return (
              <g key={slot}>
                <path
                  d={sectorPath(cursor.x, cursor.y, start, end, isActive ? ACTIVE_OUTER_R : OUTER_R)}
                  fill={isActive ? 'rgba(139,92,246,0.42)' : 'rgba(21,21,28,0.82)'}
                  stroke={isActive ? 'rgba(167,139,250,0.9)' : 'rgba(148,163,184,0.25)'}
                  strokeWidth={isActive ? 2 : 1.5}
                  style={{ transition: 'fill 90ms ease-out' }}
                />
                {item ? (
                  <g
                    style={{
                      opacity: isUnavailable ? 0.38 : 1,
                      filter: isUnavailable ? 'grayscale(1)' : undefined,
                    }}
                  >
                    {item.icon &&
                    (item.icon.startsWith('data:image') || item.icon.startsWith('file://')) ? (
                      <image
                        href={item.icon}
                        x={labelPos.x - (isActive ? 19 : 16)}
                        y={labelPos.y - (isActive ? 25 : 22)}
                        width={isActive ? 38 : 32}
                        height={isActive ? 38 : 32}
                        style={{ pointerEvents: 'none' }}
                      />
                    ) : (
                      <circle
                        cx={labelPos.x}
                        cy={labelPos.y - 6}
                        r={isActive ? 19 : 16}
                        fill={(item.color || '#8b5cf6') + '40'}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    <text
                      x={labelPos.x}
                      y={labelPos.y + 18}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={isActive ? 12 : 11}
                      fontWeight={isActive ? 600 : 400}
                      fill={isActive ? '#fff' : '#cbd5e1'}
                      style={{ pointerEvents: 'none' }}
                    >
                      {item.name.length > 7 ? item.name.slice(0, 6) + '…' : item.name}
                    </text>
                  </g>
                ) : (
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={20}
                    fill="rgba(148,163,184,0.4)"
                    style={{ pointerEvents: 'none' }}
                  >
                    +
                  </text>
                )}
              </g>
            );
          })}
          {/* 中心死区 */}
          <circle
            cx={cursor.x}
            cy={cursor.y}
            r={INNER_R - 2}
            fill="rgba(21,21,28,0.55)"
            stroke="rgba(148,163,184,0.2)"
            strokeWidth={1}
          />
          {(() => {
            const activeItem = active !== null ? itemBySlot.get(active) : undefined;
            // 高亮某个已绑定扇区时,中心区浮出完整软件名;
            // 方案1+2:字号随名字长度自适应(11→9px),并限制最多 4 行,
            // 超出部分用省略号收尾(替代静默裁切);否则显示 ESC 关闭提示。
            if (activeItem) {
              const len = activeItem.name.length;
              const fontSize = len <= 10 ? 11 : len <= 20 ? 10 : 9;
              return (
                <foreignObject
                  x={cursor.x - (INNER_R - 8)}
                  y={cursor.y - (INNER_R - 12)}
                  width={(INNER_R - 8) * 2}
                  height={(INNER_R - 12) * 2}
                  style={{ pointerEvents: 'none' }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      padding: '0 2px',
                    }}
                  >
                    <span
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 4,
                        overflow: 'hidden',
                        fontSize,
                        lineHeight: 1.25,
                        fontWeight: 600,
                        color: activeItem.unavailable ? 'rgba(203,213,225,0.55)' : '#fff',
                        wordBreak: 'break-word',
                      }}
                    >
                      {activeItem.name}
                    </span>
                  </div>
                </foreignObject>
              );
            }
            return (
              <text
                x={cursor.x}
                y={cursor.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill="rgba(148,163,184,0.7)"
                style={{ pointerEvents: 'none' }}
              >
                ESC
              </text>
            );
          })()}
        </g>
      </svg>
    </div>
  );
}
