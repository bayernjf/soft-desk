import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recordSession } from './database';

const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = 5000;

interface ActiveSession {
  softwareId: string;
  startTime: Date;
  lastTick: Date;
}

let timer: NodeJS.Timeout | null = null;
let current: ActiveSession | null = null;

async function getFrontmostApp(): Promise<string | null> {
  try {
    const { stdout: asn } = await execFileAsync('lsappinfo', ['front']);
    const asnId = asn.trim();
    if (!asnId) return null;
    const { stdout } = await execFileAsync('lsappinfo', ['info', '-only', 'bundleid', asnId]);
    const match = stdout.match(/"CFBundleIdentifier"="([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function flushCurrent(): void {
  if (!current) return;
  const duration = Math.round((current.lastTick.getTime() - current.startTime.getTime()) / 1000);
  recordSession(
    current.softwareId,
    dateKey(current.startTime),
    current.startTime.toISOString(),
    current.lastTick.toISOString(),
    duration
  );
  current = null;
}

async function tick(): Promise<void> {
  const now = new Date();
  const softwareId = await getFrontmostApp();

  if (!softwareId) {
    flushCurrent();
    return;
  }

  if (current && current.softwareId === softwareId) {
    current.lastTick = now;
    return;
  }

  flushCurrent();
  current = { softwareId, startTime: now, lastTick: now };
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
