import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Share2,
  Workflow as WorkflowIcon,
  Star,
  Compass,
  Download,
  Loader2,
  Flag,
  Check,
  AlertCircle,
  Eye,
  LogIn,
  Package,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useSoftwareStore } from '@/stores/software.store';
import { useSettingsStore } from '@/stores/settings.store';
import {
  getShareByToken,
  hasUserImported,
  hasUserReported,
  incrementViewCount,
  recordImport,
  reportShare,
  type PublicShare,
} from '@/services/shares.service';
import type { ShareKind, SharePayload, SoftwareMeta } from '@/services/share-serializer';
import { dedupeName, matchSoftware } from '@/services/share-serializer';
import { trackShareEvent } from '@/services/analytics.service';
import type { Software, Workflow, FavoriteGroup, RadialMenuConfig, RadialItem } from '@/types';
import { AppIcon } from '@/components/features/AppIcon';
import { cn } from '@/lib/utils';

const KIND_META: Record<
  ShareKind,
  { label: string; icon: typeof WorkflowIcon; color: string }
> = {
  workflow: { label: '工作流', icon: WorkflowIcon, color: '#8b5cf6' },
  favorite_group: { label: '收藏夹分组', icon: Star, color: '#f59e0b' },
  radial: { label: '径向菜单', icon: Compass, color: '#10b981' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function SharePreview() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const profile = useAuthStore((s) => s.profile);
  const software = useSoftwareStore((s) => s.software);
  const workflows = useSoftwareStore((s) => s.workflows);
  const favoriteGroups = useSoftwareStore((s) => s.favoriteGroups);
  const createWorkflow = useSoftwareStore((s) => s.createWorkflow);
  const createFavoriteGroup = useSoftwareStore((s) => s.createFavoriteGroup);
  const moveFavoriteToGroup = useSoftwareStore((s) => s.moveFavoriteToGroup);
  const toggleFavorite = useSoftwareStore((s) => s.toggleFavorite);
  const favoriteIds = useSoftwareStore((s) => s.favoriteIds);
  const setRadialConfig = useSettingsStore((s) => s.setRadialConfig);
  const setRadialItem = useSettingsStore((s) => s.setRadialItem);

  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState<PublicShare | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState<{ label: string; targetPath?: string } | null>(null);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  // 已举报: 页面初始化时从后端查一次, 提交后置 true。true 时举报按钮置灰不可点。
  const [alreadyReported, setAlreadyReported] = useState(false);
  const [radialStrategy, setRadialStrategy] = useState<'replace' | 'merge'>('merge');
  const [alreadyImported, setAlreadyImported] = useState(false);
  const [confirmReimport, setConfirmReimport] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      setError('分享链接无效');
      return;
    }
    setLoading(true);
    getShareByToken(token)
      .then(async (data) => {
        if (cancelled) return;
        if (!data) {
          setError('分享不存在、已撤销或已过期');
          return;
        }
        setShare(data);
        void incrementViewCount(token);
        trackShareEvent({
          eventType: 'share_view',
          shareId: data.id,
          shareToken: token,
          actorId: profile?.userId ?? null,
          kind: data.kind,
        });
        // 已登录用户: 并行检查是否曾经导入过 & 是否已举报过
        if (profile?.userId) {
          const [imported, reported] = await Promise.all([
            hasUserImported(data.id, profile.userId),
            hasUserReported(data.id, profile.userId),
          ]);
          if (!cancelled) {
            if (imported) setAlreadyImported(true);
            if (reported) setAlreadyReported(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('加载分享失败,请稍后再试');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, profile?.userId]);

  const matches = useMemo(() => {
    if (!share) return [];
    return matchSoftware(share.payload.softwareMeta, software);
  }, [share, software]);

  const installedCount = matches.filter((m) => m.installedId).length;
  const missingCount = matches.length - installedCount;

  const radialCurrentItems = useSettingsStore((s) => s.radial.items);
  const radialSectors = useSettingsStore((s) => s.radial.sectors);

  // 径向菜单空槽预检:merge 模式下计算可填入的槽位数量
  const radialFreeSlots = useMemo(() => {
    if (!share || share.payload.kind !== 'radial') return 0;
    const occupied = new Set(radialCurrentItems.map((it) => it.slot));
    let free = 0;
    for (let i = 0; i < radialSectors; i++) {
      if (!occupied.has(i)) free++;
    }
    return free;
  }, [share, radialCurrentItems, radialSectors]);

  const handleImport = async () => {
    if (!share) return;
    if (!loggedIn || !profile?.userId) {
      trackShareEvent({
        eventType: 'share_import_click',
        shareId: share.id,
        shareToken: share.shareToken,
        kind: share.kind,
        meta: { blocked_by: 'not_logged_in' },
      });
      setError('请先登录后再导入');
      navigate('/account');
      return;
    }
    // 已导入过 → 二次确认
    if (alreadyImported && !confirmReimport) {
      setConfirmReimport(true);
      return;
    }
    trackShareEvent({
      eventType: 'share_import_click',
      shareId: share.id,
      shareToken: share.shareToken,
      actorId: profile.userId,
      kind: share.kind,
      meta: alreadyImported ? { reimport: true } : undefined,
    });

    setImporting(true);
    setError('');
    const startedAt = Date.now();
    try {
      const payload = share.payload;
      let importedLabel = '';
      let importedPath: string | undefined;
      const conflicts: Record<string, unknown> = {};

      if (payload.kind === 'workflow') {
        const existingNames = workflows.map((w) => w.name);
        const finalName = dedupeName(payload.workflow.name, existingNames);
        if (finalName !== payload.workflow.name.trim()) {
          conflicts.workflow_renamed = { from: payload.workflow.name, to: finalName };
        }
        const created = importWorkflowPayload(payload, matches, createWorkflow, finalName);
        importedLabel = `工作流「${created.name}」已导入`;
        importedPath = '/workflows';
      } else if (payload.kind === 'favorite_group') {
        const existingNames = favoriteGroups.map((g) => g.name);
        const finalName = dedupeName(payload.group.name, existingNames);
        if (finalName !== payload.group.name.trim()) {
          conflicts.group_renamed = { from: payload.group.name, to: finalName };
        }
        const created = importFavoriteGroupPayload(
          payload,
          matches,
          favoriteIds,
          createFavoriteGroup,
          moveFavoriteToGroup,
          toggleFavorite,
          finalName
        );
        importedLabel = `收藏夹分组「${created.name}」已导入`;
        importedPath = '/favorites';
      } else if (payload.kind === 'radial') {
        // merge 模式下槽位不够 → 拦截并提示
        if (radialStrategy === 'merge' && radialFreeSlots < payload.radial.items.length) {
          conflicts.radial_slots_insufficient = {
            required: payload.radial.items.length,
            available: radialFreeSlots,
          };
          setError(
            `当前径向菜单只剩 ${radialFreeSlots} 个空槽位,分享需要 ${payload.radial.items.length} 个。请选择「覆盖当前配置」或先清理槽位。`
          );
          trackShareEvent({
            eventType: 'share_import_conflict',
            shareId: share.id,
            shareToken: share.shareToken,
            actorId: profile.userId,
            kind: share.kind,
            meta: conflicts,
          });
          return;
        }
        const result = importRadialPayload(payload, matches, radialStrategy, {
          setRadialConfig,
          setRadialItem,
          currentItems: radialCurrentItems,
        });
        importedLabel = `径向菜单已${result.action}`;
        // 深链到"设置 > 径向菜单" tab,而不是设置首页的"外观"tab,
        // 让用户点"立即查看 →"能直接看到刚导入的径向菜单配置
        importedPath = '/settings?tab=radial';
      }

      await recordImport(share.id, profile.userId);
      const durationMs = Date.now() - startedAt;

      // 命中过重命名/冲突,同时也埋一个 conflict 事件供漏斗分析
      if (Object.keys(conflicts).length > 0) {
        trackShareEvent({
          eventType: 'share_import_conflict',
          shareId: share.id,
          shareToken: share.shareToken,
          actorId: profile.userId,
          kind: share.kind,
          meta: conflicts,
        });
      }
      trackShareEvent({
        eventType: 'share_import_success',
        shareId: share.id,
        shareToken: share.shareToken,
        actorId: profile.userId,
        kind: share.kind,
        meta: {
          duration_ms: durationMs,
          missing_software: missingCount,
          ...conflicts,
        },
      });
      setImportDone({ label: importedLabel, targetPath: importedPath });
      setAlreadyImported(true);
      setConfirmReimport(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleReport = async () => {
    if (!share) return;
    // 前置门槛: 未登录直接引导登录, 不进入弹窗
    if (!profile?.userId) {
      setError('请先登录后再举报');
      navigate('/account');
      return;
    }
    const trimmed = reportReason.trim();
    if (!trimmed) {
      setError('请填写举报理由');
      return;
    }
    const result = await reportShare(share.id, trimmed, profile.userId);
    if (result.success) {
      setReportSent(true);
      setReportOpen(false);
      setAlreadyReported(true);
      trackShareEvent({
        eventType: 'share_report',
        shareId: share.id,
        shareToken: share.shareToken,
        actorId: profile.userId,
        kind: share.kind,
        meta: { reason_length: trimmed.length },
      });
    } else if (result.duplicated) {
      // 数据库 unique 拦截: 用户曾经举报过, 静默把 UI 置为"已举报"态
      setReportOpen(false);
      setAlreadyReported(true);
      setError('');
    } else {
      setError(result.error ?? '举报提交失败');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d14] text-slate-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          正在加载分享内容…
        </div>
      </div>
    );
  }

  if (!share) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d0d14] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7 text-slate-500" />
        </div>
        <h1 className="text-lg font-semibold text-white mb-1">无法打开该分享</h1>
        <p className="text-sm text-slate-500 mb-6 max-w-xs">{error || '分享不存在或已失效'}</p>
        <button
          onClick={() => navigate('/')}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
            'bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200',
            'dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/20 dark:hover:bg-violet-500/25'
          )}
        >
          返回工作台
        </button>
      </div>
    );
  }

  const KindIcon = KIND_META[share.kind].icon;

  return (
    <div className="min-h-screen bg-[#0d0d14] text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate('/')}
          className="mb-6 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回工作台
        </button>

        <div className="rounded-3xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <div
            className="px-8 py-6 border-b border-slate-800"
            style={{
              background: `linear-gradient(135deg, ${KIND_META[share.kind].color}18 0%, transparent 70%)`,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${KIND_META[share.kind].color}20` }}
                >
                  <KindIcon className="w-5 h-5" style={{ color: KIND_META[share.kind].color }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${KIND_META[share.kind].color}20`,
                        color: KIND_META[share.kind].color,
                      }}
                    >
                      {KIND_META[share.kind].label}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {share.ownerNickname ?? '匿名用户'} · {formatDate(share.createdAt)}
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-white leading-tight break-all">
                    {share.title}
                  </h1>
                  {share.description && (
                    <p className="mt-2 text-sm text-slate-400 whitespace-pre-wrap break-all">
                      {share.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {share.viewCount + 1} 次查看
              </span>
              <span className="flex items-center gap-1">
                <Download className="w-3 h-3" />
                {share.importCount} 次导入
              </span>
            </div>
          </div>

          <div className="px-8 py-6 space-y-5">
            <SoftwareBadgeList matches={matches} software={software} />

            {share.kind === 'radial' && (
              <div>
                <div className="text-xs font-medium text-slate-400 mb-2">
                  导入方式 · 当前径向菜单剩余{' '}
                  <span className="text-violet-300">{radialFreeSlots}</span> 个空槽
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRadialStrategy('merge')}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      radialStrategy === 'merge'
                        ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    )}
                  >
                    <div className="text-sm font-medium">追加到空槽位</div>
                    <div className="text-[10px] mt-0.5 opacity-80">保留当前配置,只填补空位</div>
                  </button>
                  <button
                    onClick={() => setRadialStrategy('replace')}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      radialStrategy === 'replace'
                        ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    )}
                  >
                    <div className="text-sm font-medium">覆盖当前配置</div>
                    <div className="text-[10px] mt-0.5 opacity-80">用分享的配置完全替换</div>
                  </button>
                </div>
                {radialStrategy === 'merge' &&
                  share.payload.kind === 'radial' &&
                  radialFreeSlots < share.payload.radial.items.length && (
                    <div
                      className={cn(
                        'mt-2 flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] border',
                        'bg-amber-100 border-amber-300 text-amber-800',
                        'dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300'
                      )}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        空槽位不足({radialFreeSlots}/{share.payload.radial.items.length}
                        ),请改为「覆盖当前配置」,或先在设置里清理槽位。
                      </span>
                    </div>
                  )}
              </div>
            )}

            {alreadyImported && !importDone && (
              <div
                className={cn(
                  'flex items-start gap-2 px-3 py-2 rounded-xl text-xs border',
                  'bg-sky-100 border-sky-300 text-sky-800',
                  'dark:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-300'
                )}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  你之前已经导入过这个分享。
                  {confirmReimport ? '再次点击「导入」将新增一份副本(名称自动追加序号)。' : '再次导入会创建一份新的副本。'}
                </span>
              </div>
            )}

            {missingCount > 0 && (
              <div
                className={cn(
                  'flex items-start gap-2 px-3 py-2 rounded-xl text-xs border',
                  'bg-amber-100 border-amber-300 text-amber-800',
                  'dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300'
                )}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  有 {missingCount} 款软件在本机未安装,导入后会保留占位,需自行安装后才能启动。
                </span>
              </div>
            )}

            {error && (
              <div
                className={cn(
                  'flex items-start gap-2 px-3 py-2 rounded-xl text-xs border',
                  'bg-rose-100 border-rose-300 text-rose-800',
                  'dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300'
                )}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {importDone ? (
              <div
                className={cn(
                  'p-4 rounded-xl border flex items-center justify-between',
                  'bg-emerald-100 border-emerald-300',
                  'dark:bg-emerald-500/10 dark:border-emerald-500/30'
                )}
              >
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                  <span className="text-sm text-emerald-800 dark:text-emerald-200">{importDone.label}</span>
                </div>
                {importDone.targetPath && (
                  <button
                    onClick={() => navigate(importDone.targetPath!)}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                  >
                    立即查看 →
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-70 transition-all"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      导入中…
                    </>
                  ) : !loggedIn ? (
                    <>
                      <LogIn className="w-4 h-4" />
                      登录后导入
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      导入到我的账户
                    </>
                  )}
                </button>
                {/* 举报按钮的可见性:
                   - 未登录: 完全隐藏(需要 auth.uid, 匿名不能举报)
                   - 已举报: 显示但置灰, 且鼠标 hover 提示"你已举报过"
                   - 正常态: 常规红色 hover 高亮 */}
                {loggedIn && (
                  <button
                    onClick={() => {
                      if (alreadyReported) return;
                      setReportOpen(true);
                    }}
                    disabled={alreadyReported}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-sm transition-colors',
                      alreadyReported
                        ? 'text-slate-600 opacity-50 cursor-not-allowed'
                        : 'text-slate-500 hover:text-rose-600 hover:bg-rose-100 dark:hover:text-rose-300 dark:hover:bg-rose-500/10'
                    )}
                    title={alreadyReported ? '你已举报过这个分享' : '举报'}
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {(reportSent || alreadyReported) && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                {reportSent ? '举报已提交,我们会尽快审核' : '你已举报过这个分享,我们会尽快审核'}
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-[11px] text-center text-slate-600">
          <Share2 className="w-3 h-3 inline mr-1" />
          分享内容由社区用户提供,SoftDesk 不为其准确性和合法性背书
        </p>
      </div>

      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setReportOpen(false)}
        >
          {/* 遮罩层与 ShareDialog 保持一致:bg-slate-950/70 由 index.css 做主题重映射 */}
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" aria-hidden="true" />
          <div
            className="relative w-full max-w-md rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl shadow-slate-950/50"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white">举报该分享</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">累计 3 次举报会自动隐藏</p>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value.slice(0, 200))}
                rows={4}
                placeholder="请填写举报理由(内容违规、涉黄涉暴、隐私侵权等)"
                className={cn(
                  'w-full px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 resize-none',
                  'text-sm text-slate-100 placeholder:text-slate-600',
                  'focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all'
                )}
              />
              <div className="mt-1 text-[10px] text-slate-500 text-right">
                {reportReason.length}/200
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900/60">
              <button
                onClick={() => setReportOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReport}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500 text-white hover:bg-rose-600 transition-colors"
              >
                提交举报
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SoftwareBadgeListProps {
  matches: ReturnType<typeof matchSoftware>;
  software: Software[];
}

function SoftwareBadgeList({ matches, software }: SoftwareBadgeListProps) {
  if (matches.length === 0) {
    return (
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Package className="w-3.5 h-3.5" />
        分享内容未包含具体软件
      </div>
    );
  }
  // 建立本机 id -> Software 索引,命中时用完整 Software 对象喂给 AppIcon,
  // 这样能拿到 macOS 抠出来的高分辨率原生图标,而不是首字母占位。
  const softwareById = new Map(software.map((s) => [s.id, s]));
  return (
    <div>
      <div className="text-xs font-medium text-slate-400 mb-2">
        包含 {matches.length} 款软件
      </div>
      <div className="flex flex-wrap gap-2">
        {matches.map(({ meta, installedId }) => {
          // 优先级:
          //   1) 本机命中 -> 用本机 Software (最完整、含系统抠出的高清 icon)
          //   2) 未命中但分享 payload 自带 icon (data:image / file://) -> 拿 payload 里的
          //   3) 都没有 -> AppIcon 自动降级到首字母占位
          const local = installedId ? softwareById.get(installedId) : null;
          const surrogate: Software =
            local ??
            ({
              id: meta.softwareId,
              name: meta.name,
              description: '',
              icon: meta.icon ?? '',
              category: meta.category ?? 'utilities',
              size: 0,
              lastUsed: '',
              usageMinutes: 0,
              launchCount: 0,
              path: '',
              color: meta.color ?? '#64748b',
              tags: [],
            } as Software);
          return (
            <div
              key={meta.softwareId}
              className={cn(
                'flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg border text-xs',
                installedId
                  ? 'bg-slate-800/40 border-slate-700/60 text-slate-200'
                  : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
              )}
              title={installedId ? '已安装' : '未安装'}
            >
              <AppIcon
                software={surrogate}
                size={20}
                rounded="rounded-md"
                className={cn(!installedId && 'opacity-60 grayscale')}
              />
              <span className={cn('truncate max-w-[10rem]', !installedId && 'line-through')}>
                {meta.name}
              </span>
              {!installedId && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800/60 text-slate-500">
                  未安装
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================ 三类导入实现 ================ */

function importWorkflowPayload(
  payload: Extract<SharePayload, { kind: 'workflow' }>,
  matches: ReturnType<typeof matchSoftware>,
  createWorkflow: (data: {
    name: string;
    description: string;
    softwareIds: string[];
    color: string;
  }) => Workflow,
  finalName: string
): { name: string } {
  const remap = buildRemapMap(payload.softwareMeta, matches);
  const softwareIds = payload.workflow.softwareIds.map((id) => remap.get(id) ?? id);
  const created = createWorkflow({
    name: finalName,
    description: payload.workflow.description,
    softwareIds,
    color: payload.workflow.color,
  });
  return { name: created.name };
}

function importFavoriteGroupPayload(
  payload: Extract<SharePayload, { kind: 'favorite_group' }>,
  matches: ReturnType<typeof matchSoftware>,
  favoriteIds: string[],
  createFavoriteGroup: (name: string) => { success: boolean; error?: string; group?: FavoriteGroup },
  moveFavoriteToGroup: (softwareId: string, groupId: string | null) => void,
  toggleFavorite: (id: string) => Promise<void>,
  finalName: string
): { name: string } {
  const result = createFavoriteGroup(finalName);
  if (!result.success || !result.group) {
    throw new Error(result.error ?? '创建分组失败');
  }
  const remap = buildRemapMap(payload.softwareMeta, matches);
  const targetIds = payload.group.softwareIds
    .map((id) => remap.get(id))
    .filter((id): id is string => !!id);

  // 先确保软件被收藏,再移动到新分组
  for (const softwareId of targetIds) {
    if (!favoriteIds.includes(softwareId)) {
      void toggleFavorite(softwareId);
    }
    moveFavoriteToGroup(softwareId, result.group.id);
  }
  return { name: result.group.name };
}

interface RadialImportContext {
  setRadialConfig: (patch: Partial<Omit<RadialMenuConfig, 'items'>>) => void;
  setRadialItem: (slot: number, item: Omit<RadialItem, 'slot'> | null) => void;
  currentItems: RadialItem[];
}

function importRadialPayload(
  payload: Extract<SharePayload, { kind: 'radial' }>,
  matches: ReturnType<typeof matchSoftware>,
  strategy: 'replace' | 'merge',
  ctx: RadialImportContext
): { action: string } {
  const remap = buildRemapMap(payload.softwareMeta, matches);
  const sectors = payload.radial.sectors;
  ctx.setRadialConfig({
    sectors: sectors as 4 | 6 | 8,
    style: payload.radial.style,
    showRecent: payload.radial.showRecent,
  });

  if (strategy === 'replace') {
    // 先清空所有槽位
    for (let s = 0; s < sectors; s++) {
      ctx.setRadialItem(s, null);
    }
    for (const item of payload.radial.items) {
      if (item.slot >= sectors) continue;
      const targetId = remap.get(item.targetId) ?? item.targetId;
      ctx.setRadialItem(item.slot, {
        type: item.type,
        targetId,
        name: item.name,
        icon: item.icon,
        color: item.color,
      });
    }
    return { action: '覆盖导入' };
  }

  // merge: 找空槽位填入
  const occupied = new Set(ctx.currentItems.map((it) => it.slot));
  let filled = 0;
  for (const item of payload.radial.items) {
    // 先按原槽位放入,若被占用则找下一个空槽
    let slot = item.slot;
    while (occupied.has(slot) && slot < sectors) slot++;
    if (slot >= sectors) break;
    const targetId = remap.get(item.targetId) ?? item.targetId;
    ctx.setRadialItem(slot, {
      type: item.type,
      targetId,
      name: item.name,
      icon: item.icon,
      color: item.color,
    });
    occupied.add(slot);
    filled++;
  }
  return { action: `合并导入(${filled} 项)` };
}

function buildRemapMap(
  metas: SoftwareMeta[],
  matches: ReturnType<typeof matchSoftware>
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < metas.length; i++) {
    const local = matches[i]?.installedId;
    if (local) map.set(metas[i].softwareId, local);
    else map.set(metas[i].softwareId, metas[i].softwareId); // 保留占位 id
  }
  return map;
}
