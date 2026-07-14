import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Library,
  Star,
  Workflow,
  BarChart3,
  Trash2,
  Settings,
  Sparkles,
  ChevronRight,
  ChevronDown,
  UserRound,
  Sun,
  Moon,
  Monitor,
  Share2,
  CircleDot,
} from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore, type ThemeMode } from '@/stores/settings.store';
import { CATEGORIES } from '@/data/categories';
import { cn } from '@/lib/utils';
import { getAvatarSvg } from '@/lib/avatars';

const COLLAPSED_CATEGORY_COUNT = 5;

const THEME_OPTIONS: { id: ThemeMode; icon: typeof Sun; label: string }[] = [
  { id: 'light', icon: Sun, label: '浅色' },
  { id: 'dark', icon: Moon, label: '深色' },
  { id: 'system', icon: Monitor, label: '跟随系统' },
];

interface NavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  /** 自定义激活匹配。默认按 pathname 严格相等匹配;
   * 对于 `/settings?tab=radial` 这种带 query 的深链项,需要单独判断 pathname+query。*/
  match?: (pathname: string, tab: string | null) => boolean;
}

const navItems: NavItem[] = [
  { path: '/', icon: LayoutDashboard, label: '工作台' },
  { path: '/library', icon: Library, label: '软件库' },
  { path: '/favorites', icon: Star, label: '收藏夹' },
  { path: '/workflows', icon: Workflow, label: '工作流' },
  {
    path: '/settings?tab=radial',
    icon: CircleDot,
    label: '径向菜单',
    // 用户当前正处于"设置 > 径向菜单"tab 时才高亮
    match: (pathname, tab) => pathname === '/settings' && tab === 'radial',
  },
  { path: '/my-shares', icon: Share2, label: '我的分享' },
  { path: '/statistics', icon: BarChart3, label: '统计分析' },
  { path: '/uninstall', icon: Trash2, label: '软件清理' },
];

export function Sidebar() {
  const software = useSoftwareStore((s) => s.software);
  const favoriteIds = useSoftwareStore((s) => s.favoriteIds);
  const selectedCategory = useSoftwareStore((s) => s.selectedCategory);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const profile = useAuthStore((s) => s.profile);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get('tab');
  const inLibrary = location.pathname === '/library';
  const [showAllCategories, setShowAllCategories] = useState(false);

  const visibleCategories = CATEGORIES.map((cat) => ({
    ...cat,
    count: software.filter((s) => s.category === cat.id).length,
  })).filter((cat) => cat.count > 0);

  const hasMoreCategories = visibleCategories.length > COLLAPSED_CATEGORY_COUNT;
  const displayedCategories =
    showAllCategories || !hasMoreCategories
      ? visibleCategories
      : visibleCategories.slice(0, COLLAPSED_CATEGORY_COUNT);

  return (
    <aside className="w-72 shrink-0 h-screen border-r border-slate-800/60 bg-[#0d0d14]/95 backdrop-blur-sm flex flex-col">
      <div className="p-5 pt-9">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src="/app-logo.svg" alt="SoftDesk" className="w-10 h-10 rounded-xl shadow-lg shadow-violet-500/20" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0d0d14]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-white tracking-tight">SoftDesk</h1>
            <p className="text-xs text-slate-500">AI 智能软件工作台</p>
          </div>
          <Sparkles className="w-4 h-4 text-amber-400" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            // 优先使用 match 自定义匹配 (径向菜单深链需要看 tab query),
            // 否则按 pathname 严格相等。同时对无 match 的 /settings 项要排除
            // 被径向菜单占用的情况,避免两个菜单同时高亮。
            const isActive = item.match
              ? item.match(location.pathname, currentTab)
              : location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                  'hover:bg-slate-800/60 hover:text-white',
                  isActive
                    ? 'bg-gradient-to-r from-violet-500/15 to-fuchsia-500/10 text-white border border-violet-500/20'
                    : 'text-slate-400 border border-transparent'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 transition-transform duration-200',
                    isActive ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300'
                  )}
                />
                <span className="flex-1">{item.label}</span>
                {item.path === '/favorites' && favoriteIds.length > 0 && (
                  <span className="text-[10px] text-slate-500 tabular-nums">{favoriteIds.length}</span>
                )}
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-violet-400" />}
              </NavLink>
            );
          })}
        </div>

        <div>
          <div className="px-3.5 mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">分类</h3>
            <span className="text-[10px] text-slate-600">{software.length} 个软件</span>
          </div>

          <div className="space-y-0.5">
            {displayedCategories.map((cat) => {
              const count = cat.count;
              const isSelected = inLibrary && selectedCategory === cat.id;
              return (
                <NavLink
                  key={cat.id}
                  to="/library"
                  onClick={() => useSoftwareStore.getState().setSelectedCategory(cat.id)}
                  className={cn(
                    'relative flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm transition-all duration-200',
                    isSelected
                      ? 'text-white font-medium'
                      : 'text-slate-500 hover:bg-slate-800/40 hover:text-slate-200'
                  )}
                  style={
                    isSelected
                      ? { backgroundColor: cat.color + '1f', boxShadow: `inset 0 0 0 1px ${cat.color}33` }
                      : undefined
                  }
                >
                  {isSelected && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-1 rounded-r-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all duration-200',
                      isSelected && 'scale-150'
                    )}
                    style={{
                      backgroundColor: cat.color,
                      boxShadow: isSelected ? `0 0 8px ${cat.color}` : undefined,
                    }}
                  />
                  <span className="flex-1 truncate">{cat.name}</span>
                  <span
                    className={cn(
                      'text-xs tabular-nums transition-colors',
                      isSelected ? 'text-slate-200' : 'text-slate-600'
                    )}
                  >
                    {count}
                  </span>
                </NavLink>
              );
            })}

            {hasMoreCategories && (
              <button
                type="button"
                onClick={() => setShowAllCategories((v) => !v)}
                aria-expanded={showAllCategories}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-800/40 hover:text-slate-200 transition-all duration-200"
              >
                <ChevronDown
                  className={cn(
                    'w-4 h-4 transition-transform duration-200',
                    showAllCategories && 'rotate-180'
                  )}
                />
                <span className="flex-1 text-left">
                  {showAllCategories
                    ? '收起'
                    : `展开更多（${visibleCategories.length - COLLAPSED_CATEGORY_COUNT}）`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-slate-800/60 space-y-1">
        <div className="flex items-center gap-1 px-2 py-1.5 mb-1 rounded-xl bg-slate-800/40">
          {THEME_OPTIONS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              title={label}
              aria-label={label}
              aria-pressed={theme === id}
              className={cn(
                'flex flex-1 items-center justify-center py-1.5 rounded-lg transition-all duration-200',
                theme === id
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <NavLink
          to="/account"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-slate-800/60 text-white'
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
            )
          }
        >
          {loggedIn && profile ? (
            <div className="w-4 h-4" dangerouslySetInnerHTML={{ __html: getAvatarSvg(profile.avatar) }} />
          ) : (
            <UserRound className="w-4 h-4" />
          )}
          <span className="flex-1 truncate">
            {loggedIn && profile ? profile.nickname : '登录账号'}
          </span>
          {loggedIn && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-label="已登录" />
          )}
        </NavLink>
        <NavLink
          to="/settings"
          end
          className={({ isActive }) => {
            // 当前在"设置 > 径向菜单"时,让上方的"径向菜单"菜单项高亮,
            // 而这里的"设置"入口保持未激活样式,避免两处同时高亮。
            const active = isActive && currentTab !== 'radial';
            return cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              active
                ? 'bg-slate-800/60 text-white'
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
            );
          }}
        >
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </NavLink>
      </div>
    </aside>
  );
}
