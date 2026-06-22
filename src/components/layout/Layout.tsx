import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useSoftwareStore } from '@/stores/software.store';
import { cn } from '@/lib/utils';

export function Layout() {
  const location = useLocation();
  const { isScanning, scanError, scanSoftware, setElectronReady } = useSoftwareStore();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const tryScan = () => {
      if (cancelled) return;
      if (window.softdesk) {
        setElectronReady(true);
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
    </div>
  );
}
