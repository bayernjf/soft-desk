/**
 * 渲染进程统一日志模块
 * 日志输出到 DevTools，并通过受控 IPC 交由主进程落盘
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getEnvLevel(): LogLevel {
  try {
    const env = import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined;
    if (env && env in LEVEL_PRIORITY) return env;
  } catch {
    // import.meta.env 可能不存在
  }
  return import.meta.env.PROD ? 'info' : 'debug';
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shouldOutput(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getEnvLevel()];
}

function serializeLogValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 4) return '[MaxDepth]';
  if (seen.has(value)) return '[Circular]';

  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => serializeLogValue(item, depth + 1, seen));
  }

  const serialized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    serialized[key] = serializeLogValue(item, depth + 1, seen);
  }
  return serialized;
}

class Logger {
  private namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!shouldOutput(level)) return;

    const time = formatTime(new Date());
    const prefix = `${time} [${this.namespace}] [${level.toUpperCase()}]`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(prefix, message, ...args);

    try {
      window.softdesk?.writeClientLog({
        level,
        namespace: this.namespace,
        message,
        args: args.map((item) => serializeLogValue(item)),
      });
    } catch {
      // 日志发送失败不能影响正常业务
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }
}

export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}
