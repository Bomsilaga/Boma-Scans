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

// Compare recent 5 candles vs 30-candle baseline for a more stable ratio
export function volRatio(candles: RawCandle[], recent = 5, base = 30): number {
  if (candles.length < base + recent) return 1;
  const recentVol = candles.slice(-recent).reduce((a, c) => a + c.volume, 0) / recent;
  const baseVol = candles.slice(-(base + recent), -recent).reduce((a, c) => a + c.volume, 0) / base;
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

// Swing point detection: a pivot high is a candle whose high is higher than
// the N candles on each side. Returns an array of {index, price, type} pivots.
function pivotPoints(candles: RawCandle[], strength = 3): { index: number; price: number; type: 'HIGH' | 'LOW' }[] {
  const pivots: { index: number; price: number; type: 'HIGH' | 'LOW' }[] = [];
  for (let i = strength; i < candles.length - strength; i++) {
    const c = candles[i];
    const leftHighs  = candles.slice(i - strength, i).map(x => x.high);
    const rightHighs = candles.slice(i + 1, i + strength + 1).map(x => x.high);
    const leftLows   = candles.slice(i - strength, i).map(x => x.low);
    const rightLows  = candles.slice(i + 1, i + strength + 1).map(x => x.low);
    if (c.high > Math.max(...leftHighs) && c.high > Math.max(...rightHighs))
      pivots.push({ index: i, price: c.high, type: 'HIGH' });
    if (c.low < Math.min(...leftLows) && c.low < Math.min(...rightLows))
      pivots.push({ index: i, price: c.low, type: 'LOW' });
  }
  return pivots;
}

// BOS: price closes beyond the most recent confirmed swing high (bullish BOS)
// or swing low (bearish BOS). Requires a CLOSE, not just a wick.
export function detectBOS(candles: RawCandle[]): boolean {
  if (candles.length < 20) return false;
  const pivots = pivotPoints(candles.slice(-40), 3);
  const highs = pivots.filter(p => p.type === 'HIGH').slice(-3);
  const lows  = pivots.filter(p => p.type === 'LOW').slice(-3);
  if (highs.length === 0 && lows.length === 0) return false;
  const lastClose = candles[candles.length - 1].close;
  const prevClose = candles[candles.length - 2].close;
  // Bullish BOS: two consecutive closes above a swing high
  if (highs.length > 0) {
    const swHigh = Math.max(...highs.map(h => h.price));
    if (lastClose > swHigh && prevClose > swHigh) return true;
  }
  // Bearish BOS: two consecutive closes below a swing low
  if (lows.length > 0) {
    const swLow = Math.min(...lows.map(l => l.price));
    if (lastClose < swLow && prevClose < swLow) return true;
  }
  return false;
}

// OB: the last bearish (for LONG) or bullish (for SHORT) candle BEFORE the BOS
// move, ideally with above-average volume. This is the real ICT definition.
export function detectOB(candles: RawCandle[], direction: 'LONG' | 'SHORT'): boolean {
  if (candles.length < 10) return false;
  // Look back up to 20 candles for the impulsive move
  const window = candles.slice(-20);
  const atrVal = atr(window);
  // Find an impulsive candle (body > 1.5× ATR) in the expected direction
  for (let i = window.length - 1; i >= 3; i--) {
    const c = window[i];
    const body = Math.abs(c.close - c.open);
    if (body < atrVal * 1.0) continue; // not impulsive enough
    const isImpulsiveLong  = c.close > c.open && direction === 'LONG';
    const isImpulsiveShort = c.close < c.open && direction === 'SHORT';
    if (!isImpulsiveLong && !isImpulsiveShort) continue;
    // The candle BEFORE this impulse is the OB candidate
    const obCandle = window[i - 1];
    const obIsBearish = obCandle.close < obCandle.open;
    const obIsBullish = obCandle.close > obCandle.open;
    if (direction === 'LONG'  && obIsBearish) return true;
    if (direction === 'SHORT' && obIsBullish) return true;
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
  | 'BSL_SWEEP'
  | 'SSL_SWEEP'
  | 'INDUCEMENT'
  | 'STOP_HUNT'
  | 'DOUBLE_TOP_SWEEP'
  | 'DOUBLE_BOT_SWEEP';

export type SweepStrength = 'STRONG' | 'MODERATE' | 'WEAK';

export interface SweepEvent {
  type: SweepType;
  strength: SweepStrength;
  score: number;
  direction: 'LONG' | 'SHORT';
  sweptLevel: number;
  rejectionClose: number;
  wickSize: number;
  volumeSpike: boolean;
  confirmed: boolean;
  candle: RawCandle;
  candleIndex: number;
  description: string;
}

export function detectSweeps(candles: RawCandle[], lookback = 20, atrPeriod = 14): SweepEvent[] {
  if (candles.length < lookback + atrPeriod) return [];

  const events: SweepEvent[] = [];

  const trs = candles.slice(1).map((c, i) =>
    Math.max(c.high - c.low, Math.abs(c.high - candles[i].close), Math.abs(c.low - candles[i].close))
  );
  const atrVal = trs.slice(-atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod || 1;

  const avgVol = candles.slice(-lookback - 5, -5).reduce((a, c) => a + c.volume, 0) / lookback;

  const scanStart = Math.max(lookback, candles.length - 10);

  for (let i = scanStart; i < candles.length; i++) {
    const c = candles[i];
    const window = candles.slice(i - lookback, i);
    if (window.length < 5) continue;

    const windowHigh = Math.max(...window.map(w => w.high));
    const windowLow  = Math.min(...window.map(w => w.low));

    const bslSweep = c.high > windowHigh && c.close < windowHigh;
    const sslSweep = c.low < windowLow && c.close > windowLow;

    if (!bslSweep && !sslSweep) continue;

    const isBSL = bslSweep;
    const sweptLevel  = isBSL ? windowHigh : windowLow;
    const wickBeyond  = isBSL ? c.high - windowHigh : windowLow - c.low;
    const wickPct     = wickBeyond / atrVal;
    const volSpike    = c.volume > avgVol * 1.5;
    const bodyBack    = isBSL ? c.close < windowHigh : c.close > windowLow;

    const nextC = candles[i + 1];
    const followThrough = nextC
      ? (isBSL ? nextC.close < c.close : nextC.close > c.close)
      : false;

    const prevWindow = candles.slice(i - lookback, i - 3);
    const prevHigh2 = prevWindow.length ? Math.max(...prevWindow.map(w => w.high)) : 0;
    const prevLow2  = prevWindow.length ? Math.min(...prevWindow.map(w => w.low)) : Infinity;

    let type: SweepType;
    if (wickPct > 1.5)       type = 'STOP_HUNT';
    else if (wickPct < 0.3)  type = 'INDUCEMENT';
    else if (isBSL && Math.abs(sweptLevel - prevHigh2) < atrVal * 0.2) type = 'DOUBLE_TOP_SWEEP';
    else if (!isBSL && Math.abs(sweptLevel - prevLow2) < atrVal * 0.2) type = 'DOUBLE_BOT_SWEEP';
    else                     type = isBSL ? 'BSL_SWEEP' : 'SSL_SWEEP';

    let score = 40;
    if (bodyBack)          score += 20;
    if (volSpike)          score += 15;
    if (followThrough)     score += 10;
    if (wickPct >= 0.5 && wickPct <= 2.0) score += 10;
    if (type === 'DOUBLE_TOP_SWEEP' || type === 'DOUBLE_BOT_SWEEP') score += 5;
    if (type === 'STOP_HUNT') score -= 5;
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
      direction: isBSL ? 'SHORT' : 'LONG',
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

  const sorted = events.sort((a, b) => b.score - a.score);
  const deduped: SweepEvent[] = [];
  for (const ev of sorted) {
    const nearby = deduped.find(d => Math.abs(d.sweptLevel - ev.sweptLevel) < atrVal * 0.5);
    if (!nearby) deduped.push(ev);
  }

  return deduped;
}

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
  const aligned  = sweeps.filter(s => s.direction === direction && s.confirmed);
  const opposing = sweeps.filter(s => s.direction !== direction && s.confirmed);

  if (aligned.length === 0 && opposing.length === 0) {
    return { action: 'HOLD', reason: 'No active sweeps detected', riskNote: 'Standard SL placement' };
  }

  const best   = aligned[0];
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

// trendLabel uses EMAs + price structure (HH/HL or LH/LL) for less lag
export function trendLabel(candles: RawCandle[]): string {
  if (candles.length < 50) return 'NEUTRAL';
  const closes = candles.map((c) => c.close);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const last21 = e21[e21.length - 1];
  const last50 = e50[e50.length - 1];

  // Price structure: compare last 3 swing highs/lows
  const pivots = pivotPoints(candles.slice(-60), 3);
  const highs = pivots.filter(p => p.type === 'HIGH').map(p => p.price).slice(-3);
  const lows  = pivots.filter(p => p.type === 'LOW').map(p => p.price).slice(-3);

  const hhhl = highs.length >= 2 && lows.length >= 2 &&
    highs[highs.length - 1] > highs[highs.length - 2] &&
    lows[lows.length - 1] > lows[lows.length - 2];

  const lhll = highs.length >= 2 && lows.length >= 2 &&
    highs[highs.length - 1] < highs[highs.length - 2] &&
    lows[lows.length - 1] < lows[lows.length - 2];

  // Strong trend: EMAs stacked AND price structure confirms
  if (last21 > last50 && hhhl) return 'STRONG_UP';
  if (last21 < last50 && lhll) return 'STRONG_DOWN';
  // Mild: EMA agrees but structure is mixed
  if (last21 > last50) return 'MILD_UP';
  if (last21 < last50) return 'MILD_DOWN';
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
