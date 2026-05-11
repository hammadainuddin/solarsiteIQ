import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { buildSystemInstruction, buildContextBlock } from '../utils/assistantContext';
import { streamLLMResponse, type ChatMessage } from '../utils/llmClient';
import { getLLMConfig, PROVIDER_META } from '../utils/llmConfig';

const SUGGESTED_PROMPTS = [
  'Which northern Malaysia state has the best solar potential?',
  'What are the key risks for solar in the MADA paddy zone?',
  'Explain the TNB LSS connection process for a 50 MW project.',
  'What EIA requirements apply to a 100 MW solar farm in Kedah?',
];

export function AssistantPanel() {
  const {
    claudeOpen, setClaudeOpen, pendingClaudePrompt, setPendingClaudePrompt,
    activeWorkflow, pinLocation, selectedTile,
    sharedLLMConfig,
  } = useAppContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const config = sharedLLMConfig ?? getLLMConfig();
  const hasConfig = !!config;

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  const send = useCallback(async (userText: string) => {
    if (!userText.trim() || streaming) return;
    const cfg = sharedLLMConfig ?? getLLMConfig();
    if (!cfg) return;

    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: userText.trim() };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    try {
      const contextBlock = buildContextBlock({
        activeWorkflow,
        pinLat: pinLocation?.lat ?? selectedTile?.centerLat,
        pinLng: pinLocation?.lng ?? selectedTile?.centerLng,
        pinState: selectedTile?.states?.[0],
      });

      const history = messages.filter((m) => m.content.length > 0);
      const fullMessage = `${contextBlock}\n\n---\n\n${userText.trim()}`;

      for await (const piece of streamLLMResponse(
        cfg,
        { system: buildSystemInstruction(), history, message: fullMessage, useSearch: true },
      )) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + piece };
          return next;
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Request failed: ${msg}`);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }, [streaming, messages, activeWorkflow, pinLocation, selectedTile]);

  useEffect(() => {
    if (claudeOpen && pendingClaudePrompt && !streaming) {
      const p = pendingClaudePrompt;
      setPendingClaudePrompt(null);
      send(p);
    }
  }, [claudeOpen, pendingClaudePrompt, streaming, send, setPendingClaudePrompt]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  if (!claudeOpen) {
    return (
      <button
        onClick={() => setClaudeOpen(true)}
        className="fixed bottom-5 right-5 z-[1600] w-12 h-12 rounded-full bg-accent hover:bg-accent-hover shadow-lg shadow-accent/30 text-white flex items-center justify-center transition-transform hover:scale-105"
        aria-label="Open SiteIQ assistant"
      >
        <MessageSquare size={20} />
      </button>
    );
  }

  const providerLabel = config ? PROVIDER_META[config.provider].label : '';

  return (
    <div className="fixed bottom-5 right-5 z-[1600] w-[420px] h-[640px] max-h-[calc(100vh-40px)] bg-bg border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Sparkles size={14} className="text-amber-400" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">Solar SiteIQ Assistant</p>
            <p className="text-muted text-[10px]">{config ? `${providerLabel} · ${config.model}` : 'No LLM configured'}</p>
          </div>
        </div>
        <button onClick={() => setClaudeOpen(false)} className="text-muted hover:text-white p-1 rounded-lg hover:bg-surface-2 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!hasConfig && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertCircle size={12} /> No LLM configured
            </div>
            <p className="leading-relaxed">
              Open <span className="text-amber-200 font-semibold">Settings</span> (gear icon in the sidebar) and add your API key and model to get started.
            </p>
          </div>
        )}

        {messages.length === 0 && hasConfig && (
          <div>
            <p className="text-muted text-xs mb-3">Try one of these:</p>
            <div className="space-y-1.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="w-full text-left px-3 py-2 bg-surface-2 hover:bg-surface border border-border rounded-lg text-xs text-white transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}

        {streaming && messages.length > 0 && messages[messages.length - 1].content === '' && (
          <div className="flex items-center gap-2 text-muted text-xs">
            <Loader2 size={12} className="animate-spin" />
            Thinking…
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border px-3 py-3 shrink-0 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={hasConfig ? 'Ask about solar sites, grid, land, regulations…' : 'Configure LLM in Settings to chat'}
          disabled={!hasConfig || streaming}
          className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!hasConfig || streaming || !input.trim()}
          className="w-9 h-9 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white flex items-center justify-center transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-accent/20 border border-accent/30 rounded-lg px-3 py-2 max-w-[85%] text-xs text-white whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="bg-surface border border-border rounded-lg px-3 py-2 max-w-[90%] text-xs text-white whitespace-pre-wrap leading-relaxed">
        {message.content || <span className="text-muted">…</span>}
      </div>
    </div>
  );
}
