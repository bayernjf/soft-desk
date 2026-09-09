import { describe, it, expect } from 'vitest';
import {
  PROVIDER_OPTIONS,
  MODEL_OPTIONS_BY_PROVIDER,
  normalizeProvider,
  defaultModelForProvider,
  defaultEndpointForProvider,
  isKnownProviderModel,
  providerLabel,
  buildApiKeyHint,
} from './aiProviders';

describe('normalizeProvider', () => {
  it('保留三个已知的非默认 provider', () => {
    expect(normalizeProvider('anthropic')).toBe('anthropic');
    expect(normalizeProvider('gemini')).toBe('gemini');
    expect(normalizeProvider('openai-compatible')).toBe('openai-compatible');
  });

  it('openai 与未知值都归一到 openai', () => {
    expect(normalizeProvider('openai')).toBe('openai');
    expect(normalizeProvider('deepseek')).toBe('openai');
    expect(normalizeProvider('')).toBe('openai');
  });

  it('缺省参数归一到 openai', () => {
    expect(normalizeProvider()).toBe('openai');
    expect(normalizeProvider(undefined)).toBe('openai');
  });

  it('大小写不做容错，非精确匹配即回落', () => {
    expect(normalizeProvider('Anthropic')).toBe('openai');
  });
});

describe('defaultModelForProvider', () => {
  it('每个 provider 有对应默认模型', () => {
    expect(defaultModelForProvider('openai')).toBe('gpt-5.5');
    expect(defaultModelForProvider('anthropic')).toBe('claude-fable-5');
    expect(defaultModelForProvider('gemini')).toBe('gemini-2.5-pro');
  });

  it('openai-compatible 没有默认模型，需用户自填', () => {
    expect(defaultModelForProvider('openai-compatible')).toBe('');
  });

  it('内置 provider 的默认模型都在候选列表里', () => {
    (['openai', 'anthropic', 'gemini'] as const).forEach((provider) => {
      expect(isKnownProviderModel(provider, defaultModelForProvider(provider))).toBe(true);
    });
  });
});

describe('defaultEndpointForProvider', () => {
  it('返回各家官方 endpoint', () => {
    expect(defaultEndpointForProvider('openai')).toBe('https://api.openai.com/v1');
    expect(defaultEndpointForProvider('anthropic')).toBe('https://api.anthropic.com/v1');
    expect(defaultEndpointForProvider('gemini')).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    );
  });

  it('openai-compatible 没有默认 endpoint', () => {
    expect(defaultEndpointForProvider('openai-compatible')).toBe('');
  });
});

describe('isKnownProviderModel', () => {
  it('命中所属 provider 的候选模型', () => {
    expect(isKnownProviderModel('openai', 'gpt-5.4-mini')).toBe(true);
    expect(isKnownProviderModel('anthropic', 'claude-haiku-4-5')).toBe(true);
  });

  it('模型不能跨 provider 命中', () => {
    expect(isKnownProviderModel('openai', 'claude-fable-5')).toBe(false);
    expect(isKnownProviderModel('anthropic', 'gpt-5.5')).toBe(false);
  });

  it('未知模型返回 false', () => {
    expect(isKnownProviderModel('gemini', 'gemini-9-ultra')).toBe(false);
  });

  it('openai-compatible 候选为空，任何模型都不算已知', () => {
    expect(MODEL_OPTIONS_BY_PROVIDER['openai-compatible']).toHaveLength(0);
    expect(isKnownProviderModel('openai-compatible', 'gpt-5.5')).toBe(false);
    expect(isKnownProviderModel('openai-compatible', 'my-local-model')).toBe(false);
  });
});

describe('providerLabel', () => {
  it('返回选项表里的展示名', () => {
    expect(providerLabel('openai')).toBe('OpenAI');
    expect(providerLabel('anthropic')).toBe('Anthropic');
    expect(providerLabel('gemini')).toBe('Google Gemini');
    expect(providerLabel('openai-compatible')).toBe('OpenAI Compatible / Custom');
  });

  it('每个 PROVIDER_OPTIONS 条目都能反查到自身 label', () => {
    PROVIDER_OPTIONS.forEach((option) => {
      expect(providerLabel(option.value)).toBe(option.label);
    });
  });

  it('不在表里的值回落到 OpenAI', () => {
    expect(providerLabel('mistral' as never)).toBe('OpenAI');
  });
});

describe('buildApiKeyHint', () => {
  it('只保留末 4 位，前面统一打码', () => {
    expect(buildApiKeyHint('sk-proj-abcdefgh1234')).toBe('••••1234');
  });

  it('提示串不泄漏原 key 的其余部分', () => {
    const apiKey = 'sk-super-secret-value-9876';
    const hint = buildApiKeyHint(apiKey);
    expect(hint).toBe('••••9876');
    expect(hint).not.toContain('secret');
    expect(hint.length).toBe(8);
  });

  it('空值与纯空白返回空串', () => {
    expect(buildApiKeyHint('')).toBe('');
    expect(buildApiKeyHint('   ')).toBe('');
    expect(buildApiKeyHint(undefined as never)).toBe('');
    expect(buildApiKeyHint(null as never)).toBe('');
  });

  it('先去空白再取末 4 位', () => {
    expect(buildApiKeyHint('  sk-abcd1234  ')).toBe('••••1234');
  });

  it('长度不足 4 位时原样打码，不补位', () => {
    expect(buildApiKeyHint('ab')).toBe('••••ab');
  });
});
