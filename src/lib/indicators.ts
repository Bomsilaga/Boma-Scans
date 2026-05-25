import type { RawCandle } from './bybit';

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(...new Array(period - 1).fill(NaN), prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

export function atr(candles: RawCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs = candles.slice(1).map((c, i) =>
    Math.max(c.high - c.low, Math.abs(c.high - candles[i].close), Math.abs(c.low - candles[i].close))
  );
  return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, trs.length);
}

export function macd(closes: number[]): { macdLine: number; signalLine: number; histogram: number } {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => (isNaN(v) || isNaN(e26[i]) ? NaN : v - e26[i]));
  const validMacd = macdLine.filter((v) => !isNaN(v));
  const signal = ema(validMacd, 9);
  const lastMacd = validMacd[validMacd.length - 1] ?? 0;
  const lastSignal = signal[signal.length - 1] ?? 0;
  return { macdLine: lastMacd, signalLine: lastSignal, histogram: lastMacd - lastSignal };
}

export function bollingerBands(closes: number[], period = 20, stdMult = 2): { upper: number; middle: number; lower: number; width: number } {
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + stdMult * std;
  const lower = middle - stdMult * std;
  return { upper, middle, lower, width: (upper - lower) / middle };
}

export function vwap(candles: RawCandle[]): number {
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
  }
  return cumV === 0 ? candles[candles.length - 1]?.close ?? 0 : cumPV / cumV;
}

export function poc(candles: RawCandle[], buckets = 50): number {
  if (candles.length === 0) return 0;
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const step = (maxP - minP) / buckets;
  const vol: number[] = new Array(buckets).fill(0);
  for (const c of candles) {
    const lo = Math.floor((c.low - minP) / step);
    const hi = Math.ceil((c.high - minP) / step);
    for (let b = Math.max(0, lo); b < Math.min(buckets, hi); b++) {
      vol[b] += c.volume;
    }
  }
  const maxBucket = vol.indexOf(Math.max(...vol));
  return minP + (maxBucket + 0.5) * step;
}

export function volRatio(candles: RawCandle[], recent = 5, base = 20): number {
  if (candles.length < base) return 1;
  const recentVol = candles.slice(-recent).reduce((a, c) => a + c.volume, 0) / recent;
  const baseVol = candles.slice(-base, -recent).reduce((a, c) => a + c.volume, 0) / (base - recent);
  return baseVol === 0 ? 1 : recentVol / baseVol;
}

export function swingHighLow(candles: RawCandle[], lookback = 20): { high: number; low: number } {
  const slice = candles.slice(-lookback);
  return {
    high: Math.max(...slice.map((c) => c.high)),
    low:  Math.min(...slice.map((c) => c.low)),
  };
}

export function fibLevels(high: number, low: number): { label: string; price: number }[] {
  const range = high - low;
  return [
    { label: '0%',      price: high },
    { label: '23.6%',   price: high - range * 0.236 },
    { label: '38.2%',   price: high - range * 0.382 },
    { label: '50%',     price: high - range * 0.5   },
    { label: '61.8%',   price: high - range * 0.618 },
    { label: '78.6%',   price: high - range * 0.786 },
    { label: '100%',    price: low },
    { label: 'Ext 127.2%', price: low - range * 0.272 },
    { label: 'Ext 161.8%', price: low - range * 0.618 },
  ];
}

export function wyckoffPhase(candles: RawCandle[]): string {
  if (candles.length < 40) return 'UNCLEAR';
  const first20 = candles.slice(-40, -20);
  const last20  = candles.slice(-20);
  const avgVol1 = first20.reduce((a, c) => a + c.volume, 0) / 20;
  const avgVol2 = last20.reduce((a, c) => a + c.volume, 0) / 20;
  const avgClose1 = first20.reduce((a, c) => a + c.close, 0) / 20;
  const avgClose2 = last20.reduce((a, c) => a + c.close, 0) / 20;
  const priceUp = avgClose2 > avgClose1;
  const volUp   = avgVol2  > avgVol1;
  if (priceUp && volUp)   return 'MARKUP';
  if (priceUp && !volUp)  return 'DISTRIBUTION';
  if (!priceUp && volUp)  return 'ACCUMULATION';
  return 'MARKDOWN';
}

export function detectBOS(candles: RawCandle[]): boolean {
  if (candles.length < 10) return false;
  const recent = candles.slice(-10);
  const prev = candles.slice(-20, -10);
  const prevHigh = Math.max(...prev.map((c) => c.high));
  const prevLow  = Math.min(...prev.map((c) => c.low));
  const recentClose = recent[recent.length - 1].close;
  return recentClose > prevHigh || recentClose < prevLow;
}

export function detectOB(candles: RawCandle[], direction: 'LONG' | 'SHORT'): boolean {
  if (candles.length < 5) return false;
  for (let i = candles.length - 5; i < candles.length - 1; i++) {
    const c = candles[i];
    const isBullish = c.close > c.open;
    const isBearish = c.close < c.open;
    if (direction === 'LONG' && isBearish) return true;
    if (direction === 'SHORT' && isBullish) return true;
  }
  return false;
}

export function detectFVG(candles: RawCandle[]): boolean {
  for (let i = 2; i < candles.length; i++) {
    const gap = candles[i].low - candles[i - 2].high;
    const gap2 = candles[i - 2].low - candles[i].high;
    if (gap > 0 || gap2 > 0) return true;
  }
  return false;
}

export function detectChoCH(candles: RawCandle[]): boolean {
  if (candles.length < 20) return false;
  const half = Math.floor(candles.length / 2);
  const first = candles.slice(0, half);
  const second = candles.slice(half);
  const trend1 = first[first.length - 1].close > first[0].close ? 'UP' : 'DOWN';
  const trend2 = second[second.length - 1].close > second[0].close ? 'UP' : 'DOWN';
  return trend1 !== trend2;
}

// ── Simple boolean for backward compat ───────────────────────────────────────
export function detectLiquiditySweep(candles: RawCandle[]): boolean {
  return detectSweeps(candles).length > 0;
}

// ── Sweep types ───────────────────────────────────────────────────────────────
export type SweepType =
  | 'BSL_SWEEP'       // Buy-side liquidity swept (equal highs / swing high taken out)
  | 'SSL_SWEEP'       // Sell-side liquidity swept (equal lows / swing low taken out)
  | 'INDUCEMENT'      // Minor liquidity grab before major move
  | 'STOP_HUNT'       // Spike beyond key level then immediate reversal
  | 'DOUBLE_TOP_SWEEP'// Two consecutive highs swept
  | 'DOUBLE_BOT_SWEEP';// Two consecutive lows swept

export type SweepStrength = 'STRONG' | 'MODERATE' | 'WEAK';

export interface SweepEvent {
  type: SweepType;
  strength: SweepStrength;
  score: number;           // 0–100
  direction: 'LONG' | 'SHORT'; // expected move AFTER sweep
  sweptLevel: number;      // price level that was swept
  rejectionClose: number;  // close that confirmed rejection
  wickSize: number;        // wick beyond level as % of ATR
  volumeSpike: boolean;    // volume on sweep candle > 1.5× avg
  confirmed: boolean;      // close back inside range
  candle: RawCandle;       // the sweep candle
  candleIndex: number;
  description: string;
}

export function detectSweeps(candles: RawCandle[], lookback = 20, atrPeriod = 14): SweepEvent[] {
  if (candles.length < lookback + atrPeriod) return [];

  const events: SweepEvent[] = [];

  // ATR for context
  const trs = candles.slice(1).map((c, i) =>
    Math.max(c.high - c.low, Math.abs(c.high - candles[i].close), Math.abs(c.low - candles[i].close))
  );
  const atrVal = trs.slice(-atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod || 1;

  // Average volume for spike detection
  const avgVol = candles.slice(-lookback - 5, -5).reduce((a, c) => a + c.volume, 0) / lookback;

  // Scan last 10 candles for sweep events
  const scanStart = Math.max(lookback, candles.length - 10);

  for (let i = scanStart; i < candles.length; i++) {
    const c = candles[i];
    const window = candles.slice(i - lookback, i);
    if (window.length < 5) continue;

    const windowHigh = Math.max(...window.map(w => w.high));
    const windowLow  = Math.min(...window.map(w => w.low));

    // Equal highs / swing high (BSL) — price swept above then closed below
    const bslSweep = c.high > windowHigh && c.close < windowHigh;
    // Equal lows / swing low (SSL) — price swept below then closed above
    const sslSweep = c.low < windowLow && c.close > windowLow;

    if (!bslSweep && !sslSweep) continue;

    const isBSL = bslSweep;
    const sweptLevel  = isBSL ? windowHigh : windowLow;
    const wickBeyond  = isBSL ? c.high - windowHigh : windowLow - c.low;
    const wickPct     = wickBeyond / atrVal;
    const volSpike    = c.volume > avgVol * 1.5;
    const bodyBack    = isBSL
      ? c.close < windowHigh   // closed back below swept high
      : c.close > windowLow;   // closed back above swept low

    // Check next candle for continuation confirmation (if available)
    const nextC = candles[i + 1];
    const followThrough = nextC
      ? (isBSL ? nextC.close < c.close : nextC.close > c.close)
      : false;

    // Detect inducement: wick < 0.3 ATR = minor grab
    // Detect stop hunt: wick > 1.5 ATR = large spike
    // Detect double sweep: previous sweep level nearby
    const prevWindow = candles.slice(i - lookback, i - 3);
    const prevHigh2 = prevWindow.length ? Math.max(...prevWindow.map(w => w.high)) : 0;
    const prevLow2  = prevWindow.length ? Math.min(...prevWindow.map(w => w.low)) : Infinity;

    let type: SweepType;
    if (wickPct > 1.5)       type = 'STOP_HUNT';
    else if (wickPct < 0.3)  type = 'INDUCEMENT';
    else if (isBSL && Math.abs(sweptLevel - prevHigh2) < atrVal * 0.2) type = 'DOUBLE_TOP_SWEEP';
    else if (!isBSL && Math.abs(sweptLevel - prevLow2) < atrVal * 0.2) type = 'DOUBLE_BOT_SWEEP';
    else                     type = isBSL ? 'BSL_SWEEP' : 'SSL_SWEEP';

    // Score (0–100)
    let score = 40;
    if (bodyBack)          score += 20;
    if (volSpike)          score += 15;
    if (followThrough)     score += 10;
    if (wickPct >= 0.5 && wickPct <= 2.0) score += 10; // ideal wick size
    if (type === 'DOUBLE_TOP_SWEEP' || type === 'DOUBLE_BOT_SWEEP') score += 5;
    if (type === 'STOP_HUNT') score -= 5; // stop hunts can be traps themselves
    score = Math.min(100, score);

    const strength: SweepStrength =
      score >= 75 ? 'STRONG' : score >= 55 ? 'MODERATE' : 'WEAK';

    const typeLabels: Record<SweepType, string> = {
      BSL_SWEEP:        'Buy-Side Liquidity Sweep',
      SSL_SWEEP:        'Sell-Side Liquidity Sweep',
      INDUCEMENT:       'Inducement (minor grab)',
      STOP_HUNT:        'Stop Hunt (large spike)',
      DOUBLE_TOP_SWEEP: 'Double-Top Liquidity Sweep',
      DOUBLE_BOT_SWEEP: 'Double-Bottom Liquidity Sweep',
    };

    events.push({
      type,
      strength,
      score,
      direction: isBSL ? 'SHORT' : 'LONG', // after BSL sweep → expect SHORT, after SSL → LONG
      sweptLevel,
      rejectionClose: c.close,
      wickSize: parseFloat(wickPct.toFixed(2)),
      volumeSpike: volSpike,
      confirmed: bodyBack,
      candle: c,
      candleIndex: i,
      description: [
        `${typeLabels[type]} @ $${sweptLevel.toFixed(5)}`,
        `Wick ${wickPct.toFixed(2)}× ATR`,
        volSpike ? '🔥 Vol spike' : '',
        bodyBack ? '✅ Confirmed' : '⚠️ Unconfirmed',
        followThrough ? '→ Follow-through' : '',
      ].filter(Boolean).join(' · '),
    });
  }

  // Sort by score desc, deduplicate nearby levels (within 0.5 ATR)
  const sorted = events.sort((a, b) => b.score - a.score);
  const deduped: SweepEvent[] = [];
  for (const ev of sorted) {
    const nearby = deduped.find(d => Math.abs(d.sweptLevel - ev.sweptLevel) < atrVal * 0.5);
    if (!nearby) deduped.push(ev);
  }

  return deduped;
}

// Management strategy: given active sweeps, return trade management advice
export interface SweepManagement {
  action: 'ENTER' | 'SCALE_IN' | 'TIGHTEN_SL' | 'EXIT' | 'HOLD' | 'AVOID';
  reason: string;
  suggestedEntry?: number;
  suggestedSL?: number;
  riskNote: string;
}

export function sweepManagementAdvice(
  sweeps: SweepEvent[],
  currentPrice: number,
  atrVal: number,
  direction: 'LONG' | 'SHORT',
): SweepManagement {
  const aligned = sweeps.filter(s => s.direction === direction && s.confirmed);
  const opposing = sweeps.filter(s => s.direction !== direction && s.confirmed);

  if (aligned.length === 0 && opposing.length === 0) {
    return { action: 'HOLD', reason: 'No active sweeps detected', riskNote: 'Standard SL placement' };
  }

  const best = aligned[0];
  const threat = opposing[0];

  if (threat && threat.score >= 75) {
    return {
      action: 'EXIT',
      reason: `Strong opposing ${threat.type} detected (score ${threat.score}) — liquidity may reverse`,
      riskNote: 'Close position or move SL to breakeven immediately',
    };
  }

  if (best && best.score >= 75 && best.strength === 'STRONG') {
    return {
      action: 'ENTER',
      reason: `${best.type} confirmed (score ${best.score}) — high probability reversal`,
      suggestedEntry: best.rejectionClose,
      suggestedSL: direction === 'LONG'
        ? best.sweptLevel - atrVal * 0.3
        : best.sweptLevel + atrVal * 0.3,
      riskNote: 'SL just beyond swept level with 0.3 ATR buffer',
    };
  }

  if (best && best.score >= 55) {
    return {
      action: 'SCALE_IN',
      reason: `${best.type} moderate strength — scale in on confirmation`,
      suggestedEntry: currentPrice,
      suggestedSL: direction === 'LONG'
        ? best.sweptLevel - atrVal * 0.5
        : best.sweptLevel + atrVal * 0.5,
      riskNote: 'Use 50% position size until confirmed',
    };
  }

  if (threat && threat.score >= 55) {
    return {
      action: 'TIGHTEN_SL',
      reason: `Moderate opposing sweep (${threat.type}) — tighten stop`,
      riskNote: 'Move SL to breakeven or partial profit lock',
    };
  }

  return { action: 'HOLD', reason: 'Weak sweep signals — no action needed', riskNote: 'Maintain current SL' };
}

export function oteZone(high: number, low: number): { low: number; high: number } {
  const range = high - low;
  return { low: high - range * 0.786, high: high - range * 0.618 };
}

export function trendLabel(candles: RawCandle[]): string {
  if (candles.length < 50) return 'NEUTRAL';
  const closes = candles.map((c) => c.close);
  const e14 = ema(closes, 14);
  const e28 = ema(closes, 28);
  const e50 = ema(closes, 50);
  const last14 = e14[e14.length - 1];
  const last28 = e28[e28.length - 1];
  const last50 = e50[e50.length - 1];
  if (last14 > last28 && last28 > last50) return 'STRONG_UP';
  if (last14 < last28 && last28 < last50) return 'STRONG_DOWN';
  if (last14 > last50) return 'MILD_UP';
  if (last14 < last50) return 'MILD_DOWN';
  return 'NEUTRAL';
}

export function alignmentScore(trends: string[]): number {
  let up = 0, down = 0;
  for (const t of trends) {
    if (t.includes('UP'))   up++;
    if (t.includes('DOWN')) down++;
  }
  const dominant = Math.max(up, down);
  return Math.round((dominant / trends.length) * 100);
}
