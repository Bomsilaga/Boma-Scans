'use client';
import { useState } from 'react';
import type { AIProvider } from '@/types';
import type { AISettings } from '@/hooks/useAISettings';

const PROVIDERS: { id: AIProvider; label: string; hint: string; placeholder: string }[] = [
  { id: 'claude',   label: 'Claude',   hint: 'console.anthropic.com → API keys', placeholder: 'sk-ant-api03-…' },
  { id: 'openai',   label: 'OpenAI',   hint: 'platform.openai.com → API keys',   placeholder: 'sk-proj-…'      },
  { id: 'deepseek', label: 'DeepSeek', hint: 'platform.deepseek.com → API keys', placeholder: 'sk-…'           },
];

interface Props {
  settings: AISettings;
  onSetProvider: (p: AIProvider) => void;
  onSetKey: (p: AIProvider, key: string) => void;
  onClose: () => void;
}

export default function AISettingsModal({ settings, onSetProvider, onSetKey, onClose }: Props) {
  const active = PROVIDERS.find(p => p.id === settings.provider) ?? PROVIDERS[0];
  const [draft, setDraft] = useState(settings.keys[settings.provider] ?? '');
  const [showKey, setShowKey] = useState(false);

  function handleProviderChange(p: AIProvider) {
    // Save current draft before switching
    onSetKey(settings.provider, draft);
    onSetProvider(p);
    // Load the key for the newly selected provider
    setDraft(settings.keys[p] ?? '');
    setShowKey(false);
  }

  function handleSave() {
    onSetKey(settings.provider, draft);
    onClose();
  }

  const hasKey = draft.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">🤖 AI Analysis</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none px-1">✕</button>
        </div>

        {/* Provider selector — pick ONE */}
        <div>
          <p className="text-[10px] text-text-muted mb-2 uppercase tracking-wide font-semibold">Select AI provider</p>
          <div className="flex gap-2">
            {PROVIDERS.map((prov) => {
              const isActive = settings.provider === prov.id;
              return (
                <button
                  key={prov.id}
                  onClick={() => handleProviderChange(prov.id)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                    isActive
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-text-muted hover:border-accent/40 hover:text-text-secondary'
                  }`}
                >
                  {prov.label}
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-accent mx-auto mt-1" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Single key input for the active provider only */}
        <div>
          <p className="text-[10px] text-text-muted mb-1.5 uppercase tracking-wide font-semibold">
            {active.label} API key
          </p>
          <div className="flex gap-1">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder={active.placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="input text-xs py-1.5 flex-1 font-mono"
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey(s => !s)}
              className="text-[11px] px-2.5 rounded bg-muted text-text-muted hover:text-text-primary"
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <p className="text-[9px] text-text-muted mt-1">Get key: {active.hint}</p>
        </div>

        {/* Status */}
        <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${hasKey ? 'bg-bull/10 text-bull border border-bull/20' : 'bg-muted text-text-muted'}`}>
          <span>{hasKey ? '✅' : '⚪'}</span>
          <span>{hasKey ? `${active.label} active — only this provider will run` : 'No key set — AI analysis disabled'}</span>
        </div>

        <div className="text-[9px] text-text-muted leading-relaxed">
          🔒 Key stored in your browser only. Only the selected provider runs — never all three at once.
        </div>

        <button
          onClick={handleSave}
          className="btn-primary w-full"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
}
