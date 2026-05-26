'use client';
import { useState } from 'react';
import type { StyleSignal, Direction } from '@/types';

interface Props {
  symbol: string;
  direction: Direction;
  signal: StyleSignal;
  style: string;
}

const RISK_PRESETS = [0.5, 1, 2, 3, 5];

export default function TradeButton({ symbol, direction, signal, style }: Props) {
  const [open, setOpen]           = useState(false);
  const [leverage, setLeverage]   = useState(signal.leverage);
  const [riskPct, setRiskPct]     = useState(1);
  const [customRisk, setCustomRisk] = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<{ success?: boolean; paper?: boolean; message: string; orderId?: string; balance?: string; riskAmt?: string; qty?: number } | null>(null);

  const isLong    = direction === 'LONG';
  const dirColor  = isLong ? 'text-bull'      : 'text-bear';
  const dirBorder = isLong ? 'border-bull/40' : 'border-bear/40';
  const dirBg     = isLong ? 'bg-bull/5'      : 'bg-bear/5';

  // Leverage options: engine suggestions + full range for manual override
  const leverageOptions = signal.leverageOptions ?? [signal.leverage];
  const maxLev = Math.max(...leverageOptions);
  const minLev = Math.min(...leverageOptions);

  const effectiveRisk = customRisk !== '' ? parseFloat(customRisk) || 0 : riskPct;

  async function placeTrade() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          direction,
          entry:    signal.entry,
          stopLoss: signal.stopLoss,
          tp1:      signal.tp1,
          tp2:      signal.tp2,
          tp3:      signal.tp3,
          leverage,
          riskPct:  effectiveRisk,
          style,
        }),
      });
      const data = await res.json();
      if (!res.ok) setResult({ message: `❌ ${data.error}` });
      else setResult(data);
    } catch (e) {
      setResult({ message: `❌ ${e instanceof Error ? e.message : 'Failed'}` });
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(!open);
    setResult(null);
    // Reset to engine defaults each time panel opens
    setLeverage(signal.leverage);
    setRiskPct(1);
    setCustomRisk('');
  }

  return (
    <div>
      <button
        onClick={handleOpen}
        className={`w-full text-xs font-bold py-2 rounded-lg border-2 transition-all mt-2 ${dirBg} ${dirBorder} ${dirColor} hover:opacity-80`}
      >
        ⚡ Place {direction} Trade on Bybit
      </button>

      {open && (
        <div className={`mt-2 p-3 rounded-xl border-2 ${dirBorder} ${dirBg} space-y-4`}>
          <div className="text-xs font-semibold text-text-primary">Order Preview — {style}</div>

          {/* Levels summary */}
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            {[
              { label: 'Entry',     value: `$${signal.entry.toFixed(5)}`,    color: 'text-text-primary' },
              { label: 'Stop',      value: `$${signal.stopLoss.toFixed(5)}`, color: 'text-bear' },
              { label: 'TP1 (50%)', value: `$${signal.tp1.toFixed(5)}`,      color: 'text-bull' },
              { label: 'TP2 (25%)', value: `$${signal.tp2.toFixed(5)}`,      color: 'text-bull' },
              { label: 'TP3 (25%)', value: `$${signal.tp3.toFixed(5)}`,      color: 'text-bull' },
              { label: 'Net R:R',   value: `${signal.netRR.toFixed(2)}×`,    color: 'text-accent' },
            ].map((z) => (
              <div key={z.label} className="flex justify-between bg-muted/40 rounded px-2 py-1">
                <span className="text-text-muted">{z.label}</span>
                <span className={`font-semibold ${z.color}`}>{z.value}</span>
              </div>
            ))}
          </div>

          {/* ── Leverage ───────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted font-medium">LEVERAGE</span>
              <span className="text-sm font-black text-accent">{leverage}×</span>
            </div>

            {/* Quick-tap engine suggestions */}
            <div className="flex gap-1.5 flex-wrap">
              {leverageOptions.map((lv) => (
                <button
                  key={lv}
                  onClick={() => setLeverage(lv)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-bold border transition-all ${
                    leverage === lv
                      ? 'bg-accent text-background border-accent'
                      : 'bg-muted text-text-muted border-border hover:text-text-primary'
                  }`}
                >
                  {lv}×
                  {lv === signal.leverage && <span className="ml-0.5 opacity-60">★</span>}
                </button>
              ))}
            </div>

            {/* Slider for fine-grained control */}
            <div className="space-y-1">
              <input
                type="range"
                min={minLev}
                max={maxLev}
                step={1}
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full accent-accent h-1.5"
              />
              <div className="flex justify-between text-[9px] text-text-muted">
                <span>{minLev}× min</span>
                <span className="text-accent/70">{signal.leverage}× recommended</span>
                <span>{maxLev}× max</span>
              </div>
            </div>

            <div className="text-[9px] text-text-muted bg-muted/30 rounded px-2 py-1">
              ★ = engine recommendation · {signal.leverageReasoning}
            </div>
          </div>

          {/* ── Risk % ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted font-medium">RISK % OF ACCOUNT</span>
              <span className="text-sm font-black text-accent">{effectiveRisk.toFixed(1)}%</span>
            </div>

            {/* Preset buttons */}
            <div className="flex gap-1.5">
              {RISK_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setRiskPct(p); setCustomRisk(''); }}
                  className={`flex-1 text-[10px] py-1 rounded-lg font-bold border transition-all ${
                    customRisk === '' && riskPct === p
                      ? 'bg-accent text-background border-accent'
                      : 'bg-muted text-text-muted border-border hover:text-text-primary'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.1}
                max={100}
                step={0.1}
                value={customRisk}
                placeholder="Custom %"
                onChange={(e) => setCustomRisk(e.target.value)}
                className="input text-xs py-1 h-7 w-28 placeholder:text-text-muted/50"
              />
              {customRisk !== '' && (
                <button onClick={() => setCustomRisk('')} className="text-[10px] text-text-muted hover:text-bear">✕ clear</button>
              )}
            </div>

            <div className="text-[9px] text-text-muted">
              Higher % = larger position size from your account balance.
              Keep under 2% per trade to manage drawdown.
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`text-[11px] rounded-lg p-2.5 font-mono whitespace-pre-wrap space-y-1 ${
              result.success ? 'bg-bull/5 text-bull border border-bull/20'
              : result.paper  ? 'bg-accent/5 text-accent border border-accent/20'
              : 'bg-bear/5 text-bear border border-bear/20'
            }`}>
              <div>{result.message}</div>
              {result.orderId  && <div className="text-text-muted">Order ID: {result.orderId}</div>}
              {result.balance  && <div className="text-text-muted">Account: ${result.balance} USDT</div>}
              {result.riskAmt  && <div className="text-text-muted">Risking: ${result.riskAmt}</div>}
              {result.qty      && <div className="text-text-muted">Qty: {result.qty} contracts</div>}
            </div>
          )}

          {/* Confirm */}
          <button
            onClick={placeTrade}
            disabled={loading || effectiveRisk <= 0}
            className={`w-full text-sm font-bold py-2.5 rounded-xl border-2 transition-all ${dirBg} ${dirBorder} ${dirColor} hover:opacity-80 disabled:opacity-40`}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Placing...
                </span>
              : `✅ Confirm ${direction} · ${leverage}× · ${effectiveRisk.toFixed(1)}% risk`}
          </button>
          <button onClick={() => setOpen(false)} className="w-full text-xs text-text-muted hover:text-text-secondary py-1">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
