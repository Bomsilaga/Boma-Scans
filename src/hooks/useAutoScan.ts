'use client';
import { useEffect, useRef } from 'react';

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function useAutoScan() {
  const lastRun = useRef<number>(0);

  useEffect(() => {
    async function runScan() {
      const now = Date.now();
      if (now - lastRun.current < INTERVAL_MS - 5000) return;
      lastRun.current = now;
      try {
        await fetch('/api/cron/scan');
      } catch { /* silent */ }
    }

    // Run immediately on mount if not run in the last hour
    const stored = parseInt(localStorage.getItem('lastCronRun') ?? '0');
    if (Date.now() - stored >= INTERVAL_MS) {
      runScan().then(() => localStorage.setItem('lastCronRun', String(Date.now())));
    }

    // Then every hour
    const interval = setInterval(() => {
      runScan().then(() => localStorage.setItem('lastCronRun', String(Date.now())));
    }, INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
