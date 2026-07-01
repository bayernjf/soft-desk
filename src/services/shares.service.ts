import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { ShareKind, SharePayload } from './share-serializer';
import { isValidPayload } from './share-serializer';

const logger = createLogger('shares');

export type ShareExpiry = 'permanent' | '7d' | '30d';

export interface CloudShare {
  id: number;
  share_token: string;
  owner_id: string;
  owner_nickname: string | null;
  kind: ShareKind;
  title: string;
  description: string | null;
  payload: SharePayload;
  view_count: number;
  import_count: number;
  report_count: number;
  is_public: boolean;
  is_revoked: boolean;
  is_archived: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicShare {
  id: number;
  shareToken: string;
  ownerNickname: string | null;
  kind: ShareKind;
  title: string;
  description: string | null;
  payload: SharePayload;
  viewCount: number;
  importCount: number;
  createdAt: string;
}

export interface MyShare {
  id: number;
  shareToken: string;
  kind: ShareKind;
  title: string;
  description: string | null;
  viewCount: number;
  importCount: number;
  isRevoked: boolean;
  isArchived: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// nanoid 10 位:26+10=36 字符,约 5×10^15 种组合,足够防爆破
const TOKEN_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
function generateToken(length = 10): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

function expiryToDate(expiry: ShareExpiry): string | null {
  if (expiry === 'permanent') return null;
  const days = expiry === '7d' ? 7 : 30;
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  return d.toISOString();
}

// 简易关键词黑名单(避免恶意标题/描述)
const BLACKLIST_WORDS = [
  'porn', 'sex', 'nude', '色情', '成人', '淫秽',
  '赌博', '博彩', 'gambling',
  '毒品', 'drug',
  '暴恐', '恐怖',
];

function containsBlacklist(...texts: string[]): boolean {
  const joined = texts.join(' ').toLowerCase();
  return BLACKLIST_WORDS.some((w) => joined.includes(w.toLowerCase()));
}

const MAX_PAYLOAD_BYTES = 100 * 1024;

export interface CreateShareInput {
  kind: ShareKind;
  title: string;
  description?: string;
  payload: SharePayload;
  expiry: ShareExpiry;
  ownerNickname?: string;
}

export interface CreateShareResult {
  success: boolean;
  shareId?: number;
  shareToken?: string;
  shareUrl?: string;
  error?: string;
}

export function buildShareUrl(token: string): string {
  return `softdesk://share/${token}`;
}

export async function createShare(
  userId: string,
  input: CreateShareInput
): Promise<CreateShareResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: '云端未配置,无法创建分享' };
  }
  const title = input.title.trim();
  const description = input.description?.trim() ?? '';
  if (!title) return { success: false, error: '标题不能为空' };
  if (title.length > 50) return { success: false, error: '标题不能超过 50 字' };
  if (description.length > 200) return { success: false, error: '描述不能超过 200 字' };
  if (!isValidPayload(input.payload)) return { success: false, error: '分享内容格式无效' };
  if (containsBlacklist(title, description)) {
    return { success: false, error: '标题或描述包含违禁词' };
  }
  const payloadJson = JSON.stringify(input.payload);
  if (payloadJson.length > MAX_PAYLOAD_BYTES) {
    return { success: false, error: '分享内容过大(超过 100KB)' };
  }

  // 尝试 3 次生成不冲突的 token
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateToken(10);
    try {
      const { data, error } = await supabase
        .from('shares')
        .insert({
          share_token: token,
          owner_id: userId,
          owner_nickname: input.ownerNickname ?? null,
          kind: input.kind,
          title,
          description: description || null,
          payload: input.payload,
          expires_at: expiryToDate(input.expiry),
        })
        .select('id, share_token')
        .single();

      if (error) {
        // 23505 = unique violation,token 冲突,重试
        if ((error as { code?: string }).code === '23505') continue;
        logger.error('create share error:', error);
        return { success: false, error: error.message };
      }
      const tok = data?.share_token ?? token;
      return {
        success: true,
        shareId: data?.id as number | undefined,
        shareToken: tok,
        shareUrl: buildShareUrl(tok),
      };
    } catch (err) {
      logger.error('create share exception:', err);
      return { success: false, error: '创建分享失败' };
    }
  }
  return { success: false, error: '生成分享码冲突,请重试' };
}

export async function getShareByToken(token: string): Promise<PublicShare | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  if (!token || typeof token !== 'string') return null;
  try {
    const { data, error } = await supabase
      .from('shares')
      .select(
        'id, share_token, owner_nickname, kind, title, description, payload, view_count, import_count, created_at, is_revoked, is_archived, expires_at'
      )
      .eq('share_token', token)
      .maybeSingle();
    if (error) {
      logger.error('fetch share error:', error);
      return null;
    }
    if (!data) return null;
    const row = data as unknown as CloudShare;
    if (row.is_revoked || row.is_archived) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    return {
      id: row.id,
      shareToken: row.share_token,
      ownerNickname: row.owner_nickname,
      kind: row.kind,
      title: row.title,
      description: row.description,
      payload: row.payload,
      viewCount: row.view_count,
      importCount: row.import_count,
      createdAt: row.created_at,
    };
  } catch (err) {
    logger.error('fetch share exception:', err);
    return null;
  }
}

export async function incrementViewCount(token: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    await supabase.rpc('increment_share_view', { p_token: token });
  } catch (err) {
    logger.error('increment view error:', err);
  }
}

export async function listMyShares(userId: string): Promise<MyShare[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('shares')
      .select(
        'id, share_token, kind, title, description, view_count, import_count, is_revoked, is_archived, expires_at, created_at, updated_at'
      )
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('list shares error:', error);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id as number,
      shareToken: row.share_token as string,
      kind: row.kind as ShareKind,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      viewCount: row.view_count as number,
      importCount: row.import_count as number,
      isRevoked: row.is_revoked as boolean,
      isArchived: row.is_archived as boolean,
      expiresAt: (row.expires_at as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  } catch (err) {
    logger.error('list shares exception:', err);
    return [];
  }
}

export async function revokeShare(userId: string, shareId: number): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase
      .from('shares')
      .update({ is_revoked: true })
      .eq('id', shareId)
      .eq('owner_id', userId);
    if (error) {
      logger.error('revoke share error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteShare(userId: string, shareId: number): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase
      .from('shares')
      .delete()
      .eq('id', shareId)
      .eq('owner_id', userId);
    if (error) {
      logger.error('delete share error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export interface RecordImportResult {
  firstImport: boolean;
}

export async function recordImport(
  shareId: number,
  importerId: string
): Promise<RecordImportResult> {
  if (!isSupabaseConfigured() || !supabase) return { firstImport: false };
  try {
    const { error } = await supabase
      .from('share_imports')
      .insert({ share_id: shareId, importer_id: importerId });
    if (error) {
      // 23505 唯一约束冲突 = 该用户之前已导入过,不算首次
      if ((error as { code?: string }).code === '23505') {
        return { firstImport: false };
      }
      logger.error('record import error:', error);
      return { firstImport: false };
    }
    // 首次导入 → 递增 import_count
    await supabase.rpc('increment_share_import', { p_share_id: shareId });
    return { firstImport: true };
  } catch (err) {
    logger.error('record import exception:', err);
    return { firstImport: false };
  }
}

export interface ReportShareResult {
  success: boolean;
  /** 已经举报过一次(unique 冲突或前置检查命中),UI 应该置灰按钮 */
  duplicated?: boolean;
  error?: string;
}

/**
 * 提交举报。举报前必须登录(reporterId 必填, RLS/DB 双重强制)。
 *
 * 数据库有 unique(share_id, reporter_id) 约束,同一个用户对同一分享
 * 只能存在一条举报记录。第二次调用会返回 duplicated=true,UI 侧
 * 应把举报按钮标灰并提示"你已举报过"。
 */
export async function reportShare(
  shareId: number,
  reason: string,
  reporterId: string
): Promise<ReportShareResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: '云端未配置' };
  }
  if (!reporterId) {
    return { success: false, error: '请先登录后再举报' };
  }
  const trimmed = reason.trim();
  if (!trimmed) return { success: false, error: '请填写举报理由' };
  if (trimmed.length > 200) return { success: false, error: '举报理由不能超过 200 字' };
  try {
    const { error } = await supabase.from('share_reports').insert({
      share_id: shareId,
      reporter_id: reporterId,
      reason: trimmed,
    });
    if (error) {
      // 23505 = Postgres unique_violation
      // 触到就说明该用户之前已经举报过, 数据库层已阻止重复计数
      if ((error as { code?: string }).code === '23505') {
        return { success: false, duplicated: true };
      }
      logger.error('report share error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '举报失败',
    };
  }
}

/**
 * 查询当前用户是否已举报过该分享。
 * 未登录 / 未确定时统一返回 false, 让 UI 端保持可点击(真正的拦截兜底在数据库 unique 约束)。
 */
export async function hasUserReported(
  shareId: number,
  reporterId: string | undefined
): Promise<boolean> {
  if (!reporterId) return false;
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { data, error } = await supabase
      .from('share_reports')
      .select('id')
      .eq('share_id', shareId)
      .eq('reporter_id', reporterId)
      .maybeSingle();
    if (error) {
      logger.warn('check reported error:', error.message);
      return false;
    }
    return !!data;
  } catch {
    return false;
  }
}

/**
 * 查询当前用户是否已导入过该分享(去重提醒用)。
 * 不确定时返回 false,避免误拦截。
 */
export async function hasUserImported(
  shareId: number,
  importerId: string
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { data, error } = await supabase
      .from('share_imports')
      .select('id')
      .eq('share_id', shareId)
      .eq('importer_id', importerId)
      .maybeSingle();
    if (error) {
      logger.warn('check imported error:', error.message);
      return false;
    }
    return !!data;
  } catch {
    return false;
  }
}
