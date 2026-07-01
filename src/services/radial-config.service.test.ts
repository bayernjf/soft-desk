import { describe, it, expect } from 'vitest';
import { mergeRadialConfig } from './radial-config.service';
import type { RadialMenuConfig } from '@/types';

const base = (over: Partial<RadialMenuConfig>): RadialMenuConfig => ({
  enabled: false,
  hotkey: 'CommandOrControl+Shift+R',
  mouseWheelToggle: false,
  sectors: 6,
  items: [],
  showRecent: false,
  ...over,
});

describe('mergeRadialConfig - 时间戳后写胜出', () => {
  it('云端为 null 时返回本地', () => {
    const local = base({ updatedAt: '2024-01-01T00:00:00.000Z' });
    expect(mergeRadialConfig(local, null)).toBe(local);
  });

  it('云端较新时返回云端', () => {
    const local = base({ enabled: false, updatedAt: '2024-01-01T00:00:00.000Z' });
    const cloud = base({ enabled: true, updatedAt: '2024-06-01T00:00:00.000Z' });
    expect(mergeRadialConfig(local, cloud)).toBe(cloud);
  });

  it('本地较新时返回本地', () => {
    const local = base({ enabled: true, updatedAt: '2024-06-01T00:00:00.000Z' });
    const cloud = base({ enabled: false, updatedAt: '2024-01-01T00:00:00.000Z' });
    expect(mergeRadialConfig(local, cloud)).toBe(local);
  });

  it('本地无 updatedAt 而云端有时,云端胜出', () => {
    const local = base({});
    const cloud = base({ enabled: true, updatedAt: '2024-01-01T00:00:00.000Z' });
    expect(mergeRadialConfig(local, cloud)).toBe(cloud);
  });

  it('两端时间相同时保留本地(非严格大于)', () => {
    const ts = '2024-03-01T00:00:00.000Z';
    const local = base({ enabled: true, updatedAt: ts });
    const cloud = base({ enabled: false, updatedAt: ts });
    expect(mergeRadialConfig(local, cloud)).toBe(local);
  });
});
