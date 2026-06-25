import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, CloudOff } from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { SoftwareCard } from '@/components/features/SoftwareCard';
import { AppIcon } from '@/components/features/AppIcon';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fetchCloudFavorites } from '@/services/favorites.service';
import type { CloudFavorite } from '@/services/favorites.service';
import { cn } from '@/lib/utils';

export function Favorites() {
  const navigate = useNavigate();
  const software = useSoftwareStore((s) => s.software);
  const favoriteIds = useSoftwareStore((s) => s.favoriteIds);
  const toggleFavorite = useSoftwareStore((s) => s.toggleFavorite);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const profile = useAuthStore((s) => s.profile);

  const [cloudFavorites, setCloudFavorites] = useState<CloudFavorite[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);

  // 登录后从云端拉取完整收藏数据
  useEffect(() => {
    if (!loggedIn || !profile?.userId || !isSupabaseConfigured()) {
      setCloudFavorites([]);
      return;
    }
    let cancelled = false;
    setCloudLoading(true);
    fetchCloudFavorites(profile.userId)
      .then(async (ids) => {
        if (cancelled) return;
        // 补充云端收藏的完整元数据
        const details: CloudFavorite[] = ids.map((id) => {
          const local = software.find((s) => s.id === id);
          if (local) {
            return {
              id: 0,
              user_id: profile.userId,
              software_id: id,
              name: local.name,
              bundle_id: local.id,
              category: local.category,
              icon: local.icon,
              color: local.color,
              created_at: '',
            };
          }
          return {
            id: 0,
            user_id: profile.userId,
            software_id: id,
            name: id,
            bundle_id: id,
            category: null,
            icon: null,
            color: null,
            created_at: '',
          };
        });
        setCloudFavorites(details);
      })
      .catch(() => {
        if (!cancelled) setCloudFavorites([]);
      })
      .finally(() => {
        if (!cancelled) setCloudLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loggedIn, profile?.userId, software]);

  const installedFavorites = software.filter(
    (s) => favoriteIds.includes(s.id) && !s.uninstalled && !s.deleted
  );

  const uninstalledFavorites = cloudFavorites.filter(
    (f) => !software.some((s) => s.id === f.software_id && !s.uninstalled && !s.deleted)
  );

  const totalCount = installedFavorites.length + uninstalledFavorites.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">收藏夹</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loggedIn ? '跨设备同步的收藏软件' : '登录账号即可跨设备同步收藏'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white tabular-nums">{totalCount}</div>
          <div className="text-xs text-slate-500">个收藏</div>
        </div>
      </div>

      {!loggedIn && (
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-3 text-xs text-slate-400">
          <CloudOff className="w-4 h-4 text-slate-500" />
          <span>登录账号后，收藏数据可自动同步到云端，换设备也能看到。</span>
        </div>
      )}

      {cloudLoading && totalCount === 0 && (
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-2 text-xs text-slate-400">
          正在同步云端收藏…
        </div>
      )}

      {totalCount > 0 ? (
        <div className="space-y-6">
          {installedFavorites.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                已安装 ({installedFavorites.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {installedFavorites.map((sw) => (
                  <SoftwareCard key={sw.id} software={sw} />
                ))}
              </div>
            </section>
          )}

          {uninstalledFavorites.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                未安装 ({uninstalledFavorites.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {uninstalledFavorites.map((fav) => (
                  <div
                    key={fav.software_id}
                    className={cn(
                      'relative p-3.5 rounded-2xl border border-slate-800/60',
                      'bg-slate-900/20 opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <AppIcon
                        software={{
                          id: fav.software_id,
                          name: fav.name,
                          icon: fav.icon ?? '',
                          color: fav.color ?? '#64748b',
                          category: (fav.category ?? 'utilities') as import('@/types').SoftwareCategory,
                          description: '',
                          size: 0,
                          lastUsed: '',
                          usageMinutes: 0,
                          launchCount: 0,
                          path: '',
                          tags: [],
                        }}
                        size={40}
                        rounded="rounded-xl"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-400 truncate">
                          {fav.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                            未安装
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (!loggedIn) {
                            navigate('/account');
                            return;
                          }
                          void toggleFavorite(fav.software_id);
                        }}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title={loggedIn ? '取消收藏' : '请先登录'}
                      >
                        <Heart className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-4">
            <Heart className="w-7 h-7 text-slate-600" />
          </div>
          <h3 className="text-sm font-medium text-slate-300 mb-1">暂无收藏</h3>
          <p className="text-xs text-slate-500 max-w-xs">
            在软件库或工作台中，将鼠标悬停在软件卡片上，点击星星图标即可收藏
          </p>
        </div>
      )}
    </div>
  );
}
