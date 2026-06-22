/**
 * 统一类型定义导出
 * 同时保留旧接口（Category, PageType, Stats, UsageRecord）
 * 以确保遗留代码能继续编译
 */

export {
  Software,
  SoftwareCategory,
  CategoryMeta,
  Workflow,
  SearchState,
} from './types/index';

/** 旧代码兼容接口 */
export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  count: number;
}

export interface UsageRecord {
  softwareId: string;
  date: string;
  usageTime: number;
  launchCount: number;
}

export interface Stats {
  totalApps: number;
  totalUsageTime: number;
  todayUsageTime: number;
  topApps: Array<{
    name: string;
    usageTime: number;
    percentage: number;
  }>;
  categoryDistribution: Array<{
    name: string;
    count: number;
    color: string;
  }>;
  weeklyTrend: Array<{
    day: string;
    hours: number;
  }>;
}

export type PageType = 'dashboard' | 'all' | 'statistics' | 'uninstall' | 'settings';
