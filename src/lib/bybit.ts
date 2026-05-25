const BASE = 'https://fapi.binance.com';

export interface RawCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

async function bFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status} — ${url}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`Binance bad JSON: ${text.slice(0, 120)}`); }
}

// Binance interval map
const IV: Record<string, string> = {
  '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', 'D': '1d', 'W': '1w',
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d',
};

export async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<RawCandle[]> {
  const iv = IV[interval] ?? interval;
  const url = `${BASE}/fapi/v1/klines?symbol=${symbol}&interval=${iv}&limit=${limit}`;
  const data = await bFetch(url) as unknown[][];
  return data.map((c) => ({
    time:   Number(c[0]),
    open:   parseFloat(c[1] as string),
    high:   parseFloat(c[2] as string),
    low:    parseFloat(c[3] as string),
    close:  parseFloat(c[4] as string),
    volume: parseFloat(c[5] as string),
  }));
}

export async function fetchTicker(symbol: string): Promise<{ price: number; change24h: number; volume24h: number }> {
  const url = `${BASE}/fapi/v1/ticker/24hr?symbol=${symbol}`;
  const t = await bFetch(url) as Record<string, string>;
  return {
    price:     parseFloat(t.lastPrice),
    change24h: parseFloat(t.priceChangePercent),
    volume24h: parseFloat(t.quoteVolume),
  };
}

export async function fetchAllTickers(): Promise<{ symbol: string; price: number; change24h: number; volume24h: number }[]> {
  const url = `${BASE}/fapi/v1/ticker/24hr`;
  const data = await bFetch(url) as Record<string, string>[];
  return data
    .filter((t) => t.symbol?.endsWith('USDT'))
    .map((t) => ({
      symbol:    t.symbol,
      price:     parseFloat(t.lastPrice),
      change24h: parseFloat(t.priceChangePercent),
      volume24h: parseFloat(t.quoteVolume),
    }));
}
