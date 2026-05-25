import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type AIProvider = 'claude' | 'openai' | 'deepseek';

const SYSTEM_PROMPT = `You are an elite crypto trading analyst and tutor with deep expertise in ICT (Inner Circle Trader) concepts, Wyckoff methodology, and multi-timeframe technical analysis.

When given signal data, produce a thorough, specific, actionable analysis. NEVER be vague — always use exact price figures from the data provided.

Your analysis MUST include:

## 1. ENTRY TIMING — Be exact
- State the EXACT price level to enter (not "near entry" — give the number)
- State the EXACT condition that must be met before entering (e.g. "wait for a 1m candle close above $X before entering")
- State whether to enter NOW or wait and WHY with the specific price to watch

## 2. MARKET STRUCTURE BREAKDOWN
- Explain BOS, CHoCH, OB, FVG, sweeps in plain English with the exact price levels where they occurred
- Explain what Wyckoff phase means for this trade and what the next expected move is

## 3. RISK MANAGEMENT — All figures exact
- Stop loss: $X — explain exactly WHY (e.g. "below the order block at $X which is the last structural low")
- Risk per trade: if using Xх leverage on $1000 account, max risk is $Y — show the math
- TP1: $X — what liquidity/structure is being targeted and why price is likely to reach it
- TP2: $X — the same
- TP3: $X — the same

## 4. TRADE MANAGEMENT — What to do as price moves
- If price reaches TP1: move SL to X (breakeven or better), take Y% off position
- If price reverses before TP1: the invalidation price is $X — close if a candle closes below/above this
- If price is ranging: wait for X condition at price $X

## 5. INVALIDATION SCENARIOS — Exact prices
- "This setup is invalidated if price closes a 1h candle below $X"
- "If BTC drops below $X, exit immediately — the structure has broken"
- List 2–3 specific scenarios with the exact price levels

## 6. RE-ENTRY GUIDANCE — If trend changes
- If the setup fails and trend reverses, what is the new signal to watch for?
- Give the exact price level where the opposite setup becomes valid
- Give the exact condition for a re-entry in the new direction

## 7. WHAT TO LEARN FROM THIS SETUP — Tutorial
- What pattern/concept is this demonstrating?
- What should the trader study to recognise this setup themselves next time?

Write with confidence. Use real numbers. Be a trading mentor who gives exact, actionable guidance.`;

function buildPrompt(signal: AISignalInput): string {
  const { symbol, direction, totalScore, confidence, alignmentScore, alignmentQuality,
    tier, wyckoffPhase, amdBias, rsi, volRatio, vwapAbove, bbWidth,
    hasBOS, hasOB, hasFVG, hasChoCH, hasSweep, macdBull, macdBear,
    entry, stopLoss, tp1, tp2, tp3, netRR, leverage,
    trendMap, signals, bestSetup, price, fibLevels, poc, oteZone,
    sweeps, orderbookImbalance } = signal;

  const slPct = (Math.abs(entry - stopLoss) / entry * 100).toFixed(2);
  const tp1Pct = (Math.abs(tp1 - entry) / entry * 100).toFixed(2);
  const tp2Pct = (Math.abs(tp2 - entry) / entry * 100).toFixed(2);
  const tp3Pct = (Math.abs(tp3 - entry) / entry * 100).toFixed(2);

  const trendRows = Object.entries(trendMap)
    .map(([tf, t]) => `  ${tf}: ${t}`)
    .join('\n');

  const fibRows = (fibLevels ?? []).map(f => `  ${f.label}: $${f.price.toFixed(5)}`).join('\n');

  return `Analyse this ${symbol} trade signal and provide a detailed educational breakdown:

## Signal Data
- Symbol: ${symbol}
- Current Price: $${price.toFixed(5)}
- Direction: ${direction}
- Total Score: ${totalScore}/100 (Tier ${tier})
- Confidence: ${confidence}%
- Best Setup Style: ${bestSetup}
- Recommended Leverage: ${leverage}x

## Market Structure
- Alignment: ${alignmentScore.toFixed(0)}% (${alignmentQuality})
- Wyckoff Phase: ${wyckoffPhase}
- AMD Bias: ${amdBias}
- BOS (Break of Structure): ${hasBOS ? 'YES' : 'NO'}
- OB (Order Block): ${hasOB ? 'YES' : 'NO'}
- FVG (Fair Value Gap): ${hasFVG ? 'YES' : 'NO'}
- CHoCH (Change of Character): ${hasChoCH ? 'YES' : 'NO'}
- Liquidity Sweep: ${hasSweep ? 'YES' : 'NO'}
- MACD: ${macdBull ? 'Bullish crossover' : macdBear ? 'Bearish crossover' : 'Flat'}
- RSI: ${rsi.toFixed(1)}
- Volume Ratio: ${volRatio.toFixed(2)}x
- VWAP: Price ${vwapAbove ? 'ABOVE' : 'BELOW'} VWAP
- BB Width: ${(bbWidth * 100).toFixed(2)}%
- Orderbook Imbalance: ${orderbookImbalance}
- POC: $${poc.toFixed(5)}
${oteZone ? `- OTE Zone: $${oteZone.low.toFixed(5)} – $${oteZone.high.toFixed(5)}` : ''}
${sweeps?.length ? `- Sweeps detected: ${sweeps.length}` : ''}

## Timeframe Trend Map
${trendRows}

## Trade Levels
- Entry: $${entry.toFixed(5)}
- Stop Loss: $${stopLoss.toFixed(5)} (−${slPct}% risk)
- TP1: $${tp1.toFixed(5)} (+${tp1Pct}%)
- TP2: $${tp2.toFixed(5)} (+${tp2Pct}%)
- TP3: $${tp3.toFixed(5)} (+${tp3Pct}%)
- Net R:R: ${netRR.toFixed(2)}x

## Fibonacci Levels
${fibRows}

## Detected Signals
${signals.map(s => `- ${s}`).join('\n')}

---
Provide your full educational analysis covering: confluence explanation, market structure breakdown, entry/SL/TP rationale, risk management, trading tutorial insights, invalidation scenarios, and overall verdict.`;
}

export interface AISignalInput {
  symbol: string;
  price: number;
  direction: string;
  totalScore: number;
  confidence: number;
  alignmentScore: number;
  alignmentQuality: string;
  tier: string;
  wyckoffPhase: string;
  amdBias: string;
  rsi: number;
  volRatio: number;
  vwapAbove: boolean;
  bbWidth: number;
  hasBOS: boolean;
  hasOB: boolean;
  hasFVG: boolean;
  hasChoCH: boolean;
  hasSweep: boolean;
  macdBull: boolean;
  macdBear: boolean;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  netRR: number;
  leverage: number;
  trendMap: Record<string, string>;
  signals: string[];
  bestSetup: string;
  fibLevels?: { label: string; price: number }[];
  poc: number;
  oteZone?: { low: number; high: number } | null;
  sweeps?: unknown[];
  orderbookImbalance: string;
}

export async function getAIAnalysis(
  signal: AISignalInput,
  provider: AIProvider,
  apiKey: string,
): Promise<string> {
  const prompt = buildPrompt(signal);

  if (provider === 'claude') {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = msg.content[0];
    return block.type === 'text' ? block.text : '';
  }

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey });
    const res = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });
    return res.choices[0]?.message?.content ?? '';
  }

  if (provider === 'deepseek') {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
    const res = await client.chat.completions.create({
      model: 'deepseek-reasoner',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });
    return res.choices[0]?.message?.content ?? '';
  }

  return '';
}
