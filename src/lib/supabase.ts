import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

export function isSupabaseConfigured(): boolean {
  return !!supabase;
}

export async function setSupabaseSession(accessToken: string, refreshToken: string): Promise<void> {
  if (!supabase) return;
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

export async function clearSupabaseSession(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}
