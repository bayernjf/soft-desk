import { useEffect, useMemo, useState } from 'react';
import { X, Search, LogIn } from 'lucide-react';
import type { Workflow, SoftwareCategory } from '@/types';
import { useSoftwareStore, type WorkflowInput } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { WORKFLOW_COLORS, CATEGORIES } from '@/data/categories';
import { formatMinutes } from '@/services/software.service';
import { matchSoftware, findMetaSnapshot } from '@/services/software-matching';
import { AppIcon } from './AppIcon';
import { cn } from '@/lib/utils';

interface WorkflowEditorModalProps {
  workflow?: Workflow | null;
  onClose: () => void;
}

export function WorkflowEditorModal({ workflow, onClose }: WorkflowEditorModalProps) {
  const software = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);
  const createWorkflow = useSoftwareStore((s) => s.createWorkflow);
  const updateWorkflow = useSoftwareStore((s) => s.updateWorkflow);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const isEdit = !!workflow;

  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(workflow?.softwareIds ?? []);
  const [color, setColor] = useState(workflow?.color ?? WORKFLOW_COLORS[0]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredSoftware = software.filter(
    (s) =>
      !s.uninstalled &&
      !s.deleted &&
      s.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  // 已选软件(按选择顺序),用于上方展示区;
  // 对于已卸载/已删除/找不到的软件,仍保留其 id,基于 workflow 快照渲染名称+图标并置灰标记「未安装」
  const selectedSoftware = useMemo(() => {
    return selectedIds.map((id) => {
      const sw = matchSoftware(software, id);
      if (sw) {
        return {
          id: sw.id,
          name: sw.name,
          icon: sw.icon,
          color: sw.color,
          category: sw.category,
          missing: false,
          uninstalled: !!sw.uninstalled,
          deleted: !!sw.deleted,
        };
      }
      const snap = findMetaSnapshot(workflow?.softwareMeta, id);
      return {
        id,
        name: snap?.name ?? '未安装的软件',
        icon: snap?.icon ?? '',
        color: snap?.color ?? '#64748b',
        category: (snap?.category ?? 'utilities') as SoftwareCategory,
        missing: true,
        uninstalled: false,
        deleted: false,
      };
    });
  }, [selectedIds, software, workflow?.softwareMeta]);

  // 下方候选列表:剔除已选,点击即移入展示区
  const availableSoftware = filteredSoftware.filter((s) => !selectedIds.includes(s.id));

  const addSoftware = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setError('');
  };

  const removeSoftware = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleSubmit = () => {
    if (!loggedIn) {
      setError('请先登录账号');
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请输入工作流名称');
      return;
    }
    const duplicate = workflows.find(
      (w) =>
        w.id !== workflow?.id &&
        w.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setError('工作流名称已存在');
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
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? '编辑工作流' : '创建工作流'}
        className="relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-slate-950/50"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? '编辑工作流' : '创建工作流'}
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {!loggedIn && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs',
              'bg-amber-100 border border-amber-300 text-amber-800',
              'dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300'
            )}>
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>请先登录账号后再创建工作流</span>
            </div>
          )}
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
                'w-full px-3.5 py-2.5 rounded-xl bg-slate-900/60 border text-sm text-slate-100 placeholder:text-slate-600',
                'focus:outline-none focus:ring-2 transition-all',
                error
                  ? 'border-rose-500/60 focus:border-rose-500/80 focus:ring-rose-500/20'
                  : 'border-slate-800 focus:border-violet-500/50 focus:ring-violet-500/20'
              )}
            />
            {error && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}
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
              {WORKFLOW_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`选择主题色 ${c}`}
                  aria-pressed={color === c}
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

            {/* 已选展示区:小卡片网格,右上角 × 移回候选列表 */}
            <div className="mb-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 min-h-[3.5rem]">
              {selectedSoftware.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-slate-600">
                  从下方列表点击软件，添加到这里
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {selectedSoftware.map((m) => {
                    const unavailable = m.missing || m.uninstalled || m.deleted;
                    const statusLabel = m.missing
                      ? '未安装'
                      : m.deleted
                        ? '已从本地电脑删除'
                        : m.uninstalled
                          ? '已弃用'
                          : '';
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'relative flex items-center gap-2 pl-2 pr-7 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60',
                          unavailable && 'opacity-60'
                        )}
                        title={unavailable ? `${m.name}（${statusLabel}）` : m.name}
                      >
                        <div className={cn(unavailable && 'grayscale')}>
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
                            rounded="rounded-md"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              'block text-xs font-medium truncate',
                              unavailable ? 'text-slate-400' : 'text-slate-200'
                            )}
                          >
                            {m.name}
                          </span>
                          {unavailable && (
                            <span className="block text-[10px] text-slate-500 truncate">
                              未安装
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeSoftware(m.id)}
                          aria-label={`移除 ${m.name}`}
                          className="absolute top-1 right-1 p-0.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-700/60 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
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

            {/* 候选列表:胶囊样式 + 双列网格,卡片之间留间隙;点击即移入展示区 */}
            <div className="max-h-52 overflow-y-auto pr-0.5">
              {availableSoftware.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-600">
                  {filteredSoftware.length === 0 ? '未找到软件' : '已全部添加'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableSoftware.map((s) => {
                    const categoryMeta = CATEGORIES.find((c) => c.id === s.category);
                    return (
                      <button
                        key={s.id}
                        onClick={() => addSoftware(s.id)}
                        className={cn(
                          'flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full text-left group min-w-0',
                          'bg-slate-800/40 border border-slate-800/60',
                          'hover:bg-slate-800/70 hover:border-slate-700/80 transition-colors'
                        )}
                      >
                        <AppIcon
                          software={s}
                          size={32}
                          rounded="rounded-full"
                          className="shrink-0 transition-transform duration-200 group-hover:scale-105"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-100 truncate">{s.name}</div>
                          <div className="text-xs text-slate-500 truncate">
                            {categoryMeta?.name} · {formatMinutes(s.usageMinutes)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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
            disabled={!loggedIn}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-colors active:scale-95',
              loggedIn
                ? 'bg-violet-500 text-white hover:bg-violet-600'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
            )}
          >
            {isEdit ? '保存' : loggedIn ? '创建' : '登录后创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
