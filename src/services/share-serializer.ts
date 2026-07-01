import type { Software, Workflow, FavoriteGroup, RadialMenuConfig, RadialItem } from '@/types';

export type ShareKind = 'workflow' | 'favorite_group' | 'radial';

export interface SoftwareMeta {
  softwareId: string;
  name: string;
  bundleId?: string;
  category?: string;
  icon?: string;
  color?: string;
}

export interface WorkflowPayload {
  version: 1;
  kind: 'workflow';
  workflow: {
    name: string;
    description: string;
    softwareIds: string[];
    color: string;
  };
  softwareMeta: SoftwareMeta[];
}

export interface FavoriteGroupPayload {
  version: 1;
  kind: 'favorite_group';
  group: {
    name: string;
    softwareIds: string[];
  };
  softwareMeta: SoftwareMeta[];
}

export interface RadialPayload {
  version: 1;
  kind: 'radial';
  radial: {
    sectors: number;
    style?: RadialMenuConfig['style'];
    showRecent?: boolean;
    items: Array<{
      slot: number;
      type: RadialItem['type'];
      targetId: string;
      name?: string;
      icon?: string;
      color?: string;
    }>;
  };
  softwareMeta: SoftwareMeta[];
}

export type SharePayload = WorkflowPayload | FavoriteGroupPayload | RadialPayload;

function toSoftwareMeta(sw: Software): SoftwareMeta {
  return {
    softwareId: sw.id,
    name: sw.name,
    bundleId: sw.id,
    category: sw.category,
    icon: sw.icon,
    color: sw.color,
  };
}

export function collectSoftwareMeta(softwareIds: string[], software: Software[]): SoftwareMeta[] {
  const byId = new Map(software.map((s) => [s.id, s]));
  return softwareIds
    .map((id) => byId.get(id))
    .filter((s): s is Software => !!s)
    .map(toSoftwareMeta);
}

export function serializeWorkflow(workflow: Workflow, software: Software[]): WorkflowPayload {
  return {
    version: 1,
    kind: 'workflow',
    workflow: {
      name: workflow.name,
      description: workflow.description,
      softwareIds: [...workflow.softwareIds],
      color: workflow.color,
    },
    softwareMeta: collectSoftwareMeta(workflow.softwareIds, software),
  };
}

export function serializeFavoriteGroup(
  group: FavoriteGroup,
  software: Software[]
): FavoriteGroupPayload {
  return {
    version: 1,
    kind: 'favorite_group',
    group: {
      name: group.name,
      softwareIds: [...group.softwareIds],
    },
    softwareMeta: collectSoftwareMeta(group.softwareIds, software),
  };
}

export function serializeRadial(
  radial: RadialMenuConfig,
  software: Software[]
): RadialPayload {
  const softwareIds = radial.items
    .filter((it) => it.type === 'app')
    .map((it) => it.targetId);
  return {
    version: 1,
    kind: 'radial',
    radial: {
      sectors: radial.sectors,
      style: radial.style,
      showRecent: radial.showRecent,
      items: radial.items.map((it) => ({
        slot: it.slot,
        type: it.type,
        targetId: it.targetId,
        name: it.name,
        icon: it.icon,
        color: it.color,
      })),
    },
    softwareMeta: collectSoftwareMeta(softwareIds, software),
  };
}

export interface ImportSoftwareMatch {
  meta: SoftwareMeta;
  installedId: string | null;
}

export function matchSoftware(
  metas: SoftwareMeta[],
  software: Software[]
): ImportSoftwareMatch[] {
  const byId = new Map(software.map((s) => [s.id, s]));
  const byName = new Map(software.map((s) => [s.name.toLowerCase(), s]));
  return metas.map((meta) => {
    const byBundle = meta.bundleId ? byId.get(meta.bundleId) : undefined;
    const byMetaId = byId.get(meta.softwareId);
    const byNameHit = byName.get(meta.name.toLowerCase());
    const hit = byBundle ?? byMetaId ?? byNameHit;
    return {
      meta,
      installedId: hit && !hit.uninstalled && !hit.deleted ? hit.id : null,
    };
  });
}

export function isValidPayload(raw: unknown): raw is SharePayload {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (o.kind !== 'workflow' && o.kind !== 'favorite_group' && o.kind !== 'radial') return false;
  if (!Array.isArray(o.softwareMeta)) return false;
  return true;
}

/**
 * 在给定的已有名称集合中,为 `desired` 生成一个不冲突的名称:
 *   - 不重复 → 直接返回
 *   - 有 (n) 后缀已占用 → 找到最小可用序号
 * 例如: existing = ['我的工作流', '我的工作流 (2)']  desired = '我的工作流'
 *       返回 '我的工作流 (3)'
 */
export function dedupeName(desired: string, existing: string[]): string {
  const trimmed = desired.trim();
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!taken.has(trimmed.toLowerCase())) return trimmed;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${trimmed} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  // 极端兜底:附加时间戳
  return `${trimmed} (${Date.now()})`;
}
