import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { Workflow, SoftwareCategory } from '@/types';

const logger = createLogger('workflows');

export interface CloudWorkflow {
  id: number;
  user_id: string;
  workflow_id: string;
  name: string;
  description: string;
  software_ids: string[];
  software_meta: Array<{
    software_id: string;
    name: string;
    icon: string | null;
    color: string | null;
    category: string | null;
  }> | null;
  usage_count: number;
  last_used: string;
  is_favorite: boolean;
  color: string;
  updated_at: string;
}

function cloudToLocal(row: CloudWorkflow): Workflow {
  return {
    id: row.workflow_id,
    name: row.name,
    description: row.description,
    softwareIds: row.software_ids,
    softwareMeta: Array.isArray(row.software_meta)
      ? row.software_meta.map((m) => ({
          softwareId: m.software_id,
          name: m.name,
          icon: m.icon ?? undefined,
          color: m.color ?? undefined,
          category: (m.category ?? 'utilities') as SoftwareCategory,
        }))
      : [],
    usageCount: row.usage_count,
    lastUsed: row.last_used,
    isFavorite: row.is_favorite,
    color: row.color,
    updatedAt: row.updated_at,
  };
}

function localToCloud(userId: string, wf: Workflow): Omit<CloudWorkflow, 'id'> {
  return {
    user_id: userId,
    workflow_id: wf.id,
    name: wf.name,
    description: wf.description,
    software_ids: wf.softwareIds,
    software_meta: (wf.softwareMeta ?? []).map((m) => ({
      software_id: m.softwareId,
      name: m.name,
      icon: m.icon ?? null,
      color: m.color ?? null,
      category: m.category ?? null,
    })),
    usage_count: wf.usageCount,
    last_used: wf.lastUsed,
    is_favorite: wf.isFavorite,
    color: wf.color,
    updated_at: wf.updatedAt,
  };
}

export function mergeWorkflows(local: Workflow[], remote: Workflow[]): Workflow[] {
  const byId = new Map<string, Workflow>();

  for (const wf of local) {
    byId.set(wf.id, wf);
  }

  for (const wf of remote) {
    const existing = byId.get(wf.id);
    if (!existing) {
      byId.set(wf.id, wf);
    } else {
      const localTime = new Date(existing.updatedAt).getTime();
      const remoteTime = new Date(wf.updatedAt).getTime();
      if (remoteTime > localTime) {
        byId.set(wf.id, wf);
      }
    }
  }

  return Array.from(byId.values());
}

export async function syncWorkflowsOnLogin(
  userId: string,
  localWorkflows: Workflow[]
): Promise<Workflow[]> {
  if (!isSupabaseConfigured() || !supabase) return localWorkflows;

  try {
    if (localWorkflows.length > 0) {
      const rows = localWorkflows.map((wf) => localToCloud(userId, wf));
      const { error: upsertError } = await supabase
        .from('workflows')
        .upsert(rows, { onConflict: 'user_id,workflow_id' });
      if (upsertError) {
        logger.error('upsert local workflows error:', upsertError);
      }
    }

    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      logger.error('fetch workflows error:', error);
      return localWorkflows;
    }

    const remote = (data ?? []).map(cloudToLocal);
    return mergeWorkflows(localWorkflows, remote);
  } catch (err) {
    logger.error('sync workflows error:', err);
    return localWorkflows;
  }
}

export async function upsertCloudWorkflow(
  userId: string,
  workflow: Workflow
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase.from('workflows').upsert(
      localToCloud(userId, workflow),
      { onConflict: 'user_id,workflow_id' }
    );
    if (error) {
      logger.error('upsert workflow error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteCloudWorkflow(
  userId: string,
  workflowId: string
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('user_id', userId)
      .eq('workflow_id', workflowId);
    if (error) {
      logger.error('delete workflow error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
