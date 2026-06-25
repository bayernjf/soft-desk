import { useState, useCallback } from 'react';
import { Sparkles, RefreshCw, Loader2, Search, Lightbulb } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { fetchRecommendations } from '@/services/recommendation.service';
import { SoftwareCard } from './SoftwareCard';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<string, string> = {
  query: '需求匹配',
  behavior: '习惯推荐',
  workflow: '工作流',
  complement: '补充工具',
};

const TYPE_COLOR: Record<string, string> = {
  query: 'text-emerald-400 bg-emerald-500/10',
  behavior: 'text-amber-400 bg-amber-500/10',
  workflow: 'text-violet-400 bg-violet-500/10',
  complement: 'text-sky-400 bg-sky-500/10',
};

export function SmartRecommendations() {
  const software = useSoftwareStore((s) => s.software);
  const recommendations = useSoftwareStore((s) => s.recommendations);
  const recommendationLoading = useSoftwareStore((s) => s.recommendationLoading);
  const setRecommendations = useSoftwareStore((s) => s.setRecommendations);
  const setRecommendationLoading = useSoftwareStore((s) => s.setRecommendationLoading);
  const [query, setQuery] = useState('');

  const byId = new Map(software.map((s) => [s.id, s]));

  const handleFetch = useCallback(
    async (explicitQuery?: string) => {
      if (recommendationLoading) return;
      setRecommendationLoading(true);
      const q = explicitQuery ?? query;
      const recs = await fetchRecommendations(q || undefined, software);
      setRecommendations(recs);
      setRecommendationLoading(false);
    },
    [query, software, recommendationLoading, setRecommendations, setRecommendationLoading]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleFetch();
    }
  };

  const recSoftware = recommendations
    .map((r) => byId.get(r.id))
    .filter((s): s is NonNullable<typeof s> => !!s && !s.uninstalled && !s.deleted);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-200">智能推荐</h2>
        <button
          onClick={() => void handleFetch()}
          disabled={recommendationLoading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/60 text-slate-400 text-[10px] hover:bg-slate-700/60 hover:text-slate-300 transition-colors disabled:opacity-50"
        >
          {recommendationLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          刷新
        </button>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入需求，如：剪视频、写代码…"
          className={cn(
            'w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800/60',
            'text-xs text-slate-200 placeholder:text-slate-600',
            'focus:outline-none focus:border-violet-500/40 transition-all'
          )}
        />
      </div>

      {recommendationLoading && recSoftware.length === 0 ? (
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          AI 正在分析你的软件库…
        </div>
      ) : recommendations.length > 0 ? (
        <div className="space-y-3">
          {recommendations.map((rec) => {
            const sw = byId.get(rec.id);
            if (!sw || sw.uninstalled || sw.deleted) return null;
            return (
              <div
                key={rec.id}
                className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 hover:border-slate-700/60 transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                      TYPE_COLOR[rec.type] ?? 'text-slate-400 bg-slate-700/40'
                    )}
                  >
                    {TYPE_LABEL[rec.type] ?? rec.type}
                  </span>
                </div>
                <SoftwareCard software={sw} variant="compact" />
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5">
                  <Lightbulb className="w-3 h-3 text-amber-500/60 shrink-0 mt-0.5" />
                  {rec.reason}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60">
          <div className="text-xs text-slate-400 leading-relaxed">
            <Sparkles className="w-3 h-3 text-violet-400 inline mr-1" />
            <span className="text-slate-300">提示</span>
            ：输入你的需求或直接点击刷新，AI 会根据你的使用习惯为你推荐最合适的软件。
          </div>
        </div>
      )}
    </section>
  );
}
