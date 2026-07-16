import log from 'electron-log/main';
import { existsSync, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RendererLogEntry {
  level: LogLevel;
  namespace: string;
  message: string;
  args: unknown[];
}

export interface RecentLogsResult {
  content: string;
  lineCount: number;
  size: number;
  startedAt: string | null;
  endedAt: string | null;
  truncated: boolean;
}

const LOG_FILE_MAX_SIZE = 5 * 1024 * 1024;
const RECENT_LOG_MAX_LINES = 2000;
const RECENT_LOG_MAX_SIZE = 500 * 1024;
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
const SECRET_KEY_PATTERN = /(access[_-]?token|refresh[_-]?token|authorization|api[_-]?key|apikey|password|passwd|secret|cookie|user[_-]?id)\s*([:=])\s*([^\s,;]+)/gi;
const SENSITIVE_KEY_PATTERN = /^(access[_-]?token|refresh[_-]?token|authorization|api[_-]?key|apikey|password|passwd|secret|cookie|user[_-]?id)$/i;
const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
const EMAIL_PATTERN = /\b([a-zA-Z0-9])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
const HOME_DIRECTORY = os.homedir();

function getEnvLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && LOG_LEVELS.includes(env)) return env;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function archivePath(logPath: string, index: number): string {
  const extension = path.extname(logPath);
  const basename = logPath.slice(0, -extension.length);
  return `${basename}.${index}${extension}`;
}

function rotateLogFiles(logPath: string): void {
  const oldest = archivePath(logPath, 2);
  const previous = archivePath(logPath, 1);

  if (existsSync(oldest)) rmSync(oldest);
  if (existsSync(previous)) renameSync(previous, oldest);
  if (existsSync(logPath)) renameSync(logPath, previous);
}

export function sanitizeLogText(value: string): string {
  let sanitized = value
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
    .replace(SECRET_KEY_PATTERN, '$1$2[REDACTED]')
    .replace(EMAIL_PATTERN, '$1***@$2');

  if (HOME_DIRECTORY) {
    sanitized = sanitized.split(HOME_DIRECTORY).join('~');
  }

  return sanitized;
}

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return sanitizeLogText(value);
  if (value instanceof Error) {
    const error = new Error(sanitizeLogText(value.message));
    error.name = value.name;
    if (value.stack) error.stack = sanitizeLogText(value.stack);
    return error;
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';

  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen));

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[REDACTED]'
      : sanitizeValue(item, seen);
  }
  return sanitized;
}

log.transports.file.level = getEnvLevel();
log.transports.file.fileName = 'softdesk.log';
log.transports.file.maxSize = LOG_FILE_MAX_SIZE;
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [main] [{scope}] [{level}] {text}';
log.transports.file.archiveLogFn = (oldLogFile) => rotateLogFiles(oldLogFile.path);
log.transports.console.level = process.env.NODE_ENV === 'production' ? 'warn' : getEnvLevel();
log.transports.console.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [main] [{scope}] [{level}] {text}';
log.hooks.push((message) => ({
  ...message,
  data: message.data.map((item) => sanitizeValue(item)),
}));

class Logger {
  private readonly scopedLog: ReturnType<typeof log.scope>;

  constructor(namespace: string) {
    this.scopedLog = log.scope(namespace);
  }

  debug(message: string, ...args: unknown[]): void {
    this.scopedLog.debug(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.scopedLog.info(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.scopedLog.warn(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.scopedLog.error(message, ...args);
  }
}

export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}

export function writeRendererLog(entry: RendererLogEntry): void {
  const scopedLog = log.scope(`renderer:${entry.namespace}`);
  scopedLog[entry.level](entry.message, ...entry.args);
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && LOG_LEVELS.includes(value as LogLevel);
}

export function getLogDirectory(): string {
  return path.dirname(log.transports.file.getFile().path);
}

function parseLogTimestamp(line: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(line.trimStart());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, millisecond] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getRecentLogs(minutes: 5 | 15 | 30): RecentLogsResult {
  const cutoff = Date.now() - minutes * 60 * 1000;
  const files = log.transports.file.readAllLogs({
    fileFilter: (logPath) => /^softdesk(?:\.\d+)?\.log$/.test(path.basename(logPath)),
  });
  const matching: { line: string; timestamp: Date }[] = [];

  for (const file of files) {
    for (const line of file.lines) {
      const timestamp = parseLogTimestamp(line);
      if (timestamp && timestamp.getTime() >= cutoff) {
        matching.push({ line: sanitizeLogText(line), timestamp });
      }
    }
  }

  matching.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let selected = matching;
  let truncated = false;
  if (selected.length > RECENT_LOG_MAX_LINES) {
    selected = selected.slice(-RECENT_LOG_MAX_LINES);
    truncated = true;
  }

  while (selected.length > 0) {
    const candidate = selected.map((item) => item.line).join('\n');
    if (Buffer.byteLength(candidate, 'utf8') <= RECENT_LOG_MAX_SIZE) break;
    selected = selected.slice(1);
    truncated = true;
  }

  const content = selected.map((item) => item.line).join('\n');
  return {
    content,
    lineCount: selected.length,
    size: Buffer.byteLength(content, 'utf8'),
    startedAt: selected[0]?.timestamp.toISOString() ?? null,
    endedAt: selected.length > 0 ? selected[selected.length - 1].timestamp.toISOString() : null,
    truncated,
  };
}
