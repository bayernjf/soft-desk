import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { RadialItem, RadialMenuConfig } from '@/types';

const logger = createLogger('radial-config');

interface CloudRadialConfig {
  user_id: string;
  enabled: boolean;
  hotkey: string;
  mouse_wheel_toggle: boolean;
  sectors: number;
  items: RadialItem[];
  updated_at: string;
}

function cloudToLocal(row: CloudRadialConfig): RadialMenuConfig {
  const sectors = row.sectors === 4 || row.sectors === 8 ? row.sectors : 6;
  return {
    enabled: !!row.enabled,
    hotkey: row.hotkey,
    mouseWheelToggle: !!row.mouse_wheel_toggle,
    sectors,
    items: Array.isArray(row.items) ? row.items : [],
    updatedAt: row.updated_at,
  };
}

function localToCloud(userId: string, config: RadialMenuConfig): CloudRadialConfig {
  return {
    user_id: userId,
    enabled: config.enabled,
    hotkey: config.hotkey,
    mouse_wheel_toggle: config.mouseWheelToggle,
    sectors: config.sectors,
    items: config.items,
    updated_at: config.updatedAt ?? new Date().toISOString(),
  };
}

/** 拉取云端 radial 配置;无记录或未配置 Supabase 时返回 null。 */
export async function fetchCloudRadialConfig(userId: string): Promise<RadialMenuConfig | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('radial_configs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      logger.error('fetchCloudRadialConfig error:', error);
      return null;
    }
    return data ? cloudToLocal(data as CloudRadialConfig) : null;
  } catch (err) {
    logger.error('fetchCloudRadialConfig unexpected error:', err);
    return null;
  }
}

/** 把本地 radial 配置 upsert 到云端单行(user_id 主键)。 */
export async function syncRadialConfigToCloud(
  userId: string,
  config: RadialMenuConfig
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    const { error } = await supabase
      .from('radial_configs')
      .upsert(localToCloud(userId, config), { onConflict: 'user_id' });
    if (error) {
      logger.error('syncRadialConfigToCloud error:', error);
    }
  } catch (err) {
    logger.error('syncRadialConfigToCloud unexpected error:', err);
  }
}

/** 时间戳后写胜出:云端比本地新则用云端,否则保留本地。 */
export function mergeRadialConfig(
  local: RadialMenuConfig,
  cloud: RadialMenuConfig | null
): RadialMenuConfig {
  if (!cloud) return local;
  const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
  const cloudTime = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
  return cloudTime > localTime ? cloud : local;
}
