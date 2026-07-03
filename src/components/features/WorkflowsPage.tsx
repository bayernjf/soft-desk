import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Clock, Play, Loader2, Check, AlertCircle, Pencil, Trash2, Plus, Sparkles, LogIn, Share2 } from 'lucide-react';
import type { Workflow, SoftwareMetaSnapshot } from '@/types';
import { useSoftwareStore } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { formatTimeAgo } from '@/services/software.service';
import { hasActiveAiProvider } from '@/services/ai.service';
import { serializeWorkflow } from '@/services/share-serializer';
import { cn } from '@/lib/utils';
import { WorkflowEditorModal } from './WorkflowEditorModal';
import { AiWorkflowModal } from './AiWorkflowModal';
import { ShareDialog } from './ShareDialog';
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

function resolveMeta(
  id: string,
  software: ReturnType<typeof useSoftwareStore.getState>['software'],
  meta?: SoftwareMetaSnapshot[]
) {
  const sw = software.find((s) => s.id === id);
  if (sw) {
    return {
      id,
      name: sw.name,
      icon: sw.icon,
      color: sw.color,
      category: sw.category,
      uninstalled: !!sw.uninstalled,
      deleted: !!sw.deleted,
      missing: false,
    };
  }
  const snap = meta?.find((m) => m.softwareId === id);
  return {
    id,
    name: snap?.name ?? '未安装的软件',
    icon: snap?.icon ?? '',
    color: snap?.color ?? '#64748b',
    category: snap?.category ?? 'utilities',
    uninstalled: false,
    deleted: false,
    missing: true,
  };
}

const WorkflowCard = memo(function WorkflowCard({ workflow, onEdit }: WorkflowCardProps) {
  const software = useSoftwareStore((s) => s.software);
  const launchWorkflow = useSoftwareStore((s) => s.launchWorkflow);
  const toggleWorkflowFavorite = useSoftwareStore((s) => s.toggleWorkflowFavorite);
  const deleteWorkflow = useSoftwareStore((s) => s.deleteWorkflow);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const [phase, setPhase] = useState<LaunchPhase>({ status: 'idle' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const metaMap = useRef(new Map<string, ReturnType<typeof resolveMeta>>());
  const allResolved = workflow.softwareIds.map((id) => {
    const m = resolveMeta(id, software, workflow.softwareMeta);
    metaMap.current.set(id, m);
    return m;
  });
  const availableSoftware = allResolved.filter((m) => !m.missing && !m.uninstalled && !m.deleted).slice(0, 4);
  const unavailableSoftware = allResolved.filter((m) => m.missing || m.uninstalled || m.deleted);
  const unavailableCount = unavailableSoftware.length;

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
      onClick={() => onEdit(workflow)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // 只响应卡片自身获取焦点时的 Enter/Space,
        // 忽略输入框/按钮/浮层弹窗等子元素冒泡上来的键盘事件,
        // 否则会在 ShareDialog 里打空格时误触发"编辑工作流"。
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(workflow);
        }
      }}
      className={cn(
        'relative p-5 rounded-2xl transition-all duration-300 overflow-hidden group cursor-pointer',
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
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWorkflowFavorite(workflow.id);
                }}
                aria-label={workflow.isFavorite ? '取消收藏' : '收藏'}
                aria-pressed={workflow.isFavorite}
                className="text-amber-400 opacity-80 hover:opacity-100 transition-opacity"
              >
                <Star className={cn('w-3.5 h-3.5', workflow.isFavorite && 'fill-amber-400')} />
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(workflow);
                  }}
                  title="编辑"
                  aria-label="编辑工作流"
                  className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {loggedIn && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareOpen(true);
                    }}
                    title="分享"
                    aria-label="分享工作流"
                    className="p-1 rounded-md text-slate-500 hover:text-violet-300 hover:bg-slate-800/60 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(true);
                  }}
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
            onClick={(e) => {
              e.stopPropagation();
              void handleLaunch();
            }}
            disabled={phase.status === 'launching'}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1.5 min-w-[96px] shrink-0',
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
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                }}
                className="px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteWorkflow(workflow.id);
                }}
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
            {availableSoftware.map((m) => (
              <div key={m.id} className="rounded-xl border-2 border-slate-900" title={m.name}>
                <AppIcon
                  software={{
                    id: m.id,
                    name: m.name,
                    icon: m.icon ?? '',
                    color: m.color ?? '#64748b',
                    category: m.category ?? 'utilities',
                    description: '',
                    size: 0,
                    lastUsed: '',
                    usageMinutes: 0,
                    launchCount: 0,
                    path: '',
                    tags: [],
                  }}
                  size={36}
                  rounded="rounded-[10px]"
                />
              </div>
            ))}
            {(availableSoftware.length > 0 || unavailableCount > 0) && (
              <div className="pl-3 ml-3 text-xs text-slate-500 border-l border-slate-700/80">
                {workflow.softwareIds.length} 个应用
                {unavailableCount > 0 && (
                  <span
                    className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]"
                    title={`${unavailableCount} 个软件未安装或已弃用`}
                  >
                    {unavailableCount} 未安装
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            {formatTimeAgo(workflow.lastUsed)} · {workflow.usageCount} 次使用
          </div>
        </div>

        {unavailableSoftware.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/60">
            <h4 className="text-[10px] font-medium text-slate-600 uppercase tracking-wider mb-2">
              未安装 ({unavailableSoftware.length})
            </h4>
            <div className="grid gap-2 grid-cols-2">
              {unavailableSoftware.map((m) => {
                const statusLabel = m.missing
                  ? '未安装'
                  : m.deleted
                    ? '已从本地电脑删除'
                    : '已弃用';
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 p-2 rounded-xl border border-slate-800/60 bg-slate-900/20 opacity-60"
                    title={`${m.name}（${statusLabel}）`}
                  >
                    <div className="grayscale">
                      <AppIcon
                        software={{
                          id: m.id,
                          name: m.name,
                          icon: m.icon ?? '',
                          color: m.color ?? '#64748b',
                          category: m.category ?? 'utilities',
                          description: '',
                          size: 0,
                          lastUsed: '',
                          usageMinutes: 0,
                          launchCount: 0,
                          path: '',
                          tags: [],
                        }}
                        size={28}
                        rounded="rounded-lg"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-400 truncate">{m.name}</div>
                      <span className="text-[10px] px-1 py-0.5 rounded bg-slate-800 text-slate-500">
                        未安装
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {shareOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <ShareDialog
            kind="workflow"
            defaultTitle={workflow.name}
            defaultDescription={workflow.description}
            buildPayload={() => serializeWorkflow(workflow, software)}
            onClose={() => setShareOpen(false)}
          />
        </div>
      )}
    </div>
  );
});

export function WorkflowsPage() {
  const workflows = useSoftwareStore((s) => s.workflows);
  const [editorOpen, setEditorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const navigate = useNavigate();
  const favorite = workflows.filter((w) => w.isFavorite);
  const rest = workflows.filter((w) => !w.isFavorite);

  useEffect(() => {
    let cancelled = false;
    hasActiveAiProvider()
      .then((ready) => {
        if (!cancelled) setAiReady(ready);
      })
      .catch(() => {
        if (!cancelled) setAiReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openCreate = () => {
    setEditingWorkflow(null);
    setEditorOpen(true);
  };

  const openAi = () => {
    setAiOpen(true);
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
          <p className="text-sm text-slate-500 mt-1">
            {loggedIn ? '一键启动你的高效工作组合' : '登录账号后即可管理工作流'}
          </p>
        </div>
      </div>

      {!loggedIn ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-4">
            <LogIn className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-sm font-medium text-slate-300 mb-1">请先登录</h3>
          <p className="text-xs text-slate-500 max-w-xs mb-5">
            登录账号后即可创建工作流，并在多设备间同步
          </p>
          <button
            onClick={() => navigate('/account')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 border border-violet-500/20 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            去登录
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {aiReady && (
              <button
                onClick={openAi}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center gap-1.5',
                  'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/15 text-violet-300 border-violet-500/30 hover:from-violet-500/30 hover:to-fuchsia-500/25'
                )}
              >
                <Sparkles className="w-4 h-4" />
                AI 生成
              </button>
            )}
            <button
              onClick={openCreate}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center gap-1.5',
                'bg-violet-500/20 text-violet-300 border-violet-500/30 hover:bg-violet-500/30'
              )}
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

          {aiOpen && <AiWorkflowModal onClose={() => setAiOpen(false)} />}
        </>
      )}
    </div>
  );
}
