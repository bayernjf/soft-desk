import type { CSSProperties, ReactNode } from 'react';

interface LazyMountProps {
  children: ReactNode;
  /** 估算的占位高度(px),用于屏幕外时的滚动条尺寸计算 */
  estimatedHeight?: number;
  className?: string;
}

/**
 * 利用 Chromium 原生 content-visibility: auto 跳过屏幕外子树的渲染与布局,
 * 在大列表(上百张卡片)下接近虚拟化的性能收益,且不改 DOM 结构、不引依赖、
 * 对响应式网格天然友好。contain-intrinsic-size 提供屏幕外时的占位尺寸,避免滚动跳动。
 */
export function LazyMount({ children, estimatedHeight = 96, className }: LazyMountProps) {
  const style: CSSProperties = {
    contentVisibility: 'auto',
    containIntrinsicSize: `auto ${estimatedHeight}px`,
  };
  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
