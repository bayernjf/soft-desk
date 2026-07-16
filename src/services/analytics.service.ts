import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import { useSettingsStore } from '@/stores/settings.store';
import type { ShareKind } from './share-serializer';

const logger = createLogger('analytics');

export type ProductEventType =
  | 'app_first_open'
  | 'scan_completed'
  | 'software_launch'
  | 'workflow_created'
  | 'workflow_launched'
  | 'favorite_toggled'
  | 'radial_opened'
  | 'radial_launch'
  | 'ai_suggestion_used'
  | 'ai_search_used'
  | 'share_create'
  | 'share_copy'
  | 'share_view'
  | 'share_import_click'
  | 'share_import_success'
  | 'share_import_conflict'
  | 'share_revoke'
  | 'share_delete'
  | 'share_report';

export type ProductEventResult = 'success' | 'failed' | 'skipped';

export interface TrackProductEventInput {
  eventType: ProductEventType;
  result?: ProductEventResult;
  durationBucket?: string;
  featureCategory?: string;
  platform?: string;
  osVersion?: string;
  appVersion?: string;
  locale?: string;
  meta?: Record<string, string | number | boolean | null>;
}

const ALLOWED_META_KEYS = new Set([
  'software_count',
  'workflow_count',
  'missing_software',
  'reason_length',
  'expiry',
  'reimport',
  'blocked_by',
  'has_conflict',
  'radial_slots_required',
  'radial_slots_available',
]);

const META_VALUE_MAX = 128;

let installId: string | null = null;
let installIdLoaded = false;

function loadInstallId(): string | null {
  if (installIdLoaded) return installId;
  installIdLoaded = true;
  try {
    const raw = localStorage.getItem('softdesk-analytics-install-id');
    if (raw && typeof raw === 'string' && raw.length >= 16 && raw.length <= 64) {
      installId = raw;
    }
  } catch {
    installId = null;
  }
  return installId;
}

function generateInstallId(): string {
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  return `ins_${random.slice(0, 32)}`;
}

function getOrCreateInstallId(): string | null {
  const prefs = useSettingsStore.getState().prefs;
  if (!prefs.sendAnalytics) return null;
  const existing = loadInstallId();
  if (existing) return existing;
  const next = generateInstallId();
  try {
    localStorage.setItem('softdesk-analytics-install-id', next);
  } catch {
    return null;
  }
  installId = next;
  queueMicrotask(() => {
    void trackProductEvent({ eventType: 'app_first_open' });
  });
  return next;
}

function clearInstallId(): void {
  try {
    localStorage.removeItem('softdesk-analytics-install-id');
  } catch {
    // ignore
  }
  installId = null;
  installIdLoaded = true;
}

function sanitizeMeta(
  input: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> | null {
  if (!input) return null;
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_META_KEYS.has(key)) continue;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      output[key] = value;
      continue;
    }
    if (typeof value === 'string' && value.length <= META_VALUE_MAX) {
      output[key] = value;
    }
  }
  return Object.keys(output).length > 0 ? output : null;
}

async function resolveContext(): Promise<{
  platform: string;
  osVersion: string;
  appVersion: string;
  locale: string;
}> {
  const defaults = {
    platform: typeof navigator !== 'undefined' ? navigator.platform ?? 'web' : 'unknown',
    osVersion: 'unknown',
    appVersion: 'unknown',
    locale:
      typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'unknown',
  };
  if (typeof window === 'undefined' || !window.softdesk?.getSystemInfo) return defaults;
  try {
    const info = await window.softdesk.getSystemInfo();
    return {
      platform: info.platform ?? defaults.platform,
      osVersion: info.osVersion ?? defaults.osVersion,
      appVersion: info.appVersion ?? defaults.appVersion,
      locale: info.locale ?? defaults.locale,
    };
  } catch {
    return defaults;
  }
}

export async function trackProductEvent(input: TrackProductEventInput): Promise<void> {
  if (!isAnalyticsEnabled()) return;
  const install_id = getOrCreateInstallId();
  if (!install_id) return;

  const ctx = await resolveContext();

  const row = {
    install_id,
    event_type: input.eventType,
    result: input.result ?? 'success',
    duration_bucket: input.durationBucket ?? null,
    feature_category: input.featureCategory ?? null,
    platform: input.platform ?? ctx.platform,
    os_version: input.osVersion ?? ctx.osVersion,
    app_version: input.appVersion ?? ctx.appVersion,
    locale: input.locale ?? ctx.locale,
    meta: sanitizeMeta(input.meta),
  };

  try {
    const { error } = await supabase!.from('product_events').insert(row);
    if (error) {
      logger.warn(`track ${input.eventType} failed:`, error.message);
    }
  } catch (error) {
    logger.warn(
      `track ${input.eventType} rejected:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export type ShareEventType = Extract<
  ProductEventType,
  | 'share_create'
  | 'share_copy'
  | 'share_view'
  | 'share_import_click'
  | 'share_import_success'
  | 'share_import_conflict'
  | 'share_revoke'
  | 'share_delete'
  | 'share_report'
>;

export interface TrackShareEventInput {
  eventType: ShareEventType;
  kind?: ShareKind | null;
  meta?: Record<string, string | number | boolean | null>;
}

export function trackShareEvent(input: TrackShareEventInput): void {
  void trackProductEvent({
    eventType: input.eventType,
    featureCategory: input.kind ?? null,
    meta: input.meta,
  });
}

export function resetAnalyticsIdentity(): void {
  clearInstallId();
}

const PRIVACY_CONSENT_KEY = 'softdesk-privacy-consent-shown';
const ANALYTICS_CONSENT_KEY = 'softdesk-analytics-consent-given';

export function hasShownPrivacyConsent(): boolean {
  try {
    return localStorage.getItem(PRIVACY_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPrivacyConsentShown(): void {
  try {
    localStorage.setItem(PRIVACY_CONSENT_KEY, '1');
  } catch {
    // ignore
  }
}

export function hasGivenAnalyticsConsent(): boolean {
  try {
    return localStorage.getItem(ANALYTICS_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function giveAnalyticsConsent(): void {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, '1');
  } catch {
    // ignore
  }
}

export function revokeAnalyticsConsent(): void {
  try {
    localStorage.removeItem(ANALYTICS_CONSENT_KEY);
  } catch {
    // ignore
  }
  clearInstallId();
}

export function isAnalyticsEnabled(): boolean {
  const prefs = useSettingsStore.getState().prefs;
  return (
    prefs.sendAnalytics === true &&
    hasGivenAnalyticsConsent() &&
    isSupabaseConfigured() &&
    !!supabase
  );
}

export function migrateLegacyAnalyticsConsent(): void {
  const prefs = useSettingsStore.getState().prefs;
  if (!prefs.sendAnalytics) return;
  if (hasGivenAnalyticsConsent()) return;
  giveAnalyticsConsent();
}
