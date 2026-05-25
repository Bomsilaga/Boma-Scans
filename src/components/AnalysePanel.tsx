'use client';
import { useState } from 'react';
import type { AnalyseResponse, SetupStyle } from '@/types';
import CandleChart from './CandleChart';
import TradeButton from './TradeButton';
import SweepCard from './SweepCard';

type SignalStyle = 'MASTER' | 'SCALP' | 'INTRADAY' | 'SWING';

function Row({ label, value, color = 'text-text-primary' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-text-muted text-xs">{label}</span>
      <span className={`mono font-semibold text-xs ${color}`}>{value}</span>
    </div>
  );
}

function AlignBar({ score }: { score: number }) {
  const color = score >= 80 ? '#00d4aa' : score >= 65 ? '#ffd166' : '#ff4d6d';
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, score)}%`, background: color }} />
    </div>
  );
}

function StyleCard({ data, style, onSignal }: {
  data: AnalyseResponse;
  style: SetupStyle;
  onSignal: (text: string, style: SignalStyle) => void;
}) {
  const sigMap: Record<SetupStyle, AnalyseResponse['scalpSignal']> = {
    SCALP: data.scalpSignal,
    INTRADAY: data.intradaySignal,
    SWING: data.swingSignal,
  };
  const sig = sigMap[style];
  const isLong = sig.direction === 'LONG';
  const dirColor  = isLong ? 'text-bull' : 'text-bear';
  const slPct  = (Math.abs(sig.entry - sig.stopLoss) / sig.entry * 100).toFixed(3);
  const tp1Pct = (Math.abs(sig.tp1 - sig.entry) / sig.entry * 100).toFixed(3);
  const tp2Pct = (Math.abs(sig.tp2 - sig.entry) / sig.entry * 100).toFixed(3);
  const tp3Pct = (Math.abs(sig.tp3 - sig.entry) / sig.entry * 100).toFixed(3);

  return (
    <div className={`card border ${isLong ? 'border-bull/20' : 'border-bear/20'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-black mono ${dirColor}`}>{style}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${sig.entryTiming === 'READY' ? 'bg-bull/10 text-bull' : 'bg-warning/10 text-warning'}`}>
            {sig.entryTiming.replace('_', ' ')}
          </span>
          <span className="text-xs text-text-muted mono">{sig.leverage}x</span>
        </div>
      </div>

      {/* Levels */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: 'Entry',    value: sig.entry,    pct: '',      color: 'text-text-primary' },
          { label: 'Stop',     value: sig.stopLoss, pct: `-${slPct}%`,  color: 'text-bear' },
          { label: 'TP1',      value: sig.tp1,      pct: `+${tp1Pct}%`, color: 'text-bull' },
          { label: 'TP2',      value: sig.tp2,      pct: `+${tp2Pct}%`, color: 'text-bull' },
          { label: 'TP3',      value: sig.tp3,      pct: `+${tp3Pct}%`, color: 'text-bull' },
        ].map((z) => (
          <div key={z.label} className="bg-muted/40 rounded-lg p-2">
            <div className="text-[9px] text-text-muted">{z.label} {z.pct && <span className="text-[9px]">{z.pct}</span>}</div>
            <div className={`text-xs font-bold mono ${z.color}`}>${z.value.toFixed(5)}</div>
          </div>
        ))}
        <div className="bg-muted/40 rounded-lg p-2">
          <div className="text-[9px] text-text-muted">Net R:R</div>
          <div className={`text-xs font-bold mono ${sig.netRR >= 2.5 ? 'text-bull' : 'text-bear'}`}>{sig.netRR.toFixed(2)}x</div>
        </div>
      </div>

      {/* Leverage options */}
      <div className="mb-1">
        <div className="text-[9px] text-text-muted mb-1">⚡ Leverage · TA/FA derived</div>
        <div className="flex gap-1 flex-wrap mb-1">
          {sig.leverageOptions.map((lev) => (
            <span key={lev} className={`text-[10px] px-1.5 py-0.5 rounded mono font-semibold ${lev === sig.leverage ? 'bg-accent text-white' : 'bg-muted text-text-muted'}`}>
              {lev}x
            </span>
          ))}
        </div>
        <div className="text-[9px] text-text-muted italic">{sig.leverageReasoning}</div>
      </div>

      {/* Generate signal */}
      <button
        onClick={() => onSignal(sig.signalText, style as SignalStyle)}
        className={`w-full text-xs font-semibold py-2 rounded-lg border transition-all ${isLong ? 'border-bull/30 text-bull bg-bull/5 hover:bg-bull/10' : 'border-bear/30 text-bear bg-bear/5 hover:bg-bear/10'}`}
      >
        📡 Generate {style} Signal
      </button>

      <TradeButton
        symbol={data.symbol}
        direction={sig.direction as 'LONG' | 'SHORT'}
        signal={sig}
        style={style}
      />
    </div>
  );
}

interface Props { initialSymbol?: string; onBack?: () => void }

export default function AnalysePanel({ initialSymbol = 'BTCUSDT', onBack }: Props) {
  const [input, setInput] = useState(initialSymbol);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<SetupStyle>('INTRADAY');
  const [signalOut, setSignalOut] = useState<{ text: string; style: SignalStyle } | null>(null);
  const [masterOut, setMasterOut] = useState<string | null>(null);

  async function runAnalysis(sym?: string) {
    const target = (sym ?? input).toUpperCase().trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    setData(null);
    setSignalOut(null);
    setMasterOut(null);
    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: target }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json: AnalyseResponse = await res.json();
      setData(json);
      setActiveStyle(json.bestSetup);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  const isLong = data?.direction === 'LONG';
  const dirColor  = isLong ? 'text-bull' : 'text-bear';
  const dirBorder = isLong ? 'border-bull/30' : 'border-bear/30';
  const dirBg     = isLong ? 'bg-bull/5'      : 'bg-bear/5';

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>←</span>
          <span>Back to AutoScan</span>
        </button>
      )}

      {/* Search bar */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="label block mb-1.5">Symbol</label>
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && runAnalysis()}
            placeholder="BTC, ETHUSDT, SOL…"
          />
        </div>
        <button onClick={() => runAnalysis()} disabled={loading} className="btn-primary flex items-center gap-2 h-9">
          {loading
            ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            : '🔬'}
          {loading ? 'Analysing...' : 'Analyse'}
        </button>
      </div>

      {error && <div className="card border border-bear/30 bg-bear/5 text-bear text-sm">❌ {error}</div>}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">🔬</div>
          <h3 className="text-text-primary font-semibold mb-1">Deep Analysis</h3>
          <p className="text-text-secondary text-sm">Enter a symbol to run 6-TF ICT + Wyckoff analysis and generate MASTER · SCALP · INTRADAY · SWING signals</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card flex flex-col items-center justify-center py-16">
          <svg className="animate-spin h-8 w-8 text-accent mb-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <p className="text-text-secondary text-sm">Fetching 6 timeframes and running analysis…</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary header */}
          <div className={`card border-2 ${dirBorder} ${dirBg}`}>
            <div className="flex flex-wrap items-start gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold mono text-text-primary">{data.symbol}</h2>
                  <span className={`text-sm font-black mono px-2 py-0.5 rounded-lg border ${dirBorder} ${dirColor}`}>{data.direction}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    data.totalScore >= 85 ? 'bg-bull/15 text-bull border border-bull/30' :
                    data.totalScore >= 72 ? 'bg-bull/10 text-bull border border-bull/20' :
                    data.totalScore >= 60 ? 'bg-warning/10 text-warning border border-warning/20' :
                    'bg-bear/10 text-bear border border-bear/20'
                  }`}>
                    {data.totalScore >= 85 ? '🔥 A+' : data.totalScore >= 72 ? '⭐ A' : data.totalScore >= 60 ? '✅ B' : '⚠️ C'}
                  </span>
                </div>
                <div className={`text-3xl font-bold mono mt-1 ${dirColor}`}>
                  ${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </div>
                <div className="text-text-muted text-xs mt-1">{data.timestamp}</div>
              </div>

              <div className="flex-1 min-w-48 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Score</span>
                  <span className={`mono font-bold ${dirColor}`}>{data.totalScore}/100</span>
                </div>
                <AlignBar score={data.totalScore} />
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-text-muted">Alignment · {data.alignmentQuality}</span>
                  <span className="mono font-bold text-text-secondary">{data.alignmentScore.toFixed(0)}%</span>
                </div>
                <AlignBar score={data.alignmentScore} />
              </div>

              <div className="space-y-1 text-xs">
                <Row label="Confidence"    value={`${data.confidence}%`} color={data.confidence >= 75 ? 'text-bull' : 'text-warning'} />
                <Row label="Best Setup"    value={data.bestSetup} color="text-accent" />
                <Row label="Wyckoff"       value={data.deep.wyckoffPhase} />
                <Row label="AMD Bias"      value={data.deep.amdBias} />
                <Row label="RSI"           value={data.deep.rsi.toFixed(1)} color={data.deep.rsi > 70 ? 'text-bear' : data.deep.rsi < 30 ? 'text-bull' : 'text-text-primary'} />
                <Row label="Vol Ratio"     value={`${data.deep.volRatio.toFixed(2)}x`} color={data.deep.volRatio >= 1.5 ? 'text-bull' : 'text-text-primary'} />
                <Row label="VWAP"          value={data.deep.vwapAbove ? 'Price above ✅' : 'Price below ⚠️'} />
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

            {/* Structure tags */}
            <div className="flex gap-1.5 flex-wrap mt-2">
              {data.deep.hasBOS   && <span className="text-[10px] bg-bull/10 text-bull px-2 py-0.5 rounded font-semibold">BOS</span>}
              {data.deep.hasOB    && <span className="text-[10px] bg-bull/10 text-bull px-2 py-0.5 rounded font-semibold">OB</span>}
              {data.deep.hasFVG   && <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded font-semibold">FVG</span>}
              {data.deep.hasChoCH && <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded font-semibold">CHoCH</span>}
              {data.deep.hasSweep && <span className="text-[10px] bg-bear/10 text-bear px-2 py-0.5 rounded font-semibold">SWEEP</span>}
              {data.deep.macdBull && <span className="text-[10px] bg-bull/10 text-bull px-2 py-0.5 rounded font-semibold">MACD Bull</span>}
              {data.deep.macdBear && <span className="text-[10px] bg-bear/10 text-bear px-2 py-0.5 rounded font-semibold">MACD Bear</span>}
              {data.deep.oteZone  && <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded font-semibold">OTE Zone</span>}
            </div>
          </div>

          {/* Candlestick chart */}
          {data.candles && data.candles.length > 0 && (
            <CandleChart
              candles={data.candles}
              entry={data.intradaySignal.entry}
              stopLoss={data.intradaySignal.stopLoss}
              tp1={data.intradaySignal.tp1}
              tp2={data.intradaySignal.tp2}
              tp3={data.intradaySignal.tp3}
              direction={data.direction}
              poc={data.deep.poc}
            />
          )}

          {/* Master signal */}
          <div className="card border border-accent/20 bg-accent/5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-accent">🚀 MASTER Signal</h3>
              <div className="flex gap-2">
                {masterOut && (
                  <button onClick={() => navigator.clipboard.writeText(masterOut)} className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20">
                    📋 Copy
                  </button>
                )}
                <button
                  onClick={() => setMasterOut(masterOut ? null : data.masterSignal.signalText)}
                  className="text-xs px-2 py-1 rounded bg-muted text-text-secondary hover:text-text-primary"
                >
                  {masterOut ? '▲ Hide' : '📡 Generate'}
                </button>
              </div>
            </div>
            {masterOut && (
              <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap leading-relaxed bg-muted/20 rounded-lg p-3">{masterOut}</pre>
            )}
            {!masterOut && (
              <p className="text-xs text-text-muted">Master signal combines best-setup levels with full analysis context.</p>
            )}
          </div>

          {/* Style tabs */}
          <div className="flex gap-1">
            {(['SCALP', 'INTRADAY', 'SWING'] as SetupStyle[]).map((s) => (
              <button key={s} onClick={() => setActiveStyle(s)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${activeStyle === s ? 'bg-accent/10 text-accent' : 'bg-muted text-text-secondary hover:text-text-primary'}`}>
                {s === data.bestSetup ? `⭐ ${s}` : s}
              </button>
            ))}
          </div>

          <StyleCard
            data={data}
            style={activeStyle}
            onSignal={(text, style) => setSignalOut({ text, style })}
          />

          {/* Signal output */}
          {signalOut && (
            <div className="card border border-accent/30 bg-accent/5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-accent">📡 {signalOut.style} Signal — {data.direction}</h3>
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(signalOut.text)} className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20">📋 Copy</button>
                  <button onClick={() => setSignalOut(null)} className="text-xs px-2 py-1 rounded bg-muted text-text-muted hover:bg-muted/80">✕</button>
                </div>
              </div>
              <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap leading-relaxed">{signalOut.text}</pre>
            </div>
          )}

          {/* Liquidity Sweeps */}
          {data.deep.sweeps !== undefined && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
                <span className="text-sm font-bold text-text-primary">💧 Liquidity Sweep Analysis</span>
                {data.deep.sweeps.length > 0 && (
                  <span className="text-[10px] bg-bear/10 text-bear px-2 py-0.5 rounded-full font-semibold">
                    {data.deep.sweeps.length} detected
                  </span>
                )}
              </div>
              <div className="p-4">
                <SweepCard
                  sweeps={data.deep.sweeps}
                  management={data.deep.sweepManagement}
                  direction={data.direction}
                />
              </div>
            </div>
          )}

          {/* Deep context grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Fibonacci */}
            <div className="card">
              <h3 className="text-xs font-semibold text-text-primary mb-2">📐 Fibonacci Levels</h3>
              <div className="space-y-1">
                {data.deep.fibLevels.map((f) => {
                  const inRange = data.deep.oteZone && f.price >= data.deep.oteZone.low && f.price <= data.deep.oteZone.high;
                  return (
                    <div key={f.label} className={`flex justify-between text-xs px-1.5 py-0.5 rounded ${inRange ? 'bg-accent/10' : ''}`}>
                      <span className={`text-text-muted ${inRange ? 'text-accent font-semibold' : ''}`}>{f.label}{inRange ? ' 🎯OTE' : ''}</span>
                      <span className="mono text-text-secondary">${f.price.toFixed(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Volume Profile */}
            <div className="card">
              <h3 className="text-xs font-semibold text-text-primary mb-2">📊 Volume Profile</h3>
              <div className="space-y-1.5">
                <Row label="POC" value={`$${data.deep.poc.toFixed(5)}`} color="text-accent" />
                <Row label="VWAP" value={data.deep.vwapAbove ? 'Price above ✅' : 'Price below ⚠️'} />
                <Row label="Vol Ratio" value={`${data.deep.volRatio.toFixed(2)}x`} color={data.deep.volRatio >= 1.5 ? 'text-bull' : 'text-text-primary'} />
                <Row label="BB Width" value={`${(data.deep.bbWidth * 100).toFixed(2)}%`} />
                <Row label="OB Imbalance" value={data.deep.orderbookImbalance.replace('_', ' ')} color={data.deep.orderbookImbalance === 'BID_HEAVY' ? 'text-bull' : data.deep.orderbookImbalance === 'ASK_HEAVY' ? 'text-bear' : 'text-text-muted'} />
              </div>
            </div>

            {/* ICT / Wyckoff */}
            <div className="card">
              <h3 className="text-xs font-semibold text-text-primary mb-2">🏗️ ICT / Wyckoff</h3>
              <div className="space-y-1.5">
                <Row label="Wyckoff Phase" value={data.deep.wyckoffPhase} />
                <Row label="AMD Bias" value={data.deep.amdBias} />
                <Row label="RSI" value={data.deep.rsi.toFixed(1)} color={data.deep.rsi > 70 ? 'text-bear' : data.deep.rsi < 30 ? 'text-bull' : 'text-text-primary'} />
                {data.deep.oteZone && (
                  <>
                    <Row label="OTE Low"  value={`$${data.deep.oteZone.low.toFixed(5)}`}  color="text-accent" />
                    <Row label="OTE High" value={`$${data.deep.oteZone.high.toFixed(5)}`} color="text-accent" />
                  </>
                )}
                <Row label="MACD" value={data.deep.macdBull ? '🟢 Bull' : data.deep.macdBear ? '🔴 Bear' : '⚪ Flat'} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
