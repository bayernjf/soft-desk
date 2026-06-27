import { useState } from 'react';
import { Plus, Pencil, Trash2, Sparkles, ShieldAlert } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings.store';
import { providerLabel, type AiProviderConfig } from '@/data/aiProviders';
import { AiModelModal } from './AiModelModal';
import { cn } from '@/lib/utils';

export function AiModelsSection() {
  const aiProviders = useSettingsStore((s) => s.aiProviders);
  const toggleAiProvider = useSettingsStore((s) => s.toggleAiProvider);
  const deleteAiProvider = useSettingsStore((s) => s.deleteAiProvider);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AiProviderConfig | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AiProviderConfig | null>(null);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (config: AiProviderConfig) => {
    setEditing(config);
    setModalOpen(true);
  };

  return (
    <div className="mt-8 pt-6 border-t border-slate-800/80">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">AI 模型</h3>
          <p className="text-xs text-slate-500 mt-0.5">配置用于智能功能的 AI 服务商与模型</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-300 text-xs font-medium hover:bg-violet-500/25 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          添加模型
        </button>
      </div>

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-200/80 leading-relaxed">
          隐私提示：启用 AI 功能后，智能分类、工作流推荐、语义搜索等会把你的
          <span className="font-medium text-amber-200">已安装软件清单、使用时长与使用习惯</span>
          发送到你配置的 AI 服务商进行处理。这些数据不含密码等凭证，且仅发往你选择的服务商；不配置或停用 AI 模型时不会发送任何数据。
        </p>
      </div>

      {aiProviders.length === 0 ? (
        <div className="p-6 rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 text-center">
          <Sparkles className="w-6 h-6 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 leading-relaxed">
            还没有配置 AI 模型。点击「添加模型」配置 OpenAI、Anthropic、Gemini 或自定义服务商。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {aiProviders.map((m) => (
            <div
              key={m.id}
              className="flex flex-col justify-between p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-100 truncate">{m.name}</h4>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                      {providerLabel(m.provider)}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[9px] font-mono uppercase font-bold tracking-wider shrink-0',
                      m.isActive
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-500'
                    )}
                  >
                    {m.isActive ? '已启用' : '未启用'}
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  <div className="flex justify-between gap-3 text-[11px]">
                    <span className="text-slate-500">模型</span>
                    <span className="font-medium text-slate-300 text-right truncate">{m.model || '未配置'}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-[11px]">
                    <span className="text-slate-500">API Key</span>
                    <span className="font-mono text-slate-400">{m.apiKeyHint || '未设置'}</span>
                  </div>
                  {m.endpoint && (
                    <div className="flex justify-between gap-3 text-[11px]">
                      <span className="text-slate-500">Endpoint</span>
                      <span className="font-mono text-slate-400 text-right break-all">{m.endpoint}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <button
                  onClick={() => toggleAiProvider(m.id)}
                  className={cn(
                    'w-full py-2 rounded-xl text-xs font-semibold transition-colors',
                    m.isActive
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      : 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25'
                  )}
                >
                  {m.isActive ? '停用' : '启用'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openEdit(m)}
                    className="inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    编辑
                  </button>
                  <button
                    onClick={() => setConfirmDelete(m)}
                    className="inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 text-xs font-semibold hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && <AiModelModal config={editing} onClose={() => setModalOpen(false)} />}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-slate-950/50 p-6"
          >
            <h3 className="text-base font-semibold text-white">删除模型配置</h3>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              确定删除「{confirmDelete.name}」？删除后该 API Key 配置会从本地移除，AI 功能将不再使用它。
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  deleteAiProvider(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
