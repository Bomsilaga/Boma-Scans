const BASE = 'https://api.kucoin.com';

export interface RawCandle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

async function kFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`KuCoin HTTP ${res.status} — ${url}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`KuCoin bad JSON: ${text.slice(0, 120)}`); }
}

// KuCoin interval map
const IV: Record<string, string> = {
  '1': '1min', '5': '5min', '15': '15min', '60': '1hour', '240': '4hour',
  'D': '1day', 'W': '1week',
  '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1hour', '4h': '4hour', '1d': '1day',
};

// KuCoin uses BASE-QUOTE format e.g. BTC-USDT
function toKucoinSymbol(symbol: string): string {
  if (symbol.includes('-')) return symbol;
  // BTCUSDT -> BTC-USDT
  const quote = symbol.endsWith('USDT') ? 'USDT' : symbol.endsWith('BTC') ? 'BTC' : 'USDT';
  const base = symbol.slice(0, symbol.length - quote.length);
  return `${base}-${quote}`;
}

export async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<RawCandle[]> {
  const sym = toKucoinSymbol(symbol);
  const iv = IV[interval] ?? '1hour';
  const url = `${BASE}/api/v1/market/candles?symbol=${sym}&type=${iv}`;
  const json = await kFetch(url) as { code: string; data: string[][] };
  if (json.code !== '200000') throw new Error(`KuCoin candles error: ${json.code}`);
  return (json.data ?? [])
    .slice(0, limit)
    .map(([t, o, c, h, l, v]) => ({
      time:   Number(t) * 1000,
      open:   parseFloat(o),
      high:   parseFloat(h),
      low:    parseFloat(l),
      close:  parseFloat(c),
      volume: parseFloat(v),
    }))
    .sort((a, b) => a.time - b.time);
}

export async function fetchTicker(symbol: string): Promise<{ price: number; change24h: number; volume24h: number }> {
  const sym = toKucoinSymbol(symbol);
  const url = `${BASE}/api/v1/market/stats?symbol=${sym}`;
  const json = await kFetch(url) as { code: string; data: Record<string, string> };
  if (json.code !== '200000') throw new Error(`KuCoin ticker error: ${json.code}`);
  const d = json.data;
  return {
    price:     parseFloat(d.last),
    change24h: parseFloat(d.changeRate) * 100,
    volume24h: parseFloat(d.volValue),
  };
}

export async function fetchAllTickers(): Promise<{ symbol: string; price: number; change24h: number; volume24h: number }[]> {
  const url = `${BASE}/api/v1/market/allTickers`;
  const json = await kFetch(url) as { code: string; data: { ticker: Record<string, string>[] } };
  if (json.code !== '200000') throw new Error(`KuCoin allTickers error: ${json.code}`);
  return (json.data?.ticker ?? [])
    .filter((t) => t.symbol?.endsWith('-USDT'))
    .map((t) => ({
      symbol:    t.symbol.replace('-', ''),   // BTC-USDT -> BTCUSDT
      price:     parseFloat(t.last),
      change24h: parseFloat(t.changeRate) * 100,
      volume24h: parseFloat(t.volValue),
    }));
}
