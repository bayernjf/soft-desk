import { describe, it, expect, afterEach, vi } from 'vitest';
import { cn, formatNumber, getPlatform } from './utils';

describe('cn', () => {
  it('拼接多个 class', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('过滤 falsy 值', () => {
    expect(cn('px-2', false, undefined, null, '', 'py-1')).toBe('px-2 py-1');
  });

  it('支持条件对象与数组写法', () => {
    expect(cn(['px-2', { 'py-1': true, 'py-4': false }])).toBe('px-2 py-1');
  });

  it('同一 tailwind 组内后者覆盖前者', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('不同组的 class 都保留', () => {
    expect(cn('px-2', 'text-sm')).toBe('px-2 text-sm');
  });

  it('无参数返回空串', () => {
    expect(cn()).toBe('');
  });
});

describe('formatNumber', () => {
  it('小于 1000 原样输出', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(999)).toBe('999');
  });

  it('从 1000 起换算为 k 并保留一位小数', () => {
    expect(formatNumber(1000)).toBe('1.0k');
    expect(formatNumber(1500)).toBe('1.5k');
    expect(formatNumber(12345)).toBe('12.3k');
  });

  it('负数不走 k 分支', () => {
    expect(formatNumber(-5)).toBe('-5');
  });
});

describe('getPlatform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('没有 navigator 时（Electron 主进程 / Node）默认 darwin', () => {
    vi.stubGlobal('navigator', undefined);
    expect(getPlatform()).toBe('darwin');
  });

  it('macOS 的 navigator.platform 判为 darwin', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(getPlatform()).toBe('darwin');
  });

  it('平台串大小写不敏感', () => {
    vi.stubGlobal('navigator', { platform: 'macintel' });
    expect(getPlatform()).toBe('darwin');
  });

  it('Windows 判为 win32', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(getPlatform()).toBe('win32');
  });

  it('其他平台（如 Linux）归到 win32', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
    expect(getPlatform()).toBe('win32');
  });
});
