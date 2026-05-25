import type { RawCandle } from './bybit';
import type { Direction, SetupStyle, StyleSignal, DeepAnalysis, AlignmentQuality } from '@/types';
import {
  rsi, atr, macd, bollingerBands, vwap, poc, volRatio,
  swingHighLow, fibLevels, wyckoffPhase, oteZone,
  detectBOS, detectOB, detectFVG, detectChoCH,
  detectSweeps, sweepManagementAdvice,
  trendLabel, alignmentScore,
} from './indicators';

const FEE_PCT = 0.22; // 4 fills × 0.055% taker

// ── HTF bias: 4h + 1d must not be strongly opposed to the direction ───────────
// Returns false if higher timeframes are clearly against the trade direction.
function htfBiasOk(
  trendMap: Record<string, string>,
  direction: 'LONG' | 'SHORT',
): boolean {
  const h4  = trendMap['4h'] ?? 'NEUTRAL';
  const d1  = trendMap['1d'] ?? 'NEUTRAL';
  if (direction === 'LONG') {
    // Block if 4h OR 1d is strongly down
    if (h4 === 'STRONG_DOWN' || d1 === 'STRONG_DOWN') return false;
    // If both are mild down, also block
    if (h4.includes('DOWN') && d1.includes('DOWN')) return false;
  } else {
    if (h4 === 'STRONG_UP' || d1 === 'STRONG_UP') return false;
    if (h4.includes('UP') && d1.includes('UP')) return false;
  }
  return true;
}

// ── Smarter entry: prefer OTE zone, then VWAP, then POC, else market ─────────
function calcEntry(
  price: number,
  direction: 'LONG' | 'SHORT',
  ote: { low: number; high: number },
  vwapVal: number,
  pocVal: number,
  atrVal: number,
): { entry: number; entryTiming: StyleSignal['entryTiming'] } {
  const inOTE = price >= ote.low && price <= ote.high;
  if (inOTE) return { entry: price, entryTiming: 'READY' };

  // Price is away from OTE — suggest a limit entry inside the zone
  if (direction === 'LONG') {
    // If price is above OTE (ran), suggest waiting for pullback to OTE high
    if (price > ote.high) {
      const limitEntry = Math.max(ote.high, Math.min(vwapVal, pocVal));
      return { entry: limitEntry, entryTiming: 'WAIT_PULLBACK' };
    }
    // Price below OTE — wait for price to reach OTE low
    return { entry: ote.low, entryTiming: 'WAIT_RETEST' };
  } else {
    if (price < ote.low) {
      const limitEntry = Math.min(ote.low, Math.max(vwapVal, pocVal));
      return { entry: limitEntry, entryTiming: 'WAIT_PULLBACK' };
    }
    return { entry: ote.high, entryTiming: 'WAIT_RETEST' };
  }
}

function calcLeverage(
  style: SetupStyle,
  atrPct: number,
  align: number,
  score: number,
  rsiVal: number,
  hasBOS: boolean,
  hasOB: boolean,
  hasSweep: boolean,
): { leverage: number; leverageOptions: number[]; reasoning: string } {
  const caps   = { SCALP: 50, INTRADAY: 20, SWING: 10 };
  const floors = { SCALP: 5,  INTRADAY: 3,  SWING: 2  };
  const cap   = caps[style];
  const floor = floors[style];

  let base = { SCALP: 20, INTRADAY: 10, SWING: 5 }[style];
  const reasons: string[] = [];

  if (atrPct > 0.04)       { base = Math.round(base * 0.4); reasons.push('high volatility (−60%)'); }
  else if (atrPct > 0.025) { base = Math.round(base * 0.6); reasons.push('elevated volatility (−40%)'); }
  else if (atrPct > 0.015) { base = Math.round(base * 0.8); reasons.push('moderate volatility (−20%)'); }
  else if (atrPct < 0.005) { base = Math.round(base * 1.3); reasons.push('low volatility (+30%)'); }

  if (align >= 85)      { base = Math.round(base * 1.25); reasons.push('excellent alignment (+25%)'); }
  else if (align >= 70) { base = Math.round(base * 1.10); reasons.push('strong alignment (+10%)'); }
  else if (align < 55)  { base = Math.round(base * 0.75); reasons.push('weak alignment (−25%)'); }

  const structs = [hasBOS, hasOB, hasSweep].filter(Boolean).length;
  if (structs === 3)      { base = Math.round(base * 1.20); reasons.push('full structure (BOS+OB+Sweep +20%)'); }
  else if (structs === 2) { base = Math.round(base * 1.10); reasons.push('good structure (+10%)'); }
  else if (structs === 0) { base = Math.round(base * 0.80); reasons.push('no structure (−20%)'); }

  if (score >= 80)     { base = Math.round(base * 1.15); reasons.push('high score (+15%)'); }
  else if (score < 60) { base = Math.round(base * 0.85); reasons.push('low score (−15%)'); }

  if (rsiVal > 75 || rsiVal < 25) { base = Math.round(base * 0.70); reasons.push('RSI extreme (−30%)'); }
  else if (rsiVal > 68 || rsiVal < 32) { base = Math.round(base * 0.85); reasons.push('RSI stretched (−15%)'); }

  const leverage = Math.max(floor, Math.min(cap, base));
  const raw = [floor, Math.round(leverage * 0.6), leverage, Math.round(leverage * 1.3), cap];
  const leverageOptions = [...new Set(raw.map(v => Math.max(floor, Math.min(cap, v))))].sort((a, b) => a - b);
  return { leverage, leverageOptions, reasoning: reasons.join(' · ') || 'baseline' };
}

const STYLE_CFG = {
  SCALP:    { slMult: 1.3, tpPcts: [0.45, 0.9,  1.48]        },
  INTRADAY: { slMult: 2.5, tpPcts: [2.27, 3.79,  5.96]       },
  SWING:    { slMult: 5.0, tpPcts: [5.0,  11.9, 20.1, 29.2]  },
} as const;

export function buildSignalText(
  style: SetupStyle,
  symbol: string,
  direction: Direction,
  sig: StyleSignal,
  deep: DeepAnalysis,
  alignScore: number,
  alignQuality: AlignmentQuality,
  totalScore: number,
  trendMap: Record<string, string>,
  timestamp: string,
): string {
  const isLong = direction === 'LONG';
  const dirEmoji = isLong ? '🟢' : '🔴';
  const alignBar = '█'.repeat(Math.round(alignScore / 10)) + '░'.repeat(10 - Math.round(alignScore / 10));
  const slPct  = (Math.abs(sig.entry - sig.stopLoss) / sig.entry * 100).toFixed(3);
  const tp1Pct = (Math.abs(sig.tp1  - sig.entry) / sig.entry * 100).toFixed(3);
  const tp2Pct = (Math.abs(sig.tp2  - sig.entry) / sig.entry * 100).toFixed(3);
  const tp3Pct = (Math.abs(sig.tp3  - sig.entry) / sig.entry * 100).toFixed(3);
  const tp4Pct = sig.tp4 ? (Math.abs(sig.tp4 - sig.entry) / sig.entry * 100).toFixed(3) : null;

  const tfRow = Object.entries(trendMap)
    .map(([tf, t]) => {
      const ok = (isLong && t.includes('UP')) || (!isLong && t.includes('DOWN'));
      return `  ${tf.padEnd(4)} ${ok ? '✅' : '⚠️'} ${t}`;
    }).join('\n');

  const timingNote = sig.entryTiming === 'READY'
    ? '✅ Price in OTE zone — enter at market or limit'
    : sig.entryTiming === 'WAIT_PULLBACK'
    ? '⏳ Price extended — wait for pullback to entry level'
    : '⏳ Awaiting retest — place limit at entry level';

  return [
    `🚀 4SCANS SIGNAL [${style}]`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 ${symbol} PERP — ${dirEmoji} ${direction}`,
    `⏱️  ${timestamp}`,
    `⭐ Score: ${totalScore}/100  |  Confidence: ${sig.confidence}%`,
    ``,
    `📊 ALIGNMENT: ${alignScore.toFixed(0)}% [${alignQuality}]`,
    `[${alignBar}]`,
    ``,
    `📈 TIMEFRAME TRENDS:`,
    tfRow,
    ``,
    `📥 ENTRY:    $${sig.entry.toFixed(5)}  [${timingNote}]`,
    `🛑 STOP:     $${sig.stopLoss.toFixed(5)}  (−${slPct}%)`,
    `🎯 TP1:      $${sig.tp1.toFixed(5)}  (+${tp1Pct}%)`,
    `🎯 TP2:      $${sig.tp2.toFixed(5)}  (+${tp2Pct}%)`,
    `🎯 TP3:      $${sig.tp3.toFixed(5)}  (+${tp3Pct}%)`,
    tp4Pct ? `🎯 TP4:      $${sig.tp4!.toFixed(5)}  (+${tp4Pct}%)` : null,
    ``,
    `📐 Gross R:R: ${sig.grossRR.toFixed(2)}x`,
    `💸 Net R:R:   ${sig.netRR.toFixed(2)}x  (after ${FEE_PCT}% fees)`,
    `⚡ Leverage:  ${sig.leverage}x  ← TA/FA derived`,
    `   Basis:     ${sig.leverageReasoning}`,
    `   Options:   ${sig.leverageOptions.join('x / ')}x`,
    ``,
    `🔍 STRUCTURE:`,
    `  BOS:   ${deep.hasBOS ? '✅' : '❌'}   OB: ${deep.hasOB ? '✅' : '❌'}   FVG: ${deep.hasFVG ? '✅' : '❌'}`,
    `  CHoCH: ${deep.hasChoCH ? '✅' : '❌'}   Sweep: ${deep.hasSweep ? '✅' : '❌'}`,
    ``,
    `📊 INDICATORS:`,
    `  MACD:   ${deep.macdBull ? '🟢 Bullish' : deep.macdBear ? '🔴 Bearish' : '⚪ Flat'}`,
    `  RSI:    ${deep.rsi.toFixed(1)} ${deep.rsi > 70 ? '⚠️ Overbought' : deep.rsi < 30 ? '⚠️ Oversold' : '✅ Neutral'}`,
    `  VWAP:   Price ${deep.vwapAbove ? 'above ✅' : 'below ⚠️'}`,
    `  Vol:    ${deep.volRatio.toFixed(2)}x avg ${deep.volRatio >= 1.5 ? '🔥 High' : ''}`,
    `  BB Wid: ${(deep.bbWidth * 100).toFixed(2)}%`,
    ``,
    `🏗️  WYCKOFF: ${deep.wyckoffPhase}`,
    `🎯 ICT AMD:  ${deep.amdBias}`,
    deep.oteZone ? `📐 OTE Zone: $${deep.oteZone.low.toFixed(5)} – $${deep.oteZone.high.toFixed(5)}` : null,
    `📊 Vol POC:  $${deep.poc.toFixed(5)}`,
  ].filter(Boolean).join('\n');
}

export interface EngineResult {
  direction: Direction;
  totalScore: number;
  confidence: number;
  alignmentScore: number;
  alignmentQuality: AlignmentQuality;
  bestSetup: SetupStyle;
  verdict: string;
  trendMap: Record<string, string>;
  masterSignal: StyleSignal;
  scalpSignal: StyleSignal;
  intradaySignal: StyleSignal;
  swingSignal: StyleSignal;
  deep: DeepAnalysis;
  candles: RawCandle[];
}

function buildVerdict(
  direction: Direction,
  score: number,
  confidence: number,
  alignQuality: AlignmentQuality,
  bestSetup: SetupStyle,
  deep: DeepAnalysis,
  intradaySignal: StyleSignal,
  atrPct: number,
): string {
  const isLong = direction === 'LONG';
  const dirWord = isLong ? 'LONG (bullish)' : 'SHORT (bearish)';
  const tier = score >= 85 ? 'A+' : score >= 72 ? 'A' : score >= 60 ? 'B' : 'C';

  const risks: string[] = [];
  if (deep.rsi > 72) risks.push('RSI is overbought — avoid chasing longs');
  if (deep.rsi < 28) risks.push('RSI is oversold — avoid chasing shorts');
  if (atrPct > 0.03) risks.push('volatility is high — size down or wait for compression');
  if (alignQuality === 'POOR') risks.push('timeframe alignment is weak — wait for confluence');
  if (deep.amdBias === 'DISTRIBUTION' && isLong) risks.push('Wyckoff distribution phase — longs at risk');
  if (deep.amdBias === 'ACCUMULATION' && !isLong) risks.push('Wyckoff accumulation phase — shorts at risk');

  const confirms: string[] = [];
  if (deep.hasBOS)   confirms.push('Break of Structure confirmed');
  if (deep.hasOB)    confirms.push('Order Block present');
  if (deep.hasFVG)   confirms.push('Fair Value Gap identified');
  if (deep.hasChoCH) confirms.push('Change of Character detected');
  if (deep.hasSweep) confirms.push('Liquidity sweep occurred — smart money active');
  if (deep.vwapAbove === isLong) confirms.push(`price is ${isLong ? 'above' : 'below'} VWAP`);
  if (deep.macdBull && isLong)  confirms.push('MACD momentum is bullish');
  if (deep.macdBear && !isLong) confirms.push('MACD momentum is bearish');

  let timing = '';
  if (intradaySignal.entryTiming === 'READY') {
    timing = `Price is in the OTE zone — entry is valid NOW at market or limit near $${intradaySignal.entry.toFixed(4)}.`;
  } else if (intradaySignal.entryTiming === 'WAIT_PULLBACK') {
    timing = `Price has run ahead — WAIT for pullback to $${intradaySignal.entry.toFixed(4)} before entering.`;
  } else {
    timing = `Awaiting retest — place limit at $${intradaySignal.entry.toFixed(4)} and wait for price to come to you.`;
  }

  let action = '';
  if (score >= 75 && confidence >= 65 && risks.length === 0) {
    action = `✅ HIGH CONVICTION ${dirWord} setup. ${bestSetup} is the recommended style. ${timing}`;
  } else if (score >= 60 && confidence >= 50) {
    action = `⚠️ MODERATE setup — ${dirWord} bias with caveats. ${timing} Reduce position size by 30–50% and honour your stop.`;
  } else {
    action = `🚫 LOW QUALITY setup. Signals are mixed — stay flat or use minimal size. ${timing}`;
  }

  const confirmLine = confirms.length > 0
    ? `Confirmed by: ${confirms.join(', ')}.`
    : 'No strong structure confirmation yet.';

  const riskLine = risks.length > 0
    ? `Key risks: ${risks.join('; ')}.`
    : 'No major red flags on this setup.';

  return [
    `[ TIER ${tier} · Score ${score}/100 · Confidence ${confidence}% ]`,
    '',
    action,
    '',
    confirmLine,
    riskLine,
    '',
    `Stop loss must sit beyond $${intradaySignal.stopLoss.toFixed(4)}. If price closes beyond that level — EXIT immediately. Target TP1 at $${intradaySignal.tp1.toFixed(4)}, then trail to TP2 $${intradaySignal.tp2.toFixed(4)} and TP3 $${intradaySignal.tp3.toFixed(4)}.`,
  ].join('\n');
}

export function runEngine(
  symbol: string,
  price: number,
  candleMap: Record<string, RawCandle[]>,
  timestamp: string,
): EngineResult {
  const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'];
  const trendMap: Record<string, string> = {};
  for (const tf of TFS) {
    const candles = candleMap[tf] ?? [];
    trendMap[tf] = candles.length >= 50 ? trendLabel(candles) : 'NEUTRAL';
  }

  const trends = Object.values(trendMap);
  const upCount   = trends.filter((t) => t.includes('UP')).length;
  const downCount = trends.filter((t) => t.includes('DOWN')).length;
  const direction: Direction = upCount > downCount ? 'LONG' : downCount > upCount ? 'SHORT' : 'NEUTRAL';

  const align = alignmentScore(trends);
  const alignQuality: AlignmentQuality =
    align >= 85 ? 'EXCELLENT' : align >= 70 ? 'STRONG' : align >= 55 ? 'MODERATE' : 'POOR';

  const h1  = candleMap['1h']  ?? candleMap['15m'] ?? [];
  const h4  = candleMap['4h']  ?? [];
  const closes1h = h1.map((c) => c.close);
  const rsiVal   = rsi(closes1h);
  const macdVal  = macd(closes1h);
  const bbVal    = bollingerBands(closes1h);
  const vwapVal  = vwap(h1);
  const pocVal   = poc(h1);
  const vrVal    = volRatio(h1);
  const atrVal   = atr(h1);
  const atrPct   = atrVal / price;

  const { high: swHigh, low: swLow } = swingHighLow(h4.length >= 20 ? h4 : h1, 30);
  const ote    = oteZone(swHigh, swLow);
  const fibs   = fibLevels(swHigh, swLow);
  const wyck   = wyckoffPhase(h1);
  const hasBOS   = detectBOS(h1);
  const hasOB    = direction !== 'NEUTRAL' ? detectOB(h1, direction === 'LONG' ? 'LONG' : 'SHORT') : false;
  const hasFVG   = detectFVG(h1.slice(-10));
  const hasChoCH = detectChoCH(h1);
  const sweeps   = detectSweeps(h1);
  const hasSweep = sweeps.length > 0;
  const sweepMgmt = sweepManagementAdvice(sweeps, price, atrVal, direction === 'NEUTRAL' ? 'LONG' : direction);
  const macdBull = macdVal.histogram > 0 && macdVal.macdLine > macdVal.signalLine;
  const macdBear = macdVal.histogram < 0 && macdVal.macdLine < macdVal.signalLine;
  const vwapAbove = price > vwapVal;

  const recentH1  = h1.slice(-30);
  const midIdx    = Math.floor(recentH1.length / 2);
  const accumPhase = recentH1.slice(0, midIdx);
  const distPhase  = recentH1.slice(midIdx);
  const accumRange = Math.max(...accumPhase.map(c => c.high)) - Math.min(...accumPhase.map(c => c.low));
  const distRange  = Math.max(...distPhase.map(c => c.high)) - Math.min(...distPhase.map(c => c.low));
  const amdBias = accumRange < distRange * 0.7 ? 'ACCUMULATION' :
                  distRange < accumRange * 0.7 ? 'DISTRIBUTION' :
                  hasBOS ? 'MANIPULATION' : 'UNCLEAR';

  const sweepsForJson = sweeps.map(({ candle: _c, ...rest }) => rest);

  const deep: DeepAnalysis = {
    wyckoffPhase: wyck, rsi: rsiVal, bbWidth: bbVal.width,
    volRatio: vrVal, vwapAbove, poc: pocVal, oteZone: ote, amdBias,
    fibLevels: fibs, hasBOS, hasOB, hasFVG, hasSweep, hasChoCH,
    macdBull, macdBear,
    orderbookImbalance: macdBull ? 'BID_HEAVY' : macdBear ? 'ASK_HEAVY' : 'BALANCED',
    sweeps: sweepsForJson,
    sweepManagement: sweepMgmt,
  };

  // ── Scoring: tiered and sequenced, not just additive ──────────────────────
  const resolvedDir = direction === 'NEUTRAL' ? 'LONG' : direction;
  const htfOk = htfBiasOk(trendMap, resolvedDir);

  let score = 0;

  // Alignment base (30 pts)
  score += Math.round(align * 0.30);

  // HTF bias gate: penalise hard if trading against 4h+1d
  if (!htfOk) score = Math.round(score * 0.5);

  // Structure: BOS is the anchor — other signals are only meaningful after BOS
  if (hasBOS) {
    score += 18;
    if (hasOB)    score += 12; // OB only counts when BOS exists
    if (hasSweep) score += 8;  // sweep before BOS = smart money confirmation
    if (hasChoCH) score += 6;
  } else {
    // No BOS — structure is weak, cap the bonus
    if (hasOB)    score += 4;
    if (hasSweep) score += 4;
    if (hasChoCH) score += 4;
  }

  if (hasFVG) score += 5;

  // Momentum stack
  const momentumCount = [
    macdBull || macdBear,
    vwapAbove === (resolvedDir === 'LONG'),
    vrVal >= 1.5,
    rsiVal > 45 && rsiVal < 70 && resolvedDir === 'LONG',
    rsiVal > 30 && rsiVal < 55 && resolvedDir === 'SHORT',
  ].filter(Boolean).length;
  score += momentumCount * 3;

  // OTE entry bonus
  const inOTE = price >= ote.low && price <= ote.high;
  if (inOTE) score += 6;

  // Wyckoff alignment
  if (wyck === 'MARKUP'       && resolvedDir === 'LONG')  score += 4;
  if (wyck === 'MARKDOWN'     && resolvedDir === 'SHORT') score += 4;
  if (wyck === 'ACCUMULATION' && resolvedDir === 'LONG')  score += 3;

  // RSI extreme penalty (likely to reverse)
  if (rsiVal > 78 || rsiVal < 22) score -= 10;
  else if (rsiVal > 72 || rsiVal < 28) score -= 5;

  score = Math.max(0, Math.min(100, score));

  const confidence = Math.min(100, Math.round(
    (align * 0.4) +
    ([hasBOS, hasOB, hasFVG, hasChoCH, hasSweep].filter(Boolean).length / 5) * 30 +
    ([macdBull || macdBear, vwapAbove === (resolvedDir === 'LONG'), vrVal >= 1.2].filter(Boolean).length / 3) * 30
  ));

  const bestSetup: SetupStyle =
    atrPct < 0.005 ? 'SCALP' : atrPct < 0.015 ? 'INTRADAY' : 'SWING';

  // ── Smart entry calculation ───────────────────────────────────────────────
  const { entry: smartEntry, entryTiming } = calcEntry(
    price, resolvedDir, ote, vwapVal, pocVal, atrVal
  );

  function buildStyle(style: SetupStyle): StyleSignal {
    const cfg = STYLE_CFG[style];
    const isLong = resolvedDir !== 'SHORT';

    // Use smart entry (limit/OTE-based) instead of always market price
    const entryPrice = smartEntry;
    const sl = isLong
      ? entryPrice - atrVal * cfg.slMult
      : entryPrice + atrVal * cfg.slMult;

    const riskPerUnit = Math.abs(entryPrice - sl);
    const tps = cfg.tpPcts.map((pct) =>
      isLong ? entryPrice * (1 + pct / 100) : entryPrice * (1 - pct / 100)
    );
    const grossRR = riskPerUnit > 0 ? Math.abs(tps[1] - entryPrice) / riskPerUnit : 0;
    const feeCost = entryPrice * FEE_PCT / 100;
    const netRR   = Math.max(0, riskPerUnit > 0 ? (Math.abs(tps[1] - entryPrice) - feeCost) / riskPerUnit : 0);

    const { leverage, leverageOptions, reasoning } = calcLeverage(
      style, atrPct, align, score, rsiVal, hasBOS, hasOB, hasSweep
    );

    const sig: StyleSignal = {
      style,
      direction: resolvedDir,
      entry: entryPrice,
      stopLoss: sl,
      tp1: tps[0], tp2: tps[1], tp3: tps[2], tp4: tps[3],
      grossRR, netRR,
      leverage, leverageOptions,
      leverageReasoning: reasoning,
      confidence,
      entryTiming,
      signalText: '',
    };

    sig.signalText = buildSignalText(
      style, symbol, resolvedDir,
      sig, deep, align, alignQuality, score, trendMap, timestamp
    );
    return sig;
  }

  const scalpSignal    = buildStyle('SCALP');
  const intradaySignal = buildStyle('INTRADAY');
  const swingSignal    = buildStyle('SWING');

  const masterBase = buildStyle(bestSetup);
  const masterSignal: StyleSignal = {
    ...masterBase,
    style: 'INTRADAY',
    signalText: buildSignalText(
      'INTRADAY', symbol, resolvedDir,
      masterBase, deep, align, alignQuality, score, trendMap, timestamp
    ).replace('[INTRADAY]', '[MASTER]'),
  };

  const verdict = buildVerdict(resolvedDir, score, confidence, alignQuality, bestSetup, deep, intradaySignal, atrPct);

  return {
    direction: resolvedDir,
    totalScore: score,
    confidence,
    alignmentScore: align,
    alignmentQuality: alignQuality,
    bestSetup,
    verdict,
    trendMap,
    masterSignal,
    scalpSignal,
    intradaySignal,
    swingSignal,
    deep,
    candles: h1.slice(-100),
  };
}
