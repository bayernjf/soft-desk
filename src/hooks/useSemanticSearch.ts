import { useEffect, useRef, useState } from 'react';
import { useSoftwareStore } from '@/stores/software.store';
import { searchSoftwareByIntentStream } from '@/services/ai.service';
import type { Software } from '@/types';

export interface SemanticSearchState {
  /** 模型返回的相关软件 id(按相关度排序);null 表示未触发或已回退本地 */
  ids: string[] | null;
  /** 当前是否正在请求模型 */
  loading: boolean;
  /** 本次结果是否来自 AI(用于 UI 显示"AI 语义搜索"标识) */
  fromAi: boolean;
  /** 模型实时思考过程文本(流式累计);无则为空串 */
  thinking: string;
}

const DEBOUNCE_MS = 400;
const MIN_QUERY_LEN = 2;

/** 判断查询是否"像自然语言意图":含空格、或长度偏长、或本地命中过少时才值得调模型,
 *  避免对"chr""vs"这类前缀字面查询浪费 token(省钱)。 */
function looksLikeIntent(query: string, localHitCount: number): boolean {
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) return false;
  if (/\s/.test(q)) return true; // 含空格,多半是短语意图
  if (q.length >= 3 && localHitCount === 0) return true; // 本地一个都没匹配上
  if (q.length >= 4) return true; // 较长查询,值得语义理解
  return false;
}

/**
 * 自然语言语义搜索 hook(流式 + 强回退 + 省钱):
 * - 防抖 DEBOUNCE_MS 后再触发,避免逐字调用;
 * - explicit=false(即时模式,如快速启动器):仅当查询"像自然语言意图"时才调模型(省 token);
 * - explicit=true(显式提交,如软件库回车/点按钮):用户已明确表达意图,跳过启发式门槛,
 *   只要非空即触发,并立即(不防抖)发起;
 * - 仅当 enabled(用户开关) 且存在启用模型(aiReady) 时才调模型;
 * - 流式接收模型思考过程,实时更新 thinking;
 * - 同一查询走内存缓存,不重复请求(命中缓存不再展示思考过程);
 * - 任何失败/无模型返回 ids=null,由调用方回退到本地字面匹配。
 */
export function useSemanticSearch(
  query: string,
  software: Software[],
  aiReady: boolean,
  localHitCount: number,
  enabled = true,
  explicit = false
): SemanticSearchState {
  const isElectron = useSoftwareStore((s) => s.isElectron);
  const [state, setState] = useState<SemanticSearchState>({
    ids: null,
    loading: false,
    fromAi: false,
    thinking: '',
  });
  // 查询 -> 结果 id 列表的内存缓存,会话内同一查询不重复调用模型
  const cacheRef = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    const q = query.trim();

    // 显式提交:用户已明确表达意图,只校验非空;即时模式:用启发式门槛省 token
    const shouldTrigger = explicit ? q.length > 0 : looksLikeIntent(q, localHitCount);

    if (!enabled || !isElectron || !aiReady || !shouldTrigger) {
      setState({ ids: null, loading: false, fromAi: false, thinking: '' });
      return;
    }

    const cached = cacheRef.current.get(q);
    if (cached) {
      setState({ ids: cached, loading: false, fromAi: true, thinking: '' });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, thinking: '' }));
    // 显式提交立即发起;即时模式防抖,避免逐字调用
    const delay = explicit ? 0 : DEBOUNCE_MS;
    const timer = setTimeout(() => {
      searchSoftwareByIntentStream(q, software, (thinkingText) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, thinking: thinkingText }));
      })
        .then((ids) => {
          if (cancelled) return;
          if (ids === null) {
            setState({ ids: null, loading: false, fromAi: false, thinking: '' });
            return;
          }
          cacheRef.current.set(q, ids);
          setState((prev) => ({ ids, loading: false, fromAi: true, thinking: prev.thinking }));
        })
        .catch(() => {
          if (!cancelled) setState({ ids: null, loading: false, fromAi: false, thinking: '' });
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // software 变动不应重新触发(避免扫描刷新导致重复调用);仅查询/开关/模型状态/本地命中数变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isElectron, aiReady, localHitCount, enabled, explicit]);

  return state;
}
