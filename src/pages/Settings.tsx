import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Monitor, Bell, Database, Shield, Sparkles, LifeBuoy, Trash2, FolderCog, CircleDot, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings.store';
import { useSoftwareStore } from '@/stores/software.store';
import { AiModelsSection } from '@/components/features/AiModelsSection';
import { RadialMenuSection } from '@/components/features/RadialMenuSection';
import { UpdateSection } from '@/components/features/UpdateSection';

type TabId = 'appearance' | 'notifications' | 'radial' | 'data' | 'privacy' | 'ai' | 'help' | 'about';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

const TAB_IDS: readonly TabId[] = [
  'appearance',
  'notifications',
  'radial',
  'data',
  'privacy',
  'ai',
  'help',
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

export function Settings() {
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

  // URL query 变化 (浏览器前进/后退 / 外部再次深链) 时同步 tab
  useEffect(() => {
    const next = resolveTab(searchParams.get('tab'));
    if (next !== activeTab) {
      setActiveTab(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 侧栏点击切 tab 时,把 URL query 同步更新 (replace 不加历史条目,避免回退地狱)
  const changeTab = (id: TabId) => {
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
  const scanSoftware = useSoftwareStore((s) => s.scanSoftware);
  const [version, setVersion] = useState('1.0.0');

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
                {tab.label}
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
                onChange={() => togglePref('sendAnalytics')}
                label="使用数据统计"
                description="匿名的使用数据帮助我们改进产品"
              />
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
