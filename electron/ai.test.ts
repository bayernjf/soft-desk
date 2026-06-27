import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));

import { classifyApps, syncProviders, type ClassifyInput } from './ai';

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
