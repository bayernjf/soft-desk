import { useState } from 'react';
import { Monitor, Bell, Database, Shield, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabId = 'appearance' | 'notifications' | 'data' | 'privacy' | 'ai';

const tabs = [
  { id: 'appearance' as TabId, icon: Monitor, label: '外观' },
  { id: 'notifications' as TabId, icon: Bell, label: '通知' },
  { id: 'data' as TabId, icon: Database, label: '数据与存储' },
  { id: 'privacy' as TabId, icon: Shield, label: '隐私安全' },
  { id: 'ai' as TabId, icon: Sparkles, label: 'AI 功能' },
];

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
  const [activeTab, setActiveTab] = useState<TabId>('appearance');
  const [theme, setTheme] = useState('dark');
  const [prefs, setPrefs] = useState({
    startMinimized: false,
    minimizeToTray: true,
    autoUpdates: true,
    launchNotifications: true,
    weeklyReport: true,
    smartGrouping: true,
    aiSuggestions: true,
    sendAnalytics: false,
    anonymizeData: true,
    scanOnStartup: true,
  });

  const togglePref = (key: keyof typeof prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

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
                onClick={() => setActiveTab(tab.id)}
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
                  {[
                    { id: 'light', label: '浅色' },
                    { id: 'dark', label: '深色' },
                    { id: 'system', label: '跟随系统' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-xs font-medium transition-all',
                        theme === t.id ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
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
                <div className="text-xs text-slate-500 font-mono">~/Library/Application Support/SoftDesk</div>
                <button className="mt-3 px-3 py-1.5 rounded-lg bg-slate-700/70 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors">
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
            <div className="space-y-0 max-w-lg border-t border-slate-800/80">
              <h2 className="text-base font-semibold text-slate-100 mb-1 pt-0">AI 功能</h2>
              <p className="text-sm text-slate-500 mb-6">基于 AI 的智能建议与自动化</p>
              <Toggle
                checked={prefs.smartGrouping}
                onChange={() => togglePref('smartGrouping')}
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
          )}
        </main>
      </div>
    </div>
  );
}
