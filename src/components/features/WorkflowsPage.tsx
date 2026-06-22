import { useMemo } from 'react';
import { Star, Clock, Play } from 'lucide-react';
import type { Workflow } from '@/types';
import { useSoftwareStore } from '@/stores/software.store';
import { CATEGORIES } from '@/data/categories';
import { formatTimeAgo } from '@/services/software.service';
import { cn } from '@/lib/utils';

interface WorkflowCardProps {
  workflow: Workflow;
}

function WorkflowCard({ workflow }: WorkflowCardProps) {
  const { software, launchWorkflow, toggleWorkflowFavorite } = useSoftwareStore();
  const workflowSoftware = workflow.softwareIds
    .map((id) => software.find((s) => s.id === id))
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div
      className={cn(
        'relative p-5 rounded-2xl transition-all duration-300 overflow-hidden group',
        'bg-slate-900/40 border border-slate-800/60 hover:border-slate-700/80'
      )}
    >
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${workflow.color}15 0%, transparent 60%)`,
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">{workflow.name}</h3>
              <button
                onClick={() => toggleWorkflowFavorite(workflow.id)}
                className="text-amber-400 opacity-80 hover:opacity-100 transition-opacity"
              >
                <Star className={cn('w-3.5 h-3.5', workflow.isFavorite && 'fill-amber-400')} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">{workflow.description}</p>
          </div>
          <button
            onClick={() => launchWorkflow(workflow.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5',
              'bg-white text-slate-900 hover:bg-slate-100 shadow-lg shadow-slate-900/20',
              'active:scale-95'
            )}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            启动
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center -space-x-2">
            {workflowSoftware.map((sw) =>
              sw ? (
                <div
                  key={sw.id}
                  className="w-9 h-9 rounded-xl border-2 border-slate-900 flex items-center justify-center text-xs font-semibold"
                  style={{ backgroundColor: sw.color + '30', color: sw.color }}
                  title={sw.name}
                >
                  {sw.name.slice(0, 2)}
                </div>
              ) : null
            )}
            {workflowSoftware.length > 0 && (
              <div className="pl-3 ml-3 text-xs text-slate-500 border-l border-slate-700/80">
                {workflow.softwareIds.length} 个应用
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            {formatTimeAgo(workflow.lastUsed)} · {workflow.usageCount} 次使用
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowsPage() {
  const { workflows } = useSoftwareStore();
  const favorite = workflows.filter((w) => w.isFavorite);
  const rest = workflows.filter((w) => !w.isFavorite);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">工作流</h1>
          <p className="text-sm text-slate-500 mt-1">一键启动你的高效工作组合</p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-violet-500/20 text-violet-300 text-sm font-medium border border-violet-500/30 hover:bg-violet-500/30 transition-colors">
          + 创建工作流
        </button>
      </div>

      {favorite.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            ★ 收藏
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {favorite.map((w) => (
              <WorkflowCard key={w.id} workflow={w} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          全部工作流
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {rest.map((w) => (
            <WorkflowCard key={w.id} workflow={w} />
          ))}
        </div>
      </div>
    </div>
  );
}
