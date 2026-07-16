import { Shield, X, CheckCircle2 } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings.store';
import {
  markPrivacyConsentShown,
  giveAnalyticsConsent,
  revokeAnalyticsConsent,
} from '@/services/analytics.service';
import { cn } from '@/lib/utils';

interface PrivacyConsentModalProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyConsentModal({ open, onClose }: PrivacyConsentModalProps) {
  const setPref = useSettingsStore((s) => s.setPref);

  if (!open) return null;

  const handleAccept = () => {
    setPref('sendAnalytics', true);
    giveAnalyticsConsent();
    markPrivacyConsentShown();
    onClose();
  };

  const handleDecline = () => {
    setPref('sendAnalytics', false);
    revokeAnalyticsConsent();
    markPrivacyConsentShown();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="隐私授权"
    >
      <div
        className={cn(
          'w-full max-w-md rounded-2xl bg-[#15151c] border border-slate-700/60 shadow-2xl overflow-hidden',
          'animate-in zoom-in-95'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-6 pb-4">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <Shield className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-100">使用数据统计</h2>
            <p className="text-xs text-slate-500 mt-0.5">你的隐私是我们的头等大事</p>
          </div>
          <button
            onClick={handleDecline}
            className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-4 space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            我们希望收集<span className="text-slate-100 font-medium">匿名的</span>
            使用数据，用于改进产品体验。所有数据均经过匿名化处理，无法追溯到你个人。
          </p>

          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span className="text-slate-400 text-xs">
                <span className="text-slate-200">收集：</span>
                功能使用率、操作成功率、版本分布、系统信息等统计数据
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span className="text-slate-400 text-xs">
                <span className="text-slate-200">不收集：</span>
                软件名称、文件内容、浏览记录、个人身份信息
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span className="text-slate-400 text-xs">
                <span className="text-slate-200">随时关闭：</span>
                可在「设置 → 隐私」中随时开启或关闭
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={handleDecline}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors',
              'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
            )}
          >
            暂不开启
          </button>
          <button
            onClick={handleAccept}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors',
              'bg-violet-500 text-white hover:bg-violet-400'
            )}
          >
            开启并帮助改进
          </button>
        </div>
      </div>
    </div>
  );
}
