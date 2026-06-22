import { useMemo } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import { formatMinutes } from '@/services/software.service';
import { WEEKLY_USAGE } from '@/data/software.mock';

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#3b82f6'];

export function Statistics() {
  const { software } = useSoftwareStore();

  const categoryData = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const items = software.filter((s) => s.category === cat.id);
      return {
        name: cat.name,
        value: items.reduce((sum, s) => sum + s.usageMinutes, 0),
        count: items.length,
        color: cat.color,
      };
    }).filter((d) => d.count > 0);
  }, [software]);

  const topApps = useMemo(
    () => [...software].sort((a, b) => b.usageMinutes - a.usageMinutes).slice(0, 8),
    [software]
  );

  const totalUsage = software.reduce((sum, s) => sum + s.usageMinutes, 0);
  const avgPerApp = Math.round(totalUsage / software.length);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">统计分析</h1>
        <p className="text-sm text-slate-500 mt-1">深入了解你的软件使用习惯与效率趋势</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '总使用时长', value: `${Math.round(totalUsage / 60)} 小时`, sub: `${software.length} 个软件` },
          { label: '平均每个软件', value: `${Math.round(avgPerApp / 60)} 小时`, sub: `${avgPerApp % 60} 分钟` },
          { label: '总启动次数', value: `${software.reduce((s, a) => s + a.launchCount, 0)}`, sub: '次启动' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60"
          >
            <div className="text-xs text-slate-500 font-medium">{stat.label}</div>
            <div className="mt-2 text-2xl font-bold text-white tracking-tight">{stat.value}</div>
            <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">每日使用分布</h2>
          <p className="text-xs text-slate-500 mb-4">过去 7 天的使用时长（小时）</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={WEEKLY_USAGE} margin={{ left: -15, right: 0, top: 10, bottom: 0 }}>
                <Bar dataKey="hours" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={32} opacity={0.85}>
                </Bar>
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 12,
                    padding: '8px 12px',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#f1f5f9' }}
                  formatter={(value: number) => [`${value} 小时`, '使用时长']}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">分类使用占比</h2>
          <p className="text-xs text-slate-500 mb-4">按累计使用时长统计</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="48%"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={2}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 12,
                    padding: '8px 12px',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [formatMinutes(value), '使用时长']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
        <h2 className="text-sm font-semibold text-slate-200 mb-1">软件使用排行榜</h2>
        <p className="text-xs text-slate-500 mb-6">按使用时长排序 · 全部软件</p>
        <div className="space-y-3">
          {topApps.map((sw, idx) => {
            const percent = (sw.usageMinutes / topApps[0].usageMinutes) * 100;
            return (
              <div key={sw.id} className="flex items-center gap-4">
                <div className="w-6 text-xs text-slate-600 tabular-nums">{String(idx + 1).padStart(2, '0')}</div>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: sw.color + '25', color: sw.color }}
                >
                  {sw.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-200 truncate">{sw.name}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{formatMinutes(sw.usageMinutes)}</span>
                  </div>
                  <div className="h-1 bg-slate-800/60 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, percent)}%`, backgroundColor: sw.color }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
