'use client';
import { useState, useEffect } from 'react';
import type { AIProvider } from '@/types';

const KEY_PROVIDER = 'ai_provider';
const KEY_KEYS = 'ai_api_keys';

export interface AISettings {
  provider: AIProvider;
  keys: Record<AIProvider, string>;
}

export function useAISettings() {
  const [settings, setSettings] = useState<AISettings>({
    provider: 'claude',
    keys: { claude: '', openai: '', deepseek: '' },
  });

  useEffect(() => {
    try {
      const p = (localStorage.getItem(KEY_PROVIDER) ?? 'claude') as AIProvider;
      const k = JSON.parse(localStorage.getItem(KEY_KEYS) ?? '{}') as Record<AIProvider, string>;
      setSettings({ provider: p, keys: { ...{ claude: '', openai: '', deepseek: '' }, ...k } });
    } catch { /* ignore */ }
  }, []);

  function save(next: AISettings) {
    setSettings(next);
    localStorage.setItem(KEY_PROVIDER, next.provider);
    localStorage.setItem(KEY_KEYS, JSON.stringify(next.keys));
  }

  function setProvider(p: AIProvider) {
    save({ ...settings, provider: p });
  }

  function setKey(p: AIProvider, key: string) {
    save({ ...settings, keys: { ...settings.keys, [p]: key } });
  }

  const activeKey = settings.keys[settings.provider];

  return { settings, setProvider, setKey, activeKey };
}
