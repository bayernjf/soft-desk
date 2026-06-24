import { useEffect, useMemo, useState } from 'react';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import type { Software } from '@/types';
import type { DailyUsageStat, HourlyUsage, SegmentUsageByApp } from '@/types/electron';

export type StatsPeriod = 'day' | 'week' | 'month' | 'all';

export interface TrendPoint {
  date: string;
  label: string;
  minutes: number;
  hours: number;
  launches: number;
}

export interface CategoryDatum {
  id: string;
  name: string;
  value: number;
  count: number;
  color: string;
}

export interface RankItem {
  software: Software;
  minutes: number;
  launches: number;
}

export interface UsageStats {
  trend: TrendPoint[];
  category: CategoryDatum[];
  ranking: RankItem[];
  totalMinutes: number;
  totalLaunches: number;
  activeCount: number;
  avgMinutes: number;
  loading: boolean;
  error: string | null;
}

export const PERIOD_OPTIONS: { id: StatsPeriod; label: string }[] = [
  { id: 'day', label: '今日' },
  { id: 'week', label: '本周' },
  { id: 'month', label: '本月' },
  { id: 'all', label: '全部' },
];

const PERIOD_DAYS: Record<StatsPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
  all: 365,
};

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekdayLabel(d: Date): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

function trendLabel(d: Date, period: StatsPeriod): string {
  if (period === 'week' || period === 'day') return weekdayLabel(d);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function buildDateRange(period: StatsPeriod): Date[] {
  const days = PERIOD_DAYS[period];
  const today = new Date();
  const range: Date[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    range.push(d);
  }
  return range;
}

function buildRealStats(rows: DailyUsageStat[], software: Software[], period: StatsPeriod): UsageStats {
  const bySoftware = new Map<string, { minutes: number; launches: number }>();
  const byDate = new Map<string, { seconds: number; launches: number }>();

  for (const row of rows) {
    const sw = bySoftware.get(row.softwareId) ?? { minutes: 0, launches: 0 };
    sw.minutes += row.usageTime / 60;
    sw.launches += row.launchCount;
    bySoftware.set(row.softwareId, sw);

    const day = byDate.get(row.date) ?? { seconds: 0, launches: 0 };
    day.seconds += row.usageTime;
    day.launches += row.launchCount;
    byDate.set(row.date, day);
  }

  const useCumulative = period === 'all';

  const ranking: RankItem[] = software
    .map((sw) => {
      if (useCumulative) {
        return { software: sw, minutes: sw.usageMinutes, launches: sw.launchCount };
      }
      const agg = bySoftware.get(sw.id);
      return { software: sw, minutes: Math.round(agg?.minutes ?? 0), launches: agg?.launches ?? 0 };
    })
    .filter((item) => item.minutes > 0 || item.launches > 0)
    .sort((a, b) => b.minutes - a.minutes);

  let trend: TrendPoint[];
  if (period === 'all') {
    const byMonth = new Map<string, { seconds: number; launches: number }>();
    for (const row of rows) {
      const monthKey = row.date.slice(0, 7);
      const m = byMonth.get(monthKey) ?? { seconds: 0, launches: 0 };
      m.seconds += row.usageTime;
      m.launches += row.launchCount;
      byMonth.set(monthKey, m);
    }
    trend = Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, m]) => {
        const minutes = Math.round(m.seconds / 60);
        const [, mm] = key.split('-');
        return {
          date: key,
          label: `${parseInt(mm, 10)}月`,
          minutes,
          hours: Math.round((minutes / 60) * 10) / 10,
          launches: m.launches,
        };
      });
  } else {
    trend = buildDateRange(period).map((d) => {
      const key = dateKey(d);
      const day = byDate.get(key);
      const minutes = Math.round((day?.seconds ?? 0) / 60);
      return {
        date: key,
        label: trendLabel(d, period),
        minutes,
        hours: Math.round((minutes / 60) * 10) / 10,
        launches: day?.launches ?? 0,
      };
    });
  }

  return finalize(ranking, trend);
}

function finalize(ranking: RankItem[], trend: TrendPoint[]): UsageStats {
  const totalMinutes = ranking.reduce((sum, item) => sum + item.minutes, 0);
  const totalLaunches = ranking.reduce((sum, item) => sum + item.launches, 0);
  const activeCount = ranking.length;
  const avgMinutes = activeCount > 0 ? Math.round(totalMinutes / activeCount) : 0;

  const category: CategoryDatum[] = CATEGORIES.map((cat) => {
    const items = ranking.filter((item) => item.software.category === cat.id);
    return {
      id: cat.id,
      name: cat.name,
      value: items.reduce((sum, item) => sum + item.minutes, 0),
      count: items.length,
      color: cat.color,
    };
  }).filter((d) => d.value > 0);

  return {
    trend,
    category,
    ranking,
    totalMinutes,
    totalLaunches,
    activeCount,
    avgMinutes,
    loading: false,
    error: null,
  };
}

export function useUsageStats(period: StatsPeriod): UsageStats {
  const software = useSoftwareStore((s) => s.software);
  const isElectron = useSoftwareStore((s) => s.isElectron);
  const [rows, setRows] = useState<DailyUsageStat[] | null>(null);
  const [loading, setLoading] = useState(isElectron);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron || !window.softdesk) {
      setRows(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.softdesk
      .getUsageStats(period)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          setError(err instanceof Error ? err.message : '使用统计加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, isElectron]);

  return useMemo(() => {
    return { ...buildRealStats(rows ?? [], software, period), loading, error };
  }, [software, period, rows, loading, error]);
}

export interface DailyUsageHeatmap {
  /** date('YYYY-MM-DD') -> 当日累计使用分钟数 */
  byDate: Map<string, number>;
  loading: boolean;
}

/** 拉取近一年的每日使用数据并按天聚合成 date -> 分钟数,供日历热力图使用。
 *  独立于顶部时间段切换,固定展示全年趋势;非 Electron 环境返回空 Map。 */
export function useDailyUsageHeatmap(): DailyUsageHeatmap {
  const isElectron = useSoftwareStore((s) => s.isElectron);
  const [rows, setRows] = useState<DailyUsageStat[] | null>(null);
  const [loading, setLoading] = useState(isElectron);

  useEffect(() => {
    if (!isElectron || !window.softdesk) {
      setRows(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.softdesk
      .getUsageStats('all')
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isElectron]);

  return useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of rows ?? []) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.usageTime / 60);
    }
    return { byDate, loading };
  }, [rows, loading]);
}

export interface TimeSegmentStats {
  /** 24 个点(0-23 时)的使用分钟数与会话数,固定长度 24 */
  hourly: HourlyUsage[];
  /** 每个软件四时段使用时长(按合计降序) */
  byApp: SegmentUsageByApp[];
  loading: boolean;
}

/** 拉取"全天 24 小时活跃节律"与"软件 × 时段使用分布",随 period 切换窗口天数。
 *  非 Electron 环境返回空数据。 */
export function useTimeSegmentStats(period: StatsPeriod): TimeSegmentStats {
  const isElectron = useSoftwareStore((s) => s.isElectron);
  const [hourly, setHourly] = useState<HourlyUsage[]>([]);
  const [byApp, setByApp] = useState<SegmentUsageByApp[]>([]);
  const [loading, setLoading] = useState(isElectron);

  useEffect(() => {
    if (!isElectron || !window.softdesk?.getHourlyUsage || !window.softdesk?.getSegmentByApp) {
      setHourly([]);
      setByApp([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const days = PERIOD_DAYS[period];
    Promise.all([
      window.softdesk.getHourlyUsage(days),
      window.softdesk.getSegmentByApp(days),
    ])
      .then(([h, a]) => {
        if (cancelled) return;
        setHourly(Array.isArray(h) ? h : []);
        setByApp(Array.isArray(a) ? a : []);
      })
      .catch(() => {
        if (!cancelled) {
          setHourly([]);
          setByApp([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isElectron, period]);

  return { hourly, byApp, loading };
}
