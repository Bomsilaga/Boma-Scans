import { NextRequest, NextResponse } from 'next/server';
import { fetchKlines, fetchTicker } from '@/lib/bybit';
import { runEngine } from '@/lib/signalEngine';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const { symbol } = body ? JSON.parse(body) : {};
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

    return NextResponse.json({
      symbol: sym,
      price: ticker.price,
      change24h: ticker.change24h,
      volume24h: ticker.volume24h,
      timestamp,
      ...result,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
