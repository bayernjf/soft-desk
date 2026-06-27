import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Software } from '@/types';
import { resolveDescription, lazyGenerateDescription } from '@/services/description.service';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import { Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SoftwareCardTooltipProps {
  software: Software;
  children: React.ReactNode;
}

export function SoftwareCardTooltip({ software, children }: SoftwareCardTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const setAiDescription = useSoftwareStore((s) => s.setAiDescription);

  const description = resolveDescription(software);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-tooltip]')) return;
    setMousePos({ x: e.clientX, y: e.clientY });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(true);
      if (!software.aiDescription) {
        setIsGenerating(true);
        lazyGenerateDescription(software, (id, desc) => {
          setAiDescription(id, desc);
          setIsGenerating(false);
        }).then(() => {
          setIsGenerating(false);
        });
      }
    }, 300);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-tooltip]')) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
      return;
    }
    setMousePos({ x: e.clientX, y: e.clientY });
    // 从操作图标区域移回卡片主体时，重新触发延迟显示
    if (!visible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(true);
      }, 300);
    }
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setIsGenerating(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const categoryMeta = CATEGORIES.find((c) => c.id === software.category);

  const tooltipWidth = 320;
  let left = mousePos.x;
  left = Math.max(tooltipWidth / 2 + 8, Math.min(left, window.innerWidth - tooltipWidth / 2 - 8));

  const tooltipContent = (
    <div
      className={cn(
        'fixed z-[9999]',
        'w-[320px] max-w-[90vw]',
        'rounded-xl border border-slate-200/80 dark:border-slate-700/60',
        'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl shadow-slate-900/10 dark:shadow-black/40',
        'p-4',
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
        'transition-all duration-150'
      )}
      style={{
        left,
        top: mousePos.y,
        transform: 'translate(-50%, calc(-100% - 8px))',
        transformOrigin: 'bottom center',
      }}
    >
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45',
          'bg-white/95 dark:bg-slate-900/95 border-r border-b border-slate-200/80 dark:border-slate-700/60'
        )}
      />

      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: `${software.color}18` }}
        >
          <Info className="w-4 h-4" style={{ color: software.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {software.name}
          </h4>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {categoryMeta?.name}
            {software.version && (
              <span className="ml-2 text-slate-400 dark:text-slate-600">v{software.version}</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3">
        {isGenerating && !software.aiDescription ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>正在生成简介…</span>
          </div>
        ) : (
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {software.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {software.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
        {software.size > 0 && <span>{software.size} MB</span>}
        {software.publisher && <span className="truncate max-w-[120px]">{software.publisher}</span>}
      </div>
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {createPortal(tooltipContent, document.body)}
    </div>
  );
}
