export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';
export type Tier = 'A+' | 'A' | 'B' | 'C' | 'WATCH';
export type SetupStyle = 'SCALP' | 'INTRADAY' | 'SWING';
export type AlignmentQuality = 'EXCELLENT' | 'STRONG' | 'MODERATE' | 'POOR';
export type AIProvider = 'claude' | 'openai' | 'deepseek';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StyleSignal {
  style: SetupStyle;
  direction: Direction;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4?: number;
  grossRR: number;
  netRR: number;
  leverage: number;
  leverageOptions: number[];
  leverageReasoning: string;
  confidence: number;
  entryTiming: 'READY' | 'WAIT_PULLBACK' | 'WAIT_RETEST';
  signalText: string;
}

export interface SweepEvent {
  type: string;
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  score: number;
  direction: 'LONG' | 'SHORT';
  sweptLevel: number;
  rejectionClose: number;
  wickSize: number;
  volumeSpike: boolean;
  confirmed: boolean;
  candleIndex: number;
  description: string;
}

export interface SweepManagement {
  action: 'ENTER' | 'SCALE_IN' | 'TIGHTEN_SL' | 'EXIT' | 'HOLD' | 'AVOID';
  reason: string;
  suggestedEntry?: number;
  suggestedSL?: number;
  riskNote: string;
}

export interface DeepAnalysis {
  wyckoffPhase: string;
  rsi: number;
  bbWidth: number;
  volRatio: number;
  vwapAbove: boolean;
  poc: number;
  oteZone: { low: number; high: number } | null;
  amdBias: 'ACCUMULATION' | 'MANIPULATION' | 'DISTRIBUTION' | 'UNCLEAR';
  fibLevels: { label: string; price: number }[];
  hasBOS: boolean;
  hasOB: boolean;
  hasFVG: boolean;
  hasSweep: boolean;
  hasChoCH: boolean;
  macdBull: boolean;
  macdBear: boolean;
  orderbookImbalance: 'BID_HEAVY' | 'ASK_HEAVY' | 'BALANCED';
  sweeps: SweepEvent[];
  sweepManagement: SweepManagement;
}

export interface ScanResult {
  engineVersion?: string;
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  direction: Direction;
  totalScore: number;
  confidence: number;
  alignmentScore: number;
  alignmentQuality: AlignmentQuality;
  tier: Tier;
  verdict: string;
  verdictEmoji: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  netRR: number;
  trendMap: Record<string, string>;
  rsi: number;
  volRatio: number;
  signals: string[];
  bestSetup: SetupStyle;
  recommendedLeverage: number;
  hasBOS: boolean;
  hasOB: boolean;
  hasFVG: boolean;
  hasSweep: boolean;
  hasChoCH: boolean;
  macdBull: boolean;
  macdBear: boolean;
  vwapAbove: boolean;
}

export interface AnalyseResponse {
  engineVersion?: string;
  symbol: string;
  price: number;
  direction: Direction;
  timestamp: string;
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
  candles: Candle[];
  aiAnalysis?: string;
}
