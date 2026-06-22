import { useMemo } from 'react';
import { AlertCircle, Trash2, HardDrive, Search } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { formatMinutes, formatTimeAgo, formatSize } from '@/services/software.service';
import { cn } from '@/lib/utils';

export function Uninstall() {
  const { software, uninstallSoftware } = useSoftwareStore();

  const bySize = useMemo(() => [...software].sort((a, b) => b.size - a.size).slice(0, 6), [software]);
  const unused = useMemo(
    () =>
      [...software]
        .filter((s) => new Date(s.lastUsed).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000)
        .sort((a, b) => a.usageMinutes - b.usageMinutes),
    [software]
  );
  const largeSize = useMemo(() => software.filter((s) => s.size >= 500), [software]);

  const totalSize = software.reduce((sum, s) => sum + s.size, 0);
  const potentialFree = unused.reduce((sum, s) => sum + s.size, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">软件清理</h1>
          <p className="text-sm text-slate-500 mt-1">快速识别和移除不常用的软件，释放磁盘空间</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-white tabular-nums">{formatSize(totalSize)}</div>
            <div className="text-xs text-slate-500">占用总空间</div>
          </div>
          <div className="w-px h-10 bg-slate-800" />
          <div className="text-right">
            <div className="text-2xl font-bold text-amber-400 tabular-nums">{formatSize(potentialFree)}</div>
            <div className="text-xs text-slate-500">可释放空间</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-200">占用空间最大</h2>
              </div>
              <span className="text-xs text-slate-500">Top {bySize.length}</span>
            </div>
            <div className="space-y-2.5">
              {bySize.map((sw) => (
                <div
                  key={sw.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors group"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: sw.color + '25', color: sw.color }}
                  >
                    {sw.name.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{sw.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {formatSize(sw.size)} · {formatMinutes(sw.usageMinutes)} · {formatTimeAgo(sw.lastUsed)} 使用
                    </div>
                  </div>
                  <button
                    onClick={() => uninstallSoftware(sw.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    卸载
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Search className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-slate-200">最近未使用</h2>
              </div>
              <span className="text-xs text-slate-500">{unused.length} 个软件 · 7+ 天未使用</span>
            </div>
            <div className="space-y-2.5">
              {unused.length > 0 ? (
                unused.slice(0, 5).map((sw) => (
                  <div
                    key={sw.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors group"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ backgroundColor: sw.color + '25', color: sw.color }}
                    >
                      {sw.name.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate">{sw.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        上次使用：{formatTimeAgo(sw.lastUsed)}
                      </div>
                    </div>
                    <button
                      onClick={() => uninstallSoftware(sw.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      卸载
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  ✅ 所有软件都很活跃，继续保持！
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900/40 to-slate-900/40 border border-amber-500/20">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-200">清理建议</h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  检测到 {unused.length} 个软件超过一周未使用，建议优先清理大型应用以释放更多空间。
                </p>
              </div>
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-slate-200">大体积应用</h3>
            </div>
            <div className="text-xs text-slate-500 mb-3">
              {largeSize.length} 个应用 ≥ 500MB
            </div>
            <div className="space-y-2">
              {largeSize.map((sw) => (
                <div
                  key={sw.id}
                  className="flex items-center gap-2.5 text-xs group cursor-pointer"
                  onClick={() => uninstallSoftware(sw.id)}
                >
                  <span
                    className="px-2 py-0.5 rounded-md font-medium"
                    style={{ backgroundColor: sw.color + '20', color: sw.color }}
                  >
                    {formatSize(sw.size)}
                  </span>
                  <span className="text-slate-400 truncate group-hover:text-slate-200 transition-colors">
                    {sw.name}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <button
            className={cn(
              'w-full py-3.5 rounded-2xl text-sm font-semibold transition-all',
              'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white',
              'hover:shadow-lg hover:shadow-violet-500/20 active:scale-[0.99]'
            )}
          >
            {unused.length > 0 ? `一键清理 ${unused.length} 个未使用应用` : '暂无待清理项'}
          </button>
        </aside>
      </div>
    </div>
  );
}
