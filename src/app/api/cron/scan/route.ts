import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { fetchAllTickers, fetchKlines } from '@/lib/bybit';
import { runEngine } from '@/lib/signalEngine';
import { getAllSubscriptions } from '@/lib/subscriptions';

export const maxDuration = 300; // 5 min max on Vercel pro; use 60 on hobby

const MIN_VOLUME  = 1_000_000;  // lower threshold to catch more coins
const ALERT_SCORE = 80;
const BATCH       = 6;          // parallel fetches per batch

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL ?? 'admin@4scans.app'),
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
  process.env.VAPID_PRIVATE_KEY ?? '',
);

export async function GET(req: NextRequest) {
  // Protect the cron endpoint — Vercel sets this header automatically
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
  const start = Date.now();
  const alerts: { symbol: string; score: number; direction: string; tier: string }[] = [];

  try {
    const allTickers = await fetchAllTickers();
    const candidates = allTickers.filter(t => t.volume24h >= MIN_VOLUME);

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (t) => {
          try {
            const [c1m, c5m, c15m, c1h, c4h, c1d] = await Promise.all([
              fetchKlines(t.symbol, '1',   80),
              fetchKlines(t.symbol, '5',   100),
              fetchKlines(t.symbol, '15',  100),
              fetchKlines(t.symbol, '60',  200),
              fetchKlines(t.symbol, '240', 100),
              fetchKlines(t.symbol, 'D',   100),
            ]);
            const candleMap = { '1m': c1m, '5m': c5m, '15m': c15m, '1h': c1h, '4h': c4h, '1d': c1d };
            const eng = runEngine(t.symbol, t.price, candleMap, timestamp);

            if (eng.totalScore >= ALERT_SCORE && eng.direction !== 'NEUTRAL') {
              const tier = eng.totalScore >= 85 ? 'A+' : eng.totalScore >= 72 ? 'A' : 'B';
              alerts.push({ symbol: t.symbol, score: eng.totalScore, direction: eng.direction, tier });
            }
          } catch { /* skip failed symbols silently */ }
        })
      );
    }

    // Send push notifications
    if (alerts.length > 0) {
      const subs = getAllSubscriptions();
      const emoji = (tier: string) => tier === 'A+' ? '🔥' : tier === 'A' ? '⭐' : '✅';

      for (const alert of alerts) {
        const payload = JSON.stringify({
          title: `${emoji(alert.tier)} ${alert.symbol} — ${alert.direction} [${alert.tier}]`,
          body: `Score ${alert.score}/100 · Elite signal detected · Tap to analyse`,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          data: { symbol: alert.symbol, url: `/?symbol=${alert.symbol}` },
        });

        await Promise.allSettled(
          subs.map(sub => webpush.sendNotification(sub, payload).catch(() => {}))
        );
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: candidates.length,
      alerts: alerts.length,
      elapsed: Date.now() - start,
      signals: alerts,
      timestamp,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
