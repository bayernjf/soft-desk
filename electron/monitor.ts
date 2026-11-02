import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recordSession } from './database';
import { createLogger } from './lib/logger';
import { exePathToSoftwareId } from './lib/exe-id';
import { getForegroundExePathWin } from './lib/foreground-win';

const execFileAsync = promisify(execFile);
const logger = createLogger('monitor');

const POLL_INTERVAL_MS = 5000;
// 长会话期间每累计约 1 分钟增量落库一次,避免崩溃/断电丢失整段时长
const FLUSH_INTERVAL_MS = 60000;

interface ActiveSession {
  softwareId: string;
  startTime: Date;
  lastTick: Date;
  lastFlush: Date;
}

let timer: NodeJS.Timeout | null = null;
let current: ActiveSession | null = null;

/**
 * macOS:返回前台 app 的 bundleId;无前台 app 返回 null;查询失败返回 undefined。
 * 区分二者:失败时不应结束当前会话,避免把连续使用错误地切成多段。
 */
async function getFrontmostAppMac(): Promise<string | null | undefined> {
  try {
    const { stdout: asn } = await execFileAsync('lsappinfo', ['front']);
    const asnId = asn.trim();
    if (!asnId) return null;
    const { stdout } = await execFileAsync('lsappinfo', ['info', '-only', 'bundleid', asnId]);
    const match = stdout.match(/"CFBundleIdentifier"="([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return undefined;
  }
}

/**
 * Windows:返回前台窗口进程的软件 id(sha1(exe 路径小写) 前 24 位,
 * 与 scanner-win 扫描结果的 id 公式一致,统计页才能按 id join 上软件目录)。
 * null/undefined 语义与 macOS 侧一致。
 */
async function getFrontmostAppWin(): Promise<string | null | undefined> {
  const exePath = await getForegroundExePathWin();
  if (exePath == null) return exePath;
  return exePathToSoftwareId(exePath);
}

/**
 * 返回前台 app 的软件 id;无前台 app 返回 null;查询失败返回 undefined。
 * 平台分发:macOS 走 lsappinfo,Windows 走 PowerShell P/Invoke(见 lib/foreground-win),
 * 其它平台(如 linux)不 spawn 任何进程、不产生记录。
 */
export async function getFrontmostApp(): Promise<string | null | undefined> {
  if (process.platform === 'win32') return getFrontmostAppWin();
  if (process.platform === 'darwin') return getFrontmostAppMac();
  return null;
}

function dateKey(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function flushCurrent(): void {
  if (!current) return;
  const duration = Math.round((current.lastTick.getTime() - current.startTime.getTime()) / 1000);
  if (duration > 0) {
    try {
      recordSession(
        current.softwareId,
        dateKey(current.startTime),
        current.startTime.toISOString(),
        current.lastTick.toISOString(),
        duration
      );
    } catch (err) {
      logger.error('recordSession failed:', err);
    }
  }
  current = null;
}

// Windows 的 PowerShell 探测(数十~数百 ms)远慢于 macOS lsappinfo(~5ms),
// 5s 轮询下可能出现上一次探测未结束下一次又触发,加防重入避免并发 tick 交错切会话
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    const softwareId = await getFrontmostApp();

    // 查询失败(undefined):保持当前会话不动,等待下一次轮询
    if (softwareId === undefined) return;

    if (!softwareId) {
      flushCurrent();
      return;
    }

    if (current && current.softwareId === softwareId) {
      current.lastTick = now;
      // 同一 app 持续使用时,定期增量落库一段已确认时长,再以当前时刻为新起点
      if (now.getTime() - current.lastFlush.getTime() >= FLUSH_INTERVAL_MS) {
        flushCurrent();
        current = { softwareId, startTime: now, lastTick: now, lastFlush: now };
      }
      return;
    }

    flushCurrent();
    current = { softwareId, startTime: now, lastTick: now, lastFlush: now };
  } finally {
    ticking = false;
  }
}

export function startMonitor(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}

export function stopMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  flushCurrent();
}
