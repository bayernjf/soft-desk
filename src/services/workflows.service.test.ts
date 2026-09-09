import { describe, it, expect, vi } from 'vitest';
import type { Workflow } from '@/types';

// supabase.ts 在模块顶层就 createClient(),本地存在 .env 时会因 Node 20 缺少原生
// WebSocket 而在收集阶段直接崩掉整个套件。这里只测纯函数,直接替掉该模块。
vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => false,
}));

const { mergeWorkflows } = await import('./workflows.service');

function makeWorkflow(over: Partial<Workflow> & Pick<Workflow, 'id'>): Workflow {
  return {
    id: over.id,
    name: over.name ?? over.id,
    description: '',
    softwareIds: over.softwareIds ?? [],
    usageCount: over.usageCount ?? 0,
    lastUsed: '',
    isFavorite: over.isFavorite ?? false,
    color: '#2563eb',
    updatedAt: over.updatedAt ?? '2024-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('mergeWorkflows - 按 id 合并且时间戳后写胜出', () => {
  it('远端为空时原样保留本地', () => {
    const local = [makeWorkflow({ id: 'wf-1' })];
    expect(mergeWorkflows(local, [])).toEqual(local);
  });

  it('本地为空时原样返回远端', () => {
    const remote = [makeWorkflow({ id: 'wf-1' })];
    expect(mergeWorkflows([], remote)).toEqual(remote);
  });

  it('远端有本地没有的工作流时追加进来', () => {
    const local = [makeWorkflow({ id: 'wf-1' })];
    const remote = [makeWorkflow({ id: 'wf-2' })];

    expect(mergeWorkflows(local, remote).map((w) => w.id)).toEqual(['wf-1', 'wf-2']);
  });

  it('同 id 且远端较新时用远端', () => {
    const local = [makeWorkflow({ id: 'wf-1', name: '本地版', updatedAt: '2024-01-01T00:00:00.000Z' })];
    const remote = [makeWorkflow({ id: 'wf-1', name: '远端版', updatedAt: '2024-06-01T00:00:00.000Z' })];

    const merged = mergeWorkflows(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('远端版');
  });

  it('同 id 且本地较新时保留本地', () => {
    const local = [makeWorkflow({ id: 'wf-1', name: '本地版', updatedAt: '2024-06-01T00:00:00.000Z' })];
    const remote = [makeWorkflow({ id: 'wf-1', name: '远端版', updatedAt: '2024-01-01T00:00:00.000Z' })];

    expect(mergeWorkflows(local, remote)[0].name).toBe('本地版');
  });

  it('同 id 且时间相同时保留本地(非严格大于)', () => {
    const ts = '2024-03-01T00:00:00.000Z';
    const local = [makeWorkflow({ id: 'wf-1', name: '本地版', updatedAt: ts })];
    const remote = [makeWorkflow({ id: 'wf-1', name: '远端版', updatedAt: ts })];

    expect(mergeWorkflows(local, remote)[0].name).toBe('本地版');
  });

  it('多条记录混合时逐条独立判定新旧', () => {
    const local = [
      makeWorkflow({ id: 'wf-1', name: '本地新', updatedAt: '2024-06-01T00:00:00.000Z' }),
      makeWorkflow({ id: 'wf-2', name: '本地旧', updatedAt: '2024-01-01T00:00:00.000Z' }),
    ];
    const remote = [
      makeWorkflow({ id: 'wf-1', name: '远端旧', updatedAt: '2024-01-01T00:00:00.000Z' }),
      makeWorkflow({ id: 'wf-2', name: '远端新', updatedAt: '2024-06-01T00:00:00.000Z' }),
      makeWorkflow({ id: 'wf-3', name: '仅远端', updatedAt: '2024-02-01T00:00:00.000Z' }),
    ];

    const merged = mergeWorkflows(local, remote);

    expect(merged.map((w) => w.name)).toEqual(['本地新', '远端新', '仅远端']);
  });

  it('同 id 重复出现时不会产生重复项', () => {
    const local = [makeWorkflow({ id: 'wf-1' })];
    const remote = [makeWorkflow({ id: 'wf-1' }), makeWorkflow({ id: 'wf-1' })];

    expect(mergeWorkflows(local, remote)).toHaveLength(1);
  });
});
