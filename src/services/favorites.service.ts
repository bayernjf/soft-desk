import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { Software, FavoriteGroup } from '@/types';

const logger = createLogger('favorites');

export interface CloudFavorite {
  id: number;
  user_id: string;
  software_id: string;
  name: string;
  bundle_id: string | null;
  category: string | null;
  icon: string | null;
  color: string | null;
  group_id: string | null;
  created_at: string;
}

export interface CloudFavoriteGroup {
  id: number;
  user_id: string;
  group_id: string;
  name: string;
  created_at: string;
}

export async function fetchCloudFavorites(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('software_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('fetch error:', error);
      return [];
    }
    return (data ?? []).map((row) => row.software_id as string);
  } catch {
    return [];
  }
}

export async function fetchCloudFavoriteDetails(userId: string): Promise<CloudFavorite[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('fetch details error:', error);
      return [];
    }
    return (data ?? []) as CloudFavorite[];
  } catch {
    return [];
  }
}

export async function addCloudFavorite(
  userId: string,
  software: Software
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase.from('favorites').upsert(
      {
        user_id: userId,
        software_id: software.id,
        name: software.name,
        bundle_id: software.id,
        category: software.category,
        icon: software.icon,
        color: software.color,
      },
      { onConflict: 'user_id,software_id' }
    );
    if (error) {
      logger.error('add error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function removeCloudFavorite(
  userId: string,
  softwareId: string
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('software_id', softwareId);
    if (error) {
      logger.error('remove error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function syncFavoritesToCloud(
  userId: string,
  favoriteIds: string[],
  software: Software[]
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const byId = new Map(software.map((s) => [s.id, s]));
  for (const id of favoriteIds) {
    const sw = byId.get(id);
    if (sw) {
      await addCloudFavorite(userId, sw);
    }
  }
}

/* ── 收藏分组云端操作 ── */

export async function fetchCloudFavoriteGroups(userId: string): Promise<CloudFavoriteGroup[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('favorite_groups')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) {
      logger.error('fetch groups error:', error);
      return [];
    }
    return (data ?? []) as CloudFavoriteGroup[];
  } catch {
    return [];
  }
}

export async function addCloudFavoriteGroup(
  userId: string,
  group: FavoriteGroup
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase.from('favorite_groups').upsert(
      {
        user_id: userId,
        group_id: group.id,
        name: group.name,
        created_at: group.createdAt,
      },
      { onConflict: 'user_id,group_id' }
    );
    if (error) {
      logger.error('add group error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function renameCloudFavoriteGroup(
  userId: string,
  groupId: string,
  name: string
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase
      .from('favorite_groups')
      .update({ name })
      .eq('user_id', userId)
      .eq('group_id', groupId);
    if (error) {
      logger.error('rename group error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function removeCloudFavoriteGroup(
  userId: string,
  groupId: string
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    // 先将该分组下的收藏 group_id 置空
    const { error: updateError } = await supabase
      .from('favorites')
      .update({ group_id: null })
      .eq('user_id', userId)
      .eq('group_id', groupId);
    if (updateError) {
      logger.error('clear group refs error:', updateError);
    }

    // 再删除分组
    const { error } = await supabase
      .from('favorite_groups')
      .delete()
      .eq('user_id', userId)
      .eq('group_id', groupId);
    if (error) {
      logger.error('remove group error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function moveCloudFavoriteToGroup(
  userId: string,
  softwareId: string,
  groupId: string | null
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase
      .from('favorites')
      .update({ group_id: groupId })
      .eq('user_id', userId)
      .eq('software_id', softwareId);
    if (error) {
      logger.error('move favorite error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function moveCloudFavoritesToGroup(
  userId: string,
  softwareIds: string[],
  groupId: string | null
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase || softwareIds.length === 0) return false;
  try {
    const { error } = await supabase
      .from('favorites')
      .update({ group_id: groupId })
      .eq('user_id', userId)
      .in('software_id', softwareIds);
    if (error) {
      logger.error('move favorites error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
