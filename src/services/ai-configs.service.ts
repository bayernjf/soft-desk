import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { AiProviderConfig } from '@/data/aiProviders';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ai-configs');

export interface CloudAiConfig {
  id: number;
  user_id: string;
  provider: string;
  endpoint: string | null;
  model: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

function toCloudRecord(userId: string, config: AiProviderConfig): Omit<CloudAiConfig, 'id' | 'created_at'> {
  return {
    user_id: userId,
    provider: config.provider,
    endpoint: config.endpoint ?? null,
    model: config.model,
    name: config.name,
    is_active: config.isActive,
  };
}

function matchKey(config: AiProviderConfig): string {
  return `${config.provider}|${config.model}|${config.endpoint ?? ''}|${config.name}`;
}

export async function fetchCloudAiConfigs(userId: string): Promise<AiProviderConfig[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('ai_configs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) {
      logger.error('fetchCloudAiConfigs error:', error);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: `aip_cloud_${row.id}`,
      name: row.name,
      provider: row.provider as AiProviderConfig['provider'],
      model: row.model,
      endpoint: row.endpoint ?? undefined,
      apiKey: undefined,
      apiKeyHint: '',
      isActive: row.is_active ?? false,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    }));
  } catch (err) {
    logger.error('fetchCloudAiConfigs unexpected error:', err);
    return [];
  }
}

export async function syncAiConfigsToCloud(
  userId: string,
  configs: AiProviderConfig[]
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    const { error: deleteError } = await supabase.from('ai_configs').delete().eq('user_id', userId);
    if (deleteError) {
      logger.error('syncAiConfigs delete error:', deleteError);
      return;
    }
    if (configs.length === 0) return;
    const records = configs.map((c) => toCloudRecord(userId, c));
    const { error: insertError } = await supabase.from('ai_configs').insert(records);
    if (insertError) {
      logger.error('syncAiConfigs insert error:', insertError);
    }
  } catch (err) {
    logger.error('syncAiConfigs unexpected error:', err);
  }
}

export function mergeWithLocal(
  cloudConfigs: AiProviderConfig[],
  localConfigs: AiProviderConfig[]
): AiProviderConfig[] {
  const merged = [...localConfigs];

  for (const cloud of cloudConfigs) {
    const key = matchKey(cloud);
    const existingIndex = merged.findIndex((l) => matchKey(l) === key);
    if (existingIndex >= 0) {
      // 云端和本地都有的：云端覆盖非敏感字段，保留本地 apiKey
      const local = merged[existingIndex];
      merged[existingIndex] = {
        ...cloud,
        id: local.id,
        apiKey: local.apiKey,
        apiKeyHint: local.apiKeyHint,
        createdAt: local.createdAt,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // 云端有本地没有的：添加（apiKey 留空）
      merged.push(cloud);
    }
  }

  // 按 isActive 排序，活跃的在前
  return merged.sort((a, b) => Number(b.isActive) - Number(a.isActive));
}
