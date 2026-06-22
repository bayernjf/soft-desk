import {
  LayoutDashboard,
  AppWindow,
  Code,
  Palette,
  FileText,
  MessageCircle,
  Settings,
  BarChart3,
  Trash2,
  Sparkles,
  Globe,
  Play,
} from 'lucide-react';
import { useStore } from '../store';

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Code,
  Palette,
  FileText,
  MessageCircle,
  Settings,
  Globe,
  Play,
};

const navItems = [
  { id: 'dashboard', label: '工作台', icon: LayoutDashboard },
  { id: 'all', label: '全部软件', icon: AppWindow },
];

const categoryItems = [
  { id: 'dev', name: '开发工具', icon: 'Code', color: '#00d4aa', count: 12 },
  { id: 'design', name: '设计软件', icon: 'Palette', color: '#a371f7', count: 8 },
  { id: 'office', name: '办公套件', icon: 'FileText', color: '#58a6ff', count: 6 },
  { id: 'social', name: '通讯应用', icon: 'MessageCircle', color: '#d29922', count: 5 },
  { id: 'system', name: '系统工具', icon: 'Settings', color: '#8b949e', count: 10 },
  { id: 'browser', name: '浏览器', icon: 'Globe', color: '#f85149', count: 3 },
  { id: 'media', name: '影音娱乐', icon: 'Play', color: '#a371f7', count: 4 },
];

const utilityItems = [
  { id: 'statistics', label: '统计报告', icon: BarChart3 },
  { id: 'uninstall', label: '卸载管理', icon: Trash2 },
];

export function Sidebar() {
  const { currentPage, setCurrentPage, selectedCategory, setSelectedCategory } = useStore();

  return (
    <aside className="w-56 bg-[#161b22] border-r border-[#30363d] flex flex-col h-screen">
      {/* Logo */}
      <div className="p-4 border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4aa] to-[#58a6ff] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#0d1117]" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#00d4aa]">SoftDesk</h1>
            <p className="text-xs text-[#8b949e]">智能软件工作台</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-6 overflow-y-auto">
        {/* Main Nav */}
        <div className="space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id && !selectedCategory;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-[#00d4aa]/10 text-[#00d4aa] border-l-2 border-[#00d4aa]'
                    : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Categories */}
        <div>
          <h3 className="px-3 text-xs font-semibold text-[#6e7681] uppercase tracking-wider mb-2">
            分类
          </h3>
          <div className="space-y-1">
            {categoryItems.map(category => {
              const IconComponent = iconMap[category.icon];
              const isActive = selectedCategory === category.name;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group ${
                    isActive
                      ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
                      : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]'
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center"
                    style={{ backgroundColor: `${category.color}20` }}
                  >
                    {IconComponent && <IconComponent className="w-3 h-3" style={{ color: category.color }} />}
                  </div>
                  <span className="flex-1 text-left">{category.name}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-[#00d4aa]/20' : 'bg-[#21262d]'
                    }`}
                  >
                    {category.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Utilities */}
        <div className="space-y-1">
          {utilityItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
                    : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Settings */}
      <div className="p-3 border-t border-[#30363d]">
        <button
          onClick={() => setCurrentPage('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
            currentPage === 'settings'
              ? 'bg-[#00d4aa]/10 text-[#00d4aa]'
              : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]'
          }`}
        >
          <Settings className="w-4 h-4" />
          设置
        </button>
      </div>
    </aside>
  );
}
