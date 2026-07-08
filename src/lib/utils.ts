import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + 'k';
  }
  return n.toString();
}

/** 获取当前平台标识，与 Electron process.platform 一致：'darwin' | 'win32' */
export function getPlatform(): 'darwin' | 'win32' {
  if (typeof navigator === 'undefined') return 'darwin';
  return /Mac/i.test(navigator.platform) ? 'darwin' : 'win32';
}
