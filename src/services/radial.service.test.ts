import { describe, it, expect } from 'vitest';
import { resolveRadialConfig } from './radial.service';
import type { RadialMenuConfig, Software, Workflow } from '@/types';

function makeSoftware(over: Partial<Software> & Pick<Software, 'id'>): Software {
  return {
    id: over.id,
    name: over.name ?? over.id,
    description: '',
    icon: over.icon ?? 'data:image/png;base64,AAAA',
    category: 'dev-tools',
    size: 0,
    lastUsed: '',
    usageMinutes: 0,
    launchCount: 0,
    path: over.path ?? `/Applications/${over.id}.app`,
    color: over.color ?? '#2563eb',
    tags: [],
    ...over,
  };
}

function makeWorkflow(over: Partial<Workflow> & Pick<Workflow, 'id'>): Workflow {
  return {
    id: over.id,
    name: over.name ?? over.id,
    description: '',
    softwareIds: over.softwareIds ?? [],
    usageCount: 0,
    lastUsed: '',
    isFavorite: false,
    color: over.color ?? '#8b5cf6',
    updatedAt: '',
    ...over,
  };
}

const baseConfig = (items: RadialMenuConfig['items']): RadialMenuConfig => ({
  enabled: true,
  hotkey: 'CommandOrControl+Shift+R',
  mouseWheelToggle: false,
  sectors: 6,
  items,
});

describe('resolveRadialConfig - 跨设备置灰', () => {
  it('已安装的 app 正常 resolve,不标记 unavailable', () => {
    const software = [makeSoftware({ id: 'app1', name: 'App One' })];
    const config = baseConfig([{ slot: 0, type: 'app', targetId: 'app1' }]);
    const resolved = resolveRadialConfig(config, software, []);
    expect(resolved.items).toHaveLength(1);
    expect(resolved.items[0].unavailable).toBeFalsy();
    expect(resolved.items[0].appPath).toBe('/Applications/app1.app');
  });

  it('未安装的 app 保留扇区并标记 unavailable,使用快照 name/icon 灰显', () => {
    const config = baseConfig([
      { slot: 2, type: 'app', targetId: 'ghost', name: 'Ghost App', icon: 'data:image/png;base64,ZZZZ', color: '#f00' },
    ]);
    const resolved = resolveRadialConfig(config, [], []);
    expect(resolved.items).toHaveLength(1);
    const it0 = resolved.items[0];
    expect(it0.unavailable).toBe(true);
    expect(it0.name).toBe('Ghost App');
    expect(it0.icon).toBe('data:image/png;base64,ZZZZ');
    expect(it0.appPath).toBeUndefined();
  });

  it('已卸载(uninstalled)的 app 也标记 unavailable', () => {
    const software = [makeSoftware({ id: 'app1', uninstalled: true })];
    const config = baseConfig([{ slot: 0, type: 'app', targetId: 'app1' }]);
    const resolved = resolveRadialConfig(config, software, []);
    expect(resolved.items[0].unavailable).toBe(true);
  });

  it('工作流不存在时保留并灰显', () => {
    const config = baseConfig([
      { slot: 1, type: 'workflow', targetId: 'wf-x', name: 'My Flow', color: '#0f0' },
    ]);
    const resolved = resolveRadialConfig(config, [], []);
    expect(resolved.items[0].unavailable).toBe(true);
    expect(resolved.items[0].name).toBe('My Flow');
  });

  it('工作流存在但内部无可用应用时标记 unavailable', () => {
    const wf = makeWorkflow({ id: 'wf1', name: 'Flow', softwareIds: ['missing'] });
    const config = baseConfig([{ slot: 0, type: 'workflow', targetId: 'wf1' }]);
    const resolved = resolveRadialConfig(config, [], [wf]);
    expect(resolved.items[0].unavailable).toBe(true);
    expect(resolved.items[0].workflowPaths).toEqual([]);
  });

  it('工作流存在且有可用应用时正常,不标记 unavailable', () => {
    const sw = makeSoftware({ id: 'a', path: '/Applications/a.app' });
    const wf = makeWorkflow({ id: 'wf1', softwareIds: ['a'] });
    const config = baseConfig([{ slot: 0, type: 'workflow', targetId: 'wf1' }]);
    const resolved = resolveRadialConfig(config, [sw], [wf]);
    expect(resolved.items[0].unavailable).toBe(false);
    expect(resolved.items[0].workflowPaths).toEqual(['/Applications/a.app']);
  });
});
