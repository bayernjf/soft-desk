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

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
