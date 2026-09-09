import { describe, it, expect, vi } from 'vitest';
import type { AiProviderConfig } from '@/data/aiProviders';

// supabase.ts 在模块顶层就 createClient(),本地存在 .env 时会因 Node 20 缺少原生
// WebSocket 而在收集阶段直接崩掉整个套件。这里只测纯函数,直接替掉该模块。
vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => false,
}));

const { mergeWithLocal } = await import('./ai-configs.service');

function makeConfig(over: Partial<AiProviderConfig> & Pick<AiProviderConfig, 'id'>): AiProviderConfig {
  return {
    id: over.id,
    name: over.name ?? 'OpenAI',
    provider: over.provider ?? 'openai',
    model: over.model ?? 'gpt-4o',
    endpoint: over.endpoint,
    apiKey: over.apiKey,
    apiKeyHint: over.apiKeyHint ?? '',
    isActive: over.isActive ?? false,
    createdAt: over.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2024-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('mergeWithLocal - 云端与本地 AI 配置合并', () => {
  it('云端为空时原样保留本地', () => {
    const local = [makeConfig({ id: 'local-1' })];
    expect(mergeWithLocal([], local)).toEqual(local);
  });

  it('云端有本地没有的配置时追加进来', () => {
    const local = [makeConfig({ id: 'local-1', model: 'gpt-4o' })];
    const cloud = [makeConfig({ id: 'cloud-1', model: 'claude-sonnet-4' })];

    const merged = mergeWithLocal(cloud, local);

    expect(merged).toHaveLength(2);
    expect(merged.map((c) => c.model).sort()).toEqual(['claude-sonnet-4', 'gpt-4o']);
  });

  it('同一配置命中时保留本地 apiKey / id / createdAt,不被云端覆盖', () => {
    const local = [
      makeConfig({
        id: 'local-1',
        apiKey: 'sk-local-secret',
        apiKeyHint: 'sk-...cret',
        createdAt: '2023-05-05T00:00:00.000Z',
      }),
    ];
    // 云端记录不含 apiKey(敏感字段从不上云),但业务字段可能已在别的设备改过
    const cloud = [makeConfig({ id: 'cloud-1', isActive: true, apiKey: undefined, apiKeyHint: '' })];

    const [merged] = mergeWithLocal(cloud, local);

    expect(merged.id).toBe('local-1');
    expect(merged.apiKey).toBe('sk-local-secret');
    expect(merged.apiKeyHint).toBe('sk-...cret');
    expect(merged.createdAt).toBe('2023-05-05T00:00:00.000Z');
    // 非敏感字段取云端
    expect(merged.isActive).toBe(true);
  });

  it('命中时刷新 updatedAt 为本次合并时间', () => {
    const local = [makeConfig({ id: 'local-1', updatedAt: '2024-01-01T00:00:00.000Z' })];
    const cloud = [makeConfig({ id: 'cloud-1', updatedAt: '2024-02-02T00:00:00.000Z' })];

    const [merged] = mergeWithLocal(cloud, local);

    expect(merged.updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
    expect(merged.updatedAt).not.toBe('2024-02-02T00:00:00.000Z');
    expect(Number.isNaN(Date.parse(merged.updatedAt))).toBe(false);
  });

  it('provider/model/endpoint/name 任一不同即视为不同配置', () => {
    const local = [makeConfig({ id: 'local-1', endpoint: 'https://a.example.com' })];
    const cloud = [makeConfig({ id: 'cloud-1', endpoint: 'https://b.example.com' })];

    expect(mergeWithLocal(cloud, local)).toHaveLength(2);
  });

  it('endpoint 缺省与显式 undefined 视为同一配置', () => {
    const local = [makeConfig({ id: 'local-1' })];
    const cloud = [makeConfig({ id: 'cloud-1', endpoint: undefined })];

    expect(mergeWithLocal(cloud, local)).toHaveLength(1);
  });

  it('合并结果按 isActive 排序,启用的在前', () => {
    const local = [
      makeConfig({ id: 'local-1', model: 'gpt-4o', isActive: false }),
      makeConfig({ id: 'local-2', model: 'gpt-4o-mini', isActive: false }),
    ];
    const cloud = [makeConfig({ id: 'cloud-1', model: 'claude-sonnet-4', isActive: true })];

    const merged = mergeWithLocal(cloud, local);

    expect(merged[0].isActive).toBe(true);
    expect(merged.slice(1).every((c) => !c.isActive)).toBe(true);
  });

  it('不修改传入的本地数组', () => {
    const local = [
      makeConfig({ id: 'local-1', model: 'gpt-4o', isActive: false }),
      makeConfig({ id: 'local-2', model: 'gpt-4o-mini', isActive: true }),
    ];
    const snapshot = local.map((c) => c.id);

    mergeWithLocal([makeConfig({ id: 'cloud-1', model: 'claude-sonnet-4' })], local);

    expect(local.map((c) => c.id)).toEqual(snapshot);
    expect(local).toHaveLength(2);
  });
});
