import { ArrowUpRight, Clock, Sparkles, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import { formatMinutes, formatTimeAgo } from '@/services/software.service';
import { SoftwareCard } from '@/components/features/SoftwareCard';
import { AppIcon } from '@/components/features/AppIcon';
import { cn } from '@/lib/utils';

function StatCard({
  icon: Icon,
  title,
  value,
  hint,
  color,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  hint: string;
  color: string;
}) {
  return (
    <div className="relative p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 overflow-hidden group hover:border-slate-700/80 transition-all duration-300">
      <div
        className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ backgroundColor: color }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
            <Icon className="w-3.5 h-3.5" />
            {title}
          </div>
          <div className="mt-2.5 text-3xl font-bold text-white tracking-tight">{value}</div>
          <div className="text-xs text-slate-500 mt-1">{hint}</div>
        </div>
        <ArrowUpRight className="w-4 h-4 text-slate-700 group-hover:text-slate-500 transition-colors" />
      </div>
    </div>
  );
}

export function Dashboard() {
  const software = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);

  const topApps = [...software].sort((a, b) => b.usageMinutes - a.usageMinutes).slice(0, 5);
  const recentApps = [...software]
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
    .slice(0, 6);

  const totalMinutes = software.reduce((sum, s) => sum + s.usageMinutes, 0);
  const perDay = Math.round(totalMinutes / 7);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 12) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  })();

  // 基于真实使用时长的 top 应用生成工作流建议,数据不足时不展示伪建议
  const suggestionApps = topApps.filter((s) => s.usageMinutes > 0).slice(0, 3);
  const suggestionText =
    suggestionApps.length >= 2
      ? `${suggestionApps.map((s) => s.name).join('、')} 是你使用最频繁的应用，建议创建组合工作流一键启动。`
      : null;

  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {greeting}，欢迎回来 <span className="inline-block">👋</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">这是你的软件使用概览</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-medium">AI 分析已更新</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingUp}
          title="总应用数"
          value={String(software.length)}
          hint="个已安装应用"
          color="#8b5cf6"
        />
        <StatCard
          icon={Clock}
          title="本周使用时长"
          value={`${(totalMinutes / 60).toFixed(1)}h`}
          hint={`${perDay} 分钟 / 天`}
          color="#06b6d4"
        />
        <StatCard
          icon={Sparkles}
          title="智能工作流"
          value={String(workflows.length)}
          hint={`已使用 ${workflows.reduce((s, w) => s + w.usageCount, 0)} 次`}
          color="#f59e0b"
        />
        <StatCard
          icon={ArrowUpRight}
          title="最近活跃"
          value={`${
            software.length === 0
              ? 0
              : Math.round(
                  (software.filter(
                    (s) => new Date(s.lastUsed).getTime() > Date.now() - 3 * 24 * 60 * 60 * 1000
                  ).length /
                    software.length) *
                    100
                )
          }%`}
          hint="3 天内使用过"
          color="#10b981"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">常用软件</h2>
              <div className="text-xs text-slate-500">按使用时长排序</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {topApps.map((sw) => (
                <SoftwareCard key={sw.id} software={sw} />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">最近使用</h2>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
              <div className="space-y-2">
                {recentApps.map((sw, idx) => {
                  const inactive = !!sw.uninstalled || !!sw.deleted;
                  const statusLabel = sw.deleted ? '已从本地电脑删除' : '已弃用';
                  return (
                  <div
                    key={sw.id}
                    className={cn(
                      'flex items-center gap-3 py-2 first:pt-0 last:pb-0 border-b border-slate-800/40 last:border-b-0 transition-all',
                      inactive
                        ? 'grayscale opacity-50 cursor-default'
                        : 'cursor-pointer hover:pl-2'
                    )}
                    onClick={() => {
                      if (!inactive) useSoftwareStore.getState().launchSoftware(sw.id);
                    }}
                  >
                    <div className="w-6 text-xs text-slate-600 tabular-nums">{String(idx + 1).padStart(2, '0')}</div>
                    <AppIcon software={sw} size={32} rounded="rounded-lg" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate">
                        {sw.name}
                        {inactive && (
                          <span className="ml-2 text-xs font-medium text-slate-500">{statusLabel}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatMinutes(sw.usageMinutes)} · {formatTimeAgo(sw.lastUsed)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {totalMinutes === 0 ? 0 : Math.round((sw.usageMinutes / totalMinutes) * 100)}%
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-slate-200 mb-4">分类概览</h2>
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 space-y-3">
              {CATEGORIES.slice(0, 6).map((cat) => {
                const count = software.filter((s) => s.category === cat.id).length;
                const usage = software
                  .filter((s) => s.category === cat.id)
                  .reduce((sum, s) => sum + s.usageMinutes, 0);
                const percent = totalMinutes === 0 ? 0 : Math.round((usage / totalMinutes) * 100);
                if (count === 0) return null;
                return (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-400">{cat.name}</span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {percent}% · {count} 个
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, percent)}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-200 mb-4">AI 建议</h2>
            {suggestionText ? (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 via-slate-900/40 to-amber-500/5 border border-violet-500/20">
                <div className="flex items-start gap-2.5 mb-3">
                  <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">优化你的工作流</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{suggestionText}</p>
                  </div>
                </div>
                <Link
                  to="/workflows"
                  className="block w-full py-2.5 rounded-xl bg-violet-500/15 text-violet-300 text-xs font-medium hover:bg-violet-500/25 transition-colors text-center"
                >
                  创建工作流 +
                </Link>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60">
                <div className="text-xs text-slate-400 leading-relaxed">
                  💡 <span className="text-slate-300">提示</span>
                  ：继续使用应用，积累足够的使用数据后，这里会基于你的真实习惯给出工作流建议。
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
