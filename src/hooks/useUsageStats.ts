import { useEffect, useMemo, useState } from 'react';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import { WEEKLY_USAGE } from '@/data/software.mock';
import type { Software } from '@/types';
import type { DailyUsageStat } from '@/types/electron';

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
  isReal: boolean;
  loading: boolean;
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
  all: 30,
};

const PERIOD_FACTOR: Record<StatsPeriod, number> = {
  day: 0.05,
  week: 0.22,
  month: 0.65,
  all: 1,
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

  const trend: TrendPoint[] = buildDateRange(period).map((d) => {
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

  return finalize(ranking, trend, period, true);
}

function buildMockStats(software: Software[], period: StatsPeriod): UsageStats {
  const factor = PERIOD_FACTOR[period];

  const ranking: RankItem[] = software
    .map((sw) => ({
      software: sw,
      minutes: Math.round(sw.usageMinutes * factor),
      launches: Math.round(sw.launchCount * factor),
    }))
    .filter((item) => item.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const totalForPeriod = ranking.reduce((sum, item) => sum + item.minutes, 0);
  const range = buildDateRange(period);
  const trend: TrendPoint[] = range.map((d, i) => {
    const base = WEEKLY_USAGE[i % WEEKLY_USAGE.length]?.hours ?? 6;
    const hours = Math.round(base * (period === 'all' ? 1 : 1) * 10) / 10;
    return {
      date: dateKey(d),
      label: trendLabel(d, period),
      minutes: Math.round(hours * 60),
      hours,
      launches: Math.round((totalForPeriod / range.length / 30) || 0),
    };
  });

  return finalize(ranking, trend, period, false);
}

function finalize(ranking: RankItem[], trend: TrendPoint[], period: StatsPeriod, isReal: boolean): UsageStats {
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
    isReal,
    loading: false,
  };
}

export function useUsageStats(period: StatsPeriod): UsageStats {
  const { software, isElectron } = useSoftwareStore();
  const [rows, setRows] = useState<DailyUsageStat[] | null>(null);
  const [loading, setLoading] = useState(isElectron);

  useEffect(() => {
    if (!isElectron || !window.softdesk || period === 'all') {
      setRows(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.softdesk
      .getUsageStats(period)
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
  }, [period, isElectron]);

  return useMemo(() => {
    if (!isElectron) {
      return buildMockStats(software, period);
    }
    if (period === 'all') {
      return buildRealStats([], software, period);
    }
    if (rows === null) {
      return { ...buildMockStats(software, period), loading };
    }
    return { ...buildRealStats(rows, software, period), loading };
  }, [software, isElectron, period, rows, loading]);
}
