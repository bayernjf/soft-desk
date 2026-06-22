import { useEffect, useState } from 'react';
import { X, Check, Search } from 'lucide-react';
import type { Workflow } from '@/types';
import { useSoftwareStore, type WorkflowInput } from '@/stores/software.store';
import { cn } from '@/lib/utils';

const COLOR_OPTIONS = ['#00d4aa', '#a371f7', '#58a6ff', '#d29922', '#f85149', '#ec4899'];

interface WorkflowEditorModalProps {
  workflow?: Workflow | null;
  onClose: () => void;
}

export function WorkflowEditorModal({ workflow, onClose }: WorkflowEditorModalProps) {
  const { software, createWorkflow, updateWorkflow } = useSoftwareStore();
  const isEdit = !!workflow;

  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(workflow?.softwareIds ?? []);
  const [color, setColor] = useState(workflow?.color ?? COLOR_OPTIONS[0]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredSoftware = software.filter((s) =>
    s.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const toggleSoftware = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('请输入工作流名称');
      return;
    }
    if (selectedIds.length === 0) {
      setError('请至少选择一个软件');
      return;
    }
    const data: WorkflowInput = {
      name,
      description,
      softwareIds: selectedIds,
      color,
    };
    if (isEdit && workflow) {
      updateWorkflow(workflow.id, data);
    } else {
      createWorkflow(data);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-slate-950/50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? '编辑工作流' : '创建工作流'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">名称</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="例如：代码开发环境"
              className={cn(
                'w-full px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800',
                'text-sm text-slate-100 placeholder:text-slate-600',
                'focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all'
              )}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述这个工作流的用途"
              rows={2}
              className={cn(
                'w-full px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 resize-none',
                'text-sm text-slate-100 placeholder:text-slate-600',
                'focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all'
              )}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">主题色</label>
            <div className="flex items-center gap-2.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full transition-transform',
                    color === c ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white scale-110' : 'hover:scale-110'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-400">
                选择软件
              </label>
              <span className="text-xs text-slate-500">已选 {selectedIds.length} 个</span>
            </div>
            <div className="relative mb-2.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索软件"
                className={cn(
                  'w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800',
                  'text-sm text-slate-100 placeholder:text-slate-600',
                  'focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all'
                )}
              />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/60">
              {filteredSoftware.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-600">未找到软件</div>
              ) : (
                filteredSoftware.map((s) => {
                  const checked = selectedIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSoftware(s.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800/40 transition-colors text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0"
                        style={{ backgroundColor: s.color + '30', color: s.color }}
                      >
                        {s.name.slice(0, 2)}
                      </div>
                      <span className="flex-1 text-sm text-slate-200 truncate">{s.name}</span>
                      <div
                        className={cn(
                          'w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0',
                          checked
                            ? 'bg-violet-500 border-violet-500'
                            : 'border-slate-700'
                        )}
                      >
                        {checked && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors active:scale-95"
          >
            {isEdit ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
