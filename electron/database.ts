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
  const rows = database
    .prepare(
      `SELECT
         u.software_id AS softwareId,
         SUM(u.usage_time) AS usageTime,
         SUM(u.launch_count) AS launchCount,
         (SELECT MAX(s.end_time) FROM sessions s WHERE s.software_id = u.software_id) AS lastUsed
       FROM usage_records u
       GROUP BY u.software_id`
    )
    .all() as UsageSummary[];
  return rows;
}

export function getStats(period: 'day' | 'week' | 'month'): DailyUsage[] {
  const database = getDb();
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
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

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
