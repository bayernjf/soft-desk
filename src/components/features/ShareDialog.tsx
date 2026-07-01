import { useEffect, useState } from 'react';
import { X, Copy, Check, Share2, Loader2, AlertCircle, ExternalLink, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { useAuthStore } from '@/stores/auth.store';
import { createShare, buildShareUrl, type ShareExpiry } from '@/services/shares.service';
import { trackShareEvent } from '@/services/analytics.service';
import type { ShareKind, SharePayload } from '@/services/share-serializer';
import { cn } from '@/lib/utils';

interface ShareDialogProps {
  kind: ShareKind;
  defaultTitle: string;
  defaultDescription?: string;
  buildPayload: () => SharePayload;
  onClose: () => void;
}

const EXPIRY_OPTIONS: { value: ShareExpiry; label: string; hint: string }[] = [
  { value: 'permanent', label: '永久', hint: '链接不过期,可随时撤销' },
  { value: '30d', label: '30 天', hint: '30 天后自动失效' },
  { value: '7d', label: '7 天', hint: '7 天后自动失效' },
];

const KIND_LABEL: Record<ShareKind, string> = {
  workflow: '工作流',
  favorite_group: '收藏夹分组',
  radial: '径向菜单',
};

export function ShareDialog({
  kind,
  defaultTitle,
  defaultDescription,
  buildPayload,
  onClose,
}: ShareDialogProps) {
  const profile = useAuthStore((s) => s.profile);
  const loggedIn = useAuthStore((s) => s.loggedIn);

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription ?? '');
  const [expiry, setExpiry] = useState<ShareExpiry>('permanent');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareId, setShareId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 生成成功后异步生成二维码,失败静默(不阻塞主流程)
  useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 240,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  const handleSubmit = async () => {
    if (!loggedIn || !profile?.userId) {
      setError('请先登录账号');
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setError('请输入分享标题');
      return;
    }
    if (trimmed.length > 50) {
      setError('标题不能超过 50 字');
      return;
    }
    if (description.trim().length > 200) {
      setError('描述不能超过 200 字');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = buildPayload();
      const result = await createShare(profile.userId, {
        kind,
        title: trimmed,
        description: description.trim(),
        payload,
        expiry,
        ownerNickname: profile.nickname,
      });
      if (result.success && result.shareToken) {
        setShareToken(result.shareToken);
        setShareUrl(result.shareUrl ?? buildShareUrl(result.shareToken));
        setShareId(result.shareId ?? null);
        trackShareEvent({
          eventType: 'share_create',
          shareId: result.shareId ?? null,
          shareToken: result.shareToken,
          actorId: profile.userId,
          kind,
          meta: { expiry },
        });
      } else {
        setError(result.error ?? '创建分享失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建分享失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShareEvent({
        eventType: 'share_copy',
        shareId,
        shareToken,
        actorId: profile?.userId ?? null,
        kind,
      });
    } catch {
      setError('复制失败,请手动选择复制');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* 遮罩层: 使用与 WorkflowEditorModal 一致的 bg-slate-950/70,
          浅色主题下由 index.css 全局重映射为奶咖色半透明遮罩,
          深色主题保留深灰半透明。禁止再手写 dark: 前缀,否则会双层堆叠。*/}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={shareToken ? '分享已创建' : `分享${KIND_LABEL[kind]}`}
        className="relative w-full max-w-lg flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-slate-950/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Dialog 内部键盘事件必须阻止冒泡,否则会命中外层工作流卡片的
          // role=button+Enter/Space 触发器,导致输入空格误开"编辑工作流"。
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-violet-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {shareToken ? '分享已创建' : `分享${KIND_LABEL[kind]}`}
              </h2>
              <p className="text-[11px] text-slate-500">
                {shareToken ? '复制链接发送给他人,一键即可导入' : '生成一个可分享链接给他人使用'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!shareToken ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  标题 <span className="text-slate-600">({title.length}/50)</span>
                </label>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value.slice(0, 50));
                    setError('');
                  }}
                  className={cn(
                    'w-full px-3.5 py-2.5 rounded-xl bg-slate-900/60 border text-sm text-slate-100 placeholder:text-slate-600',
                    'focus:outline-none focus:ring-2 transition-all',
                    'border-slate-800 focus:border-violet-500/50 focus:ring-violet-500/20'
                  )}
                  placeholder="给这份分享起个标题"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  描述 <span className="text-slate-600">(可选,{description.length}/200)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value.slice(0, 200));
                    setError('');
                  }}
                  rows={3}
                  className={cn(
                    'w-full px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 resize-none',
                    'text-sm text-slate-100 placeholder:text-slate-600',
                    'focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all'
                  )}
                  placeholder="介绍一下这份分享的用途或亮点"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">有效期</label>
                <div className="grid grid-cols-3 gap-2">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setExpiry(opt.value)}
                      className={cn(
                        'p-2.5 rounded-xl border text-left transition-all',
                        expiry === opt.value
                          ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                          : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      )}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-80">{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 rounded-xl text-xs',
                    'bg-rose-100 border border-rose-300 text-rose-800',
                    'dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300'
                  )}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <>
              {/* 结果卡片: 参照"标题/描述"输入框的配方,浅色主题下由 index.css 全局重映射为
                  奶白底 + 淡棕边框,深色下保持 slate-900/60 半透明黑。
                  外层不加 bg,只用一层 border 划分,避免与内部的 code 输入框撞色分层混乱。*/}
              <div className="rounded-xl p-4 border border-slate-800">
                <div className="text-[11px] text-slate-500 mb-1.5">分享链接</div>
                <div className="flex items-center gap-2">
                  {/* code 块 = 只读输入框: 完全对齐 WorkflowEditorModal 输入框 class,
                      文字色用 violet-500/violet-300 双 token 保证浅/深主题都清晰。*/}
                  <code
                    className={cn(
                      'flex-1 px-3.5 py-2.5 rounded-xl border font-mono text-xs break-all select-all',
                      'bg-slate-900/60 border-slate-800',
                      'text-violet-500 dark:text-violet-300'
                    )}
                  >
                    {shareUrl}
                  </code>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      'shrink-0 p-2 rounded-xl transition-colors border',
                      copied
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300'
                        : 'bg-violet-100 border-violet-300 text-violet-700 hover:bg-violet-200 dark:bg-violet-500/20 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/30'
                    )}
                    title={copied ? '已复制' : '复制链接'}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {qrDataUrl && (
                    <button
                      onClick={() => setQrOpen((v) => !v)}
                      className={cn(
                        'shrink-0 p-2 rounded-xl transition-colors border',
                        qrOpen
                          ? 'bg-slate-800 border-slate-700 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      )}
                      title={qrOpen ? '收起二维码' : '显示二维码'}
                      aria-label="切换二维码显示"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {qrOpen && qrDataUrl && (
                  <div className="mt-4 flex items-center gap-4">
                    {/* 二维码必须始终白底(黑码需要), 用任意值语法确保不被主题 CSS 干扰 */}
                    <img
                      src={qrDataUrl}
                      alt="分享二维码"
                      className="w-32 h-32 rounded-lg bg-[#ffffff] p-1.5 shrink-0 ring-1 ring-slate-800"
                    />
                    <div className="flex-1 text-[11px] text-slate-500 space-y-1.5">
                      <p className="text-slate-200 font-medium">跨设备转发更方便</p>
                      <p>用手机相机扫码即可拿到分享链接,发给朋友或存到备忘录。</p>
                      <a
                        href={qrDataUrl}
                        download={`softdesk-share-${shareToken ?? 'qr'}.png`}
                        className="inline-flex items-center gap-1 mt-1 text-violet-500 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-200"
                      >
                        <Copy className="w-3 h-3" /> 保存二维码图片
                      </a>
                    </div>
                  </div>
                )}

                <div className="mt-3 text-[11px] text-slate-500 flex items-start gap-1.5">
                  <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>接收者点击链接后应用会自动打开预览页,登录后可一键导入。</span>
                </div>
              </div>

              {/* 底部 tip: 用 border 划分,不加背景色,和上面的结果卡片保持相同层级视觉 */}
              <div className="rounded-xl px-3 py-2 text-[11px] border border-slate-800 text-slate-500">
                💡 你可以在「我的分享」中查看导入数据、随时撤销该分享。
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-800 bg-slate-900/60">
          {!shareToken ? (
            <>
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    生成中
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    生成链接
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
