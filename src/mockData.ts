import type { Software, Category, Stats } from './types';

export const mockCategories: Category[] = [
  { id: 'dev', name: '开发工具', icon: 'Code', color: '#00d4aa', count: 12 },
  { id: 'design', name: '设计软件', icon: 'Palette', color: '#a371f7', count: 8 },
  { id: 'office', name: '办公套件', icon: 'FileText', color: '#58a6ff', count: 6 },
  { id: 'social', name: '通讯应用', icon: 'MessageCircle', color: '#d29922', count: 5 },
  { id: 'system', name: '系统工具', icon: 'Settings', color: '#8b949e', count: 10 },
  { id: 'browser', name: '浏览器', icon: 'Globe', color: '#f85149', count: 3 },
  { id: 'media', name: '影音娱乐', icon: 'Play', color: '#a371f7', count: 4 },
];

const mk = (overrides: Partial<Software>): Software => ({
  id: 'x',
  name: 'App',
  description: '',
  icon: '',
  category: 'dev-tools',
  version: '1.0.0',
  publisher: '',
  size: 100,
  installDate: '',
  lastUsed: '',
  usageMinutes: 0,
  launchCount: 0,
  path: '',
  color: '#8b5cf6',
  tags: [],
  ...overrides,
});

export const mockSoftware: Software[] = [
  mk({ id: '1', name: 'Visual Studio Code', description: '代码编辑器', category: 'dev-tools', publisher: 'Microsoft', size: 358, usageMinutes: 89230, launchCount: 1247, color: '#2563eb', tags: ['代码', '开发'] }),
  mk({ id: '2', name: 'Figma', description: '协作式界面设计工具', category: 'design', publisher: 'Figma Inc.', size: 185, usageMinutes: 23410, launchCount: 523, color: '#a371f7', tags: ['设计'] }),
  mk({ id: '3', name: 'Chrome', description: '网页浏览器', category: 'browsers', publisher: 'Google', size: 680, usageMinutes: 124560, launchCount: 2156, color: '#ef4444', tags: ['浏览器'] }),
  mk({ id: '4', name: 'Slack', description: '团队沟通协作', category: 'communication', publisher: 'Salesforce', size: 245, usageMinutes: 45620, launchCount: 1892, color: '#a855f7', tags: ['团队'] }),
  mk({ id: '5', name: 'Notion', description: '知识库与协作工作区', category: 'productivity', publisher: 'Notion Labs', size: 286, usageMinutes: 124500, launchCount: 789, color: '#8b949e', tags: ['笔记'] }),
  mk({ id: '6', name: 'Terminal', description: '系统终端', category: 'utilities', publisher: 'Apple', size: 48, usageMinutes: 56780, launchCount: 3456, color: '#1f2937', tags: ['终端'] }),
  mk({ id: '7', name: 'Finder', description: '文件管理器', category: 'utilities', publisher: 'Apple', size: 120, usageMinutes: 23450, launchCount: 5678, color: '#58a6ff', tags: ['文件'] }),
  mk({ id: '8', name: 'Photoshop', description: '专业图像处理软件', category: 'design', publisher: 'Adobe', size: 2450, usageMinutes: 17890, launchCount: 234, color: '#f87171', tags: ['设计', '图像处理'] }),
  mk({ id: '9', name: 'Safari', description: '系统默认浏览器', category: 'browsers', publisher: 'Apple', size: 180, usageMinutes: 34560, launchCount: 1234, color: '#0ea5e9', tags: ['浏览器'] }),
  mk({ id: '10', name: 'Xcode', description: '苹果开发工具', category: 'dev-tools', publisher: 'Apple', size: 8420, usageMinutes: 42310, launchCount: 567, color: '#3b82f6', tags: ['代码', '开发'] }),
];

export const mockStats: Stats = {
  totalApps: 18,
  totalUsageTime: 5678900,
  todayUsageTime: 28456,
  topApps: [
    { name: 'VS Code', usageTime: 124560, percentage: 28.5 },
    { name: 'Chrome', usageTime: 98760, percentage: 22.6 },
    { name: 'Terminal', usageTime: 67890, percentage: 15.5 },
    { name: 'Slack', usageTime: 45670, percentage: 10.4 },
    { name: 'Figma', usageTime: 34560, percentage: 7.9 },
  ],
  categoryDistribution: [
    { name: '开发工具', count: 4, color: '#00d4aa' },
    { name: '设计软件', count: 2, color: '#a371f7' },
    { name: '办公套件', count: 3, color: '#58a6ff' },
    { name: '通讯应用', count: 3, color: '#d29922' },
    { name: '系统工具', count: 3, color: '#8b949e' },
    { name: '浏览器', count: 2, color: '#f85149' },
    { name: '影音娱乐', count: 2, color: '#a371f7' },
  ],
  weeklyTrend: [
    { day: '周一', hours: 8.5 },
    { day: '周二', hours: 9.2 },
    { day: '周三', hours: 7.8 },
    { day: '周四', hours: 10.1 },
    { day: '周五', hours: 6.5 },
    { day: '周六', hours: 3.2 },
    { day: '周日', hours: 2.8 },
  ],
};
