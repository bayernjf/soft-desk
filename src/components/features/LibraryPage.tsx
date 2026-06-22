import { useEffect, useMemo } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import { SoftwareCard } from '@/components/features/SoftwareCard';
import { cn } from '@/lib/utils';

const sortOptions = [
  { id: 'recent', label: '最近使用' },
  { id: 'usage', label: '使用时长' },
  { id: 'name', label: '软件名称' },
  { id: 'size', label: '大小排序' },
] as const;

export function LibraryPage() {
  const {
    software,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
  } = useSoftwareStore();

  const filtered = useMemo(() => {
    let result = software;
    if (selectedCategory !== 'all') {
      result = result.filter((s) => s.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    switch (sortBy) {
      case 'name':
        result = [...result].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'usage':
        result = [...result].sort((a, b) => b.usageMinutes - a.usageMinutes);
        break;
      case 'recent':
        result = [...result].sort(
          (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
        );
        break;
      case 'size':
        result = [...result].sort((a, b) => b.size - a.size);
        break;
    }
    return result;
  }, [software, selectedCategory, searchQuery, sortBy]);

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

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索软件名称、描述或标签..."
          className={cn(
            'w-full pl-11 pr-10 py-3.5 rounded-2xl bg-slate-900/60 border border-slate-800',
            'text-sm text-slate-100 placeholder:text-slate-600',
            'focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all'
          )}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-800 text-slate-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

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
          <SoftwareCard key={sw.id} software={sw} />
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
