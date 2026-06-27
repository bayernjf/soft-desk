import type { Software } from '@/types';

export interface UserProfile {
  topApps: string[];
  frequentPairs: { a: string; b: string; count: number }[];
  activeApps: string[];
}

export interface Recommendation {
  id: string;
  reason: string;
  type: 'query' | 'behavior' | 'workflow' | 'complement';
}

export function buildUserProfile(software: Software[]): UserProfile {
  const active = software
    .filter((s) => !s.uninstalled && !s.deleted)
    .sort((a, b) => b.usageMinutes - a.usageMinutes);

  const topApps = active.slice(0, 10).map((s) => s.id);

  const recentLaunchThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const activeApps = active
    .filter((s) => s.lastUsed > recentLaunchThreshold)
    .slice(0, 5)
    .map((s) => s.id);

  return {
    topApps,
    frequentPairs: [],
    activeApps,
  };
}

export async function fetchRecommendations(
  query: string | undefined,
  software: Software[]
): Promise<Recommendation[]> {
  if (typeof window === 'undefined' || !window.softdesk?.recommendApps) return [];

  const activeSoftware = software.filter((s) => !s.uninstalled && !s.deleted);
  const profile = buildUserProfile(activeSoftware);

  const apps = activeSoftware.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    aiDescription: s.aiDescription,
    usageMinutes: s.usageMinutes,
  }));

  try {
    const res = await window.softdesk.recommendApps({ query, apps, profile });
    return res.recommendations ?? [];
  } catch {
    return [];
  }
}
