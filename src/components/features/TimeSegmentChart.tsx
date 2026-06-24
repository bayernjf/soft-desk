import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Loader2, Clock3 } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { useTimeSegmentStats, type StatsPeriod } from '@/hooks/useUsageStats';
import { formatMinutes } from '@/services/software.service';

const CHART_TOOLTIP_STYLE = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: '8px 12px',
  fontSize: 12,
} as const;

const SEGMENTS = [
  { key: 'morning' as const, label: '早上', color: '#f59e0b' },
  { key: 'afternoon' as const, label: '下午', color: '#06b6d4' },
  { key: 'evening' as const, label: '晚上', color: '#8b5cf6' },
  { key: 'night' as const, label: '深夜', color: '#475569' },
];

const TOP_APPS = 8;

interface TimeSegmentChartProps {
  period: StatsPeriod;
}

export function TimeSegmentChart({ period }: TimeSegmentChartProps) {
  const software = useSoftwareStore((s) => s.software);
  const { hourly, byApp, loading } = useTimeSegmentStats(period);

  const hourData = useMemo(
    () =>
      hourly.map((h) => ({
        hour: h.hour,
        label: `${String(h.hour).padStart(2, '0')}:00`,
        minutes: h.minutes,
      })),
    [hourly]
  );

  const hasHourData = useMemo(() => hourly.some((h) => h.minutes > 0), [hourly]);

  const peakHour = useMemo(() => {
    if (!hasHourData) return null;
    return hourly.reduce((max, h) => (h.minutes > max.minutes ? h : max), hourly[0]);
  }, [hourly, hasHourData]);

  const appData = useMemo(() => {
    const nameById = new Map(software.map((s) => [s.id, s.name]));
    return byApp
      .filter((a) => a.total > 0)
      .slice(0, TOP_APPS)
      .map((a) => ({
        name: nameById.get(a.softwareId) ?? a.softwareId,
        morning: a.morning,
        afternoon: a.afternoon,
        evening: a.evening,
        night: a.night,
      }));
  }, [byApp, software]);

  return (
    <section className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-200">使用时段规律</h2>
        <div className="flex items-center gap-3">
          {loading && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
          {peakHour && (
            <span className="inline-flex items-center gap-1.5 text-xs text-violet-300">
              <Clock3 className="w-3.5 h-3.5" />
              活跃高峰 {String(peakHour.hour).padStart(2, '0')}:00
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">基于会话开始时间，分析你一天中的活跃节律与各软件的常用时段</p>

      {!hasHourData ? (
        <div className="h-56 flex items-center justify-center text-sm text-slate-600">
          积累更多使用数据后，这里会展示你的活跃时段规律
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <div className="text-xs text-slate-400 mb-2">全天活跃节律（24 小时）</div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourData} margin={{ left: -18, right: 0, top: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rhythmFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="minutes"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#rhythmFill)"
                    name="使用时长"
                  />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    interval={2}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(v: number) => `${v}m`}
                  />
                  <Tooltip
                    cursor={{ fill: '#ffffff08' }}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{ color: '#94a3b8' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    labelFormatter={(v: number) => `${String(v).padStart(2, '0')}:00`}
                    formatter={(value: number) => [formatMinutes(value), '使用时长']}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-400">软件活跃时段分布</div>
              <div className="flex items-center gap-2.5">
                {SEGMENTS.map((s) => (
                  <span key={s.key} className="flex items-center gap-1 text-[11px] text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
            {appData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-slate-600">
                暂无软件时段数据
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={appData}
                    margin={{ left: 8, right: 12, top: 6, bottom: 0 }}
                    barCategoryGap={6}
                  >
                    <CartesianGrid horizontal={false} stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickFormatter={(v: number) => `${v}m`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ fill: '#ffffff08' }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={{ color: '#94a3b8' }}
                      itemStyle={{ color: '#f1f5f9' }}
                      formatter={(value: number, name: string) => [formatMinutes(value), name]}
                    />
                    {SEGMENTS.map((s) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        stackId="seg"
                        fill={s.color}
                        name={s.label}
                        radius={s.key === 'night' ? [0, 4, 4, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
