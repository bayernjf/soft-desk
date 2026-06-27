export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'openai-compatible';

export interface AiProviderConfig {
  id: string;
  name: string;
  provider: AiProvider;
  model: string;
  endpoint?: string;
  apiKey?: string;
  apiKeyHint: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderInput {
  name: string;
  provider: AiProvider;
  model: string;
  endpoint?: string;
  apiKey?: string;
}

export interface ProviderOption {
  value: AiProvider;
  label: string;
}

export interface ModelOption {
  value: string;
  label: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai-compatible', label: 'OpenAI Compatible / Custom' },
];

export const MODEL_OPTIONS_BY_PROVIDER: Record<AiProvider, ModelOption[]> = {
  openai: [
    { value: 'gpt-5.5', label: 'GPT-5.5' },
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
  ],
  anthropic: [
    { value: 'claude-fable-5', label: 'Claude Fable 5' },
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  'openai-compatible': [],
};

export const CUSTOM_MODEL_VALUE = '__custom_model__';

export function normalizeProvider(provider?: string): AiProvider {
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'openai-compatible') return 'openai-compatible';
  return 'openai';
}

export function defaultModelForProvider(provider: AiProvider): string {
  if (provider === 'anthropic') return 'claude-fable-5';
  if (provider === 'gemini') return 'gemini-2.5-pro';
  if (provider === 'openai-compatible') return '';
  return 'gpt-5.5';
}

export function defaultEndpointForProvider(provider: AiProvider): string {
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1';
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta';
  if (provider === 'openai-compatible') return '';
  return 'https://api.openai.com/v1';
}

export function isKnownProviderModel(provider: AiProvider, value: string): boolean {
  const options = MODEL_OPTIONS_BY_PROVIDER[provider] || MODEL_OPTIONS_BY_PROVIDER.openai;
  return options.some((option) => option.value === value);
}

export function providerLabel(provider: AiProvider): string {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? 'OpenAI';
}

export function buildApiKeyHint(apiKey: string): string {
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return '';
  return `••••${trimmed.slice(-4)}`;
}
