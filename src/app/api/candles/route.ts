import { NextRequest, NextResponse } from 'next/server';
import { fetchKlines } from '@/lib/bybit';

export const maxDuration = 30;

const TF_MAP: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  const tf     = searchParams.get('tf') ?? '1h';
  const limit  = parseInt(searchParams.get('limit') ?? '200');

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const interval = TF_MAP[tf] ?? '60';
  const candles  = await fetchKlines(symbol.toUpperCase(), interval, limit);
  return NextResponse.json({ candles });
}
