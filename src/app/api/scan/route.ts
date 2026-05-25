import { NextResponse } from 'next/server';
import { fetchAllTickers, fetchKlines } from '@/lib/bybit';
import { runEngine } from '@/lib/signalEngine';
import type { ScanResult } from '@/types';



const MIN_VOLUME = 5_000_000;
const MIN_SCORE  = 55;
const MIN_ALIGN  = 65;
const BATCH      = 8;
const TOP_N      = 100;

export async function GET() {
  const start = Date.now();
  try {
    const allTickers = await fetchAllTickers();
    const candidates = allTickers
      .filter((t) => t.volume24h >= MIN_VOLUME)
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, TOP_N);

    const results: ScanResult[] = [];
    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(
        batch.map(async (t) => {
          const [c1m, c5m, c15m, c1h, c4h, c1d] = await Promise.all([
            fetchKlines(t.symbol, '1', 100),
            fetchKlines(t.symbol, '5', 200),
            fetchKlines(t.symbol, '15', 200),
            fetchKlines(t.symbol, '60', 200),
            fetchKlines(t.symbol, '240', 200),
            fetchKlines(t.symbol, 'D', 100),
          ]);
          const candleMap = { '1m': c1m, '5m': c5m, '15m': c15m, '1h': c1h, '4h': c4h, '1d': c1d };
          const eng = runEngine(t.symbol, t.price, candleMap, timestamp);

          // Persona filter
          if (eng.direction === 'NEUTRAL') return null;
          if (eng.alignmentScore < MIN_ALIGN) return null;
          if (eng.totalScore < MIN_SCORE) return null;

          const tier =
            eng.totalScore >= 85 ? 'A+' :
            eng.totalScore >= 72 ? 'A'  :
            eng.totalScore >= 60 ? 'B'  :
            eng.totalScore >= 50 ? 'C'  : 'WATCH';

          const verdict =
            tier === 'A+' ? 'ELITE — Execute now' :
            tier === 'A'  ? 'HIGH CONVICTION'     :
            tier === 'B'  ? 'VALID SETUP'         :
            tier === 'C'  ? 'BORDERLINE'          : 'Watch only';

          const verdictEmoji = { 'A+': '🔥', A: '⭐', B: '✅', C: '⚠️', WATCH: '👁️' }[tier];

          const sig = eng.scalpSignal;

          const result: ScanResult = {
            symbol: t.symbol,
            price: t.price,
            change24h: t.change24h,
            volume24h: t.volume24h,
            direction: eng.direction,
            totalScore: eng.totalScore,
            confidence: eng.confidence,
            alignmentScore: eng.alignmentScore,
            alignmentQuality: eng.alignmentQuality,
            tier: tier as ScanResult['tier'],
            verdict,
            verdictEmoji: verdictEmoji ?? '👁️',
            entry: sig.entry,
            stopLoss: sig.stopLoss,
            tp1: sig.tp1,
            tp2: sig.tp2,
            tp3: sig.tp3,
            netRR: sig.netRR,
            trendMap: eng.trendMap,
            rsi: eng.deep.rsi,
            volRatio: eng.deep.volRatio,
            signals: [
              eng.deep.hasBOS ? 'Break of Structure confirmed' : '',
              eng.deep.hasOB  ? `Order Block (${eng.direction})` : '',
              eng.deep.hasFVG ? 'Fair Value Gap present' : '',
              eng.deep.hasChoCH ? 'Change of Character detected' : '',
              eng.deep.hasSweep ? 'Liquidity Sweep confirmed' : '',
              eng.deep.macdBull ? 'MACD bullish crossover' : eng.deep.macdBear ? 'MACD bearish crossover' : '',
              eng.deep.vwapAbove ? 'Price above VWAP' : 'Price below VWAP',
              `Wyckoff: ${eng.deep.wyckoffPhase}`,
              `AMD Bias: ${eng.deep.amdBias}`,
            ].filter(Boolean),
            bestSetup: eng.bestSetup,
            recommendedLeverage: sig.leverage,
            hasBOS: eng.deep.hasBOS,
            hasOB: eng.deep.hasOB,
            hasFVG: eng.deep.hasFVG,
            hasSweep: eng.deep.hasSweep,
            hasChoCH: eng.deep.hasChoCH,
            macdBull: eng.deep.macdBull,
            macdBear: eng.deep.macdBear,
            vwapAbove: eng.deep.vwapAbove,
          };
          return result;
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      }
    }

    results.sort((a, b) => b.totalScore - a.totalScore);

    return NextResponse.json({
      results,
      scanned: candidates.length,
      elapsed: Date.now() - start,
      timestamp,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
