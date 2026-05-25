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

  // Try web push via service worker (works in background)
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      for (const hit of hits.slice(0, 3)) {
        const emoji = hit.tier === 'A+' ? '🔥' : hit.tier === 'A' ? '⭐' : '✅';
        await reg.showNotification(`${emoji} ${hit.symbol} — ${hit.direction} [${hit.tier}]`, {
          body: `Score ${hit.totalScore}/100 · Elite signal detected · Tap to analyse`,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          data: { symbol: hit.symbol, url: `/?symbol=${hit.symbol}` },
        } as NotificationOptions).catch(() => {});
      }
      return;
    }
  }

  // Fallback: native Notification API
  if (Notification.permission === 'granted') {
    for (const hit of hits.slice(0, 3)) {
      const emoji = hit.tier === 'A+' ? '🔥' : hit.tier === 'A' ? '⭐' : '✅';
      new Notification(`${emoji} ${hit.symbol} — ${hit.direction} [${hit.tier}]`, {
        body: `Score ${hit.totalScore}/100 · Elite signal detected`,
        icon: '/icon-192.png',
      });
    }
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

    // Run immediately on mount if not run in the last hour
    const stored = parseInt(localStorage.getItem('lastAutoScan') ?? '0');
    if (Date.now() - stored >= INTERVAL_MS) {
      runScan().then(() => localStorage.setItem('lastAutoScan', String(Date.now())));
    }

    // Then every hour
    const interval = setInterval(() => {
      runScan().then(() => localStorage.setItem('lastAutoScan', String(Date.now())));
    }, INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
