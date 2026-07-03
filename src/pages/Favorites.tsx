import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart,
  LogIn,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderInput,
  X,
  Check,
  Square,
  SquareCheck,
  ListChecks,
  ArrowUpDown,
  Share2,
} from 'lucide-react';
import { useSoftwareStore } from '@/stores/software.store';
import { useAuthStore } from '@/stores/auth.store';
import { SoftwareCard } from '@/components/features/SoftwareCard';
import { AppIcon } from '@/components/features/AppIcon';
import { ShareDialog } from '@/components/features/ShareDialog';
import { serializeFavoriteGroup } from '@/services/share-serializer';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fetchCloudFavoriteGroups, fetchCloudFavoriteDetails } from '@/services/favorites.service';
import type { CloudFavorite } from '@/services/favorites.service';
import type { FavoriteGroup, Software } from '@/types';
import { matchSoftware } from '@/services/software-matching';
import { cn } from '@/lib/utils';

/* ── 软件卡片包装器（含多选 checkbox / 拖拽排序） ── */
interface CardWrapperProps {
  software: Software;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  sortMode?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
  extraActions?: React.ReactNode;
}

function CardWrapper({
  software,
  selectMode,
  selected,
  onToggleSelect,
  sortMode = false,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  extraActions,
}: CardWrapperProps) {
  return (
    <div
      className={cn(
        'relative group/card transition-all',
        sortMode && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
        isDragOver && 'ring-2 ring-violet-400/70 rounded-2xl'
      )}
      draggable={sortMode}
      onDragStart={
        sortMode
          ? (e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = 'move';
              onDragStart?.();
            }
          : undefined
      }
      onDragEnter={
        sortMode
          ? (e) => {
              e.stopPropagation();
              onDragEnter?.();
            }
          : undefined
      }
      onDragOver={sortMode ? (e) => e.preventDefault() : undefined}
      onDrop={
        sortMode
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDrop?.();
            }
          : undefined
      }
      onDragEnd={sortMode ? () => onDragEnd?.() : undefined}
    >
      {selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={cn(
            'absolute top-2 left-2 z-20 p-1 rounded-md transition-colors',
            selected
              ? 'text-violet-400'
              : 'text-slate-600 hover:text-slate-400'
          )}
        >
          {selected ? (
            <SquareCheck className="w-4 h-4" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      )}
      <SoftwareCard software={software} extraActions={extraActions} />
      {selectMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className="absolute inset-0 z-10 cursor-pointer"
          aria-label={selected ? '取消选择' : '选择'}
        />
      )}
      {sortMode && <div className="absolute inset-0 z-10" aria-hidden="true" />}
    </div>
  );
}

/* ── 分组区域 ── */
interface GroupSectionProps {
  group: FavoriteGroup;
  softwareList: Software[];
  allGroups: FavoriteGroup[];
  cloudFavorites: CloudFavorite[];
  onToggleExpand: (id: string) => void;
  expanded: boolean;
  selectMode: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  sortMode: boolean;
  onReorder: (groupId: string, orderedIds: string[]) => void;
  isGroupDragging: boolean;
  isGroupDragOver: boolean;
  onGroupDragStart: () => void;
  onGroupDragEnter: () => void;
  onGroupDragEnd: () => void;
  onGroupDrop: () => void;
}

function GroupSection({
  group,
  softwareList,
  allGroups,
  cloudFavorites,
  onToggleExpand,
  expanded,
  selectMode,
  selectedIds,
  onToggleSelect,
  sortMode,
  onReorder,
  isGroupDragging,
  isGroupDragOver,
  onGroupDragStart,
  onGroupDragEnter,
  onGroupDragEnd,
  onGroupDrop,
}: GroupSectionProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);
  const [renameError, setRenameError] = useState('');
  const [moveMenuOpen, setMoveMenuOpen] = useState<string | false>(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const software = useSoftwareStore((s) => s.software);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const renameFavoriteGroup = useSoftwareStore((s) => s.renameFavoriteGroup);
  const deleteFavoriteGroup = useSoftwareStore((s) => s.deleteFavoriteGroup);
  const moveFavoriteToGroup = useSoftwareStore((s) => s.moveFavoriteToGroup);
  const toggleFavorite = useSoftwareStore((s) => s.toggleFavorite);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMoveMenuOpen(false);
      }
    }
    if (menuOpen || moveMenuOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [menuOpen, moveMenuOpen]);

  const handleRename = () => {
    const result = renameFavoriteGroup(group.id, renameValue);
    if (result.success) {
      setRenaming(false);
      setRenameError('');
    } else {
      setRenameError(result.error ?? '重命名失败');
    }
  };

  const handleDelete = () => {
    deleteFavoriteGroup(group.id);
    setMenuOpen(false);
  };

  const handleMoveOut = (softwareId: string) => {
    moveFavoriteToGroup(softwareId, null);
  };

  const softwareInGroup = group.softwareIds
    .map((id) => {
      const sw = matchSoftware(softwareList, id);
      if (sw && !sw.deleted) return { type: 'installed' as const, software: sw, uninstalled: sw.uninstalled ?? false };
      const cloudFav = cloudFavorites.find((f) => f.software_id === id);
      if (cloudFav) {
        const cloudSoftware: Software = {
          id: cloudFav.software_id,
          name: cloudFav.name,
          icon: cloudFav.icon ?? '',
          color: cloudFav.color ?? '#64748b',
          category: (cloudFav.category ?? 'utilities') as Software['category'],
          description: '',
          size: 0,
          lastUsed: '',
          usageMinutes: 0,
          launchCount: 0,
          path: '',
          tags: [],
          uninstalled: true,
        };
        return { type: 'cloud' as const, software: cloudSoftware, uninstalled: true };
      }
      return null;
    })
    .filter((item): item is { type: 'installed' | 'cloud'; software: Software; uninstalled: boolean } => item !== null);

  const installedInGroup = softwareInGroup.filter((item) => !item.uninstalled).map((item) => item.software);

  const allSelected = installedInGroup.length > 0 && installedInGroup.every((s) => selectedIds.includes(s.id));
  const someSelected = installedInGroup.some((s) => selectedIds.includes(s.id)) && !allSelected;

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const ids = installedInGroup.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    onReorder(group.id, next);
    setDragId(null);
    setOverId(null);
  };

  return (
    <section
      className={cn(
        'transition-all rounded-2xl',
        isGroupDragging && 'opacity-40',
        isGroupDragOver && 'ring-2 ring-violet-400/70'
      )}
      onDragEnter={sortMode ? () => onGroupDragEnter() : undefined}
      onDragOver={sortMode ? (e) => e.preventDefault() : undefined}
      onDrop={
        sortMode
          ? (e) => {
              e.preventDefault();
              onGroupDrop();
            }
          : undefined
      }
    >
      <div
        className={cn('flex items-center gap-2 mb-3', sortMode && 'cursor-grab active:cursor-grabbing')}
        draggable={sortMode}
        onDragStart={
          sortMode
            ? (e) => {
                e.dataTransfer.effectAllowed = 'move';
                onGroupDragStart();
              }
            : undefined
        }
        onDragEnd={sortMode ? () => onGroupDragEnd() : undefined}
      >
        {selectMode && installedInGroup.length > 0 && (
          <button
            onClick={() => {
              const ids = installedInGroup.map((s) => s.id);
              const allIn = ids.every((id) => selectedIds.includes(id));
              ids.forEach((id) => onToggleSelect(id));
              if (allIn) {
                // 取消全选：由于 toggle 会翻转，需要特殊处理
                // 这里通过两次 toggle 来恢复，但更简单的方式是在父组件处理
                // 暂时用简单方式：父组件的 toggle 会处理
              }
            }}
            className={cn(
              'p-1 rounded-md transition-colors',
              allSelected ? 'text-violet-400' : someSelected ? 'text-violet-400/70' : 'text-slate-600 hover:text-slate-400'
            )}
          >
            {allSelected ? (
              <SquareCheck className="w-3.5 h-3.5" />
            ) : someSelected ? (
              <SquareCheck className="w-3.5 h-3.5 opacity-70" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        <button
          onClick={() => onToggleExpand(group.id)}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 tracking-wider hover:text-slate-200 transition-colors"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          <span className="text-2xl">{group.name}</span>
          <span className="text-slate-600 text-2xl">({softwareInGroup.length})</span>
        </button>
        {!selectMode && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => {
                setMenuOpen((v) => !v);
                setMoveMenuOpen(false);
              }}
              className="p-1 rounded-md text-slate-600 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 w-36 py-1 rounded-xl bg-slate-900 border border-slate-700/60 shadow-xl">
                <button
                  onClick={() => {
                    setRenaming(true);
                    setMenuOpen(false);
                    setRenameValue(group.name);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/60 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  重命名
                </button>
                {loggedIn && (
                  <button
                    onClick={() => {
                      setShareOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-300 hover:bg-slate-800/60 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    分享分组
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除分组
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {renaming && (
        <div className="mb-3 flex items-center gap-2">
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => {
              setRenameValue(e.target.value);
              setRenameError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setRenaming(false);
                setRenameError('');
                setRenameValue(group.name);
              }
            }}
            className={cn(
              'flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-slate-900/60 border text-sm text-white placeholder:text-slate-600 outline-none transition-colors',
              renameError ? 'border-rose-500/50 focus:border-rose-400' : 'border-slate-700/60 focus:border-violet-500/50'
            )}
            placeholder="分组名称"
          />
          <button
            onClick={handleRename}
            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setRenaming(false);
              setRenameError('');
              setRenameValue(group.name);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {renameError && <p className="text-[11px] text-rose-400 mb-2">{renameError}</p>}

      {expanded && (
        <>
          {softwareInGroup.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {softwareInGroup.map(({ software: sw, uninstalled }) => (
                uninstalled ? (
                  <div
                    key={sw.id}
                    className={cn(
                      'relative p-3.5 rounded-2xl border border-slate-800/60',
                      'bg-slate-900/20 opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <AppIcon software={sw} size={40} rounded="rounded-xl" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-400 truncate">
                          {sw.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                            未安装
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => void toggleFavorite(sw.id)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="取消收藏"
                      >
                        <Heart className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <CardWrapper
                    key={sw.id}
                    software={sw}
                    selectMode={selectMode}
                    selected={selectedIds.includes(sw.id)}
                    onToggleSelect={() => onToggleSelect(sw.id)}
                    sortMode={sortMode}
                    isDragging={dragId === sw.id}
                    isDragOver={overId === sw.id && dragId !== sw.id}
                    onDragStart={() => setDragId(sw.id)}
                    onDragEnter={() => setOverId(sw.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDrop={() => handleDrop(sw.id)}
                    extraActions={
                      !selectMode ? (
                        <div className="relative">
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMoveMenuOpen((prev) => (prev === sw.id ? false : sw.id));
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition-colors"
                            title="移动到"
                          >
                            <FolderInput className="w-3.5 h-3.5" />
                          </button>
                          {moveMenuOpen === sw.id && (
                            <div className="absolute right-0 top-full mt-1 z-30 w-40 py-1 rounded-xl bg-slate-900 border border-slate-700/60 shadow-xl">
                              <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveOut(sw.id);
                                  setMoveMenuOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/60 transition-colors"
                              >
                                移出分组
                              </button>
                              {allGroups
                                .filter((g) => g.id !== group.id)
                                .map((g) => (
                                  <button
                                    key={g.id}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveFavoriteToGroup(sw.id, g.id);
                                      setMoveMenuOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/60 transition-colors"
                                  >
                                    移动到「{g.name}」
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : undefined
                    }
                  />
                )
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600 py-2">分组为空</p>
          )}
        </>
      )}

      {shareOpen && (
        <ShareDialog
          kind="favorite_group"
          defaultTitle={group.name}
          buildPayload={() => serializeFavoriteGroup(group, software)}
          onClose={() => setShareOpen(false)}
        />
      )}
    </section>
  );
}

/* ── 主页面 ── */
export function Favorites() {
  const navigate = useNavigate();
  const software = useSoftwareStore((s) => s.software);
  const favoriteIds = useSoftwareStore((s) => s.favoriteIds);
  const favoriteGroups = useSoftwareStore((s) => s.favoriteGroups);
  const createFavoriteGroup = useSoftwareStore((s) => s.createFavoriteGroup);
  const moveFavoriteToGroup = useSoftwareStore((s) => s.moveFavoriteToGroup);
  const moveFavoritesToGroup = useSoftwareStore((s) => s.moveFavoritesToGroup);
  const reorderFavoritesInGroup = useSoftwareStore((s) => s.reorderFavoritesInGroup);
  const reorderUngroupedFavorites = useSoftwareStore((s) => s.reorderUngroupedFavorites);
  const reorderFavoriteGroups = useSoftwareStore((s) => s.reorderFavoriteGroups);
  const toggleFavorite = useSoftwareStore((s) => s.toggleFavorite);
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const profile = useAuthStore((s) => s.profile);

  const [cloudFavorites, setCloudFavorites] = useState<CloudFavorite[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [createError, setCreateError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [ungroupedExpanded, setUngroupedExpanded] = useState(true);
  const [moveMenuOpen, setMoveMenuOpen] = useState<string | false>(false);
  const createInputRef = useRef<HTMLInputElement>(null);

  const setFavoriteGroups = useSoftwareStore((s) => s.setFavoriteGroups);

  /* ── 多选状态 ── */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const batchMoveRef = useRef<HTMLDivElement>(null);

  /* ── 排序状态 ── */
  const [sortMode, setSortMode] = useState(false);
  const [groupDragId, setGroupDragId] = useState<string | null>(null);
  const [groupOverId, setGroupOverId] = useState<string | null>(null);
  const [ungroupedDragId, setUngroupedDragId] = useState<string | null>(null);
  const [ungroupedOverId, setUngroupedOverId] = useState<string | null>(null);

  /* ── 同步：仅在登录态变化时从云端拉取一次，避免被 software 周期性刷新覆盖本地分组 ── */
  useEffect(() => {
    if (!loggedIn || !profile?.userId || !isSupabaseConfigured()) {
      setCloudFavorites([]);
      return;
    }
    let cancelled = false;
    setCloudLoading(true);

    Promise.all([
      fetchCloudFavoriteGroups(profile.userId),
      fetchCloudFavoriteDetails(profile.userId),
    ])
      .then(([cloudGroups, cloudDetails]) => {
        if (cancelled) return;

        const groupMap = new Map<string, string[]>();
        for (const d of cloudDetails) {
          if (d.group_id) {
            const arr = groupMap.get(d.group_id) ?? [];
            arr.push(d.software_id);
            groupMap.set(d.group_id, arr);
          }
        }

        const mergedGroups: FavoriteGroup[] = cloudGroups.map((cg) => ({
          id: cg.group_id,
          name: cg.name,
          softwareIds: groupMap.get(cg.group_id) ?? [],
          createdAt: cg.created_at,
        }));
        setFavoriteGroups(mergedGroups);
        setCloudFavorites(cloudDetails);
      })
      .catch(() => {
        if (!cancelled) {
          setCloudFavorites([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCloudLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loggedIn, profile?.userId, setFavoriteGroups]);

  useEffect(() => {
    if (creatingGroup && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [creatingGroup]);

  /* ── 批量移动下拉点击外部关闭 ── */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (batchMoveRef.current && !batchMoveRef.current.contains(e.target as Node)) {
        setBatchMoveOpen(false);
      }
    }
    if (batchMoveOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [batchMoveOpen]);

  const groupedSoftwareIds = new Set(
    favoriteGroups.flatMap((g) => g.softwareIds)
  );

  const installedFavorites = favoriteIds
    .map((id) => matchSoftware(software, id))
    .filter((s): s is Software => Boolean(s) && !s!.uninstalled && !s!.deleted);

  const ungroupedInstalledFavorites = installedFavorites.filter(
    (s) => !groupedSoftwareIds.has(s.id)
  );

  const uninstalledFavorites = cloudFavorites.filter((f) => {
    const s = matchSoftware(software, f.software_id);
    return !s || s.uninstalled || s.deleted;
  });

  const ungroupedUninstalledFavorites = uninstalledFavorites.filter(
    (f) => !groupedSoftwareIds.has(f.software_id)
  );

  const ungroupedFavorites = ungroupedInstalledFavorites;

  const totalCount = installedFavorites.length + uninstalledFavorites.length;

  /* ── 多选操作 ── */
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const allVisible = [
      ...installedFavorites.map((s) => s.id),
    ];
    const allSelected = allVisible.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allVisible.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allVisible])));
    }
  };

  const handleBatchMove = (groupId: string | null) => {
    if (selectedIds.length === 0) return;
    moveFavoritesToGroup(selectedIds, groupId);
    setSelectedIds([]);
    setBatchMoveOpen(false);
  };

  /* ── 拖拽排序：分组之间 ── */
  const handleGroupDrop = (targetId: string) => {
    if (!groupDragId || groupDragId === targetId) {
      setGroupDragId(null);
      setGroupOverId(null);
      return;
    }
    const ids = favoriteGroups.map((g) => g.id);
    const from = ids.indexOf(groupDragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      setGroupDragId(null);
      setGroupOverId(null);
      return;
    }
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, groupDragId);
    reorderFavoriteGroups(next);
    setGroupDragId(null);
    setGroupOverId(null);
  };

  /* ── 拖拽排序：未分组区域 ── */
  const handleUngroupedDrop = (targetId: string) => {
    if (!ungroupedDragId || ungroupedDragId === targetId) {
      setUngroupedDragId(null);
      setUngroupedOverId(null);
      return;
    }
    const ids = ungroupedFavorites.map((s) => s.id);
    const from = ids.indexOf(ungroupedDragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      setUngroupedDragId(null);
      setUngroupedOverId(null);
      return;
    }
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, ungroupedDragId);
    reorderUngroupedFavorites(next);
    setUngroupedDragId(null);
    setUngroupedOverId(null);
  };

  const handleCreateGroup = () => {
    const result = createFavoriteGroup(newGroupName);
    if (result.success) {
      setCreatingGroup(false);
      setNewGroupName('');
      setCreateError('');
      if (result.group) {
        setExpandedGroups((prev) => ({ ...prev, [result.group!.id]: true }));
      }
    } else {
      setCreateError(result.error ?? '创建失败');
    }
  };

  const toggleGroupExpand = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /* ── 可移动到哪些分组（排除当前所在分组） ── */
  const getValidTargets = () => {
    const targets: { id: string | null; name: string }[] = [{ id: null, name: '未分组' }];
    for (const g of favoriteGroups) {
      const hasSelected = g.softwareIds.some((sid) => selectedIds.includes(sid));
      if (hasSelected) {
        // 至少有一个选中项在该分组，可以移出
      }
      targets.push({ id: g.id, name: g.name });
    }
    return targets;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">收藏夹</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loggedIn ? '跨设备同步的收藏软件' : '登录账号后即可管理收藏'}
          </p>
        </div>
        {loggedIn && (
          <div className="text-right">
            <div className="text-2xl font-bold text-white tabular-nums">{totalCount}</div>
            <div className="text-xs text-slate-500">个收藏</div>
          </div>
        )}
      </div>

      {!loggedIn ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/40 flex items-center justify-center mb-4">
            <LogIn className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-sm font-medium text-slate-300 mb-1">请先登录</h3>
          <p className="text-xs text-slate-500 max-w-xs mb-5">
            登录账号后即可收藏软件、创建分组，并在多设备间同步
          </p>
          <button
            onClick={() => navigate('/account')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 border border-violet-500/20 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            去登录
          </button>
        </div>
      ) : (
        <>
          {cloudLoading && totalCount === 0 && (
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-2 text-xs text-slate-400">
              正在同步云端收藏…
            </div>
          )}

          {totalCount > 0 ? (
            <div className="space-y-6">
              {/* 顶部工具栏 */}
              <div className="flex items-center gap-2">
                {!creatingGroup ? (
                  <button
                    onClick={() => {
                      setCreatingGroup(true);
                      setNewGroupName('');
                      setCreateError('');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/40 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 border border-slate-800/60 hover:border-slate-700/60 transition-all"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    新建分组
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      ref={createInputRef}
                      value={newGroupName}
                      onChange={(e) => {
                        setNewGroupName(e.target.value);
                        setCreateError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateGroup();
                        if (e.key === 'Escape') {
                          setCreatingGroup(false);
                          setCreateError('');
                          setNewGroupName('');
                        }
                      }}
                      placeholder="分组名称"
                      className={cn(
                        'px-3 py-1.5 rounded-lg bg-slate-900/60 border text-sm text-white placeholder:text-slate-600 outline-none transition-colors w-48',
                        createError ? 'border-rose-500/50 focus:border-rose-400' : 'border-slate-700/60 focus:border-violet-500/50'
                      )}
                    />
                    <button
                      onClick={handleCreateGroup}
                      className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setCreatingGroup(false);
                        setCreateError('');
                        setNewGroupName('');
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800/60 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (selectMode) {
                      setSelectMode(false);
                      setSelectedIds([]);
                    } else {
                      setSelectMode(true);
                      setSortMode(false);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    selectMode
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 border-slate-800/60 hover:border-slate-700/60'
                  )}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  {selectMode ? '完成' : '选择'}
                </button>

                <button
                  onClick={() => {
                    if (sortMode) {
                      setSortMode(false);
                    } else {
                      setSortMode(true);
                      setSelectMode(false);
                      setSelectedIds([]);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    sortMode
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 border-slate-800/60 hover:border-slate-700/60'
                  )}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {sortMode ? '完成' : '排序'}
                </button>

                {sortMode && (
                  <span className="text-xs text-slate-500">拖动卡片可调整顺序</span>
                )}

                {selectMode && installedFavorites.length > 0 && (
                  <button
                    onClick={handleSelectAll}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {installedFavorites.every((s) => selectedIds.includes(s.id)) ? '取消全选' : '全选'}
                  </button>
                )}
              </div>
              {createError && <p className="text-[11px] text-rose-400 -mt-4">{createError}</p>}

              {/* 分组列表 */}
              {favoriteGroups.length > 0 && (
                <div className="space-y-4">
                  {favoriteGroups.map((group) => (
                    <GroupSection
                      key={group.id}
                      group={group}
                      softwareList={software}
                      allGroups={favoriteGroups}
                      cloudFavorites={cloudFavorites}
                      onToggleExpand={toggleGroupExpand}
                      expanded={expandedGroups[group.id] ?? true}
                      selectMode={selectMode}
                      selectedIds={selectedIds}
                      onToggleSelect={handleToggleSelect}
                      sortMode={sortMode}
                      onReorder={reorderFavoritesInGroup}
                      isGroupDragging={groupDragId === group.id}
                      isGroupDragOver={groupOverId === group.id && groupDragId !== group.id}
                      onGroupDragStart={() => setGroupDragId(group.id)}
                      onGroupDragEnter={() => setGroupOverId(group.id)}
                      onGroupDragEnd={() => {
                        setGroupDragId(null);
                        setGroupOverId(null);
                      }}
                      onGroupDrop={() => handleGroupDrop(group.id)}
                    />
                  ))}
                </div>
              )}

              {/* 未分组软件 */}
              {(ungroupedFavorites.length > 0 || ungroupedUninstalledFavorites.length > 0) && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    {selectMode && (
                      <button
                        onClick={() => {
                          const ids = ungroupedFavorites.map((s) => s.id);
                          const allIn = ids.every((id) => selectedIds.includes(id));
                          if (allIn) {
                            setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
                          } else {
                            setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
                          }
                        }}
                        className={cn(
                          'p-1 rounded-md transition-colors',
                          ungroupedFavorites.every((s) => selectedIds.includes(s.id))
                            ? 'text-violet-400'
                            : 'text-slate-600 hover:text-slate-400'
                        )}
                      >
                        {ungroupedFavorites.every((s) => selectedIds.includes(s.id)) ? (
                          <SquareCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setUngroupedExpanded((v) => !v)}
                      className="flex items-center gap-2 text-xs font-medium text-slate-400 tracking-wider hover:text-slate-200 transition-colors"
                    >
                      {ungroupedExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      <span>未分组</span>
                      <span className="text-slate-600">({ungroupedFavorites.length + ungroupedUninstalledFavorites.length})</span>
                    </button>
                  </div>
                  {ungroupedExpanded && (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {ungroupedFavorites.map((sw) => (
                        <CardWrapper
                          key={sw.id}
                          software={sw}
                          selectMode={selectMode}
                          selected={selectedIds.includes(sw.id)}
                          onToggleSelect={() => handleToggleSelect(sw.id)}
                          sortMode={sortMode}
                          isDragging={ungroupedDragId === sw.id}
                          isDragOver={ungroupedOverId === sw.id && ungroupedDragId !== sw.id}
                          onDragStart={() => setUngroupedDragId(sw.id)}
                          onDragEnter={() => setUngroupedOverId(sw.id)}
                          onDragEnd={() => {
                            setUngroupedDragId(null);
                            setUngroupedOverId(null);
                          }}
                          onDrop={() => handleUngroupedDrop(sw.id)}
                          extraActions={
                            !selectMode && favoriteGroups.length > 0 ? (
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMoveMenuOpen((prev) => (prev === sw.id ? false : sw.id));
                                  }}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition-colors"
                                  title="移动到"
                                >
                                  <FolderInput className="w-3.5 h-3.5" />
                                </button>
                                {moveMenuOpen === sw.id && (
                                  <div className="absolute right-0 top-full mt-1 z-30 w-40 py-1 rounded-xl bg-slate-900 border border-slate-700/60 shadow-xl">
                                    {favoriteGroups.map((g) => (
                                      <button
                                        key={g.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveFavoriteToGroup(sw.id, g.id);
                                          setMoveMenuOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/60 transition-colors"
                                      >
                                        移动到「{g.name}」
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : undefined
                          }
                        />
                      ))}
                      {ungroupedUninstalledFavorites.map((fav) => (
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
                              onClick={() => void toggleFavorite(fav.software_id)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="取消收藏"
                            >
                              <Heart className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
        </>
      )}

      {/* 批量操作浮动栏 */}
      {selectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-sm border bg-white/95 border-slate-200 dark:bg-slate-900/95 dark:border-slate-700/60">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              已选 <span className="text-slate-900 dark:text-white font-medium">{selectedIds.length}</span> 个
            </span>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700/60" />
            <div className="relative" ref={batchMoveRef}>
              <button
                onClick={() => setBatchMoveOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-violet-100 text-violet-700 hover:bg-violet-200 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25 dark:border-violet-500/20"
              >
                <FolderInput className="w-3.5 h-3.5" />
                移动到
              </button>
              {batchMoveOpen && (
                <div className="absolute left-0 bottom-full mb-1 z-50 w-44 py-1 rounded-xl shadow-xl border bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700/60">
                  {getValidTargets().map((t) => (
                    <button
                      key={t.id ?? 'ungrouped'}
                      onClick={() => handleBatchMove(t.id)}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      {t.id === null ? '移出分组' : `移动到「${t.name}」`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
