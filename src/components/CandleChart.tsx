'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Candle } from '@/types';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
type TF = typeof TIMEFRAMES[number];

interface Props {
  candles: Candle[];   // initial 1h candles from analyse
  symbol: string;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  vwap?: number;
  poc?: number;
}

// ─── Indicator math ───────────────────────────────────────────────────────────
function ema(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = Array(data.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (prev === null) {
      // seed with SMA of first `period` values
      if (i + 1 >= period) {
        prev = data.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
      }
    } else {
      prev = data[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function bollingerBands(closes: number[], period = 20, mult = 2) {
  const mid: (number | null)[] = [];
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) { mid.push(null); upper.push(null); lower.push(null); continue; }
    const slice = closes.slice(i + 1 - period, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(slice.map(v => (v - avg) ** 2).reduce((a, b) => a + b, 0) / period);
    mid.push(avg); upper.push(avg + mult * sd); lower.push(avg - mult * sd);
  }
  return { mid, upper, lower };
}

function calcVwap(candles: Candle[]): (number | null)[] {
  let cumPV = 0, cumV = 0;
  return candles.map(c => {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV  += c.volume;
    return cumV === 0 ? null : cumPV / cumV;
  });
}

function pivotSR(candles: Candle[], lookback = 10): { supports: number[]; resistances: number[] } {
  const supports: number[] = [];
  const resistances: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const slice = candles.slice(i - lookback, i + lookback + 1);
    const low   = candles[i].low;
    const high  = candles[i].high;
    if (slice.every(c => c.low >= low))  supports.push(low);
    if (slice.every(c => c.high <= high)) resistances.push(high);
  }
  // deduplicate within 0.15% of each other
  function dedup(levels: number[]) {
    return levels.filter((l, i) => !levels.slice(0, i).some(p => Math.abs(p - l) / l < 0.0015));
  }
  return { supports: dedup(supports).slice(-4), resistances: dedup(resistances).slice(-4) };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CandleChart({ candles: initCandles, symbol, entry, stopLoss, tp1, tp2, tp3, vwap: vwapProp, poc: pocVal }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const crossRef   = useRef<HTMLCanvasElement>(null);  // crosshair overlay

  const [tf, setTf]         = useState<TF>('1h');
  const [candles, setCandles] = useState<Candle[]>(initCandles);
  const [loading, setLoading] = useState(false);

  const [tzAEST, setTzAEST] = useState(true);  // true = AEST/Melbourne, false = UTC

  // indicators visibility
  const [showEMA,  setShowEMA]  = useState(true);
  const [showBB,   setShowBB]   = useState(true);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showSR,   setShowSR]   = useState(true);
  const [showVol,  setShowVol]  = useState(true);

  // zoom / pan state (via ref to avoid re-render on every mouse move)
  const viewRef = useRef({ offset: 0, zoom: 1.0 });   // offset = candles scrolled from right
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const touchRef = useRef<{ dist: number; midX: number; offset: number } | null>(null);
  const crossPos = useRef<{ x: number; y: number } | null>(null);

  // fetch candles when TF changes
  useEffect(() => {
    if (tf === '1h') { setCandles(initCandles); return; }
    setLoading(true);
    fetch(`/api/candles?symbol=${symbol}&tf=${tf}&limit=300`)
      .then(r => r.json())
      .then(d => { if (d.candles) setCandles(d.candles); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tf, symbol, initCandles]);

  // ─── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d')!;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const PAD_L = 8, PAD_R = 68, PAD_T = 16, PAD_B = showVol ? 60 : 24;
    const chartH = H - PAD_T - PAD_B;
    const chartW = W - PAD_L - PAD_R;
    const volH   = showVol ? 30 : 0;
    const priceH  = chartH - volH;

    const { zoom, offset } = viewRef.current;
    const visibleCount = Math.min(candles.length, Math.max(10, Math.round(80 / zoom)));
    const startIdx     = Math.max(0, candles.length - visibleCount - Math.round(offset));
    const slice        = candles.slice(startIdx, startIdx + visibleCount);
    if (slice.length === 0) return;

    const closes  = candles.map(c => c.close);
    const allEma20  = ema(closes, 20);
    const allEma50  = ema(closes, 50);
    const allEma200 = ema(closes, 200);
    const allBB     = bollingerBands(closes, 20, 2);
    const allVwap   = calcVwap(candles);
    const { supports, resistances } = showSR ? pivotSR(candles, 8) : { supports: [], resistances: [] };

    const sliceEma20  = allEma20.slice(startIdx,  startIdx + visibleCount);
    const sliceEma50  = allEma50.slice(startIdx,  startIdx + visibleCount);
    const sliceEma200 = allEma200.slice(startIdx, startIdx + visibleCount);
    const sliceBBmid  = allBB.mid.slice(startIdx,   startIdx + visibleCount);
    const sliceBBup   = allBB.upper.slice(startIdx,  startIdx + visibleCount);
    const sliceBBlo   = allBB.lower.slice(startIdx,  startIdx + visibleCount);
    const sliceVwap   = allVwap.slice(startIdx,   startIdx + visibleCount);

    const highs = slice.map(c => c.high);
    const lows  = slice.map(c => c.low);

    // include levels in scale
    const levelPrices = [entry, stopLoss, tp1, tp2, tp3, vwapProp, pocVal].filter((p): p is number => p !== undefined);
    const indicatorPrices: number[] = [];
    if (showEMA) {
      sliceEma20.forEach(v => v !== null && indicatorPrices.push(v));
      sliceEma50.forEach(v => v !== null && indicatorPrices.push(v));
      sliceEma200.forEach(v => v !== null && indicatorPrices.push(v));
    }
    if (showBB) {
      sliceBBup.forEach(v => v !== null && indicatorPrices.push(v));
      sliceBBlo.forEach(v => v !== null && indicatorPrices.push(v));
    }

    const maxP = Math.max(...highs, ...levelPrices, ...indicatorPrices) * 1.001;
    const minP = Math.min(...lows,  ...levelPrices, ...indicatorPrices) * 0.999;
    const range = maxP - minP || 1;

    const toY  = (p: number) => PAD_T + priceH * (1 - (p - minP) / range);
    const stepX  = chartW / visibleCount;
    const candleW = Math.max(1, stepX * 0.6);

    // ── Background ──
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    // ── Grid ──
    ctx.strokeStyle = '#1a1a28';
    ctx.lineWidth = 0.5;
    const gridCount = 6;
    for (let i = 0; i <= gridCount; i++) {
      const y = PAD_T + (priceH / gridCount) * i;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      const price = maxP - (range / gridCount) * i;
      ctx.fillStyle = '#44446a';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(price > 100 ? 2 : 5), W - PAD_R + 4, y + 3);
    }
    // vertical grid every ~10 candles
    for (let i = 0; i < visibleCount; i += Math.max(1, Math.round(visibleCount / 6))) {
      const x = PAD_L + i * stepX + stepX / 2;
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + priceH); ctx.stroke();
    }

    // ── Helper: draw line series ──
    function drawSeries(values: (number | null)[], color: string, width = 1, dash: number[] = []) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      values.forEach((v, i) => {
        if (v === null) { started = false; return; }
        const x = PAD_L + i * stepX + stepX / 2;
        const y = toY(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── BB fill ──
    if (showBB) {
      ctx.save();
      ctx.fillStyle = 'rgba(108,99,255,0.06)';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < sliceBBup.length; i++) {
        const v = sliceBBup[i];
        if (v === null) { started = false; continue; }
        const x = PAD_L + i * stepX + stepX / 2;
        if (!started) { ctx.moveTo(x, toY(v)); started = true; } else ctx.lineTo(x, toY(v));
      }
      for (let i = sliceBBlo.length - 1; i >= 0; i--) {
        const v = sliceBBlo[i];
        if (v === null) continue;
        const x = PAD_L + i * stepX + stepX / 2;
        ctx.lineTo(x, toY(v));
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      drawSeries(sliceBBup, 'rgba(108,99,255,0.5)', 0.8, [3, 3]);
      drawSeries(sliceBBlo, 'rgba(108,99,255,0.5)', 0.8, [3, 3]);
      drawSeries(sliceBBmid, 'rgba(108,99,255,0.35)', 0.7, [2, 4]);
    }

    // ── S/R trendlines ──
    if (showSR) {
      supports.forEach(s => {
        const y = toY(s);
        if (y < PAD_T || y > PAD_T + priceH) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(0,212,170,0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,212,170,0.7)';
        ctx.font = 'bold 8px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`S ${s.toFixed(s > 100 ? 2 : 5)}`, W - PAD_R - 2, y - 2);
        ctx.restore();
      });
      resistances.forEach(r => {
        const y = toY(r);
        if (y < PAD_T || y > PAD_T + priceH) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,77,109,0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,77,109,0.7)';
        ctx.font = 'bold 8px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`R ${r.toFixed(r > 100 ? 2 : 5)}`, W - PAD_R - 2, y - 2);
        ctx.restore();
      });
    }

    // ── VWAP ──
    if (showVWAP) {
      drawSeries(sliceVwap, '#ffd166', 1, [3, 3]);
    }

    // ── EMAs ──
    if (showEMA) {
      drawSeries(sliceEma200, '#4cc9f0', 1.2);
      drawSeries(sliceEma50,  '#ffd166', 1);
      drawSeries(sliceEma20,  '#00d4aa', 1);
    }

    // ── Trade level lines ──
    function drawLevel(price: number | undefined, color: string, label: string, dash: number[] = [4, 3]) {
      if (price === undefined) return;
      const y = toY(price);
      if (y < PAD_T || y > PAD_T + priceH) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
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
    if (showVWAP) drawLevel(vwapProp, '#ffd166', 'VWAP', [2, 2]);
    drawLevel(pocVal,   '#4cc9f0', 'POC', [2, 2]);

    // ── Volume bars ──
    if (showVol) {
      const maxVol = Math.max(...slice.map(c => c.volume));
      const volBase = PAD_T + priceH + volH;
      slice.forEach((c, i) => {
        const x   = PAD_L + i * stepX;
        const bH  = (c.volume / maxVol) * (volH - 4);
        const isBull = c.close >= c.open;
        ctx.fillStyle = isBull ? 'rgba(0,212,170,0.35)' : 'rgba(255,77,109,0.35)';
        ctx.fillRect(x + 1, volBase - bH, stepX - 2, bH);
      });
      // vol label
      ctx.fillStyle = '#44446a';
      ctx.font = '8px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Vol', PAD_L + 2, PAD_T + priceH + 10);
    }

    // ── Candles ──
    slice.forEach((c, i) => {
      const x      = PAD_L + i * stepX + stepX / 2;
      const isBull = c.close >= c.open;
      const color  = isBull ? '#00d4aa' : '#ff4d6d';

      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      const bodyTop    = toY(Math.max(c.open, c.close));
      const bodyBottom = toY(Math.min(c.open, c.close));
      const bodyH = Math.max(1, bodyBottom - bodyTop);
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    });

    // ── X-axis timestamps ──
    ctx.fillStyle = '#44446a';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    const tz = tzAEST ? 'Australia/Melbourne' : 'UTC';
    const labelStep = Math.max(1, Math.floor(visibleCount / 6));
    for (let i = 0; i < slice.length; i += labelStep) {
      const x = PAD_L + i * stepX + stepX / 2;
      const ts = slice[i].time;
      let label: string;
      if (tf === '1d') {
        label = new Date(ts).toLocaleDateString('en-AU', { timeZone: tz, day: '2-digit', month: '2-digit' });
      } else {
        const hh = new Date(ts).toLocaleString('en-AU', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
        const dd = new Date(ts).toLocaleDateString('en-AU', { timeZone: tz, day: '2-digit', month: '2-digit' });
        label = `${dd} ${hh}`;
      }
      ctx.fillText(label, x, H - 6);
    }

    // ── EMA legend ──
    if (showEMA) {
      const items = [
        { label: 'EMA20', color: '#00d4aa' },
        { label: 'EMA50', color: '#ffd166' },
        { label: 'EMA200', color: '#4cc9f0' },
      ];
      let lx = PAD_L + 4;
      items.forEach(({ label, color }) => {
        ctx.fillStyle = color;
        ctx.font = 'bold 8px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, lx, PAD_T + 12);
        lx += ctx.measureText(label).width + 10;
      });
    }
  }, [candles, entry, stopLoss, tp1, tp2, tp3, vwapProp, pocVal, showEMA, showBB, showVWAP, showSR, showVol, tzAEST]);

  // redraw whenever state changes
  useEffect(() => { draw(); }, [draw]);

  // ─── Crosshair overlay ────────────────────────────────────────────────────
  const drawCrosshair = useCallback((clientX: number, clientY: number) => {
    const canvas = crossRef.current;
    const main   = canvasRef.current;
    if (!canvas || !main) return;
    const rect = main.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    crossPos.current = { x, y };

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // compute price at y
    const PAD_L = 8, PAD_R = 68, PAD_T = 16, PAD_B = showVol ? 60 : 24;
    const chartH = H - PAD_T - PAD_B;
    const volH   = showVol ? 30 : 0;
    const priceH  = chartH - volH;
    const { zoom, offset } = viewRef.current;
    const visibleCount = Math.min(candles.length, Math.max(10, Math.round(80 / zoom)));
    const startIdx = Math.max(0, candles.length - visibleCount - Math.round(offset));
    const slice    = candles.slice(startIdx, startIdx + visibleCount);
    if (slice.length === 0) return;
    const highs = slice.map(c => c.high);
    const lows  = slice.map(c => c.low);
    const maxP = Math.max(...highs) * 1.001;
    const minP = Math.min(...lows)  * 0.999;
    const range = maxP - minP || 1;

    const price = maxP - ((y - PAD_T) / priceH) * range;
    const stepX = (W - PAD_L - PAD_R) / visibleCount;
    const candleIdx = Math.floor((x - PAD_L) / stepX);
    const hoverCandle = slice[candleIdx];

    ctx.save();
    ctx.strokeStyle = 'rgba(150,150,200,0.4)';
    ctx.lineWidth = 0.7;
    ctx.setLineDash([4, 4]);

    // vertical line
    ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + priceH); ctx.stroke();
    // horizontal line
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();

    ctx.setLineDash([]);

    // price tag on right axis
    const tagW = 62, tagH = 14;
    const ty = Math.max(PAD_T + 7, Math.min(PAD_T + priceH - 7, y));
    ctx.fillStyle = '#6c63ff';
    ctx.fillRect(W - PAD_R + 2, ty - 7, tagW, tagH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    const priceLabel = price > 0 ? price.toFixed(price > 100 ? 2 : 5) : '';
    ctx.fillText(priceLabel, W - PAD_R + 5, ty + 3);

    // OHLC tooltip
    if (hoverCandle) {
      const isBull = hoverCandle.close >= hoverCandle.open;
      const bx = Math.min(x + 8, W - 130);
      const by = Math.min(y - 60, H - 70);
      ctx.fillStyle = 'rgba(18,18,26,0.92)';
      ctx.strokeStyle = isBull ? '#00d4aa' : '#ff4d6d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, 120, 60, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#aaaacc';
      ctx.font = '8px JetBrains Mono, monospace';
      const dp = hoverCandle.close > 100 ? 2 : 5;
      const lines = [
        `O ${hoverCandle.open.toFixed(dp)}   C ${hoverCandle.close.toFixed(dp)}`,
        `H ${hoverCandle.high.toFixed(dp)}   L ${hoverCandle.low.toFixed(dp)}`,
        `Vol ${hoverCandle.volume.toFixed(2)}`,
        new Date(hoverCandle.time).toLocaleString('en-AU', { timeZone: tzAEST ? 'Australia/Melbourne' : 'UTC', dateStyle: 'short', timeStyle: 'short' }),
      ];
      lines.forEach((l, li) => {
        ctx.fillStyle = li === 0 ? (isBull ? '#00d4aa' : '#ff4d6d') : '#aaaacc';
        ctx.fillText(l, bx + 6, by + 14 + li * 13);
      });
    }

    ctx.restore();
  }, [candles, showVol]);

  const clearCrosshair = useCallback(() => {
    const canvas = crossRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    crossPos.current = null;
  }, []);

  // ─── Native DOM events (must be non-passive to allow preventDefault) ─────────
  const eventDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = eventDivRef.current;
    if (!el) return;

    // ── wheel: non-passive so preventDefault stops page scroll ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const delta = e.deltaY > 0 ? 0.85 : 1.18;
      v.zoom = Math.min(8, Math.max(0.2, v.zoom * delta));
      draw();
    };

    // ── mouse drag ──
    const onMouseDown = (e: MouseEvent) => {
      dragRef.current = { startX: e.clientX, startOffset: viewRef.current.offset };
    };
    const onMouseMove = (e: MouseEvent) => {
      drawCrosshair(e.clientX, e.clientY);
      if (!dragRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { zoom } = viewRef.current;
      const visibleCount = Math.max(10, Math.round(80 / zoom));
      const stepX = (canvas.offsetWidth - 76) / visibleCount;
      const dx = e.clientX - dragRef.current.startX;
      viewRef.current.offset = Math.max(0, Math.min(
        candles.length - visibleCount,
        dragRef.current.startOffset - dx / stepX,
      ));
      draw();
    };
    const onMouseUp   = () => { dragRef.current = null; };
    const onMouseLeave = () => { dragRef.current = null; clearCrosshair(); };

    // ── touch: non-passive so we can prevent default scroll ──
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchRef.current = {
          dist: Math.hypot(dx, dy),
          midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          offset: viewRef.current.offset,
        };
        dragRef.current = null;
      } else if (e.touches.length === 1) {
        dragRef.current = { startX: e.touches[0].clientX, startOffset: viewRef.current.offset };
        touchRef.current = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (e.touches.length === 2 && touchRef.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        viewRef.current.zoom = Math.min(8, Math.max(0.2, viewRef.current.zoom * (dist / touchRef.current.dist)));
        touchRef.current.dist = dist;
        draw();
      } else if (e.touches.length === 1 && dragRef.current) {
        const { zoom } = viewRef.current;
        const visibleCount = Math.max(10, Math.round(80 / zoom));
        const stepX = (canvas.offsetWidth - 76) / visibleCount;
        const dx = e.touches[0].clientX - dragRef.current.startX;
        viewRef.current.offset = Math.max(0, Math.min(
          candles.length - visibleCount,
          dragRef.current.startOffset - dx / stepX,
        ));
        draw();
      }
    };
    const onTouchEnd = () => { dragRef.current = null; touchRef.current = null; };

    el.addEventListener('wheel',      onWheel,      { passive: false });
    el.addEventListener('mousedown',  onMouseDown);
    el.addEventListener('mousemove',  onMouseMove);
    el.addEventListener('mouseup',    onMouseUp);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd);

    return () => {
      el.removeEventListener('wheel',      onWheel);
      el.removeEventListener('mousedown',  onMouseDown);
      el.removeEventListener('mousemove',  onMouseMove);
      el.removeEventListener('mouseup',    onMouseUp);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [draw, drawCrosshair, clearCrosshair, candles.length]);

  if (candles.length === 0 && !loading) return null;

  const INDICATORS = [
    { key: 'ema',  label: 'EMA', color: '#00d4aa', state: showEMA,  set: setShowEMA },
    { key: 'bb',   label: 'BB',  color: '#6c63ff', state: showBB,   set: setShowBB  },
    { key: 'vwap', label: 'VWAP',color: '#ffd166', state: showVWAP, set: setShowVWAP},
    { key: 'sr',   label: 'S/R', color: '#ff4d6d', state: showSR,   set: setShowSR  },
    { key: 'vol',  label: 'Vol', color: '#888',    state: showVol,  set: setShowVol },
  ];

  return (
    <div style={{ background: '#0a0a0f', borderRadius: 12, overflow: 'hidden', border: '1px solid #1e1e2e' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #1e1e2e', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7070a0', marginRight: 4 }}>📈</span>

        {/* TF switcher */}
        <div style={{ display: 'flex', gap: 2, background: '#12121a', borderRadius: 6, padding: 2 }}>
          {TIMEFRAMES.map(t => (
            <button
              key={t}
              onClick={() => { setTf(t); viewRef.current = { offset: 0, zoom: 1 }; }}
              style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: tf === t ? '#6c63ff' : 'transparent',
                color: tf === t ? '#fff' : '#7070a0',
                border: 'none', cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Indicator toggles */}
        <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
          {INDICATORS.map(ind => (
            <button
              key={ind.key}
              onClick={() => ind.set(!ind.state)}
              style={{
                fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                background: ind.state ? `${ind.color}22` : 'transparent',
                color: ind.state ? ind.color : '#44446a',
                border: `1px solid ${ind.state ? ind.color + '55' : '#1e1e2e'}`,
                cursor: 'pointer',
              }}
            >
              {ind.label}
            </button>
          ))}
        </div>

        {/* Timezone toggle */}
        <button
          onClick={() => setTzAEST(z => !z)}
          style={{
            fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
            background: '#12121a', color: tzAEST ? '#ffd166' : '#7070a0',
            border: '1px solid #2a2a3e', cursor: 'pointer',
          }}
        >
          {tzAEST ? '🕐 AEST' : '🌐 UTC'}
        </button>

        {/* Zoom reset */}
        <button
          onClick={() => { viewRef.current = { offset: 0, zoom: 1 }; draw(); }}
          style={{ marginLeft: 'auto', fontSize: 9, color: '#44446a', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          ↺ Reset
        </button>

        {loading && <span style={{ fontSize: 9, color: '#6c63ff' }}>Loading…</span>}
      </div>

      {/* Canvas container */}
      <div style={{ position: 'relative', touchAction: 'none', cursor: 'crosshair' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '360px', display: 'block' }}
        />
        {/* Crosshair overlay */}
        <canvas
          ref={crossRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
        {/* Event capture div — all listeners attached via useEffect as non-passive */}
        <div ref={eventDivRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '6px 12px', borderTop: '1px solid #1e1e2e' }}>
        {[
          { label: 'Entry', color: '#6c63ff' },
          { label: 'SL',    color: '#ff4d6d', dashed: true },
          { label: 'TP',    color: '#00d4aa', dashed: true },
          ...(showEMA  ? [{ label: 'EMA20', color: '#00d4aa' }, { label: 'EMA50', color: '#ffd166' }, { label: 'EMA200', color: '#4cc9f0' }] : []),
          ...(showBB   ? [{ label: 'BB',    color: '#6c63ff', dashed: true }] : []),
          ...(showVWAP ? [{ label: 'VWAP',  color: '#ffd166', dashed: true }] : []),
          ...(showSR   ? [{ label: 'Supp',  color: '#00d4aa', dashed: true }, { label: 'Res', color: '#ff4d6d', dashed: true }] : []),
        ].map(item => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#7070a0' }}>
            <span style={{ width: 16, height: 1, background: item.color, display: 'inline-block', borderTop: item.dashed ? `1px dashed ${item.color}` : undefined }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
