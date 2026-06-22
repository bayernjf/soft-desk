import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useSoftwareStore } from '@/stores/software.store';
import { cn } from '@/lib/utils';

export function Layout() {
  const location = useLocation();
  const { isElectron, isScanning, scanSoftware } = useSoftwareStore();

  useEffect(() => {
    if (isElectron) {
      scanSoftware();
    }
  }, [isElectron, scanSoftware]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 font-sans antialiased flex overflow-hidden">
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
        <div className="flex-1 overflow-y-auto">
          <div className="min-h-full px-8 py-6 lg:px-12 lg:py-8 max-w-[1600px] mx-auto w-full">
            <Outlet key={location.pathname} />
          </div>
        </div>
      </main>
    </div>
  );
}
