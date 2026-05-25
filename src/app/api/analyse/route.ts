import { NextRequest, NextResponse } from 'next/server';
import { fetchKlines, fetchTicker } from '@/lib/bybit';
import { runEngine } from '@/lib/signalEngine';
import { getAIAnalysis } from '@/lib/aiProvider';
import type { AIProvider } from '@/lib/aiProvider';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const { symbol, aiProvider, aiApiKey } = body ? JSON.parse(body) : {};
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const sym = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;

    const [ticker, ...klineResults] = await Promise.all([
      fetchTicker(sym),
      fetchKlines(sym, '1', 100),
      fetchKlines(sym, '5', 200),
      fetchKlines(sym, '15', 200),
      fetchKlines(sym, '60', 200),
      fetchKlines(sym, '240', 200),
      fetchKlines(sym, 'D', 200),
    ]);

    const candleMap: Record<string, typeof klineResults[0]> = {
      '1m':  klineResults[0],
      '5m':  klineResults[1],
      '15m': klineResults[2],
      '1h':  klineResults[3],
      '4h':  klineResults[4],
      '1d':  klineResults[5],
    };

    const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
    const result = runEngine(sym, ticker.price, candleMap, timestamp);

    // AI deep analysis — runs if provider + key are supplied
    let aiAnalysis: string | undefined;
    if (aiProvider && aiApiKey) {
      try {
        const sig = result.intradaySignal;
        aiAnalysis = await getAIAnalysis({
          symbol: sym,
          price: ticker.price,
          direction: result.direction,
          totalScore: result.totalScore,
          confidence: result.confidence,
          alignmentScore: result.alignmentScore,
          alignmentQuality: result.alignmentQuality,
          tier: result.totalScore >= 85 ? 'A+' : result.totalScore >= 72 ? 'A' : result.totalScore >= 60 ? 'B' : 'C',
          wyckoffPhase: result.deep.wyckoffPhase,
          amdBias: result.deep.amdBias,
          rsi: result.deep.rsi,
          volRatio: result.deep.volRatio,
          vwapAbove: result.deep.vwapAbove,
          bbWidth: result.deep.bbWidth,
          hasBOS: result.deep.hasBOS,
          hasOB: result.deep.hasOB,
          hasFVG: result.deep.hasFVG,
          hasChoCH: result.deep.hasChoCH,
          hasSweep: result.deep.hasSweep,
          macdBull: result.deep.macdBull,
          macdBear: result.deep.macdBear,
          entry: sig.entry,
          stopLoss: sig.stopLoss,
          tp1: sig.tp1,
          tp2: sig.tp2,
          tp3: sig.tp3,
          netRR: sig.netRR,
          leverage: sig.leverage,
          trendMap: result.trendMap,
          signals: [
            result.deep.hasBOS ? 'Break of Structure confirmed' : '',
            result.deep.hasOB  ? `Order Block (${result.direction})` : '',
            result.deep.hasFVG ? 'Fair Value Gap present' : '',
            result.deep.hasChoCH ? 'Change of Character detected' : '',
            result.deep.hasSweep ? 'Liquidity Sweep confirmed' : '',
            result.deep.macdBull ? 'MACD bullish crossover' : result.deep.macdBear ? 'MACD bearish crossover' : '',
            result.deep.vwapAbove ? 'Price above VWAP' : 'Price below VWAP',
            `Wyckoff: ${result.deep.wyckoffPhase}`,
            `AMD Bias: ${result.deep.amdBias}`,
          ].filter(Boolean),
          bestSetup: result.bestSetup,
          fibLevels: result.deep.fibLevels,
          poc: result.deep.poc,
          oteZone: result.deep.oteZone,
          sweeps: result.deep.sweeps,
          orderbookImbalance: result.deep.orderbookImbalance,
        }, aiProvider as AIProvider, aiApiKey);
      } catch (aiErr) {
        console.error('AI analysis error:', aiErr);
        aiAnalysis = `AI analysis unavailable: ${String(aiErr).slice(0, 200)}`;
      }
    }

    return NextResponse.json({
      symbol: sym,
      price: ticker.price,
      change24h: ticker.change24h,
      volume24h: ticker.volume24h,
      timestamp,
      aiAnalysis,
      ...result,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
