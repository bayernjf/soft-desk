import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { createClient, SupabaseClient, type User } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { createLogger } from './lib/logger';

const logger = createLogger('auth');

export interface AuthProfile {
  userId: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  avatar: number;
  plan: 'free' | 'pro';
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthSession {
  loggedIn: boolean;
  profile?: AuthProfile;
}

export type AuthResult =
  | { success: true; profile: AuthProfile }
  | { success: false; error: string };

interface StoredSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function sessionPath(): string {
  return path.join(app.getPath('userData'), 'session.bin');
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function userToProfile(user: User): AuthProfile {
  return {
    userId: user.id,
    email: user.email ?? '',
    nickname: (user.user_metadata?.nickname as string) || (user.email?.split('@')[0] ?? ''),
    avatarUrl: (user.user_metadata?.avatar_url as string | null) || user.user_metadata?.picture as string | null || null,
    avatar: (user.user_metadata?.avatar as number) || 0,
    plan: (user.user_metadata?.plan as 'free' | 'pro') || 'free',
    emailVerified: !!user.email_confirmed_at,
    createdAt: user.created_at,
    lastLoginAt: new Date().toISOString(),
  };
}

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (supabase) return supabase;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase 未配置，请在 .env 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
  }
  supabase = createClient(url, key, {
    realtime: {
      transport: WebSocket as never,
    },
  });
  return supabase;
}

function persistSession(session: StoredSession): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const encrypted = safeStorage.encryptString(JSON.stringify(session));
    writeFileSync(sessionPath(), encrypted);
  } catch {
    // 落盘失败仅影响"重启后保持登录"，不影响本次会话
  }
}

function readStoredSession(): StoredSession | null {
  try {
    if (!existsSync(sessionPath()) || !safeStorage.isEncryptionAvailable()) return null;
    const buf = readFileSync(sessionPath());
    const json = safeStorage.decryptString(buf);
    const parsed = JSON.parse(json) as StoredSession;
    if (!parsed || typeof parsed.userId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  try {
    if (existsSync(sessionPath())) unlinkSync(sessionPath());
  } catch {
    // 忽略删除失败
  }
}

let currentSession: StoredSession | null = null;
let sessionLoaded = false;

function ensureSessionLoaded(): void {
  if (sessionLoaded) return;
  sessionLoaded = true;
  currentSession = readStoredSession();
}

export async function register(rawEmail: unknown, rawPassword: unknown, rawNickname?: unknown): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const nickname =
    typeof rawNickname === 'string' && rawNickname.trim() ? rawNickname.trim() : email.split('@')[0];

  if (!isValidEmail(email)) return { success: false, error: '请输入有效的邮箱地址' };
  if (password.length < 6) return { success: false, error: '密码至少 6 位' };

  try {
    const sb = getSupabase();
    const randomAvatar = Math.floor(Math.random() * 10);
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { nickname, plan: 'free', avatar: randomAvatar },
      },
    });

    if (error) {
      logger.error('Supabase signUp failed:', error.message);
      return { success: false, error: error.message.includes('already registered') ? '该邮箱已注册' : error.message };
    }

    if (!data.user) {
      return { success: false, error: '注册失败' };
    }

    if (data.session) {
      currentSession = {
        userId: data.user.id,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: Date.now() + (data.session.expires_in || 3600) * 1000,
      };
      persistSession(currentSession);
      sessionLoaded = true;
    }

    return { success: true, profile: userToProfile(data.user) };
  } catch (err) {
    logger.error('register unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : '注册失败' };
  }
}

export async function login(rawEmail: unknown, rawPassword: unknown): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === 'string' ? rawPassword : '';

  if (!isValidEmail(email)) return { success: false, error: '请输入有效的邮箱地址' };
  if (!password) return { success: false, error: '请输入密码' };

  try {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session) {
      return { success: false, error: '邮箱或密码错误' };
    }

    currentSession = {
      userId: data.user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: Date.now() + (data.session.expires_in || 3600) * 1000,
    };
    persistSession(currentSession);
    sessionLoaded = true;

    return { success: true, profile: userToProfile(data.user) };
  } catch (err) {
    logger.error('login unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : '登录失败' };
  }
}

export async function logout(): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.auth.signOut();
  } catch (err) {
    logger.error('logout error:', err);
  }
  currentSession = null;
  clearStoredSession();
}

export async function getSession(): Promise<AuthSession> {
  ensureSessionLoaded();
  if (!currentSession) return { loggedIn: false };

  try {
    const sb = getSupabase();
    const { data, error } = await sb.auth.setSession({
      access_token: currentSession.accessToken,
      refresh_token: currentSession.refreshToken,
    });

    if (error || !data.session || !data.user) {
      logout();
      return { loggedIn: false };
    }

    // Token 可能已被刷新，更新本地存储
    currentSession = {
      userId: data.user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: Date.now() + (data.session.expires_in || 3600) * 1000,
    };
    persistSession(currentSession);

    return { loggedIn: true, profile: userToProfile(data.user) };
  } catch (err) {
    logger.error('getSession error:', err);
    logout();
    return { loggedIn: false };
  }
}

export async function updateProfile(updates: { nickname?: string; avatar?: number }): Promise<AuthResult> {
  ensureSessionLoaded();
  if (!currentSession) {
    return { success: false, error: '未登录' };
  }

  try {
    const sb = getSupabase();
    const metadata: Record<string, unknown> = {};
    if (updates.nickname !== undefined) metadata.nickname = updates.nickname;
    if (updates.avatar !== undefined) metadata.avatar = updates.avatar;

    const { data, error } = await sb.auth.updateUser({ data: metadata });

    if (error || !data.user) {
      logger.error('updateProfile failed:', error?.message);
      return { success: false, error: error?.message || '更新失败' };
    }

    return { success: true, profile: userToProfile(data.user) };
  } catch (err) {
    logger.error('updateProfile unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : '更新失败' };
  }
}

export function getTokens(): { accessToken: string; refreshToken: string } | null {
  ensureSessionLoaded();
  if (!currentSession) return null;
  return {
    accessToken: currentSession.accessToken,
    refreshToken: currentSession.refreshToken,
  };
}
