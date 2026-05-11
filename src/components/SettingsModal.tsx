import { useState, useEffect } from 'react';
import { X, Settings, Eye, EyeOff, Check, ChevronDown, Lock, AlertCircle, Server, Loader2 } from 'lucide-react';
import {
  getLLMConfig, saveLLMConfig, clearLLMConfig, saveSharedConfig,
  PROVIDER_META,
  type LLMProvider, type LLMConfig,
} from '../utils/llmConfig';
import { useAppContext } from '../context/AppContext';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const { sharedLLMConfig, sharedLLMConfigLoaded, setSharedLLMConfig } = useAppContext();

  // Admin unlock
  const [password, setPassword]   = useState('');
  const [unlocked, setUnlocked]   = useState(false);
  const [authError, setAuthError] = useState('');

  // Config fields
  const [provider, setProvider]   = useState<LLMProvider>('gemini');
  const [apiKey, setApiKey]       = useState('');
  const [model, setModel]         = useState('');
  const [baseUrl, setBaseUrl]     = useState('');
  const [webSearch, setWebSearch] = useState(true);
  const [showKey, setShowKey]     = useState(false);

  // Save state
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  // Pre-fill from shared config (server) or localStorage when admin unlocks
  useEffect(() => {
    if (!unlocked) return;
    const cfg = sharedLLMConfig ?? getLLMConfig();
    if (cfg) {
      setProvider(cfg.provider);
      setApiKey(cfg.apiKey);
      setModel(cfg.model);
      setBaseUrl(cfg.baseUrl ?? '');
      setWebSearch(cfg.webSearch ?? true);
    }
  }, [unlocked, sharedLLMConfig]);

  function handleProviderChange(p: LLMProvider) {
    setProvider(p);
    const meta = PROVIDER_META[p];
    setModel((prev) => prev || meta.defaultModel);
    setBaseUrl((prev) => prev || meta.defaultBaseUrl);
  }

  function handleUnlock() {
    if (!password.trim()) return;
    // The password will be verified by the server on save.
    // We unlock the UI optimistically and show a server error only on save.
    setUnlocked(true);
    setAuthError('');
  }

  async function handleSave() {
    const cfg: LLMConfig = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim() || PROVIDER_META[provider].defaultModel,
      baseUrl: baseUrl.trim() || PROVIDER_META[provider].defaultBaseUrl,
      webSearch,
    };

    setSaving(true);
    setSaveMsg(null);

    // In local dev there's no Vercel runtime — skip the server call entirely.
    if (import.meta.env.DEV) {
      saveLLMConfig(cfg);
      setSaving(false);
      setSaveMsg({ type: 'ok', text: 'Saved locally (local dev — server not available).' });
      setTimeout(() => setSaveMsg(null), 3000);
      return;
    }

    // Try to save to server first
    const result = await saveSharedConfig(password, cfg);
    setSaving(false);

    if ('ok' in result) {
      // Server save succeeded — update shared config in context
      setSharedLLMConfig(cfg);
      // Also persist locally so it works in dev
      saveLLMConfig(cfg);
      setSaveMsg({ type: 'ok', text: 'Saved to server — all visitors will use this config.' });
    } else if (result.error.includes('401') || result.error.includes('Incorrect')) {
      setAuthError('Incorrect password.');
      setUnlocked(false);
      setSaveMsg({ type: 'err', text: 'Wrong password — settings not saved.' });
    } else {
      // Server unavailable (KV not configured) — fall back to localStorage
      saveLLMConfig(cfg);
      setSaveMsg({
        type: 'warn',
        text: `Server storage unavailable — saved locally only. Set up Upstash Redis in Vercel to enable shared config.`,
      });
    }

    if (saveMsg?.type !== 'err') {
      setTimeout(() => setSaveMsg(null), 5000);
    }
  }

  function handleClear() {
    clearLLMConfig();
    setApiKey('');
    setModel('');
    setBaseUrl('');
    setWebSearch(true);
    setProvider('gemini');
    setSaveMsg(null);
  }

  const meta = PROVIDER_META[provider];
  const modelFilled = model.trim().length > 0 || meta.defaultModel.length > 0;
  const canSave =
    !saving &&
    apiKey.trim().length > 0 &&
    modelFilled &&
    (provider !== 'openai-compatible' || (baseUrl.trim().length > 0 && model.trim().length > 0));

  const isServerConfigured = sharedLLMConfigLoaded && !!sharedLLMConfig;

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
            {isServerConfigured && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                <Server size={9} />
                Server config active
              </span>
            )}
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

          {!unlocked ? (
            /* ── Admin lock screen ── */
            <div className="space-y-4">
              {isServerConfigured ? (
                <div className="flex items-start gap-2 text-[11px] text-emerald-400/80 bg-emerald-400/5 border border-emerald-400/20 rounded-lg px-3 py-2.5">
                  <Server size={12} className="mt-0.5 shrink-0" />
                  <span>
                    LLM is configured and shared with all visitors. Enter the admin password below to modify settings.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-[11px] text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2.5">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>
                    No shared config detected. Enter the admin password to configure the LLM for all visitors.
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-white/70 uppercase tracking-wider">
                  Admin Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setAuthError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
                    placeholder="Enter admin password"
                    autoFocus
                    className="w-full bg-bg border border-border focus:border-accent rounded-lg px-3 py-2 text-xs text-white placeholder:text-muted/40 outline-none transition-colors pr-9 font-mono"
                  />
                  <Lock size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                </div>
                {authError && (
                  <p className="text-[10px] text-red-400 flex items-center gap-1">
                    <AlertCircle size={10} /> {authError}
                  </p>
                )}
              </div>

              <button
                onClick={handleUnlock}
                disabled={!password.trim()}
                className="w-full py-2 text-xs font-medium bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Unlock Settings
              </button>
            </div>
          ) : (
            /* ── Admin settings form ── */
            <>
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
                  Stored server-side — shared with all visitors. Never sent anywhere except to your chosen provider.
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
                  <p className="text-[10px] text-amber-400">Required — enter the exact model ID, e.g. <span className="font-mono">openai/gpt-4o</span></p>
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
                    Groq → <span className="font-mono text-white/50">https://api.groq.com/openai/v1</span>
                  </p>
                </div>
              )}

              {/* Web search toggle
                  Track: w-11 h-6 = 44×24 px
                  Knob:  w-5  h-5 = 20×20 px, inset 2 px from each edge
                  OFF (unchecked) → knob on RIGHT: base left-[2px] + translate-x-5 (20px) = 22px
                  ON  (checked)   → knob on LEFT:  base left-[2px] + translate-x-0      =  2px
                  Both track div AND knob span are direct siblings of <input.peer>
                  so peer-checked: reaches them via CSS ~ combinator.             */}
              <div className="flex items-start gap-3 pt-1">
                <label className="relative mt-0.5 shrink-0 w-11 h-6 cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={webSearch}
                    onChange={(e) => setWebSearch(e.target.checked)}
                  />
                  {/* Track — sibling of peer input ✓ */}
                  <div className="w-full h-full rounded-full border transition-colors
                                  bg-surface-2 border-border
                                  peer-checked:bg-accent peer-checked:border-accent" />
                  {/* Knob — sibling of peer input ✓ */}
                  <span className="absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white shadow
                                   transition-transform duration-200
                                   translate-x-5 peer-checked:translate-x-0" />
                </label>
                <div>
                  <p className="text-[11px] text-white/80 font-medium">Enable web search</p>
                  <p className="text-[10px] text-muted leading-relaxed mt-0.5">{meta.webSearchHint}</p>
                </div>
              </div>

              {/* Save result message */}
              {saveMsg && (
                <div className={`flex items-start gap-2 text-[11px] rounded-lg px-3 py-2 ${
                  saveMsg.type === 'ok'  ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' :
                  saveMsg.type === 'warn'? 'bg-amber-400/10 text-amber-300 border border-amber-400/20' :
                                          'bg-red-400/10 text-red-400 border border-red-400/20'
                }`}>
                  {saveMsg.type === 'ok' ? <Check size={12} className="mt-0.5 shrink-0" /> : <AlertCircle size={12} className="mt-0.5 shrink-0" />}
                  <span>{saveMsg.text}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {unlocked && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-border gap-3">
            <button
              onClick={handleClear}
              className="text-[11px] text-muted hover:text-red-400 transition-colors"
            >
              Clear local config
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
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors min-w-[80px] justify-center"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
