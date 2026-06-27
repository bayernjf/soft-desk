/**
 * 主进程统一日志模块
 * 支持级别控制、时间戳、命名空间前缀
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getEnvLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_PRIORITY) return env;
  return process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shouldOutput(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getEnvLevel()];
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
