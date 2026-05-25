'use client';
import { useState } from 'react';
import type { StyleSignal, Direction } from '@/types';

interface Props {
  symbol: string;
  direction: Direction;
  signal: StyleSignal;
  style: string;
}

export default function TradeButton({ symbol, direction, signal, style }: Props) {
  const [open, setOpen]       = useState(false);
  const [riskPct, setRiskPct] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ success?: boolean; paper?: boolean; message: string; orderId?: string } | null>(null);

  const isLong   = direction === 'LONG';
  const dirColor  = isLong ? 'text-bull'      : 'text-bear';
  const dirBorder = isLong ? 'border-bull/40' : 'border-bear/40';
  const dirBg     = isLong ? 'bg-bull/5'      : 'bg-bear/5';

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
          leverage: signal.leverage,
          riskPct,
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

  return (
    <div>
      <button
        onClick={() => { setOpen(!open); setResult(null); }}
        className={`w-full text-xs font-bold py-2 rounded-lg border-2 transition-all mt-2 ${dirBg} ${dirBorder} ${dirColor} hover:opacity-80`}
      >
        ⚡ Place {direction} Trade on Bybit
      </button>

      {open && (
        <div className={`mt-2 p-3 rounded-xl border-2 ${dirBorder} ${dirBg} space-y-3`}>
          <div className="text-xs font-semibold text-text-primary">Order Preview — {style}</div>

          {/* Levels summary */}
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            {[
              { label: 'Entry',    value: signal.entry,    color: 'text-text-primary' },
              { label: 'Stop',     value: signal.stopLoss, color: 'text-bear' },
              { label: 'TP1 (50%)',value: signal.tp1,      color: 'text-bull' },
              { label: 'TP2 (25%)',value: signal.tp2,      color: 'text-bull' },
              { label: 'TP3 (25%)',value: signal.tp3,      color: 'text-bull' },
              { label: 'Leverage', value: signal.leverage, color: 'text-accent', isNum: true, suffix: 'x' },
            ].map((z) => (
              <div key={z.label} className="flex justify-between bg-muted/40 rounded px-2 py-1">
                <span className="text-text-muted">{z.label}</span>
                <span className={`mono font-semibold ${z.color}`}>
                  {z.isNum ? `${z.value}${z.suffix ?? ''}` : `$${(z.value as number).toFixed(5)}`}
                </span>
              </div>
            ))}
          </div>

          {/* Risk input */}
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Risk % of account balance</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.1} max={5} step={0.1}
                value={riskPct}
                onChange={(e) => setRiskPct(parseFloat(e.target.value))}
                className="input text-xs py-1 h-7 w-20"
              />
              <span className="text-[10px] text-text-muted">% (max 5%)</span>
            </div>
          </div>

          {/* Warning */}
          <div className="text-[10px] text-warning bg-warning/5 border border-warning/20 rounded-lg p-2">
            ⚠️ Currently in <strong>PAPER MODE</strong> — no real orders will be placed. Switch to LIVE in Vercel env vars when ready.
          </div>

          {/* Result */}
          {result && (
            <div className={`text-[11px] rounded-lg p-2 font-mono whitespace-pre-wrap ${result.success || result.paper ? 'bg-bull/5 text-bull border border-bull/20' : 'bg-bear/5 text-bear border border-bear/20'}`}>
              {result.message}
              {result.orderId && <div className="text-text-muted mt-1">Order ID: {result.orderId}</div>}
            </div>
          )}

          {/* Confirm */}
          <button
            onClick={placeTrade}
            disabled={loading}
            className={`w-full text-sm font-bold py-2.5 rounded-xl border-2 transition-all ${dirBg} ${dirBorder} ${dirColor} hover:opacity-80 disabled:opacity-50`}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Placing...</span>
              : `✅ Confirm ${direction} @ ${signal.leverage}x`}
          </button>
          <button onClick={() => setOpen(false)} className="w-full text-xs text-text-muted hover:text-text-secondary py-1">Cancel</button>
        </div>
      )}
    </div>
  );
}
