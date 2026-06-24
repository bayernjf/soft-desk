import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X, Sparkles, Loader2 } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { useSettingsStore } from '@/stores/settings.store';
import { CATEGORIES } from '@/data/categories';
import { SoftwareCard } from '@/components/features/SoftwareCard';
import { LazyMount } from '@/components/features/LazyMount';
import { useSemanticSearch } from '@/hooks/useSemanticSearch';
import { hasActiveAiProvider } from '@/services/ai.service';
import { fieldMatches } from '@/lib/searchMatch';
import { cn } from '@/lib/utils';

const sortOptions = [
  { id: 'recent', label: '最近使用' },
  { id: 'usage', label: '使用时长' },
  { id: 'name', label: '软件名称' },
  { id: 'size', label: '大小排序' },
] as const;

export function LibraryPage() {
  const software = useSoftwareStore((s) => s.software);
  const selectedCategory = useSoftwareStore((s) => s.selectedCategory);
  const setSelectedCategory = useSoftwareStore((s) => s.setSelectedCategory);
  const searchQuery = useSoftwareStore((s) => s.searchQuery);
  const setSearchQuery = useSoftwareStore((s) => s.setSearchQuery);
  const sortBy = useSoftwareStore((s) => s.sortBy);
  const setSortBy = useSoftwareStore((s) => s.setSortBy);
  const aiSearchEnabled = useSettingsStore((s) => s.prefs.aiSearch);
  const toggleAiSearch = useSettingsStore((s) => s.togglePref);
  const [aiReady, setAiReady] = useState(false);
  // 已提交给 AI 的查询:仅在用户按回车 / 点击搜索按钮时更新,避免输入过程中逐字触发模型请求
  const [committedQuery, setCommittedQuery] = useState('');

  useEffect(() => {
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
  }, []);

  const sortResult = (list: typeof software) => {
    switch (sortBy) {
      case 'name':
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case 'usage':
        return [...list].sort((a, b) => b.usageMinutes - a.usageMinutes);
      case 'recent':
        return [...list].sort(
          (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
        );
      case 'size':
        return [...list].sort((a, b) => b.size - a.size);
      default:
        return list;
    }
  };

  // 本地字面匹配(免费、即时):name / description / tags 的 includes
  const localFiltered = useMemo(() => {
    let result = software;
    if (selectedCategory !== 'all') {
      result = result.filter((s) => s.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (s) =>
          fieldMatches(s.name, q) ||
          fieldMatches(s.description, q) ||
          s.tags.some((t) => fieldMatches(t, q))
      );
    }
    return result;
  }, [software, selectedCategory, searchQuery]);

  // AI 语义搜索:仅对"已提交"的查询触发(回车/点击搜索按钮),避免输入过程中逐字调用模型。
  // 用提交查询对应的本地命中数作为触发门槛之一。
  const committedLocalHitCount = useMemo(() => {
    const q = committedQuery.trim().toLowerCase();
    if (!q) return 0;
    let base = software;
    if (selectedCategory !== 'all') {
      base = base.filter((s) => s.category === selectedCategory);
    }
    return base.filter(
      (s) =>
        fieldMatches(s.name, q) ||
        fieldMatches(s.description, q) ||
        s.tags.some((t) => fieldMatches(t, q))
    ).length;
  }, [software, selectedCategory, committedQuery]);

  const semantic = useSemanticSearch(
    committedQuery,
    software,
    aiReady,
    committedLocalHitCount,
    aiSearchEnabled,
    true
  );

  // 输入变化时,若与已提交查询不一致则清空提交态(隐藏上一次 AI 结果与思考过程)
  useEffect(() => {
    if (searchQuery !== committedQuery) {
      setCommittedQuery('');
    }
    // 仅在输入变化时同步,committedQuery 由提交动作显式更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const submitAiSearch = () => {
    if (!searchQuery.trim()) return;
    setCommittedQuery(searchQuery);
  };

  // 合并本地与语义结果:本地优先,语义结果去重后追加;再按当前排序输出
  const filtered = useMemo(() => {
    const localIds = new Set(localFiltered.map((s) => s.id));
    let merged = localFiltered;

    if (semantic.ids && semantic.ids.length > 0) {
      const byId = new Map(software.map((s) => [s.id, s]));
      const extra = semantic.ids
        .filter((id) => !localIds.has(id))
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s && !s.uninstalled && !s.deleted)
        .filter((s) => selectedCategory === 'all' || s.category === selectedCategory);
      merged = [...localFiltered, ...extra];
    }

    return sortResult(merged);
    // sortResult 依赖 sortBy,显式列出避免漏依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFiltered, semantic.ids, software, selectedCategory, sortBy]);

  const aiExtraCount = filtered.length - localFiltered.length;

  useEffect(() => {
    return () => {
      setSelectedCategory('all');
      setSearchQuery('');
    };
  }, [setSelectedCategory, setSearchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">软件库</h1>
          <p className="text-sm text-slate-500 mt-1">管理和启动你已安装的所有软件</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white tabular-nums">{filtered.length}</div>
          <div className="text-xs text-slate-500">应用</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <button
            type="button"
            onClick={submitAiSearch}
            disabled={!aiReady || !aiSearchEnabled || !searchQuery.trim()}
            aria-label="发起 AI 搜索"
            title={aiReady && aiSearchEnabled ? '发起 AI 搜索（或按回车）' : '搜索'}
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors',
              aiReady && aiSearchEnabled && searchQuery.trim()
                ? 'text-violet-400 hover:bg-slate-800'
                : 'text-slate-500 cursor-default'
            )}
          >
            <Search className="w-4 h-4" />
          </button>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitAiSearch();
              }
            }}
            placeholder={
              aiReady && aiSearchEnabled
                ? '输入后按回车发起 AI 搜索（本地支持拼音、首字母）...'
                : '搜索软件名称、描述或标签（支持拼音、首字母）...'
            }
            aria-label="搜索软件"
            className={cn(
              'w-full pl-11 pr-10 py-3.5 rounded-2xl bg-slate-900/60 border border-slate-800',
              'text-sm text-slate-100 placeholder:text-slate-600',
              'focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all'
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="清空搜索"
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-800 text-slate-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => toggleAiSearch('aiSearch')}
          disabled={!aiReady}
          aria-pressed={aiSearchEnabled && aiReady}
          title={
            !aiReady
              ? '未配置或未启用 AI 模型，可在设置中添加'
              : aiSearchEnabled
                ? '已开启 AI 语义搜索，点击关闭'
                : '已关闭 AI 语义搜索，点击开启'
          }
          className={cn(
            'shrink-0 inline-flex items-center gap-2 px-3.5 py-3.5 rounded-2xl border text-sm font-medium transition-all',
            !aiReady
              ? 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
              : aiSearchEnabled
                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
          )}
        >
          <Sparkles className="w-4 h-4" />
          AI 搜索
        </button>
      </div>

      {searchQuery.trim() &&
        aiSearchEnabled &&
        aiReady &&
        (semantic.loading || semantic.thinking || (semantic.fromAi && aiExtraCount > 0)) && (
          <div className="-mt-2 space-y-2 text-xs">
            {(semantic.loading || semantic.thinking) && (
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 px-3 py-2">
                <div className="flex items-center gap-1.5 text-violet-300">
                  {semantic.loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span className="font-medium">AI 思考过程</span>
                </div>
                {semantic.thinking ? (
                  <p className="mt-1 max-h-[8.2em] overflow-y-auto pr-1 text-slate-400 leading-relaxed whitespace-pre-wrap">
                    {semantic.thinking}
                  </p>
                ) : (
                  <p className="mt-1 text-slate-500">正在理解你的搜索意图…</p>
                )}
              </div>
            )}
            {!semantic.loading && semantic.fromAi && aiExtraCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300">
                <Sparkles className="w-3 h-3" />
                AI 语义搜索补充了 {aiExtraCount} 个相关应用
              </span>
            )}
          </div>
        )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              selectedCategory === 'all'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'bg-slate-800/50 text-slate-400 border border-slate-800/60 hover:bg-slate-800 hover:text-slate-300'
            )}
          >
            全部
          </button>
          {CATEGORIES.filter((c) => software.some((s) => s.category === c.id)).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                selectedCategory === cat.id
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-800/60 hover:bg-slate-800 hover:text-slate-300'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          {sortOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSortBy(opt.id)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs transition-all',
                sortBy === opt.id ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((sw) => (
          <LazyMount key={sw.id} estimatedHeight={96}>
            <SoftwareCard software={sw} />
          </LazyMount>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="text-slate-600 text-sm">没有找到匹配的软件</div>
          </div>
        )}
      </div>
    </div>
  );
}
