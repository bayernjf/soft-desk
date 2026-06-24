import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Rocket, Layers, CornerDownLeft, Loader2 } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { useSemanticSearch } from '@/hooks/useSemanticSearch';
import { hasActiveAiProvider } from '@/services/ai.service';
import { AppIcon } from './AppIcon';
import { cn } from '@/lib/utils';
import type { Software, Workflow } from '@/types';

interface QuickLauncherProps {
  open: boolean;
  onClose: () => void;
}

type LauncherItem =
  | { type: 'software'; software: Software }
  | { type: 'workflow'; workflow: Workflow };

const MAX_RESULTS = 8;

export function QuickLauncher({ open, onClose }: QuickLauncherProps) {
  const software = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);
  const launchSoftware = useSoftwareStore((s) => s.launchSoftware);
  const launchWorkflow = useSoftwareStore((s) => s.launchWorkflow);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [aiReady, setAiReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时重置状态并聚焦输入框
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 打开时探测一次是否有启用模型,决定是否启用语义搜索
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    hasActiveAiProvider()
      .then((ready) => {
        if (!cancelled) setAiReady(ready);
      })
      .catch(() => {
        if (!cancelled) setAiReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const available = useMemo(
    () => software.filter((s) => !s.uninstalled && !s.deleted),
    [software]
  );

  // 本地字面匹配的软件(name / tags / publisher),作为即时结果与语义触发门槛
  const localSoftware = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return available
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)) ||
          s.publisher?.toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS);
  }, [query, available]);

  const semantic = useSemanticSearch(query, available, aiReady, localSoftware.length);

  const items = useMemo<LauncherItem[]>(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      // 无输入时展示最近使用的软件
      return [...available]
        .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
        .slice(0, MAX_RESULTS)
        .map((s) => ({ type: 'software', software: s }) as LauncherItem);
    }

    const matchedWorkflows = workflows
      .filter((w) => w.name.toLowerCase().includes(q))
      .slice(0, 3);

    // 语义结果:补充本地字面匹配漏掉的意图相关软件(去重),追加在本地结果之后
    const localIds = new Set(localSoftware.map((s) => s.id));
    const byId = new Map(available.map((s) => [s.id, s]));
    const semanticExtra = (semantic.ids ?? [])
      .filter((id) => !localIds.has(id))
      .map((id) => byId.get(id))
      .filter((s): s is Software => !!s)
      .slice(0, MAX_RESULTS);

    return [
      ...matchedWorkflows.map((w) => ({ type: 'workflow', workflow: w }) as LauncherItem),
      ...localSoftware.map((s) => ({ type: 'software', software: s }) as LauncherItem),
      ...semanticExtra.map((s) => ({ type: 'software', software: s }) as LauncherItem),
    ];
  }, [query, available, workflows, localSoftware, semantic.ids]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const runItem = (item: LauncherItem) => {
    if (item.type === 'software') {
      launchSoftware(item.software.id);
    } else {
      launchWorkflow(item.workflow.id);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) runItem(item);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="快速启动"
        className="w-full max-w-xl rounded-2xl bg-[#15151c] border border-slate-700/60 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800/80">
          <Search className="w-4.5 h-4.5 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索软件或工作流，回车启动…"
            aria-label="搜索软件或工作流"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-500 font-mono">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-2">
          {items.length === 0 ? (
            semantic.loading ? (
              <div className="px-4 py-10 flex items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                AI 正在理解你的搜索意图…
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-slate-500">未找到匹配的软件或工作流</div>
            )
          ) : (
            items.map((item, index) => {
              const active = index === activeIndex;
              const key = item.type === 'software' ? `s-${item.software.id}` : `w-${item.workflow.id}`;
              return (
                <button
                  key={key}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runItem(item)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl text-left transition-colors',
                    active ? 'bg-violet-500/15' : 'hover:bg-slate-800/40'
                  )}
                  style={{ width: 'calc(100% - 16px)' }}
                >
                  {item.type === 'software' ? (
                    <AppIcon software={item.software} size={36} />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: item.workflow.color + '25', color: item.workflow.color }}
                    >
                      <Layers className="w-4.5 h-4.5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-100 truncate">
                      {item.type === 'software' ? item.software.name : item.workflow.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {item.type === 'software'
                        ? item.software.publisher || '应用'
                        : `工作流 · ${item.workflow.softwareIds.length} 个软件`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-slate-500">
                    {item.type === 'workflow' && <Rocket className="w-3.5 h-3.5" />}
                    {active && <CornerDownLeft className="w-3.5 h-3.5 text-violet-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-800/80 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-slate-800 font-mono">↑↓</kbd> 选择
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-slate-800 font-mono">↵</kbd> 启动
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-slate-800 font-mono">⌘⇧Space</kbd> 全局唤起
          </span>
        </div>
      </div>
    </div>
  );
}
