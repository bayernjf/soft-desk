import { useEffect, useMemo, useState } from 'react';
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

export function RadialMenu() {
  const [state, setState] = useState<RadialState | null>(null);
  const [active, setActive] = useState<number | null>(null);
  // 入场动画:state 就绪后下一帧置 true,触发 scale/opacity 过渡
  const [mounted, setMounted] = useState(false);

  // 监听主进程的 radial:open 推送
  useEffect(() => {
    const bridge = window.softdesk;
    if (!bridge?.onOpenRadial) return;
    const unsub = bridge.onOpenRadial((payload: RadialOpenPayload) => {
      setState({ cursor: payload.cursor, sectors: payload.sectors, items: payload.items });
      setActive(null);
      setMounted(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    });
    return () => unsub?.();
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

  const sectorAngle = state ? 360 / state.sectors : 0;
  const centerAngleOf = (slot: number) => slot * sectorAngle - 90;

  const itemBySlot = useMemo(() => {
    const map = new Map<number, RadialRenderItem>();
    state?.items.forEach((it) => map.set(it.slot, it));
    return map;
  }, [state]);

  if (!state) return null;

  const { cursor, sectors } = state;

  const close = () => {
    window.softdesk?.radialClose?.();
    setState(null);
  };

  // 鼠标移动 → 仅当落在扇形环带内(内半径~外半径之间)才高亮;
  // 中心死区 或 圆环外侧空白 都不高亮(点击时等同点中心:仅关闭、不启动)
  const onMouseMove = (e: React.MouseEvent) => {
    const dx = e.clientX - cursor.x;
    const dy = e.clientY - cursor.y;
    const dist = Math.hypot(dx, dy);
    if (dist < INNER_R || dist > OUTER_R) {
      setActive(null);
      return;
    }
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0=右
    let rel = deg - (-90 - sectorAngle / 2);
    rel = ((rel % 360) + 360) % 360;
    const slot = Math.floor(rel / sectorAngle) % sectors;
    setActive(slot);
  };

  const onClick = () => {
    if (active === null) {
      close();
      return;
    }
    const item = itemBySlot.get(active);
    if (item) {
      window.softdesk?.radialLaunch?.({ type: item.type, targetId: item.targetId });
    }
    close();
  };

  return (
    <div
      className="fixed inset-0"
      onMouseMove={onMouseMove}
      onClick={onClick}
      style={{ background: 'transparent' }}
    >
      <svg className="absolute inset-0 w-full h-full overflow-visible">
        <g
          style={{
            transformOrigin: `${cursor.x}px ${cursor.y}px`,
            transform: mounted ? 'scale(1)' : 'scale(0.82)',
            opacity: mounted ? 1 : 0,
            transition: 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease-out',
          }}
        >
          {Array.from({ length: sectors }).map((_, slot) => {
            const center = centerAngleOf(slot);
            const start = center - sectorAngle / 2;
            const end = center + sectorAngle / 2;
            const isActive = active === slot;
            const item = itemBySlot.get(slot);
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
                  <>
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
                  </>
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
        </g>
      </svg>
    </div>
  );
}
