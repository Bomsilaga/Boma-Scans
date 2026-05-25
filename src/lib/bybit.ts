const BASE = 'https://api.bybit.com';

export interface RawCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

export async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<RawCandle[]> {
  const url = `${BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  const json = await res.json();
  if (json.retCode !== 0) throw new Error(`Bybit kline error: ${json.retMsg}`);
  return (json.result.list as string[][])
    .map(([t, o, h, l, c, v]) => ({
      time: Number(t), open: +o, high: +h, low: +l, close: +c, volume: +v,
    }))
    .sort((a, b) => a.time - b.time);
}

export async function fetchTicker(symbol: string): Promise<{ price: number; change24h: number; volume24h: number }> {
  const url = `${BASE}/v5/market/tickers?category=linear&symbol=${symbol}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  const json = await res.json();
  const t = json.result?.list?.[0];
  if (!t) throw new Error(`No ticker for ${symbol}`);
  return {
    price: parseFloat(t.lastPrice),
    change24h: parseFloat(t.price24hPcnt) * 100,
    volume24h: parseFloat(t.turnover24h),
  };
}

export async function fetchAllTickers(): Promise<{ symbol: string; price: number; change24h: number; volume24h: number }[]> {
  const url = `${BASE}/v5/market/tickers?category=linear`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  const json = await res.json();
  return (json.result?.list ?? [])
    .filter((t: Record<string, string>) => t.symbol.endsWith('USDT'))
    .map((t: Record<string, string>) => ({
      symbol: t.symbol,
      price: parseFloat(t.lastPrice),
      change24h: parseFloat(t.price24hPcnt) * 100,
      volume24h: parseFloat(t.turnover24h),
    }));
}
