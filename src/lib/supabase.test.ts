// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// P1-A 回归：渲染层 supabase client 不得把 access/refresh token 写进
// localStorage/sessionStorage（红线见 Technical-Architecture.md §6.5.3）。
// supabase-js 默认 persistSession:true 会写入 sb-<ref>-auth-token，
// 这里用"真实 setSession 后扫描整个 Web Storage"来钉死契约；
// 另设对照组证明扫描本身能抓到旧行为，不是空断言。

const FAKE_URL = 'http://127.0.0.1:54321';
const FAKE_ANON_KEY = 'anon-key-under-test';
// 一个可解码、未过期的伪 JWT（supabase-js 只解码验 exp，不验签名）
function fakeJwt(exp: number): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'user-1', exp })}.sig`;
}
const ACCESS = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
const REFRESH = 'refresh-token-under-test-0123456789';

function dumpWebStorage(): string {
  const parts: string[] = [];
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)!;
      parts.push(`${k}=${store.getItem(k)}`);
    }
  }
  return parts.join('\n');
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', FAKE_URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', FAKE_ANON_KEY);
  // setSession 在 token 未过期时会调 _getUser（GET /auth/v1/user）；
  // 桩掉网络层，让会话保存路径完整走一遍。
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ id: 'user-1', aud: 'authenticated', email: 'a@b.c' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  ));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('renderer supabase client token storage', () => {
  it('setSession 后 localStorage/sessionStorage 无任何 token 痕迹', async () => {
    const mod = await import('./supabase');
    expect(mod.supabase).not.toBeNull();
    await mod.setSupabaseSession(ACCESS, REFRESH);

    const dump = dumpWebStorage();
    expect(dump).not.toContain(ACCESS);
    expect(dump).not.toContain(REFRESH);
    expect(dump).not.toMatch(/sb-[\w-]+-auth-token/);
    expect(dump.toLowerCase()).not.toContain('access_token');
    expect(dump.toLowerCase()).not.toContain('refresh_token');
  });

  it('对照组：默认 persistSession:true 的旧行为会把 token 写进 localStorage', async () => {
    // 证明上面的扫描不是恒真断言：默认配置（修复前行为）必须被它抓到。
    const { createClient } = await import('@supabase/supabase-js');
    const legacy = createClient(FAKE_URL, FAKE_ANON_KEY);
    await legacy.auth.setSession({ access_token: ACCESS, refresh_token: REFRESH });

    const dump = dumpWebStorage();
    expect(dump).toContain(REFRESH);
    expect(dump).toMatch(/sb-[\w-]+-auth-token/);
  });
});
