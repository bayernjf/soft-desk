import type { Software } from '@/types';
import { getBuiltinDescription, getCategoryFallbackDescription } from '@/data/software-descriptions';

const generatingIds = new Set<string>();

export function resolveDescription(software: Software): string {
  if (software.aiDescription) return software.aiDescription;
  const builtin = getBuiltinDescription(software.name, software.id);
  if (builtin) return builtin;
  return getCategoryFallbackDescription(software.category);
}

export async function generateDescription(
  name: string,
  bundleId: string,
  category: string
): Promise<string | null> {
  if (typeof window === 'undefined' || !window.softdesk?.generateDescription) return null;
  try {
    const res = await window.softdesk.generateDescription({ name, bundleId, category });
    return typeof res?.description === 'string' ? res.description : null;
  } catch {
    return null;
  }
}

export async function lazyGenerateDescription(
  software: Software,
  onUpdate: (id: string, description: string) => void
): Promise<void> {
  if (software.aiDescription) return;
  if (generatingIds.has(software.id)) return;

  const builtin = getBuiltinDescription(software.name, software.id);
  if (builtin) {
    onUpdate(software.id, builtin);
    return;
  }

  if (typeof window === 'undefined' || !window.softdesk?.generateDescription) return;

  generatingIds.add(software.id);
  try {
    const description = await generateDescription(software.name, software.id, software.category);
    if (description) {
      onUpdate(software.id, description);
    }
  } finally {
    generatingIds.delete(software.id);
  }
}

export async function batchFillDescriptions(
  software: Software[],
  onUpdate: (id: string, description: string) => void,
  batchSize = 5,
  delayMs = 800
): Promise<void> {
  const missing = software.filter((s) => !s.aiDescription && !getBuiltinDescription(s.name, s.id));
  if (missing.length === 0) return;
  if (typeof window === 'undefined' || !window.softdesk?.generateDescription) return;

  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (s) => {
        if (generatingIds.has(s.id)) return;
        generatingIds.add(s.id);
        try {
          const description = await generateDescription(s.name, s.id, s.category);
          if (description) onUpdate(s.id, description);
        } finally {
          generatingIds.delete(s.id);
        }
      })
    );
    if (i + batchSize < missing.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
