import { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, AlertCircle, Check, LogIn } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { fetchWorkflowSuggestions } from '@/services/ai.service';
import { AppIcon } from './AppIcon';
import { cn } from '@/lib/utils';
import type { AiWorkflowSuggestion } from '@/types/electron';

interface AiWorkflowModalProps {
  onClose: () => void;
}

type Phase =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; suggestions: AiWorkflowSuggestion[] };

export function AiWorkflowModal({ onClose }: AiWorkflowModalProps) {
  const software = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);
  const createWorkflow = useSoftwareStore((s) => s.createWorkflow);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const [phase, setPhase] = useState<Phase>({ status: 'loading' });
  const [created, setCreated] = useState<Set<number>>(new Set());
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setPhase({ status: 'loading' });
    fetchWorkflowSuggestions(software)
      .then((list) => {
        if (cancelled) return;
        if (list.length === 0) setPhase({ status: 'empty' });
        else setPhase({ status: 'ready', suggestions: list });
      })
      .catch((err) => {
        if (!cancelled)
          setPhase({
            status: 'error',
            message: err instanceof Error ? err.message : 'AI 生成失败',
          });
      });
    return () => {
      cancelled = true;
    };
    // 仅首次打开时请求一次,避免软件列表变动重复调用模型
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = new Map(software.map((s) => [s.id, s]));

  const handleCreate = (sug: AiWorkflowSuggestion, idx: number) => {
    setErrorMsg('');
    if (!loggedIn) {
      setErrorMsg('请先登录账号');
      return;
    }
    const trimmedName = sug.name.trim();
    const duplicate = workflows.find(
      (w) => w.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setErrorMsg(`「${sug.name}」已存在`);
      return;
    }
    const ids = sug.softwareIds.filter((id) => {
      const sw = byId.get(id);
      return sw && !sw.uninstalled && !sw.deleted;
    });
    if (ids.length < 2) return;
    createWorkflow({
      name: sug.name,
      description: sug.description || '由 AI 基于你的使用习惯推荐',
      softwareIds: ids,
      color: '',
    });
    setCreated((prev) => new Set(prev).add(idx));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI 生成工作流"
        className="relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-slate-950/50"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h2 className="text-base font-semibold text-white">AI 生成工作流</h2>
          </div>
          <button onClick={onClose} aria-label="关闭" className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {phase.status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400 mb-3" />
              <p className="text-sm text-slate-300">AI 正在分析你的使用习惯…</p>
              <p className="text-xs text-slate-500 mt-1">结合已安装应用与共现统计生成推荐组合</p>
            </div>
          )}

          {phase.status === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-8 h-8 text-rose-400 mb-3" />
              <p className="text-sm text-slate-300">{phase.message}</p>
              <p className="text-xs text-slate-500 mt-1">请确认已在「设置 → AI 功能」启用一个可用模型</p>
            </div>
          )}

          {phase.status === 'empty' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="w-8 h-8 text-slate-600 mb-3" />
              <p className="text-sm text-slate-300">暂时没有可推荐的组合</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                请先在「设置 → AI 功能」启用 AI 模型，并多使用一段时间积累习惯数据。
              </p>
            </div>
          )}

          {phase.status === 'ready' && (
            <div className="space-y-3">
              {!loggedIn && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                  <LogIn className="w-3.5 h-3.5 shrink-0" />
                  <span>请先登录账号后再创建工作流</span>
                </div>
              )}
              {errorMsg && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {phase.suggestions.map((sug, idx) => {
                const apps = sug.softwareIds
                  .map((id) => byId.get(id))
                  .filter((s): s is NonNullable<typeof s> => !!s && !s.uninstalled && !s.deleted);
                const isCreated = created.has(idx);
                return (
                  <div
                    key={`${sug.name}-${idx}`}
                    className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 via-slate-900/40 to-amber-500/5 border border-violet-500/20"
                  >
                    <h3 className="text-sm font-semibold text-slate-100">{sug.name}</h3>
                    {sug.description && (
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{sug.description}</p>
                    )}
                    {sug.reason && (
                      <p className="text-[11px] text-violet-300/80 mt-1.5 leading-relaxed">💡 {sug.reason}</p>
                    )}
                    <div className="flex items-center gap-2 mt-3 mb-3 flex-wrap">
                      {apps.map((sw) => (
                        <div key={sw.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/60" title={sw.name}>
                          <AppIcon software={sw} size={20} rounded="rounded-md" />
                          <span className="text-[11px] text-slate-300 truncate max-w-[100px]">{sw.name}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleCreate(sug, idx)}
                      disabled={isCreated || apps.length < 2 || !loggedIn}
                      className={cn(
                        'w-full py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
                        isCreated
                          ? 'bg-emerald-500/15 text-emerald-300 cursor-default'
                          : loggedIn
                            ? 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25'
                            : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      )}
                    >
                      {isCreated ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          已创建
                        </>
                      ) : (
                        '创建该工作流 +'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
