'use client';
import { useState, useCallback, useEffect } from 'react';
import type { ScanResult, SetupStyle, AnalyseResponse } from '@/types';
import CandleChart from './CandleChart';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

function AlignBar({ score }: { score: number }) {
  const color = score >= 80 ? '#00d4aa' : score >= 65 ? '#ffd166' : '#ff4d6d';
  return (
    <div className="h-1 bg-muted rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, score)}%`, background: color }} />
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    'A+': 'bg-bull/15 border-bull/50 text-bull',
    'A':  'bg-bull/10 border-bull/30 text-bull',
    'B':  'bg-warning/10 border-warning/30 text-warning',
    'C':  'bg-bear/10 border-bear/30 text-bear',
    'WATCH': 'bg-muted border-border text-text-muted',
  };
  return (
    <span className={`text-[10px] font-black mono px-1.5 py-0.5 rounded border ${styles[tier] ?? styles['WATCH']}`}>
      {tier}
    </span>
  );
}

function buildSignalText(r: ScanResult, style: 'MASTER' | 'SCALP' | 'INTRADAY' | 'SWING'): string {
  const isLong = r.direction === 'LONG';
  const dirEmoji = isLong ? '🟢' : '🔴';
  const alignBar = '█'.repeat(Math.round(r.alignmentScore / 10)) + '░'.repeat(10 - Math.round(r.alignmentScore / 10));
  const slPct  = (Math.abs(r.price - r.stopLoss) / r.price * 100).toFixed(3);
  const tp1Pct = (Math.abs(r.tp1 - r.price) / r.price * 100).toFixed(3);
  const tp2Pct = (Math.abs(r.tp2 - r.price) / r.price * 100).toFixed(3);
  const tp3Pct = (Math.abs(r.tp3 - r.price) / r.price * 100).toFixed(3);
  const levMap: Record<string, number> = {
    MASTER: r.recommendedLeverage,
    SCALP: Math.min(100, r.recommendedLeverage * 3),
    INTRADAY: r.recommendedLeverage,
    SWING: Math.max(5, Math.round(r.recommendedLeverage / 2)),
  };
  const tfRow = Object.entries(r.trendMap)
    .map(([tf, t]) => {
      const ok = (isLong && t.includes('UP')) || (!isLong && t.includes('DOWN'));
      return `  ${tf.padEnd(4)} ${ok ? '✅' : '⚠️'} ${t}`;
    }).join('\n');

  return [
    `🚀 BOMA SCANS SIGNAL [${style}]`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 ${r.symbol} PERP — ${dirEmoji} ${r.direction}`,
    `⭐ Tier: ${r.tier}  |  Score: ${r.totalScore}/100`,
    ``,
    `📊 ALIGNMENT: ${r.alignmentScore.toFixed(0)}% [${r.alignmentQuality}]`,
    `[${alignBar}]`,
    ``,
    `📈 TIMEFRAME TRENDS:`,
    tfRow,
    ``,
    `📥 ENTRY:    $${r.entry.toFixed(5)}`,
    `🛑 STOP:     $${r.stopLoss.toFixed(5)}  (−${slPct}%)`,
    `🎯 TP1:      $${r.tp1.toFixed(5)}  (+${tp1Pct}%)`,
    `🎯 TP2:      $${r.tp2.toFixed(5)}  (+${tp2Pct}%)`,
    `🎯 TP3:      $${r.tp3.toFixed(5)}  (+${tp3Pct}%)`,
    ``,
    `📐 Net R:R:  ${r.netRR.toFixed(2)}x`,
    `⚡ Leverage: ${levMap[style]}x`,
    ``,
    `🔍 STRUCTURE:`,
    `  BOS: ${r.hasBOS ? '✅' : '❌'}  OB: ${r.hasOB ? '✅' : '❌'}  FVG: ${r.hasFVG ? '✅' : '❌'}`,
    `  CHoCH: ${r.hasChoCH ? '✅' : '❌'}  Sweep: ${r.hasSweep ? '✅' : '❌'}`,
    `  MACD: ${r.macdBull ? '🟢 Bull' : r.macdBear ? '🔴 Bear' : '⚪ Flat'}`,
    `  VWAP: Price ${r.vwapAbove ? 'above ✅' : 'below ⚠️'}`,
    `  RSI: ${r.rsi.toFixed(1)}  Vol: ${r.volRatio.toFixed(2)}x`,
    ``,
    ...r.signals.map(s => `• ${s}`),
  ].join('\n');
}

// ── Inline analysis drawer ─────────────────────────────────────────────────────
interface DrawerProps {
  symbol: string;
  aiProvider?: string;
  aiApiKey?: string;
  onClose: () => void;
}

function InlineAnalysisDrawer({ symbol, aiProvider, aiApiKey, onClose }: DrawerProps) {
  const [data, setData] = useState<AnalyseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/analyse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, aiProvider, aiApiKey }),
        });
        if (!res.ok) throw new Error(await res.text());
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Analysis failed');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLong = data?.direction === 'LONG';
  const dirColor  = isLong ? 'text-bull' : 'text-bear';
  const dirBorder = isLong ? 'border-bull/30' : 'border-bear/30';
  const dirBg     = isLong ? 'bg-bull/5'      : 'bg-bear/5';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="bg-background w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl overflow-y-auto"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle / header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <span className="text-base font-black mono text-text-primary">{symbol}</span>
            {data && (
              <>
                <span className={`text-xs font-bold mono ${dirColor}`}>{data.direction}</span>
                <TierBadge tier={data.totalScore >= 85 ? 'A+' : data.totalScore >= 72 ? 'A' : data.totalScore >= 60 ? 'B' : 'C'} />
              </>
            )}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none px-1">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg className="animate-spin h-8 w-8 text-accent mb-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <p className="text-text-secondary text-sm">Running 6-TF analysis{aiProvider && aiApiKey ? ' + AI deep analysis' : ''}…</p>
            </div>
          )}

          {error && (
            <div className="card border border-bear/30 bg-bear/5 text-bear text-sm">❌ {error}</div>
          )}

          {data && (
            <>
              {/* Summary */}
              <div className={`card border-2 ${dirBorder} ${dirBg}`}>
                <div className="flex flex-wrap items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold mono text-text-primary">{data.symbol}</h2>
                      <span className={`text-sm font-black mono px-2 py-0.5 rounded-lg border ${dirBorder} ${dirColor}`}>{data.direction}</span>
                    </div>
                    <div className={`text-2xl font-bold mono mt-1 ${dirColor}`}>
                      ${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </div>
                    <div className="text-text-muted text-xs mt-1">{data.timestamp}</div>
                  </div>
                  <div className="flex-1 min-w-40 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Score</span>
                      <span className={`mono font-bold ${dirColor}`}>{data.totalScore}/100</span>
                    </div>
                    <AlignBar score={data.totalScore} />
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Alignment</span>
                      <span className="mono font-bold text-text-secondary">{data.alignmentScore.toFixed(0)}%</span>
                    </div>
                    <AlignBar score={data.alignmentScore} />
                  </div>
                </div>

                {/* TF pills */}
                <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-border/20">
                  {Object.entries(data.trendMap).map(([tf, trend]) => {
                    const match = (isLong && trend.includes('UP')) || (!isLong && trend.includes('DOWN'));
                    return (
                      <span key={tf} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${match ? (isLong ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear') : 'bg-muted text-text-muted'}`}>
                        {tf} {match ? '✅' : '⚠️'} <span className="font-normal">{trend.replace('_', ' ')}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Verdict */}
              {data.verdict && (
                <div className={`rounded-xl border-2 p-4 ${
                  data.verdict.startsWith('✅') ? 'border-bull/40 bg-bull/5' :
                  data.verdict.startsWith('⚠️') ? 'border-warning/40 bg-warning/5' :
                  'border-bear/40 bg-bear/5'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-black text-text-primary">Analyst Verdict</span>
                  </div>
                  <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap leading-relaxed">{data.verdict}</pre>
                </div>
              )}

              {/* AI Deep Analysis */}
              {data.aiAnalysis && (
                <div className="card border border-accent/30 bg-accent/5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🤖</span>
                    <h3 className="text-sm font-bold text-accent">AI Deep Analysis</h3>
                    <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-semibold ml-auto">
                      {aiProvider?.toUpperCase()}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(data.aiAnalysis ?? '')}
                      className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap leading-relaxed bg-muted/20 rounded-lg p-3 max-h-[50vh] overflow-y-auto">
                    {data.aiAnalysis}
                  </div>
                </div>
              )}
              {aiProvider && !aiApiKey && (
                <div className="card border border-warning/30 bg-warning/5 text-warning text-xs flex items-center gap-2">
                  ⚠️ No API key set for {aiProvider} — tap 🤖 in the header to add your key for AI analysis.
                </div>
              )}

              {/* Chart */}
              {data.candles && data.candles.length > 0 && (
                <CandleChart
                  candles={data.candles}
                  symbol={data.symbol}
                  entry={data.intradaySignal.entry}
                  stopLoss={data.intradaySignal.stopLoss}
                  tp1={data.intradaySignal.tp1}
                  tp2={data.intradaySignal.tp2}
                  tp3={data.intradaySignal.tp3}
                  poc={data.deep.poc}
                />
              )}

              {/* Key levels */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Entry',    value: data.intradaySignal.entry,    color: 'text-text-primary' },
                  { label: 'Stop',     value: data.intradaySignal.stopLoss, color: 'text-bear' },
                  { label: 'TP1',      value: data.intradaySignal.tp1,      color: 'text-bull' },
                  { label: 'TP2',      value: data.intradaySignal.tp2,      color: 'text-bull' },
                  { label: 'TP3',      value: data.intradaySignal.tp3,      color: 'text-bull' },
                  { label: 'Net R:R',  value: data.intradaySignal.netRR,    color: data.intradaySignal.netRR >= 2.5 ? 'text-bull' : 'text-bear', isRR: true },
                ].map((z) => (
                  <div key={z.label} className="flex justify-between bg-muted/40 rounded-lg px-2 py-1.5">
                    <span className="text-text-muted">{z.label}</span>
                    <span className={`mono font-bold ${z.color}`}>
                      {'isRR' in z && z.isRR ? `${(z.value as number).toFixed(2)}x` : `$${(z.value as number).toFixed(5)}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Signal card ────────────────────────────────────────────────────────────────
function SignalCard({
  r,
  onAnalyse,
  aiProvider,
  aiApiKey,
}: {
  r: ScanResult;
  onAnalyse: (sym: string) => void;
  aiProvider?: string;
  aiApiKey?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [signalOut, setSignalOut] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const isLong = r.direction === 'LONG';
  const dirColor  = isLong ? 'text-bull'      : 'text-bear';
  const dirBorder = isLong ? 'border-bull/30' : 'border-bear/30';
  const dirBg     = isLong ? 'bg-bull/5'      : 'bg-bear/5';

  return (
    <>
      <div className={`card border-2 ${dirBorder} ${dirBg}`}>
        {/* Header — clicking opens inline drawer */}
        <div
          className="flex items-start justify-between gap-2 mb-2 cursor-pointer"
          onClick={() => setShowDrawer(true)}
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-black mono text-text-primary">{r.symbol}</span>
              <span className={`text-xs font-bold mono ${dirColor}`}>{r.direction}</span>
              <TierBadge tier={r.tier} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm mono text-text-secondary">${r.price.toFixed(5)}</span>
              <span className={`text-[10px] mono ${r.change24h >= 0 ? 'text-bull' : 'text-bear'}`}>
                {r.change24h >= 0 ? '+' : ''}{r.change24h.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-2xl font-black mono ${r.totalScore >= 75 ? 'text-bull' : r.totalScore >= 60 ? 'text-warning' : 'text-bear'}`}>
              {r.totalScore}
            </div>
            <div className="text-[10px] text-text-muted">/100</div>
          </div>
        </div>

        {/* Alignment */}
        <div className="mb-2">
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[10px] text-text-muted">Alignment · {r.alignmentQuality}</span>
            <span className="text-[10px] mono font-semibold text-text-secondary">{r.alignmentScore.toFixed(0)}%</span>
          </div>
          <AlignBar score={r.alignmentScore} />
        </div>

        {/* TF pills */}
        <div className="flex gap-1 flex-wrap mb-2">
          {TIMEFRAMES.map((tf) => {
            const trend = r.trendMap?.[tf] ?? 'NEUTRAL';
            const match = (r.direction === 'LONG' && trend.includes('UP')) || (r.direction === 'SHORT' && trend.includes('DOWN'));
            return (
              <span key={tf} className={`text-[9px] font-bold px-1 py-0.5 rounded ${match ? (isLong ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear') : 'bg-muted text-text-muted'}`}>
                {tf}
              </span>
            );
          })}
        </div>

        {/* Structure tags */}
        <div className="flex gap-1 flex-wrap mb-2">
          {r.hasBOS    && <span className="text-[9px] bg-bull/10 text-bull px-1 py-0.5 rounded font-semibold">BOS</span>}
          {r.hasOB     && <span className="text-[9px] bg-bull/10 text-bull px-1 py-0.5 rounded font-semibold">OB</span>}
          {r.hasFVG    && <span className="text-[9px] bg-warning/10 text-warning px-1 py-0.5 rounded font-semibold">FVG</span>}
          {r.hasChoCH  && <span className="text-[9px] bg-accent/10 text-accent px-1 py-0.5 rounded font-semibold">CHoCH</span>}
          {r.hasSweep  && <span className="text-[9px] bg-bear/10 text-bear px-1 py-0.5 rounded font-semibold">SWEEP</span>}
          {r.vwapAbove && <span className="text-[9px] bg-bull/10 text-bull px-1 py-0.5 rounded font-semibold">VWAP↑</span>}
          {(isLong ? r.macdBull : r.macdBear) && <span className="text-[9px] bg-bull/10 text-bull px-1 py-0.5 rounded font-semibold">MACD✓</span>}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-1.5 text-center mb-3">
          <div className="bg-muted/40 rounded-lg p-1.5">
            <div className="text-[9px] text-text-muted">Confidence</div>
            <div className={`text-xs font-black mono ${r.confidence >= 75 ? 'text-bull' : r.confidence >= 55 ? 'text-warning' : 'text-bear'}`}>{r.confidence}%</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-1.5">
            <div className="text-[9px] text-text-muted">Net R:R</div>
            <div className={`text-xs font-black mono ${r.netRR >= 2.5 ? 'text-bull' : 'text-bear'}`}>{r.netRR.toFixed(2)}x</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-1.5">
            <div className="text-[9px] text-text-muted">Leverage</div>
            <div className="text-xs font-black mono text-accent">{r.recommendedLeverage}x</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setShowDrawer(true)}
            className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all ${dirBg} border ${dirBorder} ${dirColor} hover:opacity-80`}
          >
            🔬 Full Analysis
          </button>
          <button
            onClick={() => onAnalyse(r.symbol)}
            className="text-xs font-semibold py-1.5 px-3 rounded-lg bg-muted text-text-secondary hover:text-text-primary transition-all"
            title="Open in Analyse tab"
          >
            ↗
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-semibold py-1.5 px-3 rounded-lg bg-muted text-text-secondary hover:text-text-primary transition-all"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {/* Expanded signal generator */}
        {expanded && (
          <div className="space-y-2 border-t border-border/30 pt-2">
            {signalOut && (
              <div className="relative">
                <pre className="text-[10px] font-mono text-text-secondary bg-muted/30 rounded-lg p-2 whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto">{signalOut}</pre>
                <button
                  onClick={() => navigator.clipboard.writeText(signalOut)}
                  className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20"
                >📋 Copy</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1">
              {(['MASTER', 'SCALP', 'INTRADAY', 'SWING'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => setSignalOut(buildSignalText(r, style))}
                  className={`text-[10px] font-semibold py-1 rounded-lg ${dirBg} border ${dirBorder} ${dirColor} hover:opacity-70 transition-all`}
                >
                  📡 {style}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {[
                { label: 'Entry', value: r.entry,    color: 'text-text-primary' },
                { label: 'Stop',  value: r.stopLoss, color: 'text-bear' },
                { label: 'TP1',   value: r.tp1,      color: 'text-bull' },
                { label: 'TP2',   value: r.tp2,      color: 'text-bull' },
              ].map((z) => (
                <div key={z.label} className="flex justify-between bg-muted/30 rounded px-1.5 py-1">
                  <span className="text-text-muted">{z.label}</span>
                  <span className={`mono font-semibold ${z.color}`}>${z.value.toFixed(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showDrawer && (
        <InlineAnalysisDrawer
          symbol={r.symbol}
          aiProvider={aiProvider}
          aiApiKey={aiApiKey}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </>
  );
}

interface Props {
  onSelect: (symbol: string) => void;
  aiProvider?: string;
  aiApiKey?: string;
}

export default function ScannerPanel({ onSelect, aiProvider, aiApiKey }: Props) {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ scanned: number; elapsed: number; timestamp: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirFilter, setDirFilter]   = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'A+' | 'A' | 'B'>('ALL');
  const [setupFilter, setSetupFilter] = useState<'ALL' | SetupStyle>('ALL');
  const [sortBy, setSortBy] = useState<'score' | 'rr' | 'alignment' | 'confidence'>('score');

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scan');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data.results);
      setMeta({ scanned: data.scanned, elapsed: data.elapsed, timestamp: data.timestamp });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = results
    .filter((r) => dirFilter === 'ALL'   || r.direction === dirFilter)
    .filter((r) => tierFilter === 'ALL'  || r.tier === tierFilter)
    .filter((r) => setupFilter === 'ALL' || r.bestSetup === setupFilter)
    .sort((a, b) => {
      if (sortBy === 'score')      return b.totalScore - a.totalScore;
      if (sortBy === 'rr')        return b.netRR - a.netRR;
      if (sortBy === 'alignment') return b.alignmentScore - a.alignmentScore;
      return b.confidence - a.confidence;
    });

  const longs  = results.filter((r) => r.direction === 'LONG').length;
  const shorts = results.filter((r) => r.direction === 'SHORT').length;
  const aPlus  = results.filter((r) => r.tier === 'A+').length;

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header card */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              🌐 Elite AutoScan
              <span className="text-xs font-normal text-text-muted bg-muted px-2 py-0.5 rounded-full">No killzone · 24/7</span>
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              ICT + Wyckoff + Multi-TF EMA · Top 100 USDT perps by volume · Persona-filtered A/B/A+ only
            </p>
          </div>
          <button onClick={runScan} disabled={loading} className="btn-primary flex items-center gap-2 h-9">
            {loading
              ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              : '🔍'}
            {loading ? 'Scanning...' : 'Run Elite Scan'}
          </button>
        </div>

        {meta && (
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border/30 text-xs">
            <span className="text-text-muted">⏱ {(meta.elapsed / 1000).toFixed(1)}s</span>
            <span className="text-text-muted">🔍 {meta.scanned} scanned</span>
            <span className="text-bull">🟢 {longs} LONG</span>
            <span className="text-bear">🔴 {shorts} SHORT</span>
            <span className="text-bull">⭐ {aPlus} A+</span>
            <span className="text-text-muted ml-auto">{meta.timestamp}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      {results.length > 0 && (
        <div className="card flex flex-wrap gap-3 items-center">
          <div className="flex gap-1">
            {(['ALL', 'LONG', 'SHORT'] as const).map((f) => (
              <button key={f} onClick={() => setDirFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${dirFilter === f ? (f === 'LONG' ? 'bg-bull/10 text-bull' : f === 'SHORT' ? 'bg-bear/10 text-bear' : 'bg-accent/10 text-accent') : 'bg-muted text-text-muted hover:text-text-secondary'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['ALL', 'A+', 'A', 'B'] as const).map((f) => (
              <button key={f} onClick={() => setTierFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${tierFilter === f ? 'bg-accent/10 text-accent' : 'bg-muted text-text-muted hover:text-text-secondary'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['ALL', 'SCALP', 'INTRADAY', 'SWING'] as const).map((f) => (
              <button key={f} onClick={() => setSetupFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${setupFilter === f ? 'bg-accent/10 text-accent' : 'bg-muted text-text-muted hover:text-text-secondary'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Sort:</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="input text-xs py-0.5 h-7 w-auto">
              <option value="score">Score</option>
              <option value="rr">R:R</option>
              <option value="alignment">Alignment</option>
              <option value="confidence">Confidence</option>
            </select>
          </div>
          <span className="text-xs text-text-muted">{filtered.length} results</span>
        </div>
      )}

      {error && <div className="card border border-bear/30 bg-bear/5 text-bear text-sm">❌ {error}</div>}

      {/* Empty state */}
      {!loading && results.length === 0 && !error && (
        <div className="card flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">🛰️</div>
          <h3 className="text-text-primary font-semibold mb-2 text-lg">Boma Scans Elite AutoScan</h3>
          <p className="text-text-secondary text-sm max-w-lg mb-2">
            Scans the top 100 USDT perpetuals using ICT market structure, Wyckoff phases, and
            Multi-TF EMA alignment scoring.
          </p>
          <p className="text-text-muted text-xs max-w-md mb-6">
            Only A+ / A / B setups with &gt;65% alignment pass the persona filter.
            Tap a result to view full analysis inline. Outputs MASTER · SCALP · INTRADAY · SWING signals.
          </p>
          <button onClick={runScan} className="btn-primary px-6 py-2.5 text-base">🔍 Run Elite Scan</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card animate-pulse space-y-2">
              <div className="h-4 bg-muted rounded w-28" />
              <div className="h-3 bg-muted rounded w-20" />
              <div className="h-1.5 bg-muted rounded" />
              <div className="grid grid-cols-3 gap-1">{[0,1,2].map(j => <div key={j} className="h-10 bg-muted rounded" />)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((r) => (
            <SignalCard
              key={r.symbol}
              r={r}
              onAnalyse={onSelect}
              aiProvider={aiProvider}
              aiApiKey={aiApiKey}
            />
          ))}
        </div>
      )}

      {!loading && results.length > 0 && filtered.length === 0 && (
        <div className="card text-center py-12 text-text-muted text-sm">No results match current filters.</div>
      )}
    </div>
  );
}
