import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import {
  FEEDBACK_LIMITS,
  isFeedbackCategory,
  isFeedbackStatus,
  type FeedbackCategory,
  type FeedbackStatus,
} from '@/data/feedback';

const logger = createLogger('feedback');

export type { FeedbackCategory, FeedbackStatus } from '@/data/feedback';

export interface FeedbackInput {
  category: FeedbackCategory;
  title: string;
  content: string;
  contact?: string;
}

export interface FeedbackSystemInfo {
  appVersion: string;
  platform: string;
  arch?: string;
  osVersion?: string;
}

export interface FeedbackLogData {
  content: string;
  lineCount: number;
  startedAt: string | null;
  endedAt: string | null;
  truncated: boolean;
}

export type FeedbackErrorKey =
  | 'feedback.errors.cloudNotConfigured'
  | 'feedback.errors.authRequired'
  | 'feedback.errors.titleRequired'
  | 'feedback.errors.titleTooLong'
  | 'feedback.errors.contentRequired'
  | 'feedback.errors.contentTooLong'
  | 'feedback.errors.contactTooLong'
  | 'feedback.errors.submitFailed';

export type SubmitFeedbackResult =
  | { success: true; feedbackId: string }
  | { success: false; errorKey: FeedbackErrorKey; errorOptions?: { count: number } };

export async function submitFeedback(
  userId: string,
  input: FeedbackInput,
  systemInfo: FeedbackSystemInfo,
  logData?: FeedbackLogData | null
): Promise<SubmitFeedbackResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, errorKey: 'feedback.errors.cloudNotConfigured' };
  }
  if (!userId) {
    return { success: false, errorKey: 'feedback.errors.authRequired' };
  }
  if (!isFeedbackCategory(input.category)) {
    logger.error('invalid feedback category', input.category);
    return { success: false, errorKey: 'feedback.errors.submitFailed' };
  }

  const title = input.title.trim();
  const content = input.content.trim();
  const contact = input.contact?.trim() || null;

  if (!title) return { success: false, errorKey: 'feedback.errors.titleRequired' };
  if (title.length > FEEDBACK_LIMITS.title) {
    return {
      success: false,
      errorKey: 'feedback.errors.titleTooLong',
      errorOptions: { count: FEEDBACK_LIMITS.title },
    };
  }
  if (!content) return { success: false, errorKey: 'feedback.errors.contentRequired' };
  if (content.length > FEEDBACK_LIMITS.content) {
    return {
      success: false,
      errorKey: 'feedback.errors.contentTooLong',
      errorOptions: { count: FEEDBACK_LIMITS.content },
    };
  }
  if (contact && contact.length > FEEDBACK_LIMITS.contact) {
    return {
      success: false,
      errorKey: 'feedback.errors.contactTooLong',
      errorOptions: { count: FEEDBACK_LIMITS.contact },
    };
  }

  try {
    const { data: feedback, error: insertError } = await supabase
      .from('feedbacks')
      .insert({
        user_id: userId,
        category: input.category,
        title,
        content,
        contact,
        app_version: systemInfo.appVersion,
        platform: systemInfo.platform,
        architecture: systemInfo.arch ?? null,
        os_version: systemInfo.osVersion ?? null,
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error('submit feedback error:', insertError);
      return { success: false, errorKey: 'feedback.errors.submitFailed' };
    }

    const feedbackId = feedback.id;

    if (logData?.content) {
      try {
        const { error: logError } = await supabase.from('feedback_logs').insert({
          feedback_id: feedbackId,
          content: logData.content,
          line_count: logData.lineCount,
          started_at: logData.startedAt,
          ended_at: logData.endedAt,
          truncated: logData.truncated,
        });
        if (logError) {
          logger.warn('submit feedback log failed (feedback still saved):', logError.message);
        }
      } catch (logErr) {
        logger.warn('submit feedback log exception (feedback still saved):', logErr);
      }
    }

    return { success: true, feedbackId };
  } catch (err) {
    logger.error('submit feedback exception:', err);
    return { success: false, errorKey: 'feedback.errors.submitFailed' };
  }
}

export interface FeedbackHistoryItem {
  id: string;
  category: FeedbackCategory;
  title: string;
  content: string;
  status: FeedbackStatus;
  created_at: string;
  has_log: boolean;
}

interface FeedbackHistoryRow {
  id: unknown;
  category: unknown;
  title: unknown;
  content: unknown;
  status: unknown;
  created_at: unknown;
}

function parseFeedbackHistoryRow(row: FeedbackHistoryRow): Omit<FeedbackHistoryItem, 'has_log'> | null {
  if (
    typeof row.id !== 'string' ||
    !isFeedbackCategory(row.category) ||
    typeof row.title !== 'string' ||
    typeof row.content !== 'string' ||
    !isFeedbackStatus(row.status) ||
    typeof row.created_at !== 'string'
  ) {
    logger.error('invalid feedback history row', { id: row.id, category: row.category, status: row.status });
    return null;
  }

  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
  };
}

export async function fetchFeedbackHistory(userId: string): Promise<FeedbackHistoryItem[]> {
  if (!isSupabaseConfigured() || !supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('feedbacks')
      .select('id, category, title, content, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      logger.error('fetch feedback history error:', error);
      return [];
    }
    if (!data) return [];

    const items: FeedbackHistoryItem[] = [];
    for (const rawRow of data) {
      const row = parseFeedbackHistoryRow(rawRow as FeedbackHistoryRow);
      if (!row) continue;

      const { data: logData } = await supabase
        .from('feedback_logs')
        .select('id')
        .eq('feedback_id', row.id)
        .limit(1);
      items.push({
        ...row,
        has_log: !!logData?.length,
      });
    }
    return items;
  } catch (err) {
    logger.error('fetch feedback history exception:', err);
    return [];
  }
}
