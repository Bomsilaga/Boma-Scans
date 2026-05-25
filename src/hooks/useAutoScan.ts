'use client';
import { useEffect, useRef } from 'react';

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const ALERT_SCORE = 80;

async function doScan() {
  const res = await fetch('/api/scan');
  if (!res.ok) return;
  const data = await res.json() as { results?: { symbol: string; totalScore: number; direction: string; tier: string }[] };
  const hits = (data.results ?? []).filter(r => r.totalScore >= ALERT_SCORE);
  if (hits.length === 0) return;

  // Read whichever AI provider the user has selected right now
  const aiProvider = localStorage.getItem('ai_provider') ?? '';
  const aiKeys = JSON.parse(localStorage.getItem('ai_api_keys') ?? '{}') as Record<string, string>;
  const aiApiKey = aiProvider ? (aiKeys[aiProvider] ?? '') : '';

  // Send one notification per hit (up to 3), with AI verdict if available
  const sendNotification = async (title: string, body: string, symbol: string) => {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          data: { symbol, url: `/?symbol=${symbol}` },
        } as NotificationOptions).catch(() => {});
        return;
      }
    }
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.png' });
    }
  };

  for (const hit of hits.slice(0, 3)) {
    const emoji = hit.tier === 'A+' ? '🔥' : hit.tier === 'A' ? '⭐' : '✅';
    const baseTitle = `${emoji} ${hit.symbol} — ${hit.direction} [${hit.tier}]`;

    // If AI provider + key set, fetch a quick analysis and include verdict in notification
    if (aiProvider && aiApiKey) {
      try {
        const res = await fetch('/api/analyse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: hit.symbol, aiProvider, aiApiKey }),
        });
        if (res.ok) {
          const analysis = await res.json() as { verdict?: string; aiAnalysis?: string };
          // First line of AI analysis as the notification body
          const aiLine = analysis.aiAnalysis?.split('\n').find(l => l.trim().length > 20) ?? '';
          const body = aiLine
            ? `Score ${hit.totalScore}/100 · ${aiLine.slice(0, 80)}`
            : `Score ${hit.totalScore}/100 · Elite signal · Tap to analyse`;
          await sendNotification(baseTitle, body, hit.symbol);
          continue;
        }
      } catch { /* fall through to plain notification */ }
    }

    await sendNotification(
      baseTitle,
      `Score ${hit.totalScore}/100 · Elite signal detected · Tap to analyse`,
      hit.symbol,
    );
  }
}

export function useAutoScan() {
  const lastRun = useRef<number>(0);

  useEffect(() => {
    async function runScan() {
      const now = Date.now();
      if (now - lastRun.current < INTERVAL_MS - 5000) return;
      lastRun.current = now;
      try {
        await doScan();
      } catch { /* silent */ }
    }

    const stored = parseInt(localStorage.getItem('lastAutoScan') ?? '0');
    if (Date.now() - stored >= INTERVAL_MS) {
      runScan().then(() => localStorage.setItem('lastAutoScan', String(Date.now())));
    }

    const interval = setInterval(() => {
      runScan().then(() => localStorage.setItem('lastAutoScan', String(Date.now())));
    }, INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
