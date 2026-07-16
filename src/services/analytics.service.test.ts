import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings.store';

interface MockRow {
  install_id: string;
  event_type: string;
  result: string;
  feature_category: string | null;
  meta: Record<string, unknown> | null;
  [key: string]: unknown;
}

const mockInsert = vi.fn(() => Promise.resolve({ error: null }));
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => mockFrom(),
  },
  isSupabaseConfigured: () => true,
}));

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('crypto', {
  randomUUID: () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }),
});

function setPrefs(sendAnalytics: boolean, anonymizeData = true) {
  vi.mocked(useSettingsStore.getState).mockReturnValue({
    prefs: { sendAnalytics, anonymizeData },
  } as unknown as ReturnType<typeof useSettingsStore.getState>);
}

function giveConsent() {
  localStorageMock.setItem('softdesk-analytics-consent-given', '1');
}

function getInsertedRows(): MockRow[] {
  return (mockInsert.mock.calls as unknown[][]).map((call) => call[0] as MockRow);
}

describe('analytics service - privacy controls', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockInsert.mockClear();
    mockFrom.mockClear();
    vi.resetModules();
  });

  it('sendAnalytics=false 时 trackProductEvent 不发送', async () => {
    setPrefs(false);
    const { trackProductEvent } = await import('./analytics.service');
    await trackProductEvent({ eventType: 'scan_completed' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sendAnalytics=true 但未明确同意时不发送', async () => {
    setPrefs(true);
    const { trackProductEvent } = await import('./analytics.service');
    await trackProductEvent({ eventType: 'scan_completed' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sendAnalytics=true 且已明确同意时发送事件', async () => {
    setPrefs(true);
    giveConsent();
    const { trackProductEvent } = await import('./analytics.service');
    await trackProductEvent({ eventType: 'scan_completed' });
    expect(mockFrom).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    const eventTypes = getInsertedRows().map((r) => r.event_type);
    expect(eventTypes).toContain('scan_completed');
  });

  it('sendAnalytics=true 且已同意时生成 install_id 并持久化', async () => {
    setPrefs(true);
    giveConsent();
    const { trackProductEvent } = await import('./analytics.service');
    await trackProductEvent({ eventType: 'scan_completed' });
    const stored = localStorageMock.getItem('softdesk-analytics-install-id');
    expect(stored).toMatch(/^ins_[0-9a-f]{32}$/);
  });

  it('resetAnalyticsIdentity 清除本地 install_id', async () => {
    setPrefs(true);
    giveConsent();
    const { trackProductEvent, resetAnalyticsIdentity } = await import('./analytics.service');
    await trackProductEvent({ eventType: 'scan_completed' });
    expect(localStorageMock.getItem('softdesk-analytics-install-id')).not.toBeNull();
    resetAnalyticsIdentity();
    expect(localStorageMock.getItem('softdesk-analytics-install-id')).toBeNull();
  });

  it('revokeAnalyticsConsent 撤回同意并清除 install_id', async () => {
    setPrefs(true);
    giveConsent();
    const { trackProductEvent, revokeAnalyticsConsent, isAnalyticsEnabled } = await import(
      './analytics.service'
    );
    await trackProductEvent({ eventType: 'scan_completed' });
    expect(isAnalyticsEnabled()).toBe(true);
    revokeAnalyticsConsent();
    expect(isAnalyticsEnabled()).toBe(false);
    expect(localStorageMock.getItem('softdesk-analytics-install-id')).toBeNull();
  });

  it('事件不包含敏感字段:仅上报白名单 meta', async () => {
    setPrefs(true);
    giveConsent();
    const { trackProductEvent } = await import('./analytics.service');

    await trackProductEvent({
      eventType: 'share_create',
      featureCategory: 'workflow',
      meta: {
        expiry: '7d',
        software_count: 5,
        user_email: 'leaked@example.com',
        share_token: 'secret123',
      },
    });

    const shareCreateRow = getInsertedRows().find((r) => r.event_type === 'share_create');
    expect(shareCreateRow).toBeDefined();
    if (!shareCreateRow) return;
    expect(shareCreateRow).not.toHaveProperty('user_email');
    expect(shareCreateRow).not.toHaveProperty('share_token');
    expect(shareCreateRow.meta?.expiry).toBe('7d');
    expect(shareCreateRow.meta?.software_count).toBe(5);
  });

  it('事件包含 install_id 但不包含用户身份信息', async () => {
    setPrefs(true);
    giveConsent();
    const { trackProductEvent } = await import('./analytics.service');
    await trackProductEvent({ eventType: 'scan_completed' });

    const insertedRow = getInsertedRows().find((r) => r.event_type === 'scan_completed');
    expect(insertedRow).toBeDefined();
    if (!insertedRow) return;
    expect(insertedRow.install_id).toMatch(/^ins_[0-9a-f]{32}$/);
    expect(insertedRow).not.toHaveProperty('userId');
    expect(insertedRow).not.toHaveProperty('email');
    expect(insertedRow).not.toHaveProperty('nickname');
  });

  it('首次创建 install_id 时自动发送 app_first_open 事件', async () => {
    setPrefs(true);
    giveConsent();
    const { trackProductEvent } = await import('./analytics.service');

    await trackProductEvent({ eventType: 'scan_completed' });

    const eventTypes = getInsertedRows().map((r) => r.event_type);
    expect(eventTypes).toContain('app_first_open');
    expect(eventTypes).toContain('scan_completed');
  });

  it('migrateLegacyAnalyticsConsent 老用户 sendAnalytics=true 时静默授予同意', async () => {
    setPrefs(true);
    const { migrateLegacyAnalyticsConsent, isAnalyticsEnabled } = await import(
      './analytics.service'
    );
    expect(isAnalyticsEnabled()).toBe(false);
    migrateLegacyAnalyticsConsent();
    expect(isAnalyticsEnabled()).toBe(true);
    expect(localStorageMock.getItem('softdesk-analytics-consent-given')).toBe('1');
  });

  it('migrateLegacyAnalyticsConsent sendAnalytics=false 时不授予同意', async () => {
    setPrefs(false);
    const { migrateLegacyAnalyticsConsent, isAnalyticsEnabled } = await import(
      './analytics.service'
    );
    migrateLegacyAnalyticsConsent();
    expect(isAnalyticsEnabled()).toBe(false);
    expect(localStorageMock.getItem('softdesk-analytics-consent-given')).toBeNull();
  });
});
