import { useEffect, useState } from 'react';
import { X, Check, ChevronDown, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings.store';
import {
  CUSTOM_MODEL_VALUE,
  MODEL_OPTIONS_BY_PROVIDER,
  PROVIDER_OPTIONS,
  defaultEndpointForProvider,
  defaultModelForProvider,
  isKnownProviderModel,
  normalizeProvider,
  providerLabel,
  type AiProvider,
  type AiProviderConfig,
} from '@/data/aiProviders';
import { cn } from '@/lib/utils';

interface AiModelModalProps {
  config?: AiProviderConfig | null;
  onClose: () => void;
}

export function AiModelModal({ config, onClose }: AiModelModalProps) {
  const addAiProvider = useSettingsStore((s) => s.addAiProvider);
  const updateAiProvider = useSettingsStore((s) => s.updateAiProvider);
  const isEdit = !!config;

  const initialProvider = normalizeProvider(config?.provider);
  const initialModel = config?.model || defaultModelForProvider(initialProvider);

  const [name, setName] = useState(config?.name ?? '');
  const [provider, setProvider] = useState<AiProvider>(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? defaultEndpointForProvider(initialProvider));
  const [isCustomModel, setIsCustomModel] = useState(!isKnownProviderModel(initialProvider, initialModel));
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const modelOptions = MODEL_OPTIONS_BY_PROVIDER[provider] || MODEL_OPTIONS_BY_PROVIDER.openai;
  const selectedModelOption = modelOptions.find((o) => o.value === model);
  const modelLabel = isCustomModel ? '自定义模型 ID' : selectedModelOption?.label || model;

  const handleProviderChange = (next: AiProvider) => {
    setProvider(next);
    setModel(defaultModelForProvider(next));
    setEndpoint(defaultEndpointForProvider(next));
    setIsCustomModel(next === 'openai-compatible');
    setIsProviderMenuOpen(false);
    setIsModelMenuOpen(false);
  };

  const selectModel = (next: string) => {
    if (next === CUSTOM_MODEL_VALUE) {
      setIsCustomModel(true);
      if (isKnownProviderModel(provider, model)) setModel('');
    } else {
      setIsCustomModel(false);
      setModel(next);
    }
    setIsModelMenuOpen(false);
  };

  const handleTest = async () => {
    setError('');
    setTestResult(null);
    if (!window.softdesk?.testAiProvider) {
      setTestResult({ ok: false, message: '测试连接需在桌面应用中进行' });
      return;
    }
    const effectiveEndpoint = endpoint.trim() || defaultEndpointForProvider(provider);
    const effectiveKey = apiKey.trim() || config?.apiKey || '';
    if (!effectiveEndpoint) {
      setTestResult({ ok: false, message: '请填写 Endpoint' });
      return;
    }
    if (!effectiveKey) {
      setTestResult({ ok: false, message: '请填写 API Key' });
      return;
    }
    if (!model.trim()) {
      setTestResult({ ok: false, message: '请填写模型 ID' });
      return;
    }
    setTesting(true);
    try {
      const res = await window.softdesk.testAiProvider({
        provider,
        endpoint: effectiveEndpoint,
        apiKey: effectiveKey,
        model: model.trim(),
      });
      setTestResult(
        res.success
          ? { ok: true, message: '连接成功，配置可用' }
          : { ok: false, message: res.error || '连接失败' }
      );
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('请输入配置名称');
      return;
    }
    if (!model.trim()) {
      setError('请填写模型 ID');
      return;
    }
    if (!isEdit && !apiKey.trim()) {
      setError('请填写 API Key');
      return;
    }
    const input = {
      name: name.trim(),
      provider,
      model: model.trim(),
      endpoint: endpoint.trim() || undefined,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
    if (isEdit && config) {
      updateAiProvider(config.id, input);
    } else {
      addAiProvider(input);
    }
    onClose();
  };

  const fieldClass =
    'w-full px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all';
  const triggerClass =
    'flex w-full items-center justify-between px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-sm text-slate-100 hover:border-slate-700 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all';
  const menuClass =
    'absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-1 shadow-2xl shadow-slate-950/50';

  const optionClass = (selected: boolean) =>
    cn(
      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
      selected ? 'bg-violet-500/20 text-violet-200' : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? '编辑 AI 模型' : '添加 AI 模型'}
        className="relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-slate-950/50"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">{isEdit ? '编辑 AI 模型' : '添加 AI 模型'}</h2>
          <button onClick={onClose} aria-label="关闭" className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">配置名称</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="例如：我的 OpenAI"
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Provider</label>
              <div
                className="relative"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsProviderMenuOpen(false);
                }}
              >
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={isProviderMenuOpen}
                  onClick={() => setIsProviderMenuOpen((o) => !o)}
                  className={triggerClass}
                >
                  <span className="truncate">{providerLabel(provider)}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform', isProviderMenuOpen && 'rotate-180')} />
                </button>
                {isProviderMenuOpen && (
                  <div role="listbox" className={menuClass}>
                    {PROVIDER_OPTIONS.map((option) => {
                      const selected = option.value === provider;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleProviderChange(option.value)}
                          className={optionClass(selected)}
                        >
                          <span>{option.label}</span>
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Endpoint</label>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={defaultEndpointForProvider(provider) || '自定义接口地址'}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">模型</label>
            <div
              className="relative"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsModelMenuOpen(false);
              }}
            >
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isModelMenuOpen}
                onClick={() => setIsModelMenuOpen((o) => !o)}
                className={triggerClass}
              >
                <span className="truncate">{modelLabel}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform', isModelMenuOpen && 'rotate-180')} />
              </button>
              {isModelMenuOpen && (
                <div role="listbox" className={menuClass}>
                  {[...modelOptions, { value: CUSTOM_MODEL_VALUE, label: '自定义模型 ID' }].map((option) => {
                    const selected = option.value === CUSTOM_MODEL_VALUE ? isCustomModel : option.value === model && !isCustomModel;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectModel(option.value)}
                        className={optionClass(selected)}
                      >
                        <span>{option.label}</span>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {isCustomModel && (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="输入自定义模型 ID"
                className={cn(fieldClass, 'mt-2')}
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError('');
              }}
              placeholder={isEdit ? '留空则继续使用已保存的 Key' : 'sk-...'}
              className={fieldClass}
            />
            <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
              {isEdit
                ? 'API Key 仅保存在本地，留空表示沿用已保存的 Key。'
                : 'API Key 仅保存在本地设备，不会上传到任何服务器。'}
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</div>
          )}

          {testResult && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-xl border px-3 py-2 text-xs',
                testResult.ok
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
              )}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed break-all">{testResult.message}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-800">
          <button
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {testing ? '测试中' : '测试连接'}
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-600 transition-colors"
          >
            {isEdit ? '保存修改' : '添加'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
