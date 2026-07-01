import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { ShareKind } from './share-serializer';

const logger = createLogger('analytics');

export type ShareEventType =
  | 'share_create'
  | 'share_copy'
  | 'share_view'
  | 'share_import_click'
  | 'share_import_success'
  | 'share_import_conflict'
  | 'share_revoke'
  | 'share_delete'
  | 'share_report';

export interface TrackShareEventInput {
  eventType: ShareEventType;
  shareId?: number | null;
  shareToken?: string | null;
  actorId?: string | null;
  kind?: ShareKind | null;
  meta?: Record<string, unknown>;
}

/**
 * 分享类事件埋点上报 (fire-and-forget)。
 * 失败不影响主流程,只 warn 一条日志。
 * 匿名场景 actorId 可为 null,RLS 允许 insert。
 */
export function trackShareEvent(input: TrackShareEventInput): void {
  if (!isSupabaseConfigured() || !supabase) return;
  const row = {
    event_type: input.eventType,
    share_id: input.shareId ?? null,
    share_token: input.shareToken ?? null,
    actor_id: input.actorId ?? null,
    kind: input.kind ?? null,
    meta: input.meta ?? null,
  };
  // 不 await,埋点不能阻塞用户操作
  supabase
    .from('share_events')
    .insert(row)
    .then(({ error }) => {
      if (error) {
        logger.warn(`track ${input.eventType} failed:`, error.message);
      }
    });
}
