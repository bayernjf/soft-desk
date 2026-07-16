import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Share2,
  Copy,
  Check,
  Ban,
  Trash2,
  Loader2,
  RefreshCw,
  Eye,
  Download,
  LogIn,
  Layers,
  Star,
  Compass,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  listMyShares,
  revokeShare,
  deleteShare,
  buildShareUrl,
  type MyShare,
} from '@/services/shares.service';
import { trackShareEvent } from '@/services/analytics.service';
import type { ShareKind } from '@/services/share-serializer';
import { cn } from '@/lib/utils';

const KIND_META: Record<ShareKind, { label: string; icon: typeof Layers; color: string }> = {
  workflow: { label: '工作流', icon: Layers, color: '#8b5cf6' },
  favorite_group: { label: '收藏夹分组', icon: Star, color: '#f59e0b' },
  radial: { label: '径向菜单', icon: Compass, color: '#10b981' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getStatusInfo(s: MyShare): { label: string; className: string } {
  // 灰色徽标: 由 index.css 的 bg-slate-700/40 → var(--l-hover) 自动做浅色主题重映射
  const inactive = 'bg-slate-700/40 text-slate-500';
  if (s.isRevoked) return { label: '已撤销', className: inactive };
  if (s.isArchived) return { label: '已归档', className: inactive };
  if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) {
    return { label: '已过期', className: inactive };
  }
  // emerald 是活性色, 深浅色主题都保持绿色语义, 双 token 保证浅色也清晰
  return {
    label: '生效中',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  };
}

export function MyShares() {
  const navigate = useNavigate();
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const profile = useAuthStore((s) => s.profile);

  const [shares, setShares] = useState<MyShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!loggedIn || !profile?.userId) {
      setShares([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await listMyShares(profile.userId);
    setShares(list);
    setLoading(false);
  }, [loggedIn, profile?.userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCopy = async (share: MyShare) => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(share.shareToken));
      setCopiedId(share.id);
      setTimeout(() => setCopiedId(null), 2000);
      trackShareEvent({
        eventType: 'share_copy',
        kind: share.kind,
      });
    } catch {
      // ignore
    }
  };

  const handleRevoke = async (share: MyShare) => {
    if (!profile?.userId) return;
    const ok = await revokeShare(profile.userId, share.id);
    if (ok) {
      setShares((prev) => prev.map((s) => (s.id === share.id ? { ...s, isRevoked: true } : s)));
      setConfirmRevoke(null);
      trackShareEvent({
        eventType: 'share_revoke',
        kind: share.kind,
      });
    }
  };

  const handleDelete = async (share: MyShare) => {
    if (!profile?.userId) return;
    const ok = await deleteShare(profile.userId, share.id);
    if (ok) {
      setShares((prev) => prev.filter((s) => s.id !== share.id));
      setConfirmDelete(null);
      trackShareEvent({
        eventType: 'share_delete',
        kind: share.kind,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">我的分享</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loggedIn ? '管理你创建的社区分享链接' : '登录账号后即可管理分享'}
          </p>
        </div>
        {loggedIn && (
          <button
            onClick={() => void reload()}
            disabled={loading}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        )}
      </div>

      {!loggedIn ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-4">
            <LogIn className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-sm font-medium text-slate-300 mb-1">请先登录</h3>
          <p className="text-xs text-slate-500 max-w-xs mb-5">
            登录账号后即可查看和管理你的分享链接
          </p>
          <button
            onClick={() => navigate('/account')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
              'bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200',
              'dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/20 dark:hover:bg-violet-500/25'
            )}
          >
            <LogIn className="w-4 h-4" />
            去登录
          </button>
        </div>
      ) : loading ? (
        <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          正在加载分享列表…
        </div>
      ) : shares.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-4">
            <Share2 className="w-7 h-7 text-slate-600" />
          </div>
          <h3 className="text-sm font-medium text-slate-300 mb-1">还没有分享</h3>
          <p className="text-xs text-slate-500 max-w-xs">
            在工作流 / 收藏夹 / 径向菜单页面点击「分享」按钮,即可创建你的第一个社区分享
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shares.map((share) => {
            const meta = KIND_META[share.kind];
            const KindIcon = meta.icon;
            const status = getStatusInfo(share);
            const isActive = !share.isRevoked && !share.isArchived;
            return (
              <div
                key={share.id}
                className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 hover:border-slate-700/80 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${meta.color}20` }}
                  >
                    <KindIcon className="w-4 h-4" style={{ color: meta.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-white truncate">{share.title}</h3>
                      <span
                        className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                          status.className
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                    {share.description && (
                      <p className="text-xs text-slate-500 line-clamp-1 mb-2">
                        {share.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-slate-500">
                      <span
                        className="px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${meta.color}15`,
                          color: meta.color,
                        }}
                      >
                        {meta.label}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {share.viewCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        {share.importCount}
                      </span>
                      <span>创建于 {formatDate(share.createdAt)}</span>
                      {share.expiresAt && (
                        <span>· 过期于 {formatDate(share.expiresAt)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(share)}
                      disabled={!isActive}
                      className={cn(
                        'p-1.5 rounded-lg transition-colors',
                        copiedId === share.id
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60',
                        !isActive && 'opacity-40 cursor-not-allowed'
                      )}
                      title="复制链接"
                    >
                      {copiedId === share.id ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {isActive && (
                      <button
                        onClick={() => {
                          setConfirmDelete(null);
                          setConfirmRevoke(share.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-100 dark:hover:text-amber-300 dark:hover:bg-amber-500/10 transition-colors"
                        title="撤销"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setConfirmRevoke(null);
                        setConfirmDelete(share.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-100 dark:hover:text-rose-300 dark:hover:bg-rose-500/10 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {confirmRevoke === share.id && (
                  <div
                    className={cn(
                      'mt-3 flex items-center justify-between gap-3 text-xs rounded-xl px-3 py-2 border',
                      'bg-amber-100 border-amber-300 text-amber-800',
                      'dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300'
                    )}
                  >
                    <span>确定撤销该分享?链接立即失效,已导入的用户不受影响</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setConfirmRevoke(null)}
                        className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-200 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => void handleRevoke(share)}
                        className="px-2 py-1 rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                      >
                        撤销
                      </button>
                    </div>
                  </div>
                )}

                {confirmDelete === share.id && (
                  <div
                    className={cn(
                      'mt-3 flex items-center justify-between gap-3 text-xs rounded-xl px-3 py-2 border',
                      'bg-rose-100 border-rose-300 text-rose-800',
                      'dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300'
                    )}
                  >
                    <span>确定删除该分享?已导入的用户不受影响</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-200 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => void handleDelete(share)}
                        className="px-2 py-1 rounded-md bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
