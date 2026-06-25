import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clock, Sparkles, TrendingUp, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useSoftwareStore } from '@/stores/software.store';
import { useSettingsStore } from '@/stores/settings.store';
import { CATEGORIES } from '@/data/categories';
import { formatMinutes, formatTimeAgo } from '@/services/software.service';
import { fetchWorkflowSuggestions, hasActiveAiProvider } from '@/services/ai.service';
import { SoftwareCard } from '@/components/features/SoftwareCard';
import { AppIcon } from '@/components/features/AppIcon';
import { SmartRecommendations } from '@/components/features/SmartRecommendations';
import { cn } from '@/lib/utils';
import type { CoUsagePair, AiWorkflowSuggestion, SegmentCoUsage, TimeSegment } from '@/types/electron';

function StatCard({
  icon: Icon,
  title,
  value,
  hint,
  color,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  hint: string;
  color: string;
}) {
  return (
    <div className="relative p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 overflow-hidden group hover:border-slate-700/80 transition-all duration-300">
      <div
        className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ backgroundColor: color }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
            <Icon className="w-3.5 h-3.5" />
            {title}
          </div>
          <div className="mt-2.5 text-3xl font-bold text-white tracking-tight">{value}</div>
          <div className="text-xs text-slate-500 mt-1">{hint}</div>
        </div>
        <ArrowUpRight className="w-4 h-4 text-slate-700 group-hover:text-slate-500 transition-colors" />
      </div>
    </div>
  );
}

const SEGMENT_LABEL: Record<TimeSegment, string> = {
  morning: '早上',
  afternoon: '下午',
  evening: '晚上',
  night: '深夜',
};

/** 把 0-23 小时映射到时段(与主进程 segmentOfHour 保持一致) */
function segmentOfHour(hour: number): TimeSegment {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 22) return 'evening';
  return 'night';
}

export function Dashboard() {
  const software = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);
  const createWorkflow = useSoftwareStore((s) => s.createWorkflow);
  const isElectron = useSoftwareStore((s) => s.isElectron);
  const aiSuggestionsEnabled = useSettingsStore((s) => s.prefs.aiSuggestions);
  const navigate = useNavigate();
  const [coUsage, setCoUsage] = useState<CoUsagePair[]>([]);
  const [segmentUsage, setSegmentUsage] = useState<SegmentCoUsage[]>([]);
  const [aiProviderReady, setAiProviderReady] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiWorkflowSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const topApps = [...software].sort((a, b) => b.usageMinutes - a.usageMinutes).slice(0, 5);
  const recentApps = [...software]
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
    .slice(0, 6);

  const totalMinutes = software.reduce((sum, s) => sum + s.usageMinutes, 0);
  const perDay = Math.round(totalMinutes / 7);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 12) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  })();

  // 拉取基于 sessions 的共现分析数据(仅在 Electron + 开启 AI 建议时)
  useEffect(() => {
    if (!aiSuggestionsEnabled || !isElectron || !window.softdesk?.getSuggestions) {
      setCoUsage([]);
      setSegmentUsage([]);
      return;
    }
    let cancelled = false;
    window.softdesk
      .getSuggestions()
      .then((pairs) => {
        if (!cancelled) setCoUsage(pairs);
      })
      .catch(() => {
        if (!cancelled) setCoUsage([]);
      });
    // 按时段拆分的共现:用于"当前时段优先"的场景化本地推荐
    window.softdesk
      .getSegmentSuggestions?.()
      .then((segs) => {
        if (!cancelled) setSegmentUsage(Array.isArray(segs) ? segs : []);
      })
      .catch(() => {
        if (!cancelled) setSegmentUsage([]);
      });
    return () => {
      cancelled = true;
    };
  }, [aiSuggestionsEnabled, isElectron]);

  // 真 AI 建议:有启用模型时,把已安装应用 + 共现统计交给模型生成有语义的工作流建议;
  // 失败或无模型则保持空,UI 自动回退到下方基于共现统计/使用时长的本地建议。
  useEffect(() => {
    if (!aiSuggestionsEnabled || !isElectron) {
      setAiProviderReady(false);
      setAiSuggestions([]);
      return;
    }
    let cancelled = false;
    setAiLoading(true);
    hasActiveAiProvider()
      .then(async (ready) => {
        if (cancelled) return;
        setAiProviderReady(ready);
        if (!ready) {
          setAiSuggestions([]);
          return;
        }
        const list = await fetchWorkflowSuggestions(software);
        if (!cancelled) setAiSuggestions(list);
      })
      .catch(() => {
        if (!cancelled) {
          setAiProviderReady(false);
          setAiSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // 仅在启用状态/环境变化时触发,避免软件列表频繁变动导致重复调用模型(省钱)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSuggestionsEnabled, isElectron]);

  // 从共现软件对聚合出一个 2-4 个软件的组合建议:优先用"当前时段"的共现对作为种子
  // (场景化:如早上常一起开的软件),无当前时段数据时回退到全天共现。
  const suggestion = useMemo(() => {
    const byId = new Map(software.map((s) => [s.id, s]));
    const available = (id: string) => {
      const sw = byId.get(id);
      return sw && !sw.uninstalled && !sw.deleted ? sw : null;
    };

    // 当前时段优先:取本时段共现对;不足则回退到全天共现
    const currentSegment = segmentOfHour(new Date().getHours());
    const segPairs = segmentUsage.find((s) => s.segment === currentSegment)?.pairs ?? [];
    const useSegment = segPairs.some((p) => available(p.a) && available(p.b));
    const sourcePairs = useSegment ? segPairs : coUsage;

    const validPairs = sourcePairs.filter((p) => available(p.a) && available(p.b));
    if (validPairs.length === 0) return null;

    const seed = validPairs[0];
    const group = [seed.a, seed.b];
    for (const pair of validPairs.slice(1)) {
      if (group.length >= 4) break;
      if (group.includes(pair.a) && !group.includes(pair.b)) group.push(pair.b);
      else if (group.includes(pair.b) && !group.includes(pair.a)) group.push(pair.a);
    }

    const apps = group.map((id) => byId.get(id)!).filter(Boolean);
    if (apps.length < 2) return null;

    // 已存在覆盖同一组软件的工作流则不再重复建议
    const groupSet = new Set(group);
    const duplicated = workflows.some(
      (w) =>
        w.softwareIds.length === groupSet.size &&
        w.softwareIds.every((id) => groupSet.has(id))
    );
    if (duplicated) return null;

    return {
      apps,
      ids: group,
      strength: seed.count,
      segment: useSegment ? currentSegment : null,
    };
  }, [coUsage, segmentUsage, software, workflows]);

  const handleCreateSuggested = () => {
    if (!suggestion) return;
    const name = suggestion.segment
      ? `${SEGMENT_LABEL[suggestion.segment]}工作流`
      : `${suggestion.apps[0].name} 工作流`;
    createWorkflow({
      name,
      description: suggestion.segment
        ? `你常在${SEGMENT_LABEL[suggestion.segment]}一起使用的软件组合`
        : '基于你的使用习惯智能推荐的软件组合',
      softwareIds: suggestion.ids,
      color: '',
    });
    navigate('/workflows');
  };

  // 由某条 AI 建议直接落地为工作流(过滤掉已不可用的软件 id 后创建)
  const byId = useMemo(() => new Map(software.map((s) => [s.id, s])), [software]);
  const handleCreateAiSuggestion = (sug: AiWorkflowSuggestion) => {
    const ids = sug.softwareIds.filter((id) => {
      const sw = byId.get(id);
      return sw && !sw.uninstalled && !sw.deleted;
    });
    if (ids.length < 2) return;
    createWorkflow({
      name: sug.name,
      description: sug.description || '由 AI 基于你的使用习惯推荐',
      softwareIds: ids,
      color: '',
    });
    navigate('/workflows');
  };

  // 回退文案:无共现数据时,基于使用时长 top 应用给出轻量建议
  const fallbackApps = topApps.filter((s) => s.usageMinutes > 0).slice(0, 3);
  const fallbackText =
    fallbackApps.length >= 2
      ? `${fallbackApps.map((s) => s.name).join('、')} 是你使用最频繁的应用，建议创建组合工作流一键启动。`
      : null;

  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {greeting}，欢迎回来 <span className="inline-block">👋</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">这是你的软件使用概览</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-medium">AI 分析已更新</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingUp}
          title="总应用数"
          value={String(software.length)}
          hint="个已安装应用"
          color="#8b5cf6"
        />
        <StatCard
          icon={Clock}
          title="本周使用时长"
          value={`${(totalMinutes / 60).toFixed(1)}h`}
          hint={`${perDay} 分钟 / 天`}
          color="#06b6d4"
        />
        <StatCard
          icon={Sparkles}
          title="智能工作流"
          value={String(workflows.length)}
          hint={`已使用 ${workflows.reduce((s, w) => s + w.usageCount, 0)} 次`}
          color="#f59e0b"
        />
        <StatCard
          icon={ArrowUpRight}
          title="最近活跃"
          value={`${
            software.length === 0
              ? 0
              : Math.round(
                  (software.filter(
                    (s) => new Date(s.lastUsed).getTime() > Date.now() - 3 * 24 * 60 * 60 * 1000
                  ).length /
                    software.length) *
                    100
                )
          }%`}
          hint="3 天内使用过"
          color="#10b981"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">常用软件</h2>
              <div className="text-xs text-slate-500">按使用时长排序</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {topApps.map((sw) => (
                <SoftwareCard key={sw.id} software={sw} />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">最近使用</h2>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
              <div className="space-y-2">
                {recentApps.map((sw, idx) => {
                  const inactive = !!sw.uninstalled || !!sw.deleted;
                  const statusLabel = sw.deleted ? '已从本地电脑删除' : '已弃用';
                  return (
                  <div
                    key={sw.id}
                    className={cn(
                      'flex items-center gap-3 py-2 first:pt-0 last:pb-0 border-b border-slate-800/40 last:border-b-0 transition-all',
                      inactive
                        ? 'grayscale opacity-50 cursor-default'
                        : 'cursor-pointer hover:pl-2'
                    )}
                    onClick={() => {
                      if (!inactive) useSoftwareStore.getState().launchSoftware(sw.id);
                    }}
                  >
                    <div className="w-6 text-xs text-slate-600 tabular-nums">{String(idx + 1).padStart(2, '0')}</div>
                    <AppIcon software={sw} size={32} rounded="rounded-lg" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate">
                        {sw.name}
                        {inactive && (
                          <span className="ml-2 text-xs font-medium text-slate-500">{statusLabel}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatMinutes(sw.usageMinutes)} · {formatTimeAgo(sw.lastUsed)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {totalMinutes === 0 ? 0 : Math.round((sw.usageMinutes / totalMinutes) * 100)}%
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <SmartRecommendations />

          <section>
            <h2 className="text-sm font-semibold text-slate-200 mb-4">分类概览</h2>
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 space-y-3">
              {CATEGORIES.slice(0, 6).map((cat) => {
                const count = software.filter((s) => s.category === cat.id).length;
                const usage = software
                  .filter((s) => s.category === cat.id)
                  .reduce((sum, s) => sum + s.usageMinutes, 0);
                const percent = totalMinutes === 0 ? 0 : Math.round((usage / totalMinutes) * 100);
                if (count === 0) return null;
                return (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-400">{cat.name}</span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {percent}% · {count} 个
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, percent)}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {aiSuggestionsEnabled && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-200">AI 建议</h2>
                {aiProviderReady && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 text-[10px] font-medium">
                    <Sparkles className="w-3 h-3" />
                    模型驱动
                  </span>
                )}
              </div>
              {aiLoading ? (
                <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  AI 正在分析你的使用习惯…
                </div>
              ) : aiSuggestions.length > 0 ? (
                <div className="space-y-3">
                  {aiSuggestions.map((sug, idx) => {
                    const apps = sug.softwareIds
                      .map((id) => byId.get(id))
                      .filter(
                        (s): s is NonNullable<typeof s> => !!s && !s.uninstalled && !s.deleted
                      );
                    if (apps.length < 2) return null;
                    return (
                      <div
                        key={`${sug.name}-${idx}`}
                        className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 via-slate-900/40 to-amber-500/5 border border-violet-500/20"
                      >
                        <div className="flex items-start gap-2.5 mb-3">
                          <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-sm font-semibold text-slate-200">{sug.name}</h3>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                              {sug.reason || sug.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          {apps.map((sw) => (
                            <div key={sw.id} title={sw.name}>
                              <AppIcon software={sw} size={32} rounded="rounded-lg" />
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => handleCreateAiSuggestion(sug)}
                          className="block w-full py-2.5 rounded-xl bg-violet-500/15 text-violet-300 text-xs font-medium hover:bg-violet-500/25 transition-colors text-center"
                        >
                          一键创建该工作流 +
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : suggestion ? (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 via-slate-900/40 to-amber-500/5 border border-violet-500/20">
                  <div className="flex items-start gap-2.5 mb-3">
                    <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">
                        {suggestion.segment
                          ? `${SEGMENT_LABEL[suggestion.segment]}工作流推荐`
                          : '推荐工作流组合'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {suggestion.segment
                          ? `你常在${SEGMENT_LABEL[suggestion.segment]}一起使用 ${suggestion.apps
                              .map((s) => s.name)
                              .join('、')}，建议组成一个工作流一键启动。`
                          : `你经常一起使用 ${suggestion.apps
                              .map((s) => s.name)
                              .join('、')}，建议组成一个工作流一键启动。`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    {suggestion.apps.map((sw) => (
                      <div key={sw.id} title={sw.name}>
                        <AppIcon software={sw} size={32} rounded="rounded-lg" />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleCreateSuggested}
                    className="block w-full py-2.5 rounded-xl bg-violet-500/15 text-violet-300 text-xs font-medium hover:bg-violet-500/25 transition-colors text-center"
                  >
                    一键创建该工作流 +
                  </button>
                </div>
              ) : fallbackText ? (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 via-slate-900/40 to-amber-500/5 border border-violet-500/20">
                  <div className="flex items-start gap-2.5 mb-3">
                    <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">优化你的工作流</h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{fallbackText}</p>
                    </div>
                  </div>
                  <Link
                    to="/workflows"
                    className="block w-full py-2.5 rounded-xl bg-violet-500/15 text-violet-300 text-xs font-medium hover:bg-violet-500/25 transition-colors text-center"
                  >
                    创建工作流 +
                  </Link>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60">
                  <div className="text-xs text-slate-400 leading-relaxed">
                    💡 <span className="text-slate-300">提示</span>
                    ：继续使用应用，积累足够的使用数据后，这里会基于你的真实习惯给出工作流建议。
                  </div>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
