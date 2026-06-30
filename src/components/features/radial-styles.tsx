import type { ReactNode } from 'react';
import type { RadialStyle } from '@/types';

/** 径向菜单视觉风格的可调 token 集合。
 *  RadialMenu(运行时) 与 RadialMenuSection(设置页预览) 共用,保证两端外观一致。
 *
 *  设计要点:
 *  - default 分支必须像素级保留旧版本外观,避免静默回归;
 *  - 其余 5 种风格通过 tokens 区分:扇区填充/描边/外环装饰/中心死区/SVG defs/扇区角度间隙;
 *  - 颜色只能用 inline 字符串(SVG fill/stroke 无法被 html.light 工具类覆盖)。 */
export interface RadialStyleTokens {
  /** SVG <defs> 内的 gradient/filter;函数式以便每个实例拿到 cx/cy */
  defs?: (cx: number, cy: number) => ReactNode;
  /** 扇区 fill;item.color 仅在 material 风格里参与色调点缀,其它风格忽略 */
  sectorFill: (isActive: boolean, itemColor?: string) => string;
  sectorStroke: (isActive: boolean) => string;
  sectorStrokeWidth: (isActive: boolean) => number;
  /** 给扇区 path 加 SVG filter(发光/阴影等),返回 url(#id) 或 undefined */
  sectorFilter?: (isActive: boolean) => string | undefined;
  /** 扇区两侧角度内缩(度);material 用于做花瓣分离 */
  sectorGap: number;
  /** 中心死区圆 */
  centerFill: string;
  centerStroke: string;
  /** 扇区项文字色(已绑定 item 的 name) */
  textFill: (isActive: boolean) => string;
  /** 空槽位占位字符颜色 */
  emptyMarkFill: string;
}

/** 把 RadialStyle 解析成可直接传给 SVG 的 token 集合。
 *  isLight: 浅色主题切换两套配色(预览页用得到)。 */
export function getRadialStyleTokens(
  style: RadialStyle = 'default',
  isLight = false
): RadialStyleTokens {
  switch (style) {
    case 'glass':
      return glassTokens(isLight);
    case 'neumorph':
      return neumorphTokens(isLight);
    case 'neon':
      return neonTokens(isLight);
    case 'material':
      return materialTokens(isLight);
    case 'minimal':
      return minimalTokens(isLight);
    case 'default':
    default:
      return defaultTokens(isLight);
  }
}

/** 与旧版本完全等价的 token 集,仅当 isLight=true 时切到浅色调色板。 */
function defaultTokens(isLight: boolean): RadialStyleTokens {
  if (isLight) {
    return {
      sectorFill: (isActive) =>
        isActive ? 'rgba(124,58,237,0.32)' : 'rgba(255,253,248,0.78)',
      sectorStroke: (isActive) =>
        isActive ? 'rgba(124,58,237,0.85)' : 'rgba(124,100,75,0.30)',
      sectorStrokeWidth: (isActive) => (isActive ? 2 : 1.5),
      sectorGap: 0,
      centerFill: 'rgba(255,253,248,0.85)',
      centerStroke: 'rgba(124,100,75,0.28)',
      textFill: (isActive) => (isActive ? '#1f1a14' : '#3b3127'),
      emptyMarkFill: 'rgba(124,100,75,0.45)',
    };
  }
  return {
    sectorFill: (isActive) =>
      isActive ? 'rgba(139,92,246,0.42)' : 'rgba(21,21,28,0.82)',
    sectorStroke: (isActive) =>
      isActive ? 'rgba(167,139,250,0.9)' : 'rgba(148,163,184,0.25)',
    sectorStrokeWidth: (isActive) => (isActive ? 2 : 1.5),
    sectorGap: 0,
    centerFill: 'rgba(21,21,28,0.55)',
    centerStroke: 'rgba(148,163,184,0.2)',
    textFill: (isActive) => (isActive ? '#fff' : '#cbd5e1'),
    emptyMarkFill: 'rgba(148,163,184,0.4)',
  };
}

/** 玻璃拟态:扇区用线性渐变(顶部高光 + 底部透色),双层描边模拟玻璃厚度,激活态紫色磨砂。 */
function glassTokens(isLight: boolean): RadialStyleTokens {
  const idleGradId = 'radialGlassIdle';
  const idleLightGradId = 'radialGlassIdleLight';
  const activeGradId = 'radialGlassActive';
  return {
    defs: () => (
      <>
        <linearGradient id={idleGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="55%" stopColor="rgba(30,30,40,0.45)" />
          <stop offset="100%" stopColor="rgba(15,15,22,0.55)" />
        </linearGradient>
        <linearGradient id={idleLightGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="55%" stopColor="rgba(255,253,248,0.55)" />
          <stop offset="100%" stopColor="rgba(220,210,195,0.40)" />
        </linearGradient>
        <linearGradient id={activeGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(167,139,250,0.85)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0.55)" />
        </linearGradient>
      </>
    ),
    sectorFill: (isActive) =>
      isActive
        ? `url(#${activeGradId})`
        : `url(#${isLight ? idleLightGradId : idleGradId})`,
    sectorStroke: (isActive) =>
      isActive
        ? 'rgba(196,181,253,0.95)'
        : isLight
          ? 'rgba(124,100,75,0.30)'
          : 'rgba(255,255,255,0.18)',
    sectorStrokeWidth: (isActive) => (isActive ? 1.5 : 1),
    sectorGap: 0,
    centerFill: isLight ? 'rgba(255,253,248,0.65)' : 'rgba(20,20,28,0.55)',
    centerStroke: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.18)',
    textFill: (isActive) =>
      isActive ? '#fff' : isLight ? '#3b3127' : '#e2e8f0',
    emptyMarkFill: isLight ? 'rgba(124,100,75,0.5)' : 'rgba(226,232,240,0.5)',
  };
}

/** 新拟物:径向渐变 + 凸起阴影 filter;激活态用紫色发光与"内凹"描边。 */
function neumorphTokens(isLight: boolean): RadialStyleTokens {
  const idleId = 'radialNeumorphIdle';
  const idleLightId = 'radialNeumorphIdleLight';
  const activeId = 'radialNeumorphActive';
  const shadowFilterId = 'radialNeumorphShadow';
  const glowFilterId = 'radialNeumorphGlow';
  return {
    defs: () => (
      <>
        <radialGradient id={idleId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#3a3a48" />
          <stop offset="100%" stopColor="#15151c" />
        </radialGradient>
        <radialGradient id={idleLightId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d6cebf" />
        </radialGradient>
        <radialGradient id={activeId} cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="rgba(167,139,250,0.85)" />
          <stop offset="100%" stopColor="rgba(76,29,149,0.85)" />
        </radialGradient>
        <filter id={shadowFilterId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <filter id={glowFilterId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feFlood floodColor="rgba(167,139,250,0.85)" />
          <feComposite in2="b" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </>
    ),
    sectorFill: (isActive) =>
      isActive
        ? `url(#${activeId})`
        : `url(#${isLight ? idleLightId : idleId})`,
    sectorStroke: (isActive) =>
      isActive
        ? 'rgba(196,181,253,0.9)'
        : isLight
          ? 'rgba(124,100,75,0.25)'
          : 'rgba(255,255,255,0.06)',
    sectorStrokeWidth: (isActive) => (isActive ? 2 : 1),
    sectorFilter: (isActive) =>
      isActive ? `url(#${glowFilterId})` : `url(#${shadowFilterId})`,
    sectorGap: 0,
    centerFill: isLight ? '#ece4d4' : '#1d1d27',
    centerStroke: isLight ? 'rgba(124,100,75,0.20)' : 'rgba(255,255,255,0.05)',
    textFill: (isActive) =>
      isActive ? '#fff' : isLight ? '#3b3127' : '#cbd5e1',
    emptyMarkFill: isLight ? 'rgba(124,100,75,0.45)' : 'rgba(148,163,184,0.45)',
  };
}

/** 霓虹:激活扇区紫色高斯模糊发光,默认扇区半透深色 + 细发光描边。 */
function neonTokens(isLight: boolean): RadialStyleTokens {
  const glowId = 'radialNeonGlow';
  const strongGlowId = 'radialNeonStrongGlow';
  return {
    defs: () => (
      <>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={strongGlowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </>
    ),
    sectorFill: (isActive) =>
      isActive
        ? 'rgba(139,92,246,0.55)'
        : isLight
          ? 'rgba(255,253,248,0.55)'
          : 'rgba(10,10,18,0.85)',
    sectorStroke: (isActive) =>
      isActive
        ? 'rgba(232,121,249,0.95)'
        : isLight
          ? 'rgba(167,139,250,0.55)'
          : 'rgba(167,139,250,0.45)',
    sectorStrokeWidth: (isActive) => (isActive ? 2 : 1),
    sectorFilter: (isActive) =>
      isActive ? `url(#${strongGlowId})` : `url(#${glowId})`,
    sectorGap: 0,
    centerFill: isLight ? 'rgba(255,253,248,0.85)' : 'rgba(10,10,18,0.65)',
    centerStroke: 'rgba(167,139,250,0.7)',
    textFill: (isActive) =>
      isActive ? '#fff' : isLight ? '#3b3127' : '#e0e7ff',
    emptyMarkFill: 'rgba(167,139,250,0.55)',
  };
}

/** 分层卡片(花瓣):扇区间留 4° 间隙,激活态色调取自 item.color,默认扇区柔和暗色卡片。 */
function materialTokens(isLight: boolean): RadialStyleTokens {
  const shadowId = 'radialMaterialShadow';
  return {
    defs: () => (
      <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
      </filter>
    ),
    sectorFill: (isActive, itemColor) => {
      if (isActive) {
        return itemColor
          ? `${itemColor}c8`
          : isLight
            ? 'rgba(124,58,237,0.78)'
            : 'rgba(139,92,246,0.62)';
      }
      return isLight ? 'rgba(255,253,248,0.95)' : 'rgba(38,38,52,0.92)';
    },
    sectorStroke: (isActive) =>
      isActive
        ? 'rgba(245,243,255,0.55)'
        : isLight
          ? 'rgba(124,100,75,0.25)'
          : 'rgba(148,163,184,0.18)',
    sectorStrokeWidth: () => 1,
    sectorFilter: () => `url(#${shadowId})`,
    sectorGap: 4,
    centerFill: isLight ? '#ffffff' : '#222230',
    centerStroke: isLight ? 'rgba(124,100,75,0.25)' : 'rgba(148,163,184,0.18)',
    textFill: (isActive) =>
      isActive ? '#fff' : isLight ? '#3b3127' : '#e2e8f0',
    emptyMarkFill: isLight ? 'rgba(124,100,75,0.45)' : 'rgba(148,163,184,0.45)',
  };
}

/** 极简光带:默认扇区几乎透明,激活态从内到外的紫色径向渐变。 */
function minimalTokens(isLight: boolean): RadialStyleTokens {
  const beamId = 'radialMinimalBeam';
  return {
    defs: (cx, cy) => (
      <radialGradient
        id={beamId}
        cx={cx}
        cy={cy}
        r="100"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="rgba(139,92,246,0.65)" />
        <stop offset="100%" stopColor="rgba(139,92,246,0)" />
      </radialGradient>
    ),
    sectorFill: (isActive) =>
      isActive
        ? `url(#${beamId})`
        : isLight
          ? 'rgba(255,253,248,0.20)'
          : 'rgba(255,255,255,0.03)',
    sectorStroke: (isActive) =>
      isActive
        ? 'rgba(196,181,253,0.6)'
        : isLight
          ? 'rgba(124,100,75,0.18)'
          : 'rgba(255,255,255,0.08)',
    sectorStrokeWidth: (isActive) => (isActive ? 1.5 : 0.75),
    sectorGap: 0,
    centerFill: 'transparent',
    centerStroke: isLight ? 'rgba(124,100,75,0.30)' : 'rgba(255,255,255,0.15)',
    textFill: (isActive) =>
      isActive ? (isLight ? '#1f1a14' : '#fff') : isLight ? '#3b3127' : '#cbd5e1',
    emptyMarkFill: isLight ? 'rgba(124,100,75,0.35)' : 'rgba(148,163,184,0.3)',
  };
}

/** 给设置页下拉栏使用的选项列表(顺序即下拉展示顺序)。 */
export const RADIAL_STYLE_OPTIONS: { value: RadialStyle; label: string; hint: string }[] = [
  { value: 'default', label: '默认', hint: '深色卡片(当前)' },
  { value: 'glass', label: '玻璃拟态', hint: '磨砂半透,顶部高光' },
  { value: 'neumorph', label: '新拟物', hint: '凸起按键,有体积感' },
  { value: 'neon', label: '霓虹发光', hint: '荧光描边,激活高斯模糊' },
  { value: 'material', label: '分层卡片', hint: '花瓣分离,带阴影' },
  { value: 'minimal', label: '极简光带', hint: '透明扇区,激活才点亮' },
];
