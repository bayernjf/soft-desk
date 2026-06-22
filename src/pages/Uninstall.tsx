import { useMemo, useState } from 'react';
import { AlertCircle, HardDrive, Search, X } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import { formatSize } from '@/services/software.service';
import { SoftwareCard } from '@/components/features/SoftwareCard';
import type { SoftwareCategory } from '@/types';
import { cn } from '@/lib/utils';

export function Uninstall() {
  const { software, uninstallSoftware, reinstallSoftware } = useSoftwareStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SoftwareCategory | 'all'>('all');
  const [confirmClean, setConfirmClean] = useState(false);
  const [cleanedIds, setCleanedIds] = useState<string[]>([]);

  const active = useMemo(() => software.filter((s) => !s.uninstalled), [software]);
  const unused = useMemo(
    () =>
      active
        .filter(
          (s) =>
            new Date(s.lastUsed).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000 &&
            s.size >= 1024
        )
        .sort((a, b) => b.size - a.size),
    [active]
  );

  const totalSize = active.reduce((sum, s) => sum + s.size, 0);
  const potentialFree = unused.reduce((sum, s) => sum + s.size, 0);

  const filtered = useMemo(() => {
    let result = software;
    if (category !== 'all') {
      result = result.filter((s) => s.category === category);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)) ||
          s.publisher?.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      if (!!a.uninstalled !== !!b.uninstalled) return a.uninstalled ? 1 : -1;
      return b.size - a.size;
    });
  }, [software, category, query]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">软件清理</h1>
          <p className="text-sm text-slate-500 mt-1">浏览全部软件，快速卸载不常用的应用以释放磁盘空间</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-white tabular-nums">{formatSize(totalSize)}</div>
            <div className="text-xs text-slate-500">占用总空间</div>
          </div>
          <div className="w-px h-10 bg-slate-800" />
          <div className="text-right">
            <div className="text-2xl font-bold text-amber-400 tabular-nums">{formatSize(potentialFree)}</div>
            <div className="text-xs text-slate-500">可释放空间</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索软件名称、描述或标签..."
              className={cn(
                'w-full pl-11 pr-10 py-3.5 rounded-2xl bg-slate-900/60 border border-slate-800',
                'text-sm text-slate-100 placeholder:text-slate-600',
                'focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all'
              )}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-800 text-slate-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setCategory('all')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                category === 'all'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-800/60 hover:bg-slate-800 hover:text-slate-300'
              )}
            >
              全部
            </button>
            {CATEGORIES.filter((c) => software.some((s) => s.category === c.id)).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  category === cat.id
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'bg-slate-800/50 text-slate-400 border border-slate-800/60 hover:bg-slate-800 hover:text-slate-300'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">全部软件</h2>
            <span className="text-xs text-slate-500 tabular-nums">{filtered.length} 个</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((sw) => (
              <SoftwareCard key={sw.id} software={sw} context="uninstall" />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-20 text-center">
                <div className="text-slate-600 text-sm">没有找到匹配的软件</div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900/40 to-slate-900/40 border border-amber-500/20">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-200">清理建议</h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  检测到 {unused.length} 个软件超过一个月未使用且体积大于 1GB，建议优先弃用以释放更多空间。
                </p>
              </div>
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-slate-200">大体积应用</h3>
            </div>
            <div className="text-xs text-slate-500 mb-3">{unused.length} 个应用 ≥ 1GB 且超一个月未用</div>
            <div className="space-y-2 max-h-[17.5rem] overflow-y-auto pr-1">
              {unused.length > 0 ? (
                unused.map((sw) => (
                  <div key={sw.id} className="flex items-center gap-2.5 text-xs h-5">
                    <span
                      className="px-2 py-0.5 rounded-md font-medium tabular-nums shrink-0"
                      style={{ backgroundColor: sw.color + '20', color: sw.color }}
                    >
                      {formatSize(sw.size)}
                    </span>
                    <span className="text-slate-400 truncate">{sw.name}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-600">暂无符合条件的应用</div>
              )}
            </div>
          </section>

          {confirmClean ? (
            <div className="w-full p-4 rounded-2xl bg-slate-900/60 border border-rose-500/30 space-y-3">
              <p className="text-xs text-slate-300 text-center">
                确认弃用这 {unused.length} 个未使用应用？
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => {
                    const ids = unused.map((sw) => sw.id);
                    ids.forEach((id) => uninstallSoftware(id));
                    setCleanedIds(ids);
                    setConfirmClean(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                >
                  确认弃用
                </button>
                <button
                  onClick={() => setConfirmClean(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : cleanedIds.length > 0 ? (
            <button
              onClick={() => {
                cleanedIds.forEach((id) => reinstallSoftware(id));
                setCleanedIds([]);
              }}
              className={cn(
                'w-full py-3.5 rounded-2xl text-sm font-semibold transition-all',
                'bg-gradient-to-r from-emerald-500 to-teal-500 text-white',
                'hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.99]'
              )}
            >
              一键重新使用 {cleanedIds.length} 个应用
            </button>
          ) : (
            <button
              onClick={() => setConfirmClean(true)}
              disabled={unused.length === 0}
              className={cn(
                'w-full py-3.5 rounded-2xl text-sm font-semibold transition-all',
                'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white',
                'hover:shadow-lg hover:shadow-violet-500/20 active:scale-[0.99]',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100'
              )}
            >
              {unused.length > 0 ? `一键弃用 ${unused.length} 个未使用应用` : '暂无待清理项'}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
