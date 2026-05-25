import { NextResponse } from 'next/server';
import { fetchAllTickers } from '@/lib/bybit';

export async function GET() {
  try {
    const all = await fetchAllTickers();
    // Return every valid USDT ticker sorted by volume descending
    const tickers = all
      .filter(t => t.price > 0 && t.volume24h > 0)
      .sort((a, b) => b.volume24h - a.volume24h);

    return NextResponse.json({ tickers });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
