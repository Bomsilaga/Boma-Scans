'use client';
import { useEffect, useRef } from 'react';
import type { Candle } from '@/types';

interface Props {
  candles: Candle[];
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
  vwap?: number;
  poc?: number;
}

export default function CandleChart({ candles, entry, stopLoss, tp1, tp2, tp3, direction, vwap: vwapVal, poc: pocVal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const PAD_L = 10, PAD_R = 60, PAD_T = 16, PAD_B = 24;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const slice = candles.slice(-80);
    const highs  = slice.map(c => c.high);
    const lows   = slice.map(c => c.low);

    // Include level prices in scale
    const levelPrices = [entry, stopLoss, tp1, tp2, tp3, vwapVal, pocVal].filter(Boolean) as number[];
    const allHighs = [...highs, ...levelPrices];
    const allLows  = [...lows,  ...levelPrices];

    const maxP = Math.max(...allHighs) * 1.001;
    const minP = Math.min(...allLows)  * 0.999;
    const range = maxP - minP || 1;

    const toY = (p: number) => PAD_T + chartH * (1 - (p - minP) / range);
    const candleW = Math.max(2, Math.floor(chartW / slice.length) - 1);
    const stepX = chartW / slice.length;

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#1e1e2e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = PAD_T + (chartH / 5) * i;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      const price = maxP - (range / 5) * i;
      ctx.fillStyle = '#555577';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(price > 100 ? 2 : 5), W - PAD_R + 4, y + 3);
    }

    // Level lines
    function drawLevel(price: number | undefined, color: string, label: string, dash: number[] = [4, 3]) {
      if (price === undefined) return;
      const y = toY(price);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, W - PAD_R + 4, y + 3);
      ctx.restore();
    }

    drawLevel(tp3,      '#00d4aa', 'TP3', [6, 3]);
    drawLevel(tp2,      '#00d4aa', 'TP2', [6, 3]);
    drawLevel(tp1,      '#00d4aa', 'TP1', [6, 3]);
    drawLevel(entry,    '#6c63ff', 'ENT', []);
    drawLevel(stopLoss, '#ff4d6d', 'SL',  [4, 3]);
    drawLevel(vwapVal,  '#ffd166', 'VWAP',[2, 2]);
    drawLevel(pocVal,   '#4cc9f0', 'POC', [2, 2]);

    // Candles
    slice.forEach((c, i) => {
      const x = PAD_L + i * stepX + stepX / 2;
      const isBull = c.close >= c.open;
      const color  = isBull ? '#00d4aa' : '#ff4d6d';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      // Body
      const bodyTop    = toY(Math.max(c.open, c.close));
      const bodyBottom = toY(Math.min(c.open, c.close));
      const bodyH = Math.max(1, bodyBottom - bodyTop);
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    });

    // X-axis timestamps (every ~16 candles)
    ctx.fillStyle = '#555577';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(slice.length / 5));
    for (let i = 0; i < slice.length; i += step) {
      const x = PAD_L + i * stepX + stepX / 2;
      const d = new Date(slice[i].time);
      const label = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:00`;
      ctx.fillText(label, x, H - 6);
    }
  }, [candles, entry, stopLoss, tp1, tp2, tp3, vwapVal, pocVal, direction]);

  if (candles.length === 0) return null;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
        <span className="text-xs font-semibold text-text-secondary">📈 1H Chart</span>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-accent inline-block" /> Entry</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-bear inline-block" style={{borderTop:'1px dashed #ff4d6d'}} /> SL</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px bg-bull inline-block" style={{borderTop:'1px dashed #00d4aa'}} /> TP</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px inline-block" style={{borderTop:'1px dashed #ffd166'}} /> VWAP</span>
          <span className="flex items-center gap-1"><span className="w-3 h-px inline-block" style={{borderTop:'1px dashed #4cc9f0'}} /> POC</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '320px', display: 'block' }}
      />
    </div>
  );
}
