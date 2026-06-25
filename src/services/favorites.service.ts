import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { Software } from '@/types';

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
