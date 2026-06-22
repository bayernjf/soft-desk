import type { CategoryMeta } from '@/types';

export const CATEGORIES: CategoryMeta[] = [
  { id: 'dev-tools', name: '开发工具', icon: 'Code2', color: '#00d4aa' },
  { id: 'design', name: '设计创意', icon: 'Palette', color: '#a371f7' },
  { id: 'productivity', name: '效率办公', icon: 'LayoutList', color: '#58a6ff' },
  { id: 'communication', name: '通讯协作', icon: 'MessageSquare', color: '#d29922' },
  { id: 'browsers', name: '浏览器', icon: 'Globe', color: '#f85149' },
  { id: 'utilities', name: '系统工具', icon: 'Wrench', color: '#8b949e' },
  { id: 'media', name: '影音娱乐', icon: 'Image', color: '#ec4899' },
  { id: 'security', name: '安全防护', icon: 'ShieldCheck', color: '#10b981' },
];

export const CATEGORY_COLORS: Record<string, string> = {
  'dev-tools': '#00d4aa',
  'design': '#a371f7',
  'productivity': '#58a6ff',
  'communication': '#d29922',
  'browsers': '#f85149',
  'utilities': '#8b949e',
  'media': '#ec4899',
  'security': '#10b981',
};
