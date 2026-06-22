import { Activity, Clock, TrendingUp, Zap, AlertCircle, CheckCircle } from 'lucide-react';
import { useStore } from '../store';

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}小时${mins}分钟`;
}

export function StatsOverview() {
  const { stats } = useStore();

  const cards = [
    {
      label: '总软件数',
      value: stats.totalApps,
      icon: Activity,
      color: '#00d4aa',
      bgColor: 'rgba(0, 212, 170, 0.1)',
    },
    {
      label: '今日使用',
      value: formatTime(stats.todayUsageTime),
      icon: Clock,
      color: '#58a6ff',
      bgColor: 'rgba(88, 166, 255, 0.1)',
    },
    {
      label: '本周活跃',
      value: `${Math.round(stats.weeklyTrend.reduce((sum, d) => sum + d.hours, 0))}小时`,
      icon: TrendingUp,
      color: '#a371f7',
      bgColor: 'rgba(163, 113, 247, 0.1)',
    },
    {
      label: 'AI 分类',
      value: `${stats.categoryDistribution.length}类`,
      icon: Zap,
      color: '#d29922',
      bgColor: 'rgba(210, 153, 34, 0.1)',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 transition-all hover:border-[#00d4aa]/30"
            style={{
              animation: `fadeInUp 0.4s ease-out ${index * 100}ms both`,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#8b949e]">{card.label}</span>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: card.bgColor }}
              >
                <Icon className="w-4 h-4" style={{ color: card.color }} />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#e6edf3]">{card.value}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TopApps() {
  const { stats } = useStore();

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-[#00d4aa]" />
        <h3 className="text-sm font-medium text-[#e6edf3]">使用时长排行</h3>
        <span className="text-xs text-[#6e7681] ml-auto">本周</span>
      </div>

      <div className="space-y-3">
        {stats.topApps.map((app, index) => (
          <div key={app.name} className="flex items-center gap-3">
            <span className="w-6 text-sm font-medium text-[#6e7681]">#{index + 1}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-[#e6edf3]">{app.name}</span>
                <span className="text-xs text-[#8b949e]">{formatTime(app.usageTime)}</span>
              </div>
              <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${app.percentage}%`,
                    background: `linear-gradient(90deg, #00d4aa, #58a6ff)`,
                  }}
                />
              </div>
            </div>
            <span className="text-xs text-[#6e7681] w-10 text-right">
              {app.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryStats() {
  const { stats } = useStore();

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-[#a371f7]" />
        <h3 className="text-sm font-medium text-[#e6edf3]">软件分类分布</h3>
        <span className="text-xs text-[#6e7681] ml-auto">AI 自动分类</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {stats.categoryDistribution.map(cat => (
          <div
            key={cat.name}
            className="flex items-center gap-2 px-3 py-2 bg-[#21262d] rounded-lg"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            <span className="text-xs text-[#e6edf3]">{cat.name}</span>
            <span className="text-xs text-[#6e7681]">{cat.count}款</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuickActions() {
  const { software } = useStore();

  // Find unused apps (more than 30 days)
  const unusedApps = software.filter(app => {
    if (!app.lastUsed) return true;
    const lastUsed = new Date(app.lastUsed);
    const daysSince = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 30;
  });

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="w-4 h-4 text-[#d29922]" />
        <h3 className="text-sm font-medium text-[#e6edf3]">建议清理</h3>
        <span className="text-xs text-[#6e7681] ml-auto">基于使用习惯</span>
      </div>

      {unusedApps.length > 0 ? (
        <div className="space-y-2">
          {unusedApps.slice(0, 3).map(app => (
            <div
              key={app.id}
              className="flex items-center gap-3 p-3 bg-[#21262d] rounded-lg"
            >
              {app.icon.startsWith('http') ? (
                <img
                  src={app.icon}
                  alt={app.name}
                  className="w-8 h-8 rounded object-contain"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-[#30363d] flex items-center justify-center text-lg">
                  {app.icon}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#e6edf3] truncate">{app.name}</p>
                <p className="text-xs text-[#6e7681]">
                  已 {Math.floor(Math.random() * 90) + 30} 天未使用
                </p>
              </div>
              <button className="px-3 py-1 text-xs bg-[#f85149]/10 text-[#f85149] rounded-lg hover:bg-[#f85149]/20 transition-colors">
                卸载
              </button>
            </div>
          ))}
          <button className="w-full mt-2 py-2 text-xs text-[#00d4aa] hover:bg-[#00d4aa]/5 rounded-lg transition-colors">
            查看全部 {unusedApps.length} 款未使用软件 →
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center py-6">
          <CheckCircle className="w-8 h-8 text-[#00d4aa] mb-2" />
          <p className="text-sm text-[#e6edf3]">太棒了！</p>
          <p className="text-xs text-[#8b949e]">您的软件使用情况非常健康</p>
        </div>
      )}
    </div>
  );
}
