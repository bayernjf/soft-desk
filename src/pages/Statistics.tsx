import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { Clock, Rocket, AppWindow, Gauge, ChevronDown, Loader2, ChevronRight } from 'lucide-react';
import { CATEGORIES } from '@/data/categories';
import { useSoftwareStore } from '@/stores/software.store';
import { formatMinutes, formatTimeAgo } from '@/services/software.service';
import {
  useUsageStats,
  PERIOD_OPTIONS,
  type StatsPeriod,
} from '@/hooks/useUsageStats';
import type { SoftwareCategory } from '@/types';

type RankSort = 'usage' | 'launches' | 'recent';

const RANK_SORT_OPTIONS: { id: RankSort; label: string }[] = [
  { id: 'usage', label: '按使用时长' },
  { id: 'launches', label: '按启动次数' },
  { id: 'recent', label: '按最近使用' },
];

const PIE_TOOLTIP_STYLE = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: '8px 12px',
  fontSize: 12,
} as const;

export function Statistics() {
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const [rankSort, setRankSort] = useState<RankSort>('usage');
  const [rankCategory, setRankCategory] = useState<SoftwareCategory | 'all'>('all');
  const [sortOpen, setSortOpen] = useState(false);
  const [showHours, setShowHours] = useState(true);
  const [showLaunches, setShowLaunches] = useState(true);
  const sortRef = useRef<HTMLDivElement>(null);

  const stats = useUsageStats(period);

  const navigate = useNavigate();
  const setSearchQuery = useSoftwareStore((s) => s.setSearchQuery);
  const setSelectedCategory = useSoftwareStore((s) => s.setSelectedCategory);

  const goToLibrary = (name: string) => {
    setSelectedCategory('all');
    setSearchQuery(name);
    navigate('/library');
  };

  const trendSeries = [
    { key: 'hours' as const, label: '使用时长', color: '#8b5cf6', visible: showHours, toggle: () => setShowHours((v) => !v) },
    { key: 'launches' as const, label: '启动次数', color: '#06b6d4', visible: showLaunches, toggle: () => setShowLaunches((v) => !v) },
  ];

  const summaryCards = useMemo(
    () => [
      {
        label: '总使用时长',
        value: formatMinutes(stats.totalMinutes),
        sub: `${PERIOD_OPTIONS.find((p) => p.id === period)?.label} · ${stats.activeCount} 个软件`,
        icon: Clock,
        color: '#8b5cf6',
      },
      {
        label: '总启动次数',
        value: `${stats.totalLaunches}`,
        sub: '次启动',
        icon: Rocket,
        color: '#06b6d4',
      },
      {
        label: '活跃软件数',
        value: `${stats.activeCount}`,
        sub: '个有使用记录',
        icon: AppWindow,
        color: '#10b981',
      },
      {
        label: '平均每个软件',
        value: formatMinutes(stats.avgMinutes),
        sub: '人均使用时长',
        icon: Gauge,
        color: '#f59e0b',
      },
    ],
    [stats, period]
  );

  const ranking = useMemo(() => {
    const filtered =
      rankCategory === 'all'
        ? stats.ranking
        : stats.ranking.filter((item) => item.software.category === rankCategory);
    const sorted = [...filtered].sort((a, b) => {
      if (rankSort === 'usage') return b.minutes - a.minutes;
      if (rankSort === 'launches') return b.launches - a.launches;
      const ta = a.software.lastUsed ? new Date(a.software.lastUsed).getTime() : 0;
      const tb = b.software.lastUsed ? new Date(b.software.lastUsed).getTime() : 0;
      return tb - ta;
    });
    return sorted.slice(0, 12);
  }, [stats.ranking, rankCategory, rankSort]);

  const rankMax = ranking.length
    ? rankSort === 'launches'
      ? ranking[0].launches
      : ranking[0].minutes
    : 1;

  const activeCategories = useMemo(() => {
    const ids = new Set(stats.ranking.map((item) => item.software.category));
    return CATEGORIES.filter((c) => ids.has(c.id));
  }, [stats.ranking]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">统计分析</h1>
          <p className="text-sm text-slate-500 mt-1">
            深入了解你的软件使用习惯与效率趋势
            {!stats.isReal && (
              <span className="ml-2 text-amber-500/80">· 示例数据</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800/60">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === opt.id
                  ? 'bg-violet-500/90 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 hover:border-slate-700/80 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500 font-medium">{stat.label}</div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: stat.color + '20', color: stat.color }}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 text-2xl font-bold text-white tracking-tight">{stat.value}</div>
              <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-200">使用趋势</h2>
            <div className="flex items-center gap-3">
              {stats.loading && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
              <div className="flex items-center gap-1.5">
                {trendSeries.map((s) => (
                  <button
                    key={s.key}
                    onClick={s.toggle}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                      s.visible ? 'text-slate-300 hover:bg-slate-800/60' : 'text-slate-600 hover:bg-slate-800/40'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full transition-opacity"
                      style={{ backgroundColor: s.color, opacity: s.visible ? 1 : 0.3 }}
                    />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">使用时长（小时）与启动次数 · 点击图例可切换显隐</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats.trend} margin={{ left: -18, right: 0, top: 10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 3" />
                {showHours && (
                  <Bar
                    yAxisId="left"
                    dataKey="hours"
                    fill="#8b5cf6"
                    radius={[6, 6, 0, 0]}
                    barSize={28}
                    opacity={0.85}
                    name="使用时长"
                  />
                )}
                {showLaunches && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="launches"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#06b6d4' }}
                    activeDot={{ r: 5 }}
                    name="启动次数"
                  />
                )}
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickFormatter={(v) => `${v}h`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: '#ffffff08' }}
                  contentStyle={PIE_TOOLTIP_STYLE}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#f1f5f9' }}
                  formatter={(value: number, name: string) =>
                    name === '使用时长' ? [`${value} 小时`, name] : [`${value} 次`, name]
                  }
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">分类使用占比</h2>
          <p className="text-xs text-slate-500 mb-4">按累计使用时长统计</p>
          {stats.category.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-600">
              暂无使用数据
            </div>
          ) : (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.category}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                    >
                      {stats.category.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={PIE_TOOLTIP_STYLE}
                      formatter={(value: number) => [formatMinutes(value), '使用时长']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3">
                {stats.category.map((item) => (
                  <div key={item.id} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-slate-400">{item.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 mb-1">软件使用排行榜</h2>
            <p className="text-xs text-slate-500">
              {rankSort === 'usage'
                ? '按使用时长排序'
                : rankSort === 'launches'
                  ? '按启动次数排序'
                  : '按最近使用排序'} · 最多展示 12 项
            </p>
          </div>

          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setSortOpen((v) => !v)}
              onBlur={() => setTimeout(() => setSortOpen(false), 120)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/60 text-slate-300 hover:bg-slate-800 transition-colors"
            >
              {RANK_SORT_OPTIONS.find((o) => o.id === rankSort)?.label}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortOpen && (
              <div className="absolute right-0 mt-1.5 w-36 z-10 p-1 rounded-xl bg-slate-900 border border-slate-700/80 shadow-xl">
                {RANK_SORT_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setRankSort(o.id);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      rankSort === o.id
                        ? 'bg-violet-500/20 text-violet-300'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setRankCategory('all')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              rankCategory === 'all'
                ? 'bg-slate-200 text-slate-900'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            全部
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setRankCategory(cat.id)}
              className="px-3 py-1 text-xs font-medium rounded-full transition-colors"
              style={
                rankCategory === cat.id
                  ? { backgroundColor: cat.color, color: '#0b1120' }
                  : { backgroundColor: cat.color + '1f', color: cat.color }
              }
            >
              {cat.name}
            </button>
          ))}
        </div>

        {ranking.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-600">该范围内暂无使用记录</div>
        ) : (
          <div className="space-y-3">
            {ranking.map((item, idx) => {
              const sw = item.software;
              const metric = rankSort === 'launches' ? item.launches : item.minutes;
              const percent = (metric / rankMax) * 100;
              return (
                <button
                  key={sw.id}
                  onClick={() => goToLibrary(sw.name)}
                  title={`在软件库中查看 ${sw.name}`}
                  className="w-full flex items-center gap-4 group text-left rounded-xl -mx-2 px-2 py-1.5 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="w-6 text-xs text-slate-600 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: sw.color + '25', color: sw.color }}
                  >
                    {sw.name.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                          {sw.name}
                        </span>
                        {rankSort !== 'recent' && sw.lastUsed && (
                          <span className="text-[11px] text-slate-600 shrink-0">
                            最近 {formatTimeAgo(sw.lastUsed)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums shrink-0 ml-3 flex items-center gap-1">
                        {rankSort === 'usage'
                          ? formatMinutes(item.minutes)
                          : rankSort === 'launches'
                            ? `${item.launches} 次`
                            : sw.lastUsed
                              ? formatTimeAgo(sw.lastUsed)
                              : '未使用'}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </span>
                    </div>
                    <div className="h-1 bg-slate-800/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 group-hover:opacity-100 opacity-85"
                        style={{ width: `${Math.max(5, percent)}%`, backgroundColor: sw.color }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
