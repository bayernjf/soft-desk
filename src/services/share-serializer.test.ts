import { describe, it, expect } from 'vitest';
import {
  dedupeName,
  matchSoftware,
  serializeWorkflow,
  serializeFavoriteGroup,
  serializeRadial,
  isValidPayload,
  type SoftwareMeta,
} from './share-serializer';
import type { Software, Workflow, FavoriteGroup, RadialMenuConfig } from '@/types';

/* ────────── 工具:构造轻量 Software 测试样本 ────────── */
function makeSoftware(over: Partial<Software> & Pick<Software, 'id' | 'name'>): Software {
  return {
    id: over.id,
    name: over.name,
    description: '',
    icon: '',
    category: 'utilities',
    size: 0,
    lastUsed: '',
    usageMinutes: 0,
    launchCount: 0,
    path: '',
    color: '#64748b',
    tags: [],
    ...over,
  };
}

/* ─────────────────────────────────────────────────────────
 * dedupeName - 名称去重(自动追加序号)
 * ───────────────────────────────────────────────────────── */
describe('dedupeName - 名称去重后缀', () => {
  it('无冲突时保留原名(去掉首尾空白)', () => {
    expect(dedupeName('  我的工作流  ', ['其他'])).toBe('我的工作流');
  });

  it('已存在同名 → 追加 (2)', () => {
    expect(dedupeName('我的工作流', ['我的工作流'])).toBe('我的工作流 (2)');
  });

  it('存在多个同前缀占用 → 找到最小可用序号', () => {
    expect(
      dedupeName('我的工作流', ['我的工作流', '我的工作流 (2)', '我的工作流 (3)'])
    ).toBe('我的工作流 (4)');
  });

  it('中间有空位时补齐空位而非追加末尾', () => {
    expect(
      dedupeName('我的工作流', ['我的工作流', '我的工作流 (2)', '我的工作流 (4)'])
    ).toBe('我的工作流 (3)');
  });

  it('大小写不敏感,英文名同样按序号追加', () => {
    expect(dedupeName('My Workflow', ['MY WORKFLOW'])).toBe('My Workflow (2)');
  });

  it('空 existing → 直接返回', () => {
    expect(dedupeName('新工作流', [])).toBe('新工作流');
  });
});

/* ─────────────────────────────────────────────────────────
 * matchSoftware - 分享包中软件与本机软件的映射
 * ───────────────────────────────────────────────────────── */
describe('matchSoftware - 本机软件匹配', () => {
  const meta: SoftwareMeta[] = [
    { softwareId: 'meta-a', name: 'Alpha', bundleId: 'com.alpha' },
    { softwareId: 'meta-b', name: 'Bravo', bundleId: 'com.bravo' },
    { softwareId: 'meta-c', name: 'Charlie' },
  ];

  it('按 bundleId 命中 → 返回本机 id', () => {
    const software = [makeSoftware({ id: 'com.alpha', name: 'Alpha-本机' })];
    const matches = matchSoftware(meta, software);
    expect(matches[0].installedId).toBe('com.alpha');
    expect(matches[1].installedId).toBeNull();
    expect(matches[2].installedId).toBeNull();
  });

  it('bundleId 不匹配但 softwareId 命中', () => {
    const software = [makeSoftware({ id: 'meta-b', name: 'Bravo' })];
    const matches = matchSoftware(meta, software);
    expect(matches[1].installedId).toBe('meta-b');
  });

  it('bundleId / softwareId 都不匹配时按 name 兜底(大小写不敏感)', () => {
    const software = [makeSoftware({ id: 'unrelated', name: 'CHARLIE' })];
    const matches = matchSoftware(meta, software);
    expect(matches[2].installedId).toBe('unrelated');
  });

  it('已卸载 / 已删除的软件不算命中', () => {
    const software = [
      makeSoftware({ id: 'com.alpha', name: 'Alpha', uninstalled: true }),
      makeSoftware({ id: 'meta-b', name: 'Bravo', deleted: true }),
    ];
    const matches = matchSoftware(meta, software);
    expect(matches[0].installedId).toBeNull();
    expect(matches[1].installedId).toBeNull();
  });

  it('空软件列表 → 全部返回 null', () => {
    const matches = matchSoftware(meta, []);
    expect(matches.every((m) => m.installedId === null)).toBe(true);
    expect(matches).toHaveLength(3);
  });
});

/* ─────────────────────────────────────────────────────────
 * serialize* - 快照结构一致性
 * ───────────────────────────────────────────────────────── */
describe('serializeWorkflow', () => {
  it('生成 v1 payload,并把 softwareIds 对应软件写入 softwareMeta', () => {
    const workflow: Workflow = {
      id: 'wf-1',
      name: '测试工作流',
      description: '两个应用',
      softwareIds: ['a', 'b'],
      usageCount: 0,
      lastUsed: '',
      isFavorite: false,
      color: '#ff0',
      updatedAt: '',
    };
    const software = [
      makeSoftware({ id: 'a', name: 'A' }),
      makeSoftware({ id: 'b', name: 'B' }),
      makeSoftware({ id: 'unused', name: 'Unused' }),
    ];
    const payload = serializeWorkflow(workflow, software);
    expect(payload.version).toBe(1);
    expect(payload.kind).toBe('workflow');
    expect(payload.workflow.name).toBe('测试工作流');
    expect(payload.softwareMeta.map((m) => m.name)).toEqual(['A', 'B']);
  });

  it('缺失软件不出现在 softwareMeta,softwareIds 保持原样', () => {
    const workflow: Workflow = {
      id: 'wf-2',
      name: '缺一半',
      description: '',
      softwareIds: ['x', 'not-installed'],
      usageCount: 0,
      lastUsed: '',
      isFavorite: false,
      color: '#0f0',
      updatedAt: '',
    };
    const payload = serializeWorkflow(workflow, [makeSoftware({ id: 'x', name: 'X' })]);
    expect(payload.workflow.softwareIds).toEqual(['x', 'not-installed']);
    expect(payload.softwareMeta).toHaveLength(1);
  });
});

describe('serializeFavoriteGroup', () => {
  it('生成 favorite_group payload', () => {
    const group: FavoriteGroup = {
      id: 'fg-1',
      name: '收藏组 A',
      softwareIds: ['a'],
      createdAt: '',
    };
    const payload = serializeFavoriteGroup(group, [makeSoftware({ id: 'a', name: 'A' })]);
    expect(payload.kind).toBe('favorite_group');
    expect(payload.group.name).toBe('收藏组 A');
    expect(payload.softwareMeta[0].name).toBe('A');
  });
});

describe('serializeRadial', () => {
  it('生成 radial payload,只收录 type=app 的软件元数据', () => {
    const radial: RadialMenuConfig = {
      enabled: true,
      hotkey: 'CommandOrControl+Shift+R',
      mouseWheelToggle: false,
      sectors: 6,
      showRecent: false,
      style: 'default',
      items: [
        { slot: 0, type: 'app', targetId: 'app-a' },
        { slot: 1, type: 'workflow', targetId: 'wf-1' },
        { slot: 2, type: 'app', targetId: 'app-b' },
      ],
    };
    const software = [
      makeSoftware({ id: 'app-a', name: 'App A' }),
      makeSoftware({ id: 'app-b', name: 'App B' }),
    ];
    const payload = serializeRadial(radial, software);
    expect(payload.kind).toBe('radial');
    expect(payload.radial.sectors).toBe(6);
    expect(payload.radial.items).toHaveLength(3);
    // softwareMeta 只收录 app 类型的应用
    expect(payload.softwareMeta.map((m) => m.name)).toEqual(['App A', 'App B']);
  });
});

/* ─────────────────────────────────────────────────────────
 * isValidPayload - 校验器
 * ───────────────────────────────────────────────────────── */
describe('isValidPayload - 分享内容校验', () => {
  it('合法 payload 返回 true', () => {
    expect(
      isValidPayload({
        version: 1,
        kind: 'workflow',
        workflow: { name: '', description: '', softwareIds: [], color: '' },
        softwareMeta: [],
      })
    ).toBe(true);
  });

  it('缺 version / 不为 1 → false', () => {
    expect(isValidPayload({ kind: 'workflow', softwareMeta: [] })).toBe(false);
    expect(isValidPayload({ version: 2, kind: 'workflow', softwareMeta: [] })).toBe(false);
  });

  it('未知 kind → false', () => {
    expect(
      isValidPayload({ version: 1, kind: 'unknown', softwareMeta: [] })
    ).toBe(false);
  });

  it('softwareMeta 非数组 → false', () => {
    expect(isValidPayload({ version: 1, kind: 'workflow', softwareMeta: 'x' })).toBe(false);
  });

  it('null / 非对象 → false', () => {
    expect(isValidPayload(null)).toBe(false);
    expect(isValidPayload(undefined)).toBe(false);
    expect(isValidPayload('str')).toBe(false);
  });
});
