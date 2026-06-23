import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Star, Clock, Play, Loader2, Check, AlertCircle, Pencil, Trash2, Plus } from 'lucide-react';
import type { Workflow } from '@/types';
import { useSoftwareStore } from '@/stores/software.store';
import { formatTimeAgo } from '@/services/software.service';
import { cn } from '@/lib/utils';
import { WorkflowEditorModal } from './WorkflowEditorModal';
import { AppIcon } from './AppIcon';

interface WorkflowCardProps {
  workflow: Workflow;
  onEdit: (workflow: Workflow) => void;
}

type LaunchPhase =
  | { status: 'idle' }
  | { status: 'launching' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

const WorkflowCard = memo(function WorkflowCard({ workflow, onEdit }: WorkflowCardProps) {
  const software = useSoftwareStore((s) => s.software);
  const launchWorkflow = useSoftwareStore((s) => s.launchWorkflow);
  const toggleWorkflowFavorite = useSoftwareStore((s) => s.toggleWorkflowFavorite);
  const deleteWorkflow = useSoftwareStore((s) => s.deleteWorkflow);
  const [phase, setPhase] = useState<LaunchPhase>({ status: 'idle' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const workflowSoftware = workflow.softwareIds
    .map((id) => software.find((s) => s.id === id))
    .filter(Boolean)
    .slice(0, 4);

  const handleLaunch = async () => {
    if (phase.status === 'launching') return;
    setPhase({ status: 'launching' });
    const result = await launchWorkflow(workflow.id);

    if (!result.isElectron) {
      setPhase({ status: 'error', message: result.error ?? '当前环境无法启动' });
    } else if (result.failed > 0) {
      setPhase({
        status: 'error',
        message: `${result.launched}/${result.total} 已启动，${result.failed} 个失败`,
      });
    } else {
      const missingNote = result.missing > 0 ? `（${result.missing} 个软件缺失）` : '';
      setPhase({
        status: 'success',
        message: `已启动 ${result.launched} 个应用${missingNote}`,
      });
    }

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setPhase({ status: 'idle' }), 3000);
  };

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
                aria-label={workflow.isFavorite ? '取消收藏' : '收藏'}
                aria-pressed={workflow.isFavorite}
                className="text-amber-400 opacity-80 hover:opacity-100 transition-opacity"
              >
                <Star className={cn('w-3.5 h-3.5', workflow.isFavorite && 'fill-amber-400')} />
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(workflow)}
                  title="编辑"
                  aria-label="编辑工作流"
                  className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  title="删除"
                  aria-label="删除工作流"
                  className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800/60 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">{workflow.description}</p>
          </div>
          <button
            onClick={handleLaunch}
            disabled={phase.status === 'launching'}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5',
              'bg-white text-slate-900 hover:bg-slate-100 shadow-lg shadow-slate-900/20',
              'active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100'
            )}
          >
            {phase.status === 'launching' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                启动中
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                启动
              </>
            )}
          </button>
        </div>

        {confirmDelete && (
          <div className="flex items-center justify-between gap-3 mb-3 text-xs rounded-lg px-3 py-2 bg-rose-500/10 text-rose-300">
            <span>确定删除「{workflow.name}」？</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => deleteWorkflow(workflow.id)}
                className="px-2 py-1 rounded-md bg-rose-500 text-white hover:bg-rose-600 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        )}

        {(phase.status === 'success' || phase.status === 'error') && (
          <div
            className={cn(
              'flex items-center gap-1.5 mb-3 text-xs rounded-lg px-2.5 py-1.5',
              phase.status === 'success'
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-rose-500/10 text-rose-300'
            )}
          >
            {phase.status === 'success' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            {phase.message}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center -space-x-2">
            {workflowSoftware.map((sw) =>
              sw ? (
                <div
                  key={sw.id}
                  className={cn(
                    'rounded-xl border-2 border-slate-900',
                    (sw.uninstalled || sw.deleted) && 'grayscale opacity-50'
                  )}
                  title={
                    sw.deleted
                      ? `${sw.name}（已从本地电脑删除）`
                      : sw.uninstalled
                        ? `${sw.name}（已弃用）`
                        : sw.name
                  }
                >
                  <AppIcon software={sw} size={36} rounded="rounded-[10px]" />
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
});

export function WorkflowsPage() {
  const workflows = useSoftwareStore((s) => s.workflows);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const favorite = workflows.filter((w) => w.isFavorite);
  const rest = workflows.filter((w) => !w.isFavorite);

  const openCreate = () => {
    setEditingWorkflow(null);
    setEditorOpen(true);
  };

  const openEdit = useCallback((workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setEditorOpen(true);
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">工作流</h1>
          <p className="text-sm text-slate-500 mt-1">一键启动你的高效工作组合</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-violet-500/20 text-violet-300 text-sm font-medium border border-violet-500/30 hover:bg-violet-500/30 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          创建工作流
        </button>
      </div>

      {favorite.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            ★ 收藏
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {favorite.map((w) => (
              <WorkflowCard key={w.id} workflow={w} onEdit={openEdit} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          全部工作流
        </h2>
        {rest.length === 0 && favorite.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-12 text-center">
            <p className="text-sm text-slate-500">还没有工作流，点击右上角创建一个吧</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {rest.map((w) => (
              <WorkflowCard key={w.id} workflow={w} onEdit={openEdit} />
            ))}
          </div>
        )}
      </div>

      {editorOpen && (
        <WorkflowEditorModal
          workflow={editingWorkflow}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
