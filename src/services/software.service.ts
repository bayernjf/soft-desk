import type { Software, SoftwareCategory } from '@/types';
import { useSoftwareStore } from '@/stores/software.store';

export function getFilteredSoftware(): Software[] {
  const { software, selectedCategory, searchQuery, sortBy } = useSoftwareStore.getState();

  let result = software;

  if (selectedCategory !== 'all') {
    result = result.filter((s) => s.category === selectedCategory);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.publisher?.toLowerCase().includes(q)
    );
  }

  switch (sortBy) {
    case 'name':
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'usage':
      result = [...result].sort((a, b) => b.usageMinutes - a.usageMinutes);
      break;
    case 'recent':
      result = [...result].sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
      break;
    case 'size':
      result = [...result].sort((a, b) => b.size - a.size);
      break;
  }

  return result;
}

export function getSoftwareById(id: string): Software | undefined {
  return useSoftwareStore.getState().software.find((s) => s.id === id);
}

export function getSoftwareByCategory(category: SoftwareCategory): Software[] {
  return useSoftwareStore.getState().software.filter((s) => s.category === category);
}

export function getTopSoftware(limit = 5): Software[] {
  return [...useSoftwareStore.getState().software]
    .sort((a, b) => b.usageMinutes - a.usageMinutes)
    .slice(0, limit);
}

export function getRecentSoftware(limit = 8): Software[] {
  return [...useSoftwareStore.getState().software]
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
    .slice(0, limit);
}

export function formatTimeAgo(dateStr: string): string {
  const now = new Date().getTime();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} 分钟`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  if (hours < 8) return `${hours} 小时 ${remaining} 分`;
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

export function formatSize(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}
