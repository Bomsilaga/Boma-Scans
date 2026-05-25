const BASE = 'https://api.bybit.com';

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bybit.com',
  'Origin': 'https://www.bybit.com',
};

export interface RawCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

async function bybitFetch(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: 'no-store', headers: HEADERS });
  if (!res.ok) throw new Error(`Bybit HTTP ${res.status} — ${url}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`Bybit bad JSON: ${text.slice(0, 120)}`); }
}

export async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<RawCandle[]> {
  const url = `${BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const json = await bybitFetch(url);
  if (json.retCode !== 0) throw new Error(`Bybit kline error: ${json.retMsg}`);
  const list = (json.result as Record<string, unknown>)?.list as string[][];
  if (!list) return [];
  return list
    .map(([t, o, h, l, c, v]) => ({
      time: Number(t), open: +o, high: +h, low: +l, close: +c, volume: +v,
    }))
    .sort((a, b) => a.time - b.time);
}

export async function fetchTicker(symbol: string): Promise<{ price: number; change24h: number; volume24h: number }> {
  const url = `${BASE}/v5/market/tickers?category=linear&symbol=${symbol}`;
  const json = await bybitFetch(url);
  const list = (json.result as Record<string, unknown[]>)?.list;
  const t = list?.[0] as Record<string, string> | undefined;
  if (!t) throw new Error(`No ticker for ${symbol}`);
  return {
    price: parseFloat(t.lastPrice),
    change24h: parseFloat(t.price24hPcnt) * 100,
    volume24h: parseFloat(t.turnover24h),
  };
}

export async function fetchAllTickers(): Promise<{ symbol: string; price: number; change24h: number; volume24h: number }[]> {
  const url = `${BASE}/v5/market/tickers?category=linear`;
  const json = await bybitFetch(url);
  const list = ((json.result as Record<string, unknown>)?.list ?? []) as Record<string, string>[];
  return list
    .filter((t) => t.symbol?.endsWith('USDT'))
    .map((t) => ({
      symbol: t.symbol,
      price: parseFloat(t.lastPrice),
      change24h: parseFloat(t.price24hPcnt) * 100,
      volume24h: parseFloat(t.turnover24h),
    }));
}
