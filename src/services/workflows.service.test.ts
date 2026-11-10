import { describe, it, expect, vi } from 'vitest';
import type { Workflow } from '@/types';

// supabase.ts 在模块顶层就 createClient(),本地存在 .env 时会因 Node 20 缺少原生
// WebSocket 而在收集阶段直接崩掉整个套件。这里只测纯函数,直接替掉该模块。
const sbState = vi.hoisted(() => ({
  remoteRows: [] as unknown[],
  calls: [] as string[],
  upserted: [] as string[],
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  get supabase() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => {
              sbState.calls.push('select');
              return Promise.resolve({ data: sbState.remoteRows, error: null });
            },
          }),
        }),
        upsert: (rows: { workflow_id: string }[]) => {
          sbState.calls.push('upsert');
          sbState.upserted.push(...rows.map((r) => r.workflow_id));
          return Promise.resolve({ error: null });
        },
      }),
    };
  },
}));

const { mergeWorkflows, syncWorkflowsOnLogin } = await import('./workflows.service');

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

// P2-1 回归：登录同步必须先拉云端、内存按 updatedAt 合并、仅把本地较新/独有的行上行。
describe('syncWorkflowsOnLogin - 先拉后合再上行', () => {
  it('云端较新的行不被本地旧副本覆盖，只有本地较新/独有的行被 upsert', async () => {
    sbState.remoteRows = [
      { workflow_id: 'wf-shared', name: '云端新版', description: '', software_ids: [], software_meta: [], usage_count: 0, last_used: '', is_favorite: false, color: '#000', updated_at: '2024-06-01T00:00:00.000Z' },
    ];
    sbState.calls = [];
    sbState.upserted = [];
    const local = [
      makeWorkflow({ id: 'wf-shared', name: '本地旧版', updatedAt: '2024-01-01T00:00:00.000Z' }),
      makeWorkflow({ id: 'wf-local-only', name: '离线新增', updatedAt: '2024-02-01T00:00:00.000Z' }),
    ];
    const merged = await syncWorkflowsOnLogin('user-1', local);
    // 合并结果：共享行取云端新版，本地独有保留
    expect(merged.find((w) => w.id === 'wf-shared')?.name).toBe('云端新版');
    expect(merged.some((w) => w.id === 'wf-local-only')).toBe(true);
    // 先 select 后 upsert；且只上行本地独有行（本地旧版不上行）
    expect(sbState.calls).toEqual(['select', 'upsert']);
    expect(sbState.upserted).toEqual(['wf-local-only']);
  });

  it('本地较新的行会上行覆盖云端旧版', async () => {
    sbState.remoteRows = [
      { workflow_id: 'wf-shared', name: '云端旧版', description: '', software_ids: [], software_meta: [], usage_count: 0, last_used: '', is_favorite: false, color: '#000', updated_at: '2024-01-01T00:00:00.000Z' },
    ];
    sbState.calls = [];
    sbState.upserted = [];
    const local = [makeWorkflow({ id: 'wf-shared', name: '本地新版', updatedAt: '2024-07-01T00:00:00.000Z' })];
    const merged = await syncWorkflowsOnLogin('user-1', local);
    expect(merged[0]?.name).toBe('本地新版');
    expect(sbState.calls).toEqual(['select', 'upsert']);
    expect(sbState.upserted).toEqual(['wf-shared']);
  });
});
