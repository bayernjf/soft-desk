import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

let db: Database.Database | null = null;

export interface DailyUsage {
  softwareId: string;
  date: string;
  launchCount: number;
  usageTime: number;
}

export interface UsageSummary {
  softwareId: string;
  usageTime: number;
  launchCount: number;
  lastUsed: string | null;
}

function getDb(): Database.Database {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'softdesk.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      software_id TEXT NOT NULL,
      date TEXT NOT NULL,
      launch_count INTEGER DEFAULT 0,
      usage_time INTEGER DEFAULT 0,
      UNIQUE(software_id, date)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      software_id TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_records(date);
    CREATE INDEX IF NOT EXISTS idx_usage_software ON usage_records(software_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_software ON sessions(software_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
  `);
}

export function recordSession(
  softwareId: string,
  date: string,
  startTime: string,
  endTime: string,
  duration: number
): void {
  if (duration <= 0) return;
  const database = getDb();
  const insertSession = database.prepare(
    `INSERT INTO sessions (software_id, date, start_time, end_time, duration)
     VALUES (?, ?, ?, ?, ?)`
  );
  const upsertUsage = database.prepare(
    `INSERT INTO usage_records (software_id, date, launch_count, usage_time)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(software_id, date)
     DO UPDATE SET usage_time = usage_time + excluded.usage_time`
  );
  const tx = database.transaction(() => {
    insertSession.run(softwareId, date, startTime, endTime, duration);
    upsertUsage.run(softwareId, date, duration);
  });
  tx();
}

export function recordLaunch(softwareId: string, date: string): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO usage_records (software_id, date, launch_count, usage_time)
       VALUES (?, ?, 1, 0)
       ON CONFLICT(software_id, date)
       DO UPDATE SET launch_count = launch_count + 1`
    )
    .run(softwareId, date);
}

export function getUsageSummary(): UsageSummary[] {
  const database = getDb();
  // 先对 sessions 一次性聚合出每个 software 的最后使用时间,再 LEFT JOIN,
  // 避免对每个分组行执行相关子查询(行级 N 次扫描 sessions)
  const rows = database
    .prepare(
      `SELECT
         u.software_id AS softwareId,
         SUM(u.usage_time) AS usageTime,
         SUM(u.launch_count) AS launchCount,
         last.lastUsed AS lastUsed
       FROM usage_records u
       LEFT JOIN (
         SELECT software_id, MAX(end_time) AS lastUsed
         FROM sessions
         GROUP BY software_id
       ) last ON last.software_id = u.software_id
       GROUP BY u.software_id`
    )
    .all() as UsageSummary[];
  return rows;
}

export function getStats(period: 'day' | 'week' | 'month' | 'all'): DailyUsage[] {
  const database = getDb();
  const days = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceStr = since.toISOString().slice(0, 10);
  const rows = database
    .prepare(
      `SELECT
         software_id AS softwareId,
         date,
         launch_count AS launchCount,
         usage_time AS usageTime
       FROM usage_records
       WHERE date >= ?
       ORDER BY date ASC`
    )
    .all(sinceStr) as DailyUsage[];
  return rows;
}

export interface CoUsagePair {
  a: string;
  b: string;
  count: number;
}

/**
 * 基于 sessions 表做共现分析:近 windowDays 天内,把每段会话按 bucketMinutes
 * 分钟的时间窗口归桶,统计"同一时间窗口内一起出现"的不同软件两两共现次数。
 * 返回按共现次数降序的软件对,供工作流建议使用。
 */
export function getCoUsage(windowDays = 30, bucketMinutes = 30): CoUsagePair[] {
  const database = getDb();
  const since = new Date();
  since.setDate(since.getDate() - (windowDays - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = database
    .prepare(
      `SELECT software_id AS softwareId, start_time AS startTime
       FROM sessions
       WHERE date >= ?
       ORDER BY start_time ASC`
    )
    .all(sinceStr) as { softwareId: string; startTime: string }[];

  const bucketMs = bucketMinutes * 60 * 1000;
  // bucketKey -> 该时间窗口内出现过的软件集合
  const buckets = new Map<number, Set<string>>();
  for (const row of rows) {
    const ts = new Date(row.startTime).getTime();
    if (Number.isNaN(ts)) continue;
    const bucket = Math.floor(ts / bucketMs);
    let set = buckets.get(bucket);
    if (!set) {
      set = new Set<string>();
      buckets.set(bucket, set);
    }
    set.add(row.softwareId);
  }

  // 软件对(有序 key "a\u0000b")-> 共现次数
  const pairCount = new Map<string, number>();
  for (const set of buckets.values()) {
    const ids = [...set];
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
        const key = `${a}\u0000${b}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: CoUsagePair[] = [];
  for (const [key, count] of pairCount.entries()) {
    const [a, b] = key.split('\u0000');
    pairs.push({ a, b, count });
  }
  pairs.sort((x, y) => y.count - x.count);
  return pairs;
}

/** 一天中的使用时段。用于把会话按"几点使用"归类,做场景化(早上/下午…)工作流分析。 */
export type TimeSegment = 'morning' | 'afternoon' | 'evening' | 'night';

export interface SegmentCoUsage {
  segment: TimeSegment;
  /** 该时段内的会话总数(反映该时段活跃度) */
  sessionCount: number;
  /** 该时段内按共现次数降序的软件对 */
  pairs: CoUsagePair[];
}

/** 把 0-23 小时映射到时段:
 *  早上 5-11、下午 12-17、晚上 18-22、深夜 23-4。 */
export function segmentOfHour(hour: number): TimeSegment {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 22) return 'evening';
  return 'night';
}

const ALL_SEGMENTS: TimeSegment[] = ['morning', 'afternoon', 'evening', 'night'];

/**
 * 按"一天中的时段"分组做共现分析:近 windowDays 天内,先把每段会话按其 start_time 的
 * 小时归入时段(早上/下午/晚上/深夜),再在每个时段内部按 bucketMinutes 分钟窗口归桶,
 * 统计同窗口内一起出现的软件两两共现次数。用于场景化工作流推荐(如"早上工作流")。
 */
export function getCoUsageBySegment(windowDays = 30, bucketMinutes = 30): SegmentCoUsage[] {
  const database = getDb();
  const since = new Date();
  since.setDate(since.getDate() - (windowDays - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = database
    .prepare(
      `SELECT software_id AS softwareId, start_time AS startTime
       FROM sessions
       WHERE date >= ?
       ORDER BY start_time ASC`
    )
    .all(sinceStr) as { softwareId: string; startTime: string }[];

  const bucketMs = bucketMinutes * 60 * 1000;
  // segment -> (bucketKey -> 该窗口内出现过的软件集合)
  const bySegment = new Map<TimeSegment, Map<number, Set<string>>>();
  // segment -> 会话计数
  const sessionCount = new Map<TimeSegment, number>();
  for (const seg of ALL_SEGMENTS) {
    bySegment.set(seg, new Map());
    sessionCount.set(seg, 0);
  }

  for (const row of rows) {
    const d = new Date(row.startTime);
    const ts = d.getTime();
    if (Number.isNaN(ts)) continue;
    const seg = segmentOfHour(d.getHours());
    sessionCount.set(seg, (sessionCount.get(seg) ?? 0) + 1);
    const buckets = bySegment.get(seg)!;
    const bucket = Math.floor(ts / bucketMs);
    let set = buckets.get(bucket);
    if (!set) {
      set = new Set<string>();
      buckets.set(bucket, set);
    }
    set.add(row.softwareId);
  }

  const result: SegmentCoUsage[] = [];
  for (const seg of ALL_SEGMENTS) {
    const buckets = bySegment.get(seg)!;
    const pairCount = new Map<string, number>();
    for (const set of buckets.values()) {
      const ids = [...set];
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
          const key = `${a}\u0000${b}`;
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
        }
      }
    }
    const pairs: CoUsagePair[] = [];
    for (const [key, count] of pairCount.entries()) {
      const [a, b] = key.split('\u0000');
      pairs.push({ a, b, count });
    }
    pairs.sort((x, y) => y.count - x.count);
    result.push({ segment: seg, sessionCount: sessionCount.get(seg) ?? 0, pairs });
  }
  return result;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export interface HourlyUsage {
  /** 0-23 */
  hour: number;
  /** 该小时累计使用分钟数 */
  minutes: number;
  /** 该小时的会话数 */
  sessionCount: number;
}

/**
 * 全天活跃节律:近 windowDays 天内,把每段会话按其 start_time 的小时(0-23)归桶,
 * 累加使用时长(分钟)与会话数。用于"你几点最活跃"的 24 小时曲线。
 * 会话时长归属到 start_time 所在小时(与共现分析口径一致,简单且足够反映节律)。
 */
export function getHourlyUsage(windowDays = 30): HourlyUsage[] {
  const database = getDb();
  const since = new Date();
  since.setDate(since.getDate() - (windowDays - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = database
    .prepare(
      `SELECT start_time AS startTime, duration
       FROM sessions
       WHERE date >= ?`
    )
    .all(sinceStr) as { startTime: string; duration: number }[];

  const minutes = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (const row of rows) {
    const d = new Date(row.startTime);
    if (Number.isNaN(d.getTime())) continue;
    const h = d.getHours();
    minutes[h] += (row.duration ?? 0) / 60;
    counts[h] += 1;
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    minutes: Math.round(minutes[hour]),
    sessionCount: counts[hour],
  }));
}

export interface SegmentUsageByApp {
  softwareId: string;
  /** 各时段累计使用分钟数 */
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
  /** 全时段合计分钟数(便于排序) */
  total: number;
}

/**
 * 软件 × 时段使用时长:近 windowDays 天内,把每段会话按 start_time 的小时归入时段,
 * 按软件累加各时段使用分钟数。用于"软件活跃时段分布"堆叠条形图。
 */
export function getSegmentUsageByApp(windowDays = 30): SegmentUsageByApp[] {
  const database = getDb();
  const since = new Date();
  since.setDate(since.getDate() - (windowDays - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = database
    .prepare(
      `SELECT software_id AS softwareId, start_time AS startTime, duration
       FROM sessions
       WHERE date >= ?`
    )
    .all(sinceStr) as { softwareId: string; startTime: string; duration: number }[];

  const byApp = new Map<string, SegmentUsageByApp>();
  for (const row of rows) {
    const d = new Date(row.startTime);
    if (Number.isNaN(d.getTime())) continue;
    const seg = segmentOfHour(d.getHours());
    const mins = (row.duration ?? 0) / 60;
    let entry = byApp.get(row.softwareId);
    if (!entry) {
      entry = {
        softwareId: row.softwareId,
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0,
        total: 0,
      };
      byApp.set(row.softwareId, entry);
    }
    entry[seg] += mins;
    entry.total += mins;
  }

  const result = [...byApp.values()].map((e) => ({
    softwareId: e.softwareId,
    morning: Math.round(e.morning),
    afternoon: Math.round(e.afternoon),
    evening: Math.round(e.evening),
    night: Math.round(e.night),
    total: Math.round(e.total),
  }));
  result.sort((a, b) => b.total - a.total);
  return result;
}