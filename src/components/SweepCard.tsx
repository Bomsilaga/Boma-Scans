'use client';
import type { SweepEvent, SweepManagement } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  BSL_SWEEP:        'Buy-Side Liquidity Sweep',
  SSL_SWEEP:        'Sell-Side Liquidity Sweep',
  INDUCEMENT:       'Inducement',
  STOP_HUNT:        'Stop Hunt',
  DOUBLE_TOP_SWEEP: 'Double-Top Sweep',
  DOUBLE_BOT_SWEEP: 'Double-Bottom Sweep',
};

const TYPE_EMOJI: Record<string, string> = {
  BSL_SWEEP: '🐻', SSL_SWEEP: '🐂', INDUCEMENT: '🪤',
  STOP_HUNT: '🎯', DOUBLE_TOP_SWEEP: '⛰️', DOUBLE_BOT_SWEEP: '🏔️',
};

const ACTION_STYLE: Record<string, { bg: string; border: string; text: string; emoji: string }> = {
  ENTER:      { bg: 'bg-bull/10',     border: 'border-bull/30',    text: 'text-bull',    emoji: '✅' },
  SCALE_IN:   { bg: 'bg-bull/5',      border: 'border-bull/20',    text: 'text-bull',    emoji: '📈' },
  TIGHTEN_SL: { bg: 'bg-warning/10',  border: 'border-warning/30', text: 'text-warning', emoji: '⚠️' },
  EXIT:       { bg: 'bg-bear/10',     border: 'border-bear/30',    text: 'text-bear',    emoji: '🚨' },
  HOLD:       { bg: 'bg-muted/40',    border: 'border-border',     text: 'text-text-secondary', emoji: '⏸️' },
  AVOID:      { bg: 'bg-bear/5',      border: 'border-bear/20',    text: 'text-bear',    emoji: '🚫' },
};

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
    </div>
  );
}

function SweepRow({ sweep }: { sweep: SweepEvent }) {
  const isLong = sweep.direction === 'LONG';
  const scoreColor = sweep.score >= 75 ? '#00d4aa' : sweep.score >= 55 ? '#ffd166' : '#ff4d6d';
  const strengthColor = sweep.strength === 'STRONG' ? 'text-bull' : sweep.strength === 'MODERATE' ? 'text-warning' : 'text-bear';
  const strengthBg    = sweep.strength === 'STRONG' ? 'bg-bull/10' : sweep.strength === 'MODERATE' ? 'bg-warning/10' : 'bg-bear/10';

  return (
    <div className={`rounded-xl border p-3 ${isLong ? 'border-bull/20 bg-bull/3' : 'border-bear/20 bg-bear/3'}`}
      style={{ background: isLong ? 'rgba(0,212,170,0.03)' : 'rgba(255,77,109,0.03)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-base">{TYPE_EMOJI[sweep.type] ?? '🔍'}</span>
          <span className="text-xs font-bold text-text-primary">{TYPE_LABELS[sweep.type] ?? sweep.type}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${strengthBg} ${strengthColor}`}>
            {sweep.strength}
          </span>
          {sweep.volumeSpike && <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-bold">🔥 Vol</span>}
          {sweep.confirmed   && <span className="text-[9px] bg-bull/10 text-bull px-1.5 py-0.5 rounded font-bold">✅ Confirmed</span>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-black mono" style={{ color: scoreColor }}>{sweep.score}</div>
          <div className="text-[9px] text-text-muted">/100</div>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-2">
        <ScoreBar score={sweep.score} color={scoreColor} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="bg-muted/40 rounded p-1.5 text-center">
          <div className="text-[9px] text-text-muted">Swept Level</div>
          <div className="text-[10px] font-bold mono text-text-primary">${sweep.sweptLevel.toFixed(5)}</div>
        </div>
        <div className="bg-muted/40 rounded p-1.5 text-center">
          <div className="text-[9px] text-text-muted">Rejection</div>
          <div className="text-[10px] font-bold mono text-text-primary">${sweep.rejectionClose.toFixed(5)}</div>
        </div>
        <div className="bg-muted/40 rounded p-1.5 text-center">
          <div className="text-[9px] text-text-muted">Wick × ATR</div>
          <div className={`text-[10px] font-bold mono ${sweep.wickSize >= 0.5 && sweep.wickSize <= 2 ? 'text-bull' : 'text-warning'}`}>{sweep.wickSize}×</div>
        </div>
      </div>

      {/* Expected direction */}
      <div className={`flex items-center gap-2 text-[10px] rounded-lg px-2 py-1.5 ${isLong ? 'bg-bull/8 text-bull' : 'bg-bear/8 text-bear'}`}
        style={{ background: isLong ? 'rgba(0,212,170,0.08)' : 'rgba(255,77,109,0.08)' }}>
        <span className="font-bold">Expected move after sweep →</span>
        <span className="font-black">{sweep.direction}</span>
      </div>

      {/* Description */}
      <div className="text-[9px] text-text-muted mt-1.5">{sweep.description}</div>
    </div>
  );
}

interface Props {
  sweeps: SweepEvent[];
  management: SweepManagement;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
}

export default function SweepCard({ sweeps, management, direction }: Props) {
  const actionStyle = ACTION_STYLE[management.action] ?? ACTION_STYLE['HOLD'];

  return (
    <div className="space-y-3">
      {/* Management action banner */}
      <div className={`rounded-xl border-2 p-4 ${actionStyle.bg} ${actionStyle.border}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{actionStyle.emoji}</span>
          <span className={`text-sm font-black ${actionStyle.text}`}>{management.action.replace('_', ' ')}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ml-auto ${actionStyle.border} ${actionStyle.text}`}>
            Sweep Management
          </span>
        </div>
        <p className={`text-xs font-medium ${actionStyle.text} mb-2`}>{management.reason}</p>

        {(management.suggestedEntry || management.suggestedSL) && (
          <div className="grid grid-cols-2 gap-2 mb-2">
            {management.suggestedEntry && (
              <div className="bg-muted/40 rounded-lg p-2">
                <div className="text-[9px] text-text-muted">Suggested Entry</div>
                <div className="text-xs font-bold mono text-accent">${management.suggestedEntry.toFixed(5)}</div>
              </div>
            )}
            {management.suggestedSL && (
              <div className="bg-muted/40 rounded-lg p-2">
                <div className="text-[9px] text-text-muted">Suggested SL</div>
                <div className="text-xs font-bold mono text-bear">${management.suggestedSL.toFixed(5)}</div>
              </div>
            )}
          </div>
        )}

        <div className={`text-[10px] rounded-lg px-2 py-1.5 border ${actionStyle.border}`}
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          💡 {management.riskNote}
        </div>
      </div>

      {/* Sweep events */}
      {sweeps.length === 0 ? (
        <div className="card text-center py-8 text-text-muted text-sm">
          <div className="text-3xl mb-2">🔍</div>
          No liquidity sweeps detected in recent 1H candles.
          <div className="text-xs mt-1">Sweeps require a wick beyond a swing high/low with close back inside range.</div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">
              {sweeps.length} sweep{sweeps.length > 1 ? 's' : ''} detected
            </span>
            <div className="flex gap-1">
              {['LONG', 'SHORT'].map((d) => {
                const count = sweeps.filter(s => s.direction === d).length;
                return count > 0 ? (
                  <span key={d} className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${d === 'LONG' ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                    {count} → {d}
                  </span>
                ) : null;
              })}
            </div>
          </div>
          {sweeps.map((s, i) => <SweepRow key={i} sweep={s} />)}
        </div>
      )}

      {/* Strategy guide */}
      <div className="card border border-accent/20">
        <h3 className="text-xs font-bold text-accent mb-2">📖 Sweep Strategy Guide</h3>
        <div className="space-y-1.5 text-[10px] text-text-muted">
          <div><span className="text-bull font-semibold">BSL Sweep →</span> Buy-side liquidity taken out above swing highs. Smart money sells into retail longs. Expect SHORT.</div>
          <div><span className="text-bear font-semibold">SSL Sweep →</span> Sell-side liquidity taken below swing lows. Smart money buys retail stops. Expect LONG.</div>
          <div><span className="text-warning font-semibold">Inducement →</span> Minor grab to lure breakout traders. Wait for confirmation before entering.</div>
          <div><span className="text-accent font-semibold">Stop Hunt →</span> Large wick spike (1.5× ATR+). High-probability reversal but confirm close back inside range.</div>
          <div><span className="text-info font-semibold">Double Sweep →</span> Two consecutive levels swept — strongest signal. High conviction reversal setup.</div>
          <div className="pt-1 border-t border-border/30"><span className="text-text-primary font-semibold">SL Rule:</span> Always place SL beyond the swept level + 0.3 ATR buffer to avoid re-sweeps.</div>
        </div>
      </div>
    </div>
  );
}
