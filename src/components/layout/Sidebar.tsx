import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Library,
  Workflow,
  BarChart3,
  Trash2,
  Settings,
  FolderOpenDot,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: '工作台' },
  { path: '/library', icon: Library, label: '软件库' },
  { path: '/workflows', icon: Workflow, label: '工作流' },
  { path: '/statistics', icon: BarChart3, label: '统计分析' },
  { path: '/uninstall', icon: Trash2, label: '软件清理' },
];

export function Sidebar() {
  const { software } = useSoftwareStore();
  const location = useLocation();

  return (
    <aside className="w-72 shrink-0 h-screen border-r border-slate-800/60 bg-[#0d0d14]/95 backdrop-blur-sm flex flex-col">
      <div className="p-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <FolderOpenDot className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
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
            const isActive = location.pathname === item.path;
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
            {CATEGORIES.slice(0, 5).map((cat) => {
              const count = software.filter((s) => s.category === cat.id).length;
              if (count === 0) return null;
              return (
                <NavLink
                  key={cat.id}
                  to="/library"
                  onClick={() => useSoftwareStore.getState().setSelectedCategory(cat.id)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm transition-all duration-200',
                      'hover:bg-slate-800/40 hover:text-slate-200 text-slate-500',
                      isActive && 'text-slate-300'
                    )
                  }
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="flex-1 truncate">{cat.name}</span>
                  <span className="text-xs text-slate-600 tabular-nums">{count}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-slate-800/60">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-slate-800/60 text-white'
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
            )
          }
        >
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </NavLink>
      </div>
    </aside>
  );
}
