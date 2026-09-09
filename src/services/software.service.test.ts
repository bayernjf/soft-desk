import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatTimeAgo, formatMinutes, formatSize } from './software.service';

describe('formatTimeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function at(now: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  }

  it('不足 1 分钟显示「刚刚」', () => {
    at('2024-06-01T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T11:59:30.000Z')).toBe('刚刚');
  });

  it('整 1 分钟起显示分钟', () => {
    at('2024-06-01T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T11:59:00.000Z')).toBe('1 分钟前');
  });

  it('59 分钟仍显示分钟', () => {
    at('2024-06-01T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T11:01:00.000Z')).toBe('59 分钟前');
  });

  it('满 60 分钟进位为小时', () => {
    at('2024-06-01T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T11:00:00.000Z')).toBe('1 小时前');
  });

  it('23 小时仍显示小时', () => {
    at('2024-06-02T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T13:00:00.000Z')).toBe('23 小时前');
  });

  it('满 24 小时进位为天', () => {
    at('2024-06-02T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T12:00:00.000Z')).toBe('1 天前');
  });

  it('29 天仍显示天', () => {
    at('2024-06-30T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T12:00:00.000Z')).toBe('29 天前');
  });

  it('满 30 天进位为月', () => {
    at('2024-07-01T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T12:00:00.000Z')).toBe('1 个月前');
  });

  it('跨多月按 30 天取整', () => {
    at('2024-09-01T12:00:00.000Z');
    expect(formatTimeAgo('2024-06-01T12:00:00.000Z')).toBe('3 个月前');
  });
});

describe('formatMinutes', () => {
  it('不足 60 分钟只显示分钟', () => {
    expect(formatMinutes(0)).toBe('0 分钟');
    expect(formatMinutes(59)).toBe('59 分钟');
  });

  it('60 分钟起显示「小时 + 分」', () => {
    expect(formatMinutes(60)).toBe('1 小时 0 分');
    expect(formatMinutes(90)).toBe('1 小时 30 分');
  });

  it('不足 8 小时保留分钟部分', () => {
    expect(formatMinutes(479)).toBe('7 小时 59 分');
  });

  it('满 8 小时起省略分钟', () => {
    expect(formatMinutes(480)).toBe('8 小时');
    expect(formatMinutes(500)).toBe('8 小时');
  });

  it('23 小时仍显示小时', () => {
    expect(formatMinutes(23 * 60)).toBe('23 小时');
  });

  it('满 24 小时进位为「天 + 小时」', () => {
    expect(formatMinutes(24 * 60)).toBe('1 天 0 小时');
    expect(formatMinutes(25 * 60)).toBe('1 天 1 小时');
  });

  it('多天场景取余显示剩余小时', () => {
    expect(formatMinutes(50 * 60)).toBe('2 天 2 小时');
  });
});

describe('formatSize', () => {
  it('不足 1024 MB 用 MB', () => {
    expect(formatSize(0)).toBe('0 MB');
    expect(formatSize(1023)).toBe('1023 MB');
  });

  it('满 1024 MB 换算为 GB 并保留一位小数', () => {
    expect(formatSize(1024)).toBe('1.0 GB');
    expect(formatSize(1536)).toBe('1.5 GB');
  });

  it('大体积按 GB 显示', () => {
    expect(formatSize(10240)).toBe('10.0 GB');
  });
});
