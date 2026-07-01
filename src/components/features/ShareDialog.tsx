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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
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
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
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
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/50 transition-colors"
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
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/50 transition-colors resize-none"
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
                        'p-2.5 rounded-lg border text-left transition-all',
                        expiry === opt.value
                          ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                          : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                      )}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-80">{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-300 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-4">
                <div className="text-[11px] text-slate-500 mb-1.5">分享链接</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-violet-300 font-mono break-all">
                    {shareUrl}
                  </code>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      'shrink-0 p-2 rounded-lg transition-colors',
                      copied
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                    )}
                    title={copied ? '已复制' : '复制链接'}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {qrDataUrl && (
                    <button
                      onClick={() => setQrOpen((v) => !v)}
                      className={cn(
                        'shrink-0 p-2 rounded-lg transition-colors',
                        qrOpen
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                    <img
                      src={qrDataUrl}
                      alt="分享二维码"
                      className="w-32 h-32 rounded-lg bg-white p-1.5 shrink-0"
                    />
                    <div className="flex-1 text-[11px] text-slate-500 space-y-1.5">
                      <p className="text-slate-300 font-medium">跨设备转发更方便</p>
                      <p>用手机相机扫码即可拿到分享链接,发给朋友或存到备忘录。</p>
                      <a
                        href={qrDataUrl}
                        download={`softdesk-share-${shareToken ?? 'qr'}.png`}
                        className="inline-flex items-center gap-1 mt-1 text-violet-300 hover:text-violet-200"
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

              <div className="rounded-lg bg-slate-800/30 border border-slate-800/60 px-3 py-2 text-[11px] text-slate-500">
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
