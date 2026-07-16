import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Monitor, Bell, Database, Shield, Sparkles, LifeBuoy, Trash2, FolderCog, CircleDot, Info, FileText, FolderOpen, Download, MessageSquare, Send, Eye, X, Loader2, History, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings.store';
import { useSoftwareStore } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { AiModelsSection } from '@/components/features/AiModelsSection';
import { RadialMenuSection } from '@/components/features/RadialMenuSection';
import { UpdateSection } from '@/components/features/UpdateSection';
import { submitFeedback, fetchFeedbackHistory, type FeedbackLogData, type FeedbackHistoryItem } from '@/services/feedback.service';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_I18N_KEYS,
  FEEDBACK_LIMITS,
  FEEDBACK_STATUS_I18N_KEYS,
  FEEDBACK_STATUS_STYLES,
  type FeedbackCategory,
} from '@/data/feedback';
import { APP_LOCALES, setAppLocale, type AppLocale } from '@/lib/i18n';
import {
  resetAnalyticsIdentity,
  giveAnalyticsConsent,
  revokeAnalyticsConsent,
} from '@/services/analytics.service';

type TabId = 'appearance' | 'notifications' | 'radial' | 'data' | 'privacy' | 'ai' | 'help' | 'feedback' | 'about';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

const TAB_IDS: readonly TabId[] = [
  'appearance',
  'notifications',
  'radial',
  'data',
  'privacy',
  'ai',
  'help',
  'feedback',
  'about',
];

function isTabId(v: string | null): v is TabId {
  return v !== null && (TAB_IDS as readonly string[]).includes(v);
}

const ALL_TABS = [
  { id: 'appearance' as TabId, icon: Monitor, label: '外观' },
  { id: 'notifications' as TabId, icon: Bell, label: '通知' },
  { id: 'radial' as TabId, icon: CircleDot, label: '径向菜单' },
  { id: 'data' as TabId, icon: Database, label: '数据与存储' },
  { id: 'privacy' as TabId, icon: Shield, label: '隐私安全' },
  { id: 'ai' as TabId, icon: Sparkles, label: 'AI 功能' },
  { id: 'help' as TabId, icon: LifeBuoy, label: '帮助' },
  { id: 'feedback' as TabId, icon: MessageSquare, label: '意见反馈' },
  { id: 'about' as TabId, icon: Info, label: '关于' },
];

// 非 Mac 平台(当前主要是 Windows)过滤掉"帮助"tab —— 无内容可展示时不显示入口
const tabs = ALL_TABS.filter((t) => (t.id === 'help' ? IS_MAC : true));

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}
function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-xl hover:bg-slate-800/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-200">{label}</div>
        {description && <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
          checked ? 'bg-violet-500' : 'bg-slate-700'
        )}
      >
        <span
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all',
            checked ? 'left-6' : 'left-1'
          )}
        />
      </button>
    </div>
  );
}

const LOG_TIME_OPTIONS = [5, 15, 30] as const;

const LOCALE_LABELS = {
  'zh-CN': '简体中文',
  'en-US': 'English',
} as const satisfies Record<AppLocale, string>;

function FeedbackTab() {
  const { t, i18n } = useTranslation();
  const { loggedIn, profile } = useAuthStore();

  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');

  const [logData, setLogData] = useState<FeedbackLogData | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logPreview, setLogPreview] = useState(false);
  const [logMinutes, setLogMinutes] = useState<5 | 15 | 30>(5);

  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [resultOk, setResultOk] = useState(false);

  const [history, setHistory] = useState<FeedbackHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const loadHistory = async () => {
    if (!profile) return;
    setHistoryLoading(true);
    try {
      const items = await fetchFeedbackHistory(profile.userId);
      setHistory(items);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (loggedIn && profile && showHistory) {
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, profile, showHistory]);

  const fetchLogs = async () => {
    if (!window.softdesk) return;
    setLogLoading(true);
    try {
      const result = await window.softdesk.getRecentLogs(logMinutes);
      if (result.success) {
        setLogData({
          content: result.content,
          lineCount: result.lineCount,
          startedAt: result.startedAt,
          endedAt: result.endedAt,
          truncated: result.truncated,
        });
        setResultMsg('');
      } else {
        setResultMsg(t('feedback.errors.logFetchFailed'));
        setResultOk(false);
      }
    } catch {
      setResultMsg(t('feedback.errors.logFetchFailed'));
      setResultOk(false);
    } finally {
      setLogLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!loggedIn || !profile) {
      setResultMsg(t('feedback.errors.authRequired'));
      setResultOk(false);
      return;
    }
    if (!title.trim() || !content.trim()) {
      setResultMsg(t('feedback.errors.titleAndContentRequired'));
      setResultOk(false);
      return;
    }

    setSubmitting(true);
    setResultMsg('');

    try {
      let systemInfo: { appVersion: string; platform: string; arch?: string; osVersion?: string } = { appVersion: 'unknown', platform: 'unknown' };
      try {
        const info = await window.softdesk?.getSystemInfo();
        if (info) {
          systemInfo = {
            appVersion: info.appVersion,
            platform: info.platform,
            arch: info.arch,
            osVersion: info.osVersion,
          };
        }
      } catch {
        // 系统信息获取失败不阻止提交
      }

      const result = await submitFeedback(
        profile.userId,
        { category, title, content, contact },
        systemInfo,
        logData
      );

      if (result.success) {
        setResultOk(true);
        setResultMsg(t('feedback.success'));
        setTitle('');
        setContent('');
        setContact('');
        setLogData(null);
      } else if ('errorKey' in result) {
        setResultOk(false);
        setResultMsg(t(result.errorKey, result.errorOptions));
      }
    } catch {
      setResultOk(false);
      setResultMsg(t('feedback.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!loggedIn) {
    return (
      <div className="space-y-6 max-w-xl">
        <div>
          <h2 className="text-base font-semibold text-slate-100 mb-1">{t('feedback.title')}</h2>
          <p className="text-sm text-slate-500">{t('feedback.subtitle')}</p>
        </div>
        <div className="rounded-2xl bg-slate-800/40 border border-slate-800 p-6 text-center">
          <p className="text-sm text-slate-400">{t('feedback.loginRequired')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-slate-100 mb-1">{t('feedback.title')}</h2>
        <p className="text-sm text-slate-500">{t('feedback.subtitle')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('feedback.fields.category')}</label>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_CATEGORIES.map((categoryId) => (
              <button
                key={categoryId}
                onClick={() => setCategory(categoryId)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  category === categoryId
                    ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                    : 'text-slate-400 border-slate-700/50 hover:text-slate-200'
                )}
              >
                {t(FEEDBACK_CATEGORY_I18N_KEYS[categoryId])}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('feedback.fields.title')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={FEEDBACK_LIMITS.title}
            placeholder={t('feedback.fields.titlePlaceholder')}
            className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('feedback.fields.content')}</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={FEEDBACK_LIMITS.content}
            rows={5}
            placeholder={t('feedback.fields.contentPlaceholder')}
            className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 resize-none"
          />
          <div className="text-xs text-slate-600 mt-1 text-right">{content.length} / {FEEDBACK_LIMITS.content}</div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('feedback.fields.contact')}</label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={FEEDBACK_LIMITS.contact}
            placeholder={t('feedback.fields.contactPlaceholder')}
            className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('feedback.logs.title')}</label>
          <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3">
            <p className="text-xs text-slate-500 leading-relaxed mb-2">
              {t('feedback.logs.description')}
            </p>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-slate-500">{t('feedback.logs.range')}</span>
              <div className="flex gap-1">
                {LOG_TIME_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setLogMinutes(minutes)}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-xs font-medium transition-colors border',
                      logMinutes === minutes
                        ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                        : 'text-slate-400 border-slate-700/50 hover:text-slate-200'
                    )}
                  >
                    {t('feedback.logs.minutes', { count: minutes })}
                  </button>
                ))}
              </div>
            </div>
            {logData ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300">
                    {t('feedback.logs.collected', { count: logData.lineCount })}
                    {logData.truncated && t('feedback.logs.truncated')}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setLogPreview(!logPreview)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 text-xs hover:text-slate-200 transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      {logPreview ? t('feedback.logs.hide') : t('feedback.logs.view')}
                    </button>
                    <button
                      onClick={fetchLogs}
                      disabled={logLoading}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 text-xs hover:text-slate-200 transition-colors"
                    >
                      {t('feedback.logs.refetch')}
                    </button>
                    <button
                      onClick={() => setLogData(null)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 text-xs hover:text-rose-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      {t('feedback.logs.remove')}
                    </button>
                  </div>
                </div>
                {logPreview && (
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900/80 border border-slate-800 p-2 text-xs text-slate-400 whitespace-pre-wrap break-all">
                    {logData.content || t('feedback.logs.empty')}
                  </pre>
                )}
              </div>
            ) : (
              <button
                onClick={fetchLogs}
                disabled={logLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/20 text-xs font-medium hover:bg-violet-500/20 disabled:opacity-50 transition-colors"
              >
                {logLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {logLoading ? t('feedback.logs.fetching') : t('feedback.logs.fetch', { count: logMinutes })}
              </button>
            )}
          </div>
        </div>

        {resultMsg && (
          <div className={cn('text-sm', resultOk ? 'text-green-400' : 'text-rose-400')}>
            {resultMsg}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !content.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? t('feedback.submitting') : t('feedback.submit')}
        </button>
      </div>

      <div className="border-t border-slate-800/60 pt-6">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <History className="w-4 h-4" />
          {showHistory ? t('feedback.history.hide') : t('feedback.history.show')}
        </button>

        {showHistory && (
          <div className="mt-4 space-y-2">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('feedback.history.loading')}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-600">{t('feedback.history.empty')}</p>
            ) : (
              history.map((item) => (
                <div key={item.id} className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{item.title}</span>
                      {item.has_log && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/15 text-violet-300">{t('feedback.history.hasLog')}</span>
                      )}
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      FEEDBACK_STATUS_STYLES[item.status]
                    )}>
                      {t(FEEDBACK_STATUS_I18N_KEYS[item.status])}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-1">{item.content}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span>{t(FEEDBACK_CATEGORY_I18N_KEYS[item.category])}</span>
                    <span>·</span>
                    <span>{new Date(item.created_at).toLocaleString(i18n.resolvedLanguage ?? 'zh-CN')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Settings() {
  const { i18n } = useTranslation();
  const currentLocale: AppLocale = APP_LOCALES.includes(i18n.resolvedLanguage as AppLocale)
    ? (i18n.resolvedLanguage as AppLocale)
    : 'zh-CN';
  // 支持通过 URL query 深链定位 tab (例如 /settings?tab=radial),
  // 便于从分享导入成功页 / 通知栏等外部入口直接跳到具体设置分区。
  const [searchParams, setSearchParams] = useSearchParams();
  // 若目标 tab 在当前平台不可用(如 Windows 上的 'help'),回退到 'appearance'
  const resolveTab = (raw: string | null): TabId => {
    if (!isTabId(raw)) return 'appearance';
    if (raw === 'help' && !IS_MAC) return 'appearance';
    return raw;
  };
  const initialTab: TabId = resolveTab(searchParams.get('tab'));
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const isInternalChange = useRef(false);

  // URL query 变化 (浏览器前进/后退 / 外部再次深链) 时同步 tab
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const next = resolveTab(searchParams.get('tab'));
    if (next !== activeTab) {
      setActiveTab(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 侧栏点击切 tab 时,把 URL query 同步更新 (replace 不加历史条目,避免回退地狱)
  const changeTab = (id: TabId) => {
    isInternalChange.current = true;
    setActiveTab(id);
    const next = new URLSearchParams(searchParams);
    if (id === 'appearance') {
      next.delete('tab');
    } else {
      next.set('tab', id);
    }
    setSearchParams(next, { replace: true });
  };

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const prefs = useSettingsStore((s) => s.prefs);
  const togglePref = useSettingsStore((s) => s.togglePref);
  const [analyticsResetMsg, setAnalyticsResetMsg] = useState('');
  const scanSoftware = useSoftwareStore((s) => s.scanSoftware);
  const [version, setVersion] = useState('1.0.0');
  const [logAction, setLogAction] = useState<'open' | 'export' | null>(null);
  const [logMessage, setLogMessage] = useState('');

  useEffect(() => {
    window.softdesk?.getUpdaterStatus().then((s) => {
      if (s?.currentVersion) setVersion(s.currentVersion);
    }).catch(() => {});
  }, []);

  // 切换"智能分类"后立即重扫,使新的分类策略即时反映到全局软件列表
  const toggleSmartGrouping = () => {
    togglePref('smartGrouping');
    void scanSoftware();
  };

  const openStorage = () => {
    window.softdesk?.openUserData?.();
  };

  const openLogs = async () => {
    if (!window.softdesk) return;
    setLogAction('open');
    setLogMessage('');
    try {
      const result = await window.softdesk.openLogsDirectory();
      setLogMessage(result.success ? '已打开日志目录' : result.error ?? '打开日志目录失败');
    } catch {
      setLogMessage('打开日志目录失败');
    } finally {
      setLogAction(null);
    }
  };

  const exportLogs = async () => {
    if (!window.softdesk) return;
    setLogAction('export');
    setLogMessage('');
    try {
      const result = await window.softdesk.exportDiagnosticLogs();
      if (result.success) {
        setLogMessage('诊断日志已导出');
      } else if (!('canceled' in result && result.canceled)) {
        setLogMessage(('error' in result && result.error) || '导出诊断日志失败');
      }
    } catch {
      setLogMessage('导出诊断日志失败');
    } finally {
      setLogAction(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">设置</h1>
        <p className="text-sm text-slate-500 mt-1">管理 SoftDesk 的偏好设置与功能选项</p>
      </div>

      <div className="grid lg:grid-cols-[200px_1fr] gap-6">
        <nav className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-left transition-all',
                  activeTab === tab.id
                    ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.id === 'feedback' ? i18n.t('feedback.title') : tab.label}
              </button>
            );
          })}
        </nav>

        <main className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60">
          {activeTab === 'appearance' && (
            <div className="space-y-1 max-w-lg">
              <h2 className="text-base font-semibold text-slate-100 mb-1">外观</h2>
              <p className="text-sm text-slate-500 mb-6">自定义 SoftDesk 的视觉风格</p>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">主题</div>
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-800/40 rounded-xl w-fit">
                  {([
                    { id: 'light', label: '浅色' },
                    { id: 'dark', label: '深色' },
                    { id: 'system', label: '跟随系统' },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-xs font-medium transition-all border',
                        theme === t.id
                          ? 'bg-gradient-to-r from-violet-500/15 to-fuchsia-500/10 text-violet-300 border-violet-500/20'
                          : 'text-slate-400 border-transparent hover:text-slate-300'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{i18n.t('settings.language')}</div>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800/40 rounded-xl w-fit">
                  {APP_LOCALES.map((locale) => (
                    <button
                      key={locale}
                      onClick={() => void setAppLocale(locale)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-xs font-medium transition-all border',
                        currentLocale === locale
                          ? 'bg-gradient-to-r from-violet-500/15 to-fuchsia-500/10 text-violet-300 border-violet-500/20'
                          : 'text-slate-400 border-transparent hover:text-slate-300'
                      )}
                    >
                      {LOCALE_LABELS[locale]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 space-y-0 border-t border-slate-800/80">
                <Toggle
                  checked={prefs.startMinimized}
                  onChange={() => togglePref('startMinimized')}
                  label="启动时最小化"
                  description="软件启动后直接最小化至系统托盘"
                />
                <Toggle
                  checked={prefs.minimizeToTray}
                  onChange={() => togglePref('minimizeToTray')}
                  label="最小化到系统托盘"
                  description="关闭窗口时不退出程序，而是最小化到托盘"
                />
              </div>
            </div>
          )}

          {activeTab === 'radial' && (
            <div className="max-w-2xl">
              <RadialMenuSection />
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-0 max-w-lg border-t border-slate-800/80">
              <h2 className="text-base font-semibold text-slate-100 mb-1 pt-0">通知</h2>
              <p className="text-sm text-slate-500 mb-6">配置你希望接收的通知类型</p>
              <Toggle
                checked={prefs.launchNotifications}
                onChange={() => togglePref('launchNotifications')}
                label="启动通知"
                description="工作流启动完成后显示通知"
              />
              <Toggle
                checked={prefs.weeklyReport}
                onChange={() => togglePref('weeklyReport')}
                label="每周使用报告"
                description="每周一上午显示你的软件使用洞察报告"
              />
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-0 max-w-lg border-t border-slate-800/80">
              <h2 className="text-base font-semibold text-slate-100 mb-1 pt-0">数据与存储</h2>
              <p className="text-sm text-slate-500 mb-6">管理扫描设置与数据存储位置</p>
              <Toggle
                checked={prefs.scanOnStartup}
                onChange={() => togglePref('scanOnStartup')}
                label="启动时扫描"
                description="启动 SoftDesk 时自动扫描系统中的所有软件"
              />
              <Toggle
                checked={prefs.autoUpdates}
                onChange={() => togglePref('autoUpdates')}
                label="自动更新"
                description="在后台自动下载并安装更新"
              />
              <div className="p-4 rounded-xl bg-slate-800/40 mt-4">
                <div className="text-xs font-semibold text-slate-300 mb-1">本地存储</div>
                <div className="text-xs text-slate-500 leading-relaxed">软件使用记录与图标缓存存储在 SoftDesk 的应用数据目录中</div>
                <button
                  onClick={openStorage}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-slate-700/70 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
                >
                  打开存储位置
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/40 mt-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-300 mb-1">诊断与日志</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                      日志保存在本机并自动脱敏。导出内容包含系统信息和最近 30 分钟日志。
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => void openLogs()}
                    disabled={logAction !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/70 text-slate-300 text-xs font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {logAction === 'open' ? '正在打开…' : '打开日志目录'}
                  </button>
                  <button
                    onClick={() => void exportLogs()}
                    disabled={logAction !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/20 text-xs font-medium hover:bg-violet-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {logAction === 'export' ? '正在导出…' : '导出诊断日志'}
                  </button>
                </div>
                {logMessage && <div className="text-xs text-slate-400 mt-2">{logMessage}</div>}
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-0 max-w-lg border-t border-slate-800/80">
              <h2 className="text-base font-semibold text-slate-100 mb-1 pt-0">隐私安全</h2>
              <p className="text-sm text-slate-500 mb-6">数据隐私由你掌控，默认不上传</p>
              <Toggle
                checked={prefs.anonymizeData}
                onChange={() => togglePref('anonymizeData')}
                label="数据匿名化"
                description="在发送任何数据前，删除可识别的个人信息"
              />
              <Toggle
                checked={prefs.sendAnalytics}
                onChange={() => {
                  const next = !prefs.sendAnalytics;
                  if (next) {
                    useSettingsStore.getState().setPref('sendAnalytics', true);
                    giveAnalyticsConsent();
                  } else {
                    useSettingsStore.getState().setPref('sendAnalytics', false);
                    revokeAnalyticsConsent();
                  }
                }}
                label="使用数据统计"
                description="匿名的使用数据帮助我们改进产品"
              />
              <div className="pt-4 border-t border-slate-800/60">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-200">重置统计标识</div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      清除本地匿名标识，后续数据将以新的匿名身份上报。已上报的数据无法关联到你。
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      resetAnalyticsIdentity();
                      setAnalyticsResetMsg('统计标识已重置');
                      setTimeout(() => setAnalyticsResetMsg(''), 3000);
                    }}
                    disabled={!prefs.sendAnalytics}
                    className={cn(
                      'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      prefs.sendAnalytics
                        ? 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                        : 'bg-slate-800/30 text-slate-600 cursor-not-allowed'
                    )}
                  >
                    重置
                  </button>
                </div>
                {analyticsResetMsg && (
                  <div className="mt-3 text-xs text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {analyticsResetMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-0 max-w-2xl border-t border-slate-800/80">
              <h2 className="text-base font-semibold text-slate-100 mb-1 pt-0">AI 功能</h2>
              <p className="text-sm text-slate-500 mb-6">基于 AI 的智能建议与自动化</p>
              <div className="max-w-lg">
                <Toggle
                  checked={prefs.smartGrouping}
                  onChange={toggleSmartGrouping}
                  label="智能分类"
                  description="AI 自动将同类软件分组到合适的分类"
                />
                <Toggle
                  checked={prefs.aiSuggestions}
                  onChange={() => togglePref('aiSuggestions')}
                  label="工作流建议"
                  description="基于使用习惯，为你推荐常用的软件组合"
                />
              </div>
              <AiModelsSection />
            </div>
          )}

          {activeTab === 'help' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h2 className="text-base font-semibold text-slate-100 mb-1">帮助与常见问题</h2>
                <p className="text-sm text-slate-500">遇到问题？这里是常见情况的解决办法</p>
              </div>

              <div className="rounded-2xl bg-slate-800/40 border border-slate-800 overflow-hidden">
                <div className="flex items-start gap-3 p-4 border-b border-slate-800/80">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-200">
                      移到废纸篓时提示「没有访问许可 / 没有权限」
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      这是 macOS 的安全限制：系统默认不允许 SoftDesk 删除其他应用。授予一次权限后即可正常使用，属于一次性设置。
                    </p>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <FolderCog className="w-4 h-4 text-violet-400" />
                      <h4 className="text-sm font-medium text-slate-200">解决步骤</h4>
                    </div>
                    <ol className="space-y-2 text-xs text-slate-400 leading-relaxed list-none">
                      {[
                        '打开「系统设置」→「隐私与安全性」。',
                        '找到并进入「App 管理」（App Management）。',
                        '在列表中打开 SoftDesk 的开关；若没有 SoftDesk，点「+」手动添加。',
                        '如果仍失败，改为开启「完全磁盘访问权限」（Full Disk Access）中的 SoftDesk。',
                        '完全退出并重新启动 SoftDesk，再次尝试移到废纸篓。',
                      ].map((step, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-violet-500/15 text-violet-300 flex items-center justify-center shrink-0 text-[11px] font-semibold tabular-nums">
                            {i + 1}
                          </span>
                          <span className="pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      💡 <span className="text-slate-300">替代方案</span>
                      ：你也可以直接在「访达 / 启动台」中手动把目标应用拖入废纸篓，效果相同。开发调试模式下权限申请对象为 Electron，建议在打包后的正式版中授权。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'feedback' && <FeedbackTab />}

          {activeTab === 'about' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h2 className="text-base font-semibold text-slate-100 mb-1">关于 SoftDesk</h2>
                <p className="text-sm text-slate-500">本地软件管理与智能启动工具</p>
              </div>

              <div className="rounded-2xl bg-slate-800/40 border border-slate-800 overflow-hidden">
                <div className="flex items-start gap-3 p-4 border-b border-slate-800/80">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
                    <Info className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-200">版本信息</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      当前版本 <span className="text-slate-300 tabular-nums font-medium">v{version}</span>
                    </p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    SoftDesk 是一款轻量的本地软件管理工具，帮助你快速启动、分类和管理系统中的所有应用，支持工作流、径向菜单和 AI 智能分类。
                  </p>
                </div>
              </div>

              <UpdateSection />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
