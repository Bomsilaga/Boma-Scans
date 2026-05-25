import type { RawCandle } from './bybit';
import type { Direction, SetupStyle, StyleSignal, DeepAnalysis, AlignmentQuality } from '@/types';
import {
  ema, rsi, atr, macd, bollingerBands, vwap, poc, volRatio,
  swingHighLow, fibLevels, wyckoffPhase, oteZone,
  detectBOS, detectOB, detectFVG, detectChoCH, detectLiquiditySweep,
  trendLabel, alignmentScore,
} from './indicators';

const FEE_PCT = 0.22; // 4 fills × 0.055% taker

const STYLE_CFG = {
  SCALP: {
    slMult: 1.3,
    tpPcts: [0.45, 0.9, 1.48],
    leverages: [20, 30, 50, 75, 100],
    label: 'SCALP',
  },
  INTRADAY: {
    slMult: 2.5,
    tpPcts: [2.27, 3.79, 5.96],
    leverages: [10, 15, 20, 25, 30],
    label: 'INTRADAY',
  },
  SWING: {
    slMult: 5.0,
    tpPcts: [5.0, 11.9, 20.1, 29.2],
    leverages: [5, 7, 10, 15, 20],
    label: 'SWING',
  },
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
  const slPct = (Math.abs(sig.entry - sig.stopLoss) / sig.entry * 100).toFixed(3);
  const tp1Pct = (Math.abs(sig.tp1 - sig.entry) / sig.entry * 100).toFixed(3);
  const tp2Pct = (Math.abs(sig.tp2 - sig.entry) / sig.entry * 100).toFixed(3);
  const tp3Pct = (Math.abs(sig.tp3 - sig.entry) / sig.entry * 100).toFixed(3);
  const tp4Pct = sig.tp4 ? (Math.abs(sig.tp4 - sig.entry) / sig.entry * 100).toFixed(3) : null;

  const tfRow = Object.entries(trendMap)
    .map(([tf, t]) => {
      const ok = (isLong && t.includes('UP')) || (!isLong && t.includes('DOWN'));
      return `  ${tf.padEnd(4)} ${ok ? '✅' : '⚠️'} ${t}`;
    })
    .join('\n');

  const lines = [
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
    `📥 ENTRY:    $${sig.entry.toFixed(5)}  [${sig.entryTiming}]`,
    `🛑 STOP:     $${sig.stopLoss.toFixed(5)}  (−${slPct}%)`,
    `🎯 TP1:      $${sig.tp1.toFixed(5)}  (+${tp1Pct}%)`,
    `🎯 TP2:      $${sig.tp2.toFixed(5)}  (+${tp2Pct}%)`,
    `🎯 TP3:      $${sig.tp3.toFixed(5)}  (+${tp3Pct}%)`,
    tp4Pct ? `🎯 TP4:      $${sig.tp4!.toFixed(5)}  (+${tp4Pct}%)` : null,
    ``,
    `📐 Gross R:R: ${sig.grossRR.toFixed(2)}x`,
    `💸 Net R:R:   ${sig.netRR.toFixed(2)}x  (after ${FEE_PCT}% fees)`,
    `⚡ Leverage:  ${sig.leverage}x`,
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
    `📚 OB Imbal: ${deep.orderbookImbalance}`,
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

export interface EngineResult {
  direction: Direction;
  totalScore: number;
  confidence: number;
  alignmentScore: number;
  alignmentQuality: AlignmentQuality;
  bestSetup: SetupStyle;
  trendMap: Record<string, string>;
  masterSignal: StyleSignal;
  scalpSignal: StyleSignal;
  intradaySignal: StyleSignal;
  swingSignal: StyleSignal;
  deep: DeepAnalysis;
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

  // Use 1h candles for deep analysis
  const h1 = candleMap['1h'] ?? candleMap['15m'] ?? [];
  const h4 = candleMap['4h'] ?? [];
  const closes1h = h1.map((c) => c.close);
  const rsiVal  = rsi(closes1h);
  const macdVal = macd(closes1h);
  const bbVal   = bollingerBands(closes1h);
  const vwapVal = vwap(h1);
  const pocVal  = poc(h1);
  const vrVal   = volRatio(h1);
  const atrVal  = atr(h1);
  const { high: swHigh, low: swLow } = swingHighLow(h4.length >= 20 ? h4 : h1, 30);
  const ote    = oteZone(swHigh, swLow);
  const fibs   = fibLevels(swHigh, swLow);
  const wyck   = wyckoffPhase(h1);
  const hasBOS = detectBOS(h1);
  const hasOB  = direction !== 'NEUTRAL' ? detectOB(h1, direction === 'LONG' ? 'LONG' : 'SHORT') : false;
  const hasFVG = detectFVG(h1.slice(-10));
  const hasChoCH = detectChoCH(h1);
  const hasSweep = detectLiquiditySweep(h1);
  const macdBull = macdVal.histogram > 0 && macdVal.macdLine > macdVal.signalLine;
  const macdBear = macdVal.histogram < 0 && macdVal.macdLine < macdVal.signalLine;
  const vwapAbove = price > vwapVal;

  // AMD bias from recent price structure
  const recentH1 = h1.slice(-30);
  const midIdx = Math.floor(recentH1.length / 2);
  const accumPhase = recentH1.slice(0, midIdx);
  const distPhase  = recentH1.slice(midIdx);
  const accumRange = Math.max(...accumPhase.map(c => c.high)) - Math.min(...accumPhase.map(c => c.low));
  const distRange  = Math.max(...distPhase.map(c => c.high)) - Math.min(...distPhase.map(c => c.low));
  const amdBias = accumRange < distRange * 0.7 ? 'ACCUMULATION' :
                  distRange < accumRange * 0.7 ? 'DISTRIBUTION' :
                  hasBOS ? 'MANIPULATION' : 'UNCLEAR';

  const deep: DeepAnalysis = {
    wyckoffPhase: wyck,
    rsi: rsiVal,
    bbWidth: bbVal.width,
    volRatio: vrVal,
    vwapAbove,
    poc: pocVal,
    oteZone: ote,
    amdBias,
    fibLevels: fibs,
    hasBOS, hasOB, hasFVG, hasSweep, hasChoCH,
    macdBull, macdBear,
    orderbookImbalance: macdBull ? 'BID_HEAVY' : macdBear ? 'ASK_HEAVY' : 'BALANCED',
  };

  // Composite score (0–100)
  let score = 0;
  score += Math.round(align * 0.3);                    // 30 pts alignment
  if (hasBOS)  score += 15;
  if (hasOB)   score += 12;
  if (hasChoCH) score += 8;
  if (hasFVG)  score += 7;
  if (hasSweep) score += 6;
  if (macdBull || macdBear) score += 8;
  if (vwapAbove === (direction === 'LONG')) score += 5;
  if (vrVal >= 1.5) score += 5;
  const inOTE = price >= ote.low && price <= ote.high;
  if (inOTE) score += 4;
  score = Math.min(100, score);

  const confidence = Math.round(
    (align * 0.4) +
    ([hasBOS, hasOB, hasFVG, hasChoCH, hasSweep].filter(Boolean).length / 5) * 30 +
    ([macdBull || macdBear, vwapAbove === (direction === 'LONG'), vrVal >= 1.2].filter(Boolean).length / 3) * 30
  );

  const bestSetup: SetupStyle =
    atrVal / price < 0.005 ? 'SCALP' :
    atrVal / price < 0.015 ? 'INTRADAY' : 'SWING';

  function buildStyle(style: SetupStyle): StyleSignal {
    const cfg = STYLE_CFG[style];
    const isLong = direction !== 'SHORT';
    const sl = isLong
      ? price - atrVal * cfg.slMult
      : price + atrVal * cfg.slMult;
    const riskPerUnit = Math.abs(price - sl);
    const tps = cfg.tpPcts.map((pct) =>
      isLong ? price * (1 + pct / 100) : price * (1 - pct / 100)
    );
    const grossRR = Math.abs(tps[1] - price) / riskPerUnit;
    const feeCost = price * FEE_PCT / 100;
    const netRR = Math.max(0, (Math.abs(tps[1] - price) - feeCost) / riskPerUnit);
    const entryTiming: StyleSignal['entryTiming'] = inOTE ? 'READY' :
      (isLong && price > vwapVal) || (!isLong && price < vwapVal) ? 'WAIT_PULLBACK' : 'WAIT_RETEST';
    const leverage = cfg.leverages[Math.floor(confidence / 25)] ?? cfg.leverages[0];

    const sig: StyleSignal = {
      style,
      direction: direction === 'NEUTRAL' ? 'LONG' : direction,
      entry: price,
      stopLoss: sl,
      tp1: tps[0],
      tp2: tps[1],
      tp3: tps[2],
      tp4: tps[3],
      grossRR,
      netRR,
      leverage,
      leverageOptions: [...cfg.leverages],
      confidence,
      entryTiming,
      signalText: '',
    };

    sig.signalText = buildSignalText(
      style, symbol, direction === 'NEUTRAL' ? 'LONG' : direction,
      sig, deep, align, alignQuality, score, trendMap, timestamp
    );
    return sig;
  }

  const scalpSignal   = buildStyle('SCALP');
  const intradaySignal = buildStyle('INTRADAY');
  const swingSignal   = buildStyle('SWING');

  // Master = best-setup style with slightly wider levels
  const masterBase = buildStyle(bestSetup);
  const masterSignal: StyleSignal = {
    ...masterBase,
    style: 'INTRADAY',
    signalText: buildSignalText(
      'INTRADAY', symbol, direction === 'NEUTRAL' ? 'LONG' : direction,
      masterBase, deep, align, alignQuality, score, trendMap, timestamp
    ).replace('[INTRADAY]', '[MASTER]'),
  };

  return {
    direction: direction === 'NEUTRAL' ? 'LONG' : direction,
    totalScore: score,
    confidence,
    alignmentScore: align,
    alignmentQuality: alignQuality,
    bestSetup,
    trendMap,
    masterSignal,
    scalpSignal,
    intradaySignal,
    swingSignal,
    deep,
  };
}
