import type { Software } from '@/types';
import type { AiWorkflowSuggestion } from '@/types/electron';

/** 渲染层 AI 服务封装:统一通过主进程桥接发起推理,封装"是否可用 / 工作流建议"等业务调用。
 *  所有方法在无 bridge / 无启用模型 / 调用失败时都安全降级,由调用方决定回退逻辑。 */

export function isAiBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.softdesk?.completeAi;
}

/** 查询当前是否有启用且配置完整的 AI 模型(决定是否展示 AI 入口)。 */
export async function hasActiveAiProvider(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.softdesk?.hasAiProvider) return false;
  try {
    const res = await window.softdesk.hasAiProvider();
    return !!res?.hasProvider;
  } catch {
    return false;
  }
}

/** 请求 AI 生成工作流建议;无 provider / 失败时返回空数组,由调用方回退到本地统计。 */
export async function fetchWorkflowSuggestions(
  software: Software[]
): Promise<AiWorkflowSuggestion[]> {
  if (typeof window === 'undefined' || !window.softdesk?.suggestWorkflows) return [];

  const apps = software
    .filter((s) => !s.uninstalled && !s.deleted)
    .map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      usageMinutes: s.usageMinutes,
    }));

  if (apps.length < 2) return [];

  try {
    const res = await window.softdesk.suggestWorkflows({ apps });
    return Array.isArray(res?.suggestions) ? res.suggestions : [];
  } catch {
    return [];
  }
}

/** 自然语言语义搜索:把查询 + 精简候选交给主进程模型,返回按相关度排序的软件 id。
 *  无 bridge / 无启用模型 / 调用失败时返回 null,调用方据此回退到本地字面匹配。 */
export async function searchSoftwareByIntent(
  query: string,
  software: Software[]
): Promise<string[] | null> {
  if (typeof window === 'undefined' || !window.softdesk?.semanticSearch) return null;

  const candidates = software
    .filter((s) => !s.uninstalled && !s.deleted)
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      tags: s.tags,
    }));

  if (!query.trim() || candidates.length === 0) return null;

  try {
    const res = await window.softdesk.semanticSearch({ query, candidates });
    return Array.isArray(res?.ids) ? res.ids : null;
  } catch {
    return null;
  }
}
