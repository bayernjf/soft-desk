import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));

import { classifyApps, getActiveProvider, getProviders, syncProviders, validateAiTestEndpoint, type ClassifyInput } from './ai';

const APPS: ClassifyInput[] = [
  { id: 'app-a', name: 'Some IDE' },
  { id: 'app-b', name: 'Some Browser' },
];

function setActiveProvider() {
  syncProviders([
    {
      id: 'p1',
      name: 'Test',
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-test',
      isActive: true,
    },
  ]);
}

function mockFetchOnceWithContent(content: string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('classifyApps', () => {
  beforeEach(() => {
    setActiveProvider();
  });

  it('保留合法分类并过滤非法分类', async () => {
    mockFetchOnceWithContent(
      JSON.stringify({
        results: [
          { id: 'app-a', category: 'dev-tools' },
          { id: 'app-b', category: 'not-a-real-category' },
        ],
      })
    );

    const result = await classifyApps(APPS);

    expect(result).toEqual({ 'app-a': 'dev-tools' });
  });

  it('容忍被 ```json 围栏包裹的输出', async () => {
    mockFetchOnceWithContent(
      '```json\n{"results":[{"id":"app-b","category":"browsers"}]}\n```'
    );

    const result = await classifyApps(APPS);

    expect(result).toEqual({ 'app-b': 'browsers' });
  });

  it('模型输出无法解析为 JSON 时兜底返回空对象', async () => {
    mockFetchOnceWithContent('抱歉，我无法分类这些应用。');

    const result = await classifyApps(APPS);

    expect(result).toEqual({});
  });

  it('请求失败（HTTP 非 2xx）时兜底返回空对象', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'boom' } }),
      }))
    );

    const result = await classifyApps(APPS);

    expect(result).toEqual({});
  });

  it('无待分类应用时不发起请求', async () => {
    const fetchMock = mockFetchOnceWithContent('{"results":[]}');

    const result = await classifyApps([]);

    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('无启用的 provider 时不发起请求', async () => {
    syncProviders([]);
    const fetchMock = mockFetchOnceWithContent('{"results":[]}');

    const result = await classifyApps(APPS);

    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('provider apiKey 脱敏（P2-2 回归）', () => {
  it('getProviders 不返回明文 apiKey，仅保留 hint', () => {
    setActiveProvider();
    const providers = getProviders() as Record<string, unknown>[];
    expect(providers).toHaveLength(1);
    expect(providers[0].apiKey).toBeUndefined();
    expect(String(providers[0].apiKeyHint)).not.toContain('sk-test');
    expect(String(providers[0].apiKeyHint)).toContain('••••');
  });

  it('渲染层回填的空 apiKey 不清掉主进程已存的 key（留空=保持不变）', () => {
    setActiveProvider();
    const masked = getProviders();
    // 模拟渲染层把脱敏列表原样同步回主进程（设置页编辑但未改 key）
    syncProviders(masked);
    const active = getActiveProvider();
    expect(active?.apiKey).toBe('sk-test');
  });
});

describe('ai:test endpoint 校验（P2-6 回归）', () => {
  it('允许公网 https 与本机回环 http', () => {
    expect(validateAiTestEndpoint('https://api.openai.com/v1')).not.toBeNull();
    expect(validateAiTestEndpoint('http://localhost:11434/api')).not.toBeNull();
    expect(validateAiTestEndpoint('http://127.0.0.1:8080')).not.toBeNull();
  });

  it('拒绝非回环 http、私网/链路本地/保留段与非 http 协议', () => {
    for (const url of [
      'http://api.example.com',
      'https://169.254.169.254/latest/meta-data',
      'https://192.168.1.1/',
      'https://10.0.0.1/',
      'https://172.20.0.1/',
      'https://100.64.0.1/',
      'https://[::1]/',
      'https://[fd00::1]/',
      'https://[::ffff:127.0.0.1]/',
      'ftp://example.com',
      'not-a-url',
    ]) {
      expect(validateAiTestEndpoint(url), url).toBeNull();
    }
  });
});
