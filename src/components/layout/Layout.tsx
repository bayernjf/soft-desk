import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { QuickLauncher } from '@/components/features/QuickLauncher';
import { useSoftwareStore } from '@/stores/software.store';
import { useSettingsStore, syncWindowPrefs } from '@/stores/settings.store';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';

export function Layout() {
  const location = useLocation();
  const { isScanning, scanError, scanSoftware, applyScannedApps, setElectronReady } =
    useSoftwareStore();
  const [launcherOpen, setLauncherOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const tryScan = () => {
      if (cancelled) return;
      if (window.softdesk) {
        setElectronReady(true);
        // bridge 就绪后,把渲染层持久化的窗口偏好同步给主进程,
        // 确保下次冷启动 createWindow 前 window-prefs.json 与设置页一致
        syncWindowPrefs(useSettingsStore.getState().prefs);
        scanSoftware();
        return;
      }
      if (attempts++ < maxAttempts) {
        setTimeout(tryScan, 100);
      }
    };

    tryScan();
    return () => {
      cancelled = true;
    };
  }, [scanSoftware, setElectronReady]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const subscribe = () => {
      if (cancelled || !window.softdesk) return;
      // 主进程通过 FSEvents 监听到安装/卸载后主动推送,无需窗口聚焦轮询
      unsubscribe = window.softdesk.onSoftwareChanged((apps) => applyScannedApps(apps));
    };

    if (window.softdesk) {
      subscribe();
    } else {
      const retry = () => {
        if (cancelled) return;
        if (window.softdesk) {
          subscribe();
          return;
        }
        if (attempts++ < maxAttempts) setTimeout(retry, 100);
      };
      retry();
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [applyScannedApps]);

  // 启动时向主进程(权威)查询登录态,回填渲染层会话(仅登录态 + 脱敏资料)
  useEffect(() => {
    void useAuthStore.getState().hydrateSession();
  }, []);

  // 接通快速启动器:Electron 托盘/全局快捷键事件 + 应用内键盘快捷键(⌘⇧Space)
  useEffect(() => {
    const unsubscribe = window.softdesk?.onOpenLauncher(() => setLauncherOpen(true));
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        setLauncherOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      unsubscribe?.();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f] text-slate-100 font-sans antialiased overflow-hidden">
      {/* 顶部窗口拖拽区:固定在窗口最顶部、横跨整宽、高约 1cm,透明且不占布局。
          通过 -webkit-app-region: drag 实现拖动窗口;双击调用主进程 IPC 切换最大化/还原。
          故意不加 isElectron 条件——避免该常量在模块加载时因 preload 时序为 false 而导致拖拽区不渲染。
          非 Electron 环境下 WebkitAppRegion 会被浏览器忽略,window.softdesk 为空也安全跳过。 */}
      <div
        className="fixed top-0 left-0 right-0 h-10 z-50"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        onDoubleClick={() => window.softdesk?.toggleMaximize()}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main
          className={cn(
            'flex-1 flex flex-col overflow-hidden',
            'bg-gradient-to-br from-[#0a0a0f] via-[#0d0d14] to-[#0a0a0f]'
          )}
        >
          {isScanning && (
            <div className="flex items-center gap-2 px-8 py-2 text-xs text-violet-300 bg-violet-500/10 border-b border-violet-500/20">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              正在扫描本机已安装的软件...
            </div>
          )}
          {!isScanning && scanError && (
            <div className="px-8 py-2 text-xs text-rose-300 bg-rose-500/10 border-b border-rose-500/20">
              扫描失败:{scanError}
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            <div className="min-h-full px-8 py-6 lg:px-12 lg:py-8 max-w-[1600px] mx-auto w-full">
              <Outlet key={location.pathname} />
            </div>
          </div>
        </main>
      </div>
      <QuickLauncher open={launcherOpen} onClose={() => setLauncherOpen(false)} />
    </div>
  );
}
