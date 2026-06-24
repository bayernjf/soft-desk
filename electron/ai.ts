import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'openai-compatible';

export interface AiProviderConfig {
  id: string;
  name: string;
  provider: AiProvider;
  model: string;
  endpoint?: string;
  apiKey?: string;
  isActive: boolean;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompleteOptions {
  messages: AiChatMessage[];
  maxTokens?: number;
  temperature?: number;
  expectJson?: boolean;
}

interface AiCompleteSuccess {
  success: true;
  content: string;
}

interface AiCompleteFailure {
  success: false;
  error: string;
}

export type AiCompleteResult = AiCompleteSuccess | AiCompleteFailure;

const DEFAULT_ENDPOINTS: Record<AiProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  'openai-compatible': '',
};

let providers: AiProviderConfig[] = [];
// 落盘的原始 provider 对象数组(保留前端完整字段如 createdAt/apiKeyHint),用于启动回填给渲染层;
// providers 则是从中 sanitize 出的精简版,仅供主进程推理使用。
let rawProviders: unknown[] = [];
let providersLoaded = false;

function providersPath(): string {
  return path.join(app.getPath('userData'), 'ai-providers.json');
}

function normalizeProvider(value: unknown): AiProvider {
  if (value === 'anthropic') return 'anthropic';
  if (value === 'gemini') return 'gemini';
  if (value === 'openai-compatible') return 'openai-compatible';
  return 'openai';
}

function sanitizeProviders(raw: unknown): AiProviderConfig[] {
  if (!Array.isArray(raw)) return [];
  const result: AiProviderConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id : '';
    if (!id) continue;
    result.push({
      id,
      name: typeof obj.name === 'string' ? obj.name : 'AI Provider',
      provider: normalizeProvider(obj.provider),
      model: typeof obj.model === 'string' ? obj.model : '',
      endpoint: typeof obj.endpoint === 'string' ? obj.endpoint : undefined,
      apiKey: typeof obj.apiKey === 'string' ? obj.apiKey : undefined,
      isActive: obj.isActive === true,
    });
  }
  return result;
}

function loadProviders(): void {
  if (providersLoaded) return;
  providersLoaded = true;
  try {
    const raw = JSON.parse(readFileSync(providersPath(), 'utf-8'));
    rawProviders = Array.isArray(raw) ? raw : [];
    providers = sanitizeProviders(rawProviders);
  } catch {
    rawProviders = [];
    providers = [];
  }
}

/** 渲染层(设置页)在 provider 配置变更时调用,把含明文 apiKey 的完整列表落盘到主进程,
 *  之后所有推理在主进程发起,apiKey 不再依赖渲染层 localStorage 持久化。
 *  主进程的 ai-providers.json 是 provider 配置的唯一权威数据源。 */
export function syncProviders(raw: unknown): void {
  rawProviders = Array.isArray(raw) ? raw : [];
  providers = sanitizeProviders(rawProviders);
  providersLoaded = true;
  try {
    writeFileSync(providersPath(), JSON.stringify(rawProviders), 'utf-8');
  } catch {
    // 落盘失败不阻断,内存副本仍可用
  }
}

/** 返回落盘的原始 provider 列表(完整字段),供渲染层启动时回填 store。 */
export function getProviders(): unknown[] {
  loadProviders();
  return rawProviders;
}

/** 取当前启用且配置完整(有 key + model)的 provider;无则返回 null。 */
export function getActiveProvider(): AiProviderConfig | null {
  loadProviders();
  const active = providers.find(
    (p) => p.isActive && p.apiKey && p.apiKey.trim() && p.model && p.model.trim()
  );
  return active ?? null;
}

export function hasActiveProvider(): boolean {
  return getActiveProvider() !== null;
}

function effectiveEndpoint(config: AiProviderConfig): string {
  const trimmed = (config.endpoint ?? '').trim();
  return trimmed || DEFAULT_ENDPOINTS[config.provider];
}

function joinPath(base: string, suffix: string): string {
  const trimmed = base.replace(/\/+$/, '');
  if (trimmed.endsWith(suffix)) return trimmed;
  return `${trimmed}${suffix}`;
}

const REQUEST_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function extractError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string }; message?: string };
    const detail = data?.error?.message || data?.message || '';
    return `HTTP ${res.status}${detail ? `：${String(detail).slice(0, 200)}` : ''}`;
  } catch {
    const text = await res.text().catch(() => '');
    return `HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`;
  }
}

async function completeOpenAi(
  config: AiProviderConfig,
  options: AiCompleteOptions
): Promise<AiCompleteResult> {
  const url = joinPath(effectiveEndpoint(config), '/chat/completions');
  const body: Record<string, unknown> = {
    model: config.model.trim(),
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 1024,
    stream: false,
  };
  if (options.expectJson) {
    body.response_format = { type: 'json_object' };
  }
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { success: false, error: await extractError(res) };
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data?.choices?.[0]?.message?.content ?? '';
  return { success: true, content };
}

async function completeAnthropic(
  config: AiProviderConfig,
  options: AiCompleteOptions
): Promise<AiCompleteResult> {
  const url = joinPath(effectiveEndpoint(config), '/messages');
  const system = options.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const messages = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  const body: Record<string, unknown> = {
    model: config.model.trim(),
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.3,
    messages,
  };
  if (system) body.system = system;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { success: false, error: await extractError(res) };
  const data = (await res.json()) as { content?: { text?: string }[] };
  const content = data?.content?.map((c) => c.text ?? '').join('') ?? '';
  return { success: true, content };
}

async function completeGemini(
  config: AiProviderConfig,
  options: AiCompleteOptions
): Promise<AiCompleteResult> {
  const base = effectiveEndpoint(config).replace(/\/+$/, '');
  const model = config.model.trim();
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
    config.apiKey ?? ''
  )}`;
  const systemText = options.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const contents = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.3,
    maxOutputTokens: options.maxTokens ?? 1024,
  };
  if (options.expectJson) {
    generationConfig.responseMimeType = 'application/json';
  }
  const body: Record<string, unknown> = { contents, generationConfig };
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { success: false, error: await extractError(res) };
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return { success: true, content };
}

/** 统一推理入口:按 provider 类型分发到对应协议。 */
export async function complete(
  config: AiProviderConfig,
  options: AiCompleteOptions
): Promise<AiCompleteResult> {
  try {
    if (config.provider === 'anthropic') return await completeAnthropic(config, options);
    if (config.provider === 'gemini') return await completeGemini(config, options);
    return await completeOpenAi(config, options);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? '请求超时（30s）'
          : err.message
        : '请求失败';
    return { success: false, error: message };
  }
}

/** 从模型输出里抽出 JSON(容忍 ```json 围栏与前后说明文字),解析失败返回 null。 */
function parseJsonLoose<T>(text: string): T | null {
  if (!text) return null;
  let candidate = text.trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // 退而求其次:截取首个 { 或 [ 到末尾对应闭合
    const start = candidate.search(/[[{]/);
    if (start === -1) return null;
    const open = candidate[start];
    const close = open === '{' ? '}' : ']';
    const end = candidate.lastIndexOf(close);
    if (end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

const VALID_CATEGORIES = [
  'dev-tools',
  'design',
  'productivity',
  'communication',
  'browsers',
  'utilities',
  'media',
  'security',
] as const;

export type AiCategory = (typeof VALID_CATEGORIES)[number];

export interface ClassifyInput {
  id: string;
  name: string;
  bundleId?: string;
  description?: string;
}

const CLASSIFY_SYSTEM = `你是一个 macOS 应用分类专家。把每个应用归入且仅归入以下 8 个分类之一：
- dev-tools（开发工具：IDE、终端、数据库、API 工具等）
- design（设计创意：图形、UI、视频剪辑、3D 等）
- productivity（效率办公：笔记、文档表格、待办、日历等）
- communication（通讯协作：IM、邮件、视频会议等）
- browsers（浏览器）
- utilities（系统工具：启动器、清理、窗口管理、压缩等）
- media（影音娱乐：音乐、播放器、流媒体等）
- security（安全防护：密码管理、VPN、网络代理、防火墙等）
只输出 JSON，格式为 {"results":[{"id":"应用id","category":"分类id"}]}，不要任何解释。category 必须是上述 8 个英文 id 之一。`;

/** 仅对规则判不出的应用做兜底分类;返回 id -> category 映射(只含模型给出且合法的项)。 */
export async function classifyApps(items: ClassifyInput[]): Promise<Record<string, AiCategory>> {
  const config = getActiveProvider();
  if (!config || items.length === 0) return {};

  const payload = items.map((it) => ({
    id: it.id,
    name: it.name,
    bundleId: it.bundleId ?? '',
    description: it.description ?? '',
  }));

  const result = await complete(config, {
    messages: [
      { role: 'system', content: CLASSIFY_SYSTEM },
      { role: 'user', content: JSON.stringify({ apps: payload }) },
    ],
    expectJson: true,
    temperature: 0,
    maxTokens: Math.min(2048, 64 + items.length * 24),
  });

  if (!result.success) return {};

  const parsed = parseJsonLoose<{ results?: { id?: string; category?: string }[] }>(
    result.content
  );
  if (!parsed?.results) return {};

  const valid = new Set<string>(VALID_CATEGORIES);
  const out: Record<string, AiCategory> = {};
  for (const row of parsed.results) {
    if (typeof row?.id === 'string' && typeof row?.category === 'string' && valid.has(row.category)) {
      out[row.id] = row.category as AiCategory;
    }
  }
  return out;
}

export interface SuggestAppInput {
  id: string;
  name: string;
  category: string;
  usageMinutes: number;
}

export interface CoUsageInput {
  a: string;
  b: string;
  count: number;
}

export interface SegmentCoUsageInput {
  /** morning / afternoon / evening / night */
  segment: string;
  sessionCount: number;
  pairs: CoUsageInput[];
}

export interface WorkflowSuggestion {
  name: string;
  description: string;
  softwareIds: string[];
  reason: string;
}

const SEGMENT_LABEL: Record<string, string> = {
  morning: '早上',
  afternoon: '下午',
  evening: '晚上',
  night: '深夜',
};

const SUGGEST_SYSTEM = `你是一个生产力助手。基于用户已安装应用、使用时长、"经常同时使用"的共现统计，以及"按一天中时段(早上/下午/晚上/深夜)拆分的共现统计"，推荐 1-3 个有业务语义的"工作流"（一组经常配合使用的软件，可一键启动）。
要求：
- 每个工作流包含 2-5 个软件，只能用给定的软件 id；
- 充分利用时段规律：若某组软件主要在某时段一起使用，请据此生成场景化工作流，并在 name 体现时段（如"早上工作流""下午设计流程""晚上娱乐"）；
- name 用简洁中文；description 一句话说明用途；
- reason 用一句话解释为什么推荐这个组合（结合使用习惯与时段规律，如"你常在早上同时打开它们"）；
- 不要推荐只有单个软件的组合，不要编造不存在的 id。
只输出 JSON：{"workflows":[{"name":"","description":"","softwareIds":["",""],"reason":""}]}，不要任何解释。`;

export async function suggestWorkflows(
  apps: SuggestAppInput[],
  coUsage: CoUsageInput[],
  segments: SegmentCoUsageInput[] = []
): Promise<WorkflowSuggestion[]> {
  const config = getActiveProvider();
  if (!config || apps.length < 2) return [];

  // 仅保留有共现对的时段,每个时段取前若干高频对,带上中文时段标签,控制 token 体积
  const segmentPayload = segments
    .filter((s) => Array.isArray(s.pairs) && s.pairs.length > 0)
    .map((s) => ({
      segment: SEGMENT_LABEL[s.segment] ?? s.segment,
      sessionCount: s.sessionCount,
      pairs: s.pairs.slice(0, 12),
    }));

  const result = await complete(config, {
    messages: [
      { role: 'system', content: SUGGEST_SYSTEM },
      {
        role: 'user',
        content: JSON.stringify({
          apps: apps.slice(0, 60),
          coUsage: coUsage.slice(0, 40),
          segmentCoUsage: segmentPayload,
        }),
      },
    ],
    expectJson: true,
    temperature: 0.4,
    maxTokens: 1024,
  });

  if (!result.success) return [];

  const parsed = parseJsonLoose<{ workflows?: WorkflowSuggestion[] }>(result.content);
  if (!parsed?.workflows) return [];

  const validIds = new Set(apps.map((a) => a.id));
  const out: WorkflowSuggestion[] = [];
  for (const wf of parsed.workflows) {
    if (!wf || typeof wf.name !== 'string') continue;
    const ids = Array.isArray(wf.softwareIds)
      ? wf.softwareIds.filter((id) => typeof id === 'string' && validIds.has(id))
      : [];
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length < 2) continue;
    out.push({
      name: wf.name.trim().slice(0, 40),
      description: typeof wf.description === 'string' ? wf.description.trim().slice(0, 120) : '',
      reason: typeof wf.reason === 'string' ? wf.reason.trim().slice(0, 160) : '',
      softwareIds: uniqueIds.slice(0, 5),
    });
  }
  return out.slice(0, 3);
}

export interface SearchCandidate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
}

const SEARCH_SYSTEM = `你是一个 macOS 应用搜索助手。用户用自然语言描述意图（如"截屏""做表格""改图""录屏""连数据库"），你要从给定的候选应用里挑出能完成该意图的应用。
要求：
- 理解意图而非字面匹配（例如"截屏"应匹配截图类工具，"做表格"应匹配电子表格类应用）；
- 只能返回给定候选里的 id，按相关度从高到低排序，最多返回 10 个；
- 没有任何相关应用时返回空数组，绝不编造 id。
只输出 JSON：{"ids":["id1","id2"]}，不要任何解释。`;

/** 自然语言语义搜索:把 query + 精简候选交给模型,返回按相关度排序且存在于候选中的 id 列表。
 *  无启用模型 / 调用失败 / 解析失败时返回 null,由调用方回退到本地字面匹配。 */
export async function semanticSearch(
  query: string,
  candidates: SearchCandidate[]
): Promise<string[] | null> {
  const config = getActiveProvider();
  const q = (query ?? '').trim();
  if (!config || !q || candidates.length === 0) return null;

  const payload = candidates.slice(0, 200).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? '',
    category: c.category ?? '',
    tags: Array.isArray(c.tags) ? c.tags.slice(0, 8) : [],
  }));

  const result = await complete(config, {
    messages: [
      { role: 'system', content: SEARCH_SYSTEM },
      { role: 'user', content: JSON.stringify({ query: q, apps: payload }) },
    ],
    expectJson: true,
    temperature: 0,
    maxTokens: 512,
  });

  if (!result.success) return null;

  const parsed = parseJsonLoose<{ ids?: unknown }>(result.content);
  if (!parsed || !Array.isArray(parsed.ids)) return null;

  const validIds = new Set(candidates.map((c) => c.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of parsed.ids) {
    if (typeof id === 'string' && validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.slice(0, 10);
}
