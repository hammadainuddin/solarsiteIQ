import { useState, useEffect } from 'react';
import { X, Settings, Eye, EyeOff, Check, ChevronDown } from 'lucide-react';
import {
  getLLMConfig, saveLLMConfig, clearLLMConfig,
  PROVIDER_META,
  type LLMProvider, type LLMConfig,
} from '../utils/llmConfig';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [provider, setProvider]   = useState<LLMProvider>('gemini');
  const [apiKey, setApiKey]       = useState('');
  const [model, setModel]         = useState('');
  const [baseUrl, setBaseUrl]     = useState('');
  const [webSearch, setWebSearch] = useState(true);
  const [showKey, setShowKey]     = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    const cfg = getLLMConfig();
    if (cfg) {
      setProvider(cfg.provider);
      setApiKey(cfg.apiKey);
      setModel(cfg.model);
      setBaseUrl(cfg.baseUrl ?? '');
      setWebSearch(cfg.webSearch ?? true);
    }
  }, []);

  // When provider changes, pre-fill defaults for model/baseUrl if fields are empty
  function handleProviderChange(p: LLMProvider) {
    setProvider(p);
    const meta = PROVIDER_META[p];
    setModel((prev) => prev || meta.defaultModel);
    setBaseUrl((prev) => prev || meta.defaultBaseUrl);
  }

  function handleSave() {
    const meta = PROVIDER_META[provider];
    const cfg: LLMConfig = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim() || meta.defaultModel,
      baseUrl: baseUrl.trim() || meta.defaultBaseUrl,
      webSearch,
    };
    saveLLMConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    clearLLMConfig();
    setApiKey('');
    setModel('');
    setBaseUrl('');
    setWebSearch(true);
    setProvider('gemini');
  }

  const meta = PROVIDER_META[provider];
  // For gemini/openai a default model exists; for openai-compatible the user must specify one
  const modelFilled = model.trim().length > 0 || meta.defaultModel.length > 0;
  const canSave =
    apiKey.trim().length > 0 &&
    modelFilled &&
    (provider !== 'openai-compatible' || (baseUrl.trim().length > 0 && model.trim().length > 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface border border-border rounded-xl w-full max-w-md mx-4 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-accent" />
            <h2 className="text-white font-semibold text-sm">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white p-1 rounded hover:bg-surface-2 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">

          {/* LLM Provider */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-white/70 uppercase tracking-wider">
              LLM Provider
            </label>
            <div className="relative">
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
                className="w-full appearance-none bg-bg border border-border focus:border-accent rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors pr-8"
              >
                {(Object.keys(PROVIDER_META) as LLMProvider[]).map((p) => (
                  <option key={p} value={p}>{PROVIDER_META[p].label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>
            <p className="text-[10px] text-muted leading-relaxed">{meta.hint}</p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-white/70 uppercase tracking-wider">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta.keyPlaceholder}
                className="w-full bg-bg border border-border focus:border-accent rounded-lg px-3 py-2 text-xs text-white placeholder:text-muted/40 outline-none transition-colors pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <p className="text-[10px] text-muted">
              Stored in your browser's local storage — never transmitted anywhere except directly to your chosen provider.
            </p>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-white/70 uppercase tracking-wider">
              Model{provider !== 'openai-compatible' && meta.defaultModel && (
                <span className="ml-1 normal-case font-normal text-muted/50">(default: {meta.defaultModel})</span>
              )}
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={meta.modelPlaceholder}
              className="w-full bg-bg border border-border focus:border-accent rounded-lg px-3 py-2 text-xs text-white placeholder:text-muted/40 outline-none transition-colors font-mono"
            />
            {provider === 'openai-compatible' && !model.trim() && (
              <p className="text-[10px] text-amber-400">Required — enter the exact model ID your provider expects, e.g. <span className="font-mono">openai/gpt-4o</span> for OpenRouter.</p>
            )}
          </div>

          {/* Base URL — only for openai-compatible */}
          {meta.showBaseUrl && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-white/70 uppercase tracking-wider">
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.groq.com/openai/v1"
                className="w-full bg-bg border border-border focus:border-accent rounded-lg px-3 py-2 text-xs text-white placeholder:text-muted/40 outline-none transition-colors font-mono"
              />
              <p className="text-[10px] text-muted leading-relaxed">
                OpenRouter → <span className="font-mono text-white/50">https://openrouter.ai/api/v1</span><br />
                Groq → <span className="font-mono text-white/50">https://api.groq.com/openai/v1</span><br />
                Mistral → <span className="font-mono text-white/50">https://api.mistral.ai/v1</span> ·
                Ollama → <span className="font-mono text-white/50">http://localhost:11434/v1</span>
              </p>
            </div>
          )}

          {/* Web search toggle */}
          <div className="flex items-start gap-3 pt-1">
            <button
              type="button"
              onClick={() => setWebSearch((v) => !v)}
              className={`mt-0.5 shrink-0 w-8 h-4 rounded-full transition-colors relative ${
                webSearch ? 'bg-accent' : 'bg-surface-2 border border-border'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                  webSearch ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <div>
              <p className="text-[11px] text-white/80 font-medium">Enable web search</p>
              <p className="text-[10px] text-muted leading-relaxed mt-0.5">{meta.webSearchHint}</p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border gap-3">
          <button
            onClick={handleClear}
            className="text-[11px] text-muted hover:text-red-400 transition-colors"
          >
            Clear saved config
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-muted hover:text-white border border-border hover:border-border/60 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {saved ? <><Check size={12} /> Saved</> : 'Save'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
