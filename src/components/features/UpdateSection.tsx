import { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UpdaterEvent, UpdaterStatus } from '@/types/electron';

type UiState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; version: string }
  | { kind: 'downloading'; version: string; percent: number; speed: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }
  | { kind: 'dev-mode' };

function humanSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let n = bps;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

export function UpdateSection() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [ui, setUi] = useState<UiState>({ kind: 'idle' });

  useEffect(() => {
    const bridge = window.softdesk;
    if (!bridge) return;
    let unsub: (() => void) | null = null;
    bridge.getUpdaterStatus().then((s) => {
      setStatus(s);
      if (s.devMode) setUi({ kind: 'dev-mode' });
      else if (s.updateReady) setUi({ kind: 'ready', version: s.currentVersion });
    });
    unsub = bridge.onUpdaterEvent((event: UpdaterEvent) => {
      switch (event.type) {
        case 'checking':
          setUi({ kind: 'checking' });
          break;
        case 'available':
          setUi({ kind: 'downloading', version: event.version, percent: 0, speed: 0 });
          break;
        case 'not-available':
          setUi({ kind: 'up-to-date', version: event.version });
          break;
        case 'progress':
          setUi((prev) =>
            prev.kind === 'downloading'
              ? { ...prev, percent: event.percent, speed: event.bytesPerSecond }
              : {
                  kind: 'downloading',
                  version: '',
                  percent: event.percent,
                  speed: event.bytesPerSecond,
                }
          );
          break;
        case 'downloaded':
          setUi({ kind: 'ready', version: event.version });
          break;
        case 'error':
          setUi({ kind: 'error', message: event.message });
          break;
      }
    });
    return () => {
      unsub?.();
    };
  }, []);

  const bridge = window.softdesk;
  if (!bridge) return null;

  const currentVersion = status?.currentVersion ?? '—';

  const handleCheck = async () => {
    setUi({ kind: 'checking' });
    const result = await bridge.checkForUpdates();
    if (result.ok === false) {
      if (result.reason === 'dev-mode') setUi({ kind: 'dev-mode' });
      else setUi({ kind: 'error', message: result.message ?? '检查失败,请稍后重试' });
      return;
    }
    if (!result.hasUpdate) {
      setUi({ kind: 'up-to-date', version: result.currentVersion });
    }
  };

  const handleInstall = async () => {
    await bridge.quitAndInstall();
  };

  return (
    <div className="rounded-2xl bg-slate-800/40 border border-slate-800 overflow-hidden">
      <div className="flex items-start gap-3 p-4 border-b border-slate-800/80">
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
          <Download className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-200">应用更新</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            当前版本 <span className="text-slate-300 tabular-nums">v{currentVersion}</span>
            {status?.devMode ? '(开发模式,不检查更新)' : ' · 每 6 小时自动检查新版'}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {ui.kind === 'idle' && (
          <p className="text-xs text-slate-500 leading-relaxed">
            SoftDesk 会在启动后自动检查新版本。若发现更新,将在后台下载并提示你重启完成安装。
          </p>
        )}

        {ui.kind === 'checking' && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>正在检查更新...</span>
          </div>
        )}

        {ui.kind === 'up-to-date' && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>已是最新版本 v{ui.version}</span>
          </div>
        )}

        {ui.kind === 'downloading' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>正在下载 v{ui.version || '新版'}...</span>
              <span className="tabular-nums">
                {Math.max(0, Math.min(100, Math.round(ui.percent)))}%
                {ui.speed > 0 ? ` · ${humanSpeed(ui.speed)}` : ''}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, ui.percent))}%` }}
              />
            </div>
          </div>
        )}

        {ui.kind === 'ready' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-violet-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>新版本 v{ui.version} 已就绪,重启即可安装</span>
            </div>
            <button
              onClick={handleInstall}
              className={cn(
                'self-start px-4 py-1.5 rounded-lg text-xs font-medium',
                'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white',
                'hover:from-violet-400 hover:to-fuchsia-400 transition-colors'
              )}
            >
              立即重启并安装
            </button>
          </div>
        )}

        {ui.kind === 'error' && (
          <div className="flex items-start gap-2 text-xs text-rose-400">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="leading-relaxed">{ui.message}</span>
          </div>
        )}

        {ui.kind === 'dev-mode' && (
          <p className="text-xs text-slate-500 leading-relaxed">
            开发模式下不进行更新检查。请在打包后的正式版中使用此功能。
          </p>
        )}

        <button
          onClick={handleCheck}
          disabled={ui.kind === 'checking' || ui.kind === 'downloading' || ui.kind === 'dev-mode'}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
            'bg-slate-800/60 text-slate-300 border border-slate-700',
            'hover:bg-slate-800 hover:text-slate-100 transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('w-3 h-3', ui.kind === 'checking' && 'animate-spin')} />
          手动检查更新
        </button>
      </div>
    </div>
  );
}
