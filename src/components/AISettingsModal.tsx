'use client';
import { useState } from 'react';
import type { AIProvider } from '@/types';
import type { AISettings } from '@/hooks/useAISettings';

const PROVIDERS: { id: AIProvider; label: string; hint: string; color: string }[] = [
  { id: 'claude',   label: 'Claude (Anthropic)', hint: 'claude.ai/settings → API keys',      color: '#cc785c' },
  { id: 'openai',   label: 'OpenAI GPT-4o',      hint: 'platform.openai.com → API keys',     color: '#10a37f' },
  { id: 'deepseek', label: 'DeepSeek Reasoner',  hint: 'platform.deepseek.com → API keys',   color: '#4d6bff' },
];

interface Props {
  settings: AISettings;
  onSetProvider: (p: AIProvider) => void;
  onSetKey: (p: AIProvider, key: string) => void;
  onClose: () => void;
}

export default function AISettingsModal({ settings, onSetProvider, onSetKey, onClose }: Props) {
  const [showKeys, setShowKeys] = useState<Record<AIProvider, boolean>>({
    claude: false, openai: false, deepseek: false,
  });
  const [drafts, setDrafts] = useState<Record<AIProvider, string>>({
    claude: settings.keys.claude,
    openai: settings.keys.openai,
    deepseek: settings.keys.deepseek,
  });

  function save(p: AIProvider) {
    onSetKey(p, drafts[p]);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md space-y-4"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">🤖 AI Analysis Settings</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">✕</button>
        </div>

        <p className="text-xs text-text-muted">
          Choose your AI engine. The selected provider runs a deep educational analysis on every signal — covering market structure, entry rationale, risk management, and trading tutorial.
          Your API key is stored locally in your browser only — never sent to our servers.
        </p>

        <div className="space-y-3">
          {PROVIDERS.map((prov) => {
            const isActive = settings.provider === prov.id;
            const hasKey = !!drafts[prov.id];
            return (
              <div
                key={prov.id}
                className={`rounded-xl border-2 p-3 transition-all ${isActive ? 'border-accent/60 bg-accent/5' : 'border-border bg-surface'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => onSetProvider(prov.id)}
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${isActive ? 'border-accent bg-accent' : 'border-border'}`}
                  />
                  <span className="text-sm font-semibold text-text-primary">{prov.label}</span>
                  {isActive && (
                    <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-bold ml-auto">ACTIVE</span>
                  )}
                  {!isActive && hasKey && (
                    <span className="text-[10px] bg-bull/10 text-bull px-1.5 py-0.5 rounded font-bold ml-auto">KEY SET</span>
                  )}
                </div>

                <div className="flex gap-1">
                  <input
                    type={showKeys[prov.id] ? 'text' : 'password'}
                    placeholder={`${prov.label} API key…`}
                    value={drafts[prov.id]}
                    onChange={(e) => setDrafts(d => ({ ...d, [prov.id]: e.target.value }))}
                    onBlur={() => save(prov.id)}
                    className="input text-xs py-1 flex-1 font-mono"
                  />
                  <button
                    onClick={() => setShowKeys(s => ({ ...s, [prov.id]: !s[prov.id] }))}
                    className="text-[10px] px-2 rounded bg-muted text-text-muted hover:text-text-primary"
                  >
                    {showKeys[prov.id] ? '🙈' : '👁️'}
                  </button>
                </div>
                <p className="text-[9px] text-text-muted mt-1">Get key: {prov.hint}</p>
              </div>
            );
          })}
        </div>

        <div className="text-[10px] text-text-muted bg-muted/30 rounded-lg p-2 leading-relaxed">
          🔒 Keys are stored in <code>localStorage</code> on this device only. They are sent directly to the AI provider's API from our server — never logged or stored by Boma Scans.
        </div>

        <button onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  );
}
