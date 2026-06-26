export interface Software {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: SoftwareCategory;
  version?: string;
  publisher?: string;
  size: number;
  installDate?: string;
  lastUsed: string;
  usageMinutes: number;
  launchCount: number;
  path: string;
  color: string;
  tags: string[];
  uninstalled?: boolean;
  deleted?: boolean;
  aiDescription?: string;
}

export type SoftwareCategory =
  | 'dev-tools'
  | 'design'
  | 'productivity'
  | 'communication'
  | 'browsers'
  | 'utilities'
  | 'media'
  | 'security';

export interface CategoryMeta {
  id: SoftwareCategory;
  name: string;
  icon: string;
  color: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  softwareIds: string[];
  usageCount: number;
  lastUsed: string;
  isFavorite: boolean;
  color: string;
  updatedAt: string;
}

export interface FavoriteGroup {
  id: string;
  name: string;
  softwareIds: string[];
  createdAt: string;
}

export interface SearchState {
  query: string;
  results: Software[];
  recentSearches: string[];
}
