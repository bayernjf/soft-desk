import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Token 红线（Technical-Architecture.md §6.5.3）：渲染层会话只活在内存。
// supabase-js 默认 persistSession:true 会把 access/refresh token 明文写进
// localStorage，架空主进程 safeStorage 加密的 session.bin，必须显式关闭。
// 刷新同样收口到主进程（auth:getSession），渲染层不自行轮换 refresh token，
// 否则会使 session.bin 里保存的 refresh token 提前失效。
export const supabase = url && key
  ? createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

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
