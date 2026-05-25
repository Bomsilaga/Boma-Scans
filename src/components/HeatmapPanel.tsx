'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';

interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
}

interface ScanTier {
  symbol: string;
  tier: 'A+' | 'A' | 'B';
  direction: 'LONG' | 'SHORT';
  totalScore: number;
}

type SizeBy   = 'volume' | 'equal';
type ColourBy = 'change' | 'direction';
type Filter   = 'ALL' | 'LONG' | 'SHORT' | 'gainers' | 'losers';
type SortBy   = 'volume' | 'change_asc' | 'change_desc' | 'alpha';

// Map change% to a background colour
function changeColour(pct: number, dimmed = false): string {
  const abs = Math.min(Math.abs(pct), 15);
  const intensity = Math.round((abs / 15) * 200);
  const alpha = dimmed ? 0.35 : 1;
  if (pct >= 0) return `rgba(0,${100 + intensity},${80},${alpha})`;
  return `rgba(${120 + intensity},0,${40},${alpha})`;
}

function directionColour(dir: 'LONG' | 'SHORT' | undefined, dimmed = false): string {
  const alpha = dimmed ? 0.3 : 1;
  if (dir === 'LONG')  return `rgba(0,180,120,${alpha})`;
  if (dir === 'SHORT') return `rgba(200,40,60,${alpha})`;
  return `rgba(40,40,60,${alpha})`;
}

function TierBadge({ tier }: { tier: string }) {
  const c = tier === 'A+' ? '#00d4aa' : tier === 'A' ? '#7bc67e' : '#ffd166';
  return (
    <span style={{ fontSize: 8, fontWeight: 900, color: c, lineHeight: 1 }}>{tier}</span>
  );
}

interface TileProps {
  t: Ticker;
  size: number;
  scanData?: ScanTier;
  colourBy: ColourBy;
  onSelect: (sym: string) => void;
}

function Tile({ t, size, scanData, colourBy, onSelect }: TileProps) {
  const bg = colourBy === 'direction'
    ? directionColour(scanData?.direction, !scanData)
    : changeColour(t.change24h);

  const fontSize = size < 48 ? 7 : size < 72 ? 9 : size < 100 ? 10 : 12;
  const label = t.symbol.replace('USDT', '');

  return (
    <div
      onClick={() => onSelect(t.symbol)}
      title={`${t.symbol}  ${t.change24h >= 0 ? '+' : ''}${t.change24h.toFixed(2)}%  Vol $${(t.volume24h / 1e6).toFixed(0)}M`}
      style={{
        width: size, height: size,
        background: bg,
        border: scanData ? '1.5px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', userSelect: 'none',
        overflow: 'hidden', flexShrink: 0,
        transition: 'opacity 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {scanData && (
        <div style={{ position: 'absolute', top: 2, right: 2 }}>
          <TierBadge tier={scanData.tier} />
        </div>
      )}
      {size >= 36 && (
        <span style={{ fontSize, fontWeight: 700, color: '#fff', lineHeight: 1.2, textAlign: 'center', padding: '0 2px', wordBreak: 'break-all' }}>
          {label}
        </span>
      )}
      {size >= 52 && (
        <span style={{ fontSize: fontSize - 1, color: 'rgba(255,255,255,0.8)', lineHeight: 1.1 }}>
          {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

interface Props {
  onSelect: (symbol: string) => void;
  aiProvider?: string;
  aiApiKey?: string;
}

export default function HeatmapPanel({ onSelect }: Props) {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [scanOverlay, setScanOverlay] = useState<ScanTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizeBy,   setSizeBy]   = useState<SizeBy>('volume');
  const [colourBy, setColourBy] = useState<ColourBy>('change');
  const [filter,   setFilter]   = useState<Filter>('ALL');
  const [sortBy,   setSortBy]   = useState<SortBy>('volume');
  const [search,   setSearch]   = useState('');

  const loadTickers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/heatmap');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { tickers: Ticker[] };
      setTickers(data.tickers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTickers(); }, [loadTickers]);

  async function runScanOverlay() {
    setScanning(true);
    try {
      const res = await fetch('/api/scan');
      if (!res.ok) return;
      const data = await res.json() as { results: ScanTier[] };
      setScanOverlay(data.results ?? []);
      setColourBy('direction');
    } finally {
      setScanning(false);
    }
  }

  const scanMap = useMemo(() => {
    const m: Record<string, ScanTier> = {};
    for (const s of scanOverlay) m[s.symbol] = s;
    return m;
  }, [scanOverlay]);

  const maxVol = useMemo(() => Math.max(...tickers.map(t => t.volume24h), 1), [tickers]);

  const filtered = useMemo(() => {
    let list = [...tickers];

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(t => t.symbol.includes(q));
    }

    if (filter === 'gainers')  list = list.filter(t => t.change24h > 0);
    if (filter === 'losers')   list = list.filter(t => t.change24h < 0);
    if (filter === 'LONG')     list = list.filter(t => scanMap[t.symbol]?.direction === 'LONG');
    if (filter === 'SHORT')    list = list.filter(t => scanMap[t.symbol]?.direction === 'SHORT');

    list.sort((a, b) => {
      if (sortBy === 'volume')      return b.volume24h - a.volume24h;
      if (sortBy === 'change_desc') return b.change24h - a.change24h;
      if (sortBy === 'change_asc')  return a.change24h - b.change24h;
      return a.symbol.localeCompare(b.symbol);
    });

    return list;
  }, [tickers, filter, sortBy, search, scanMap]);

  // Tile sizing
  function tileSize(t: Ticker): number {
    if (sizeBy === 'equal') return 64;
    const ratio = t.volume24h / maxVol;
    return Math.max(32, Math.min(120, Math.round(32 + ratio * 88)));
  }

  const gainers = tickers.filter(t => t.change24h > 0).length;
  const losers  = tickers.filter(t => t.change24h < 0).length;
  const avgChange = tickers.length
    ? tickers.reduce((s, t) => s + t.change24h, 0) / tickers.length
    : 0;

  return (
    <div className="space-y-3 animate-slide-up">
      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              🗺️ Market Heatmap
              <span className="text-xs font-normal text-text-muted bg-muted px-2 py-0.5 rounded-full">
                All USDT pairs · KuCoin
              </span>
            </h2>
            {!loading && tickers.length > 0 && (
              <div className="flex gap-3 mt-1 text-xs">
                <span className="text-bull">🟢 {gainers} up</span>
                <span className="text-bear">🔴 {losers} down</span>
                <span className={avgChange >= 0 ? 'text-bull' : 'text-bear'}>
                  Avg {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
                </span>
                <span className="text-text-muted">{tickers.length} pairs</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={runScanOverlay}
              disabled={scanning || loading}
              className="btn-primary flex items-center gap-1.5 h-9 text-sm"
            >
              {scanning
                ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                : '🔍'}
              {scanning ? 'Scanning…' : scanOverlay.length > 0 ? `Overlay (${scanOverlay.length})` : 'Signal Overlay'}
            </button>
            <button onClick={loadTickers} disabled={loading} className="text-xs px-3 h-9 rounded-lg bg-muted text-text-secondary hover:text-text-primary">
              {loading ? '…' : '↺'}
            </button>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap gap-3 items-center">
        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value.toUpperCase())}
          placeholder="Search symbol…"
          className="input text-xs py-1 h-7 w-32"
        />

        {/* Size by */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Size:</span>
          {(['volume', 'equal'] as SizeBy[]).map(s => (
            <button key={s} onClick={() => setSizeBy(s)}
              className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${sizeBy === s ? 'bg-accent/10 text-accent' : 'bg-muted text-text-muted hover:text-text-secondary'}`}>
              {s === 'volume' ? 'Volume' : 'Equal'}
            </button>
          ))}
        </div>

        {/* Colour by */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Colour:</span>
          {(['change', 'direction'] as ColourBy[]).map(c => (
            <button key={c} onClick={() => setColourBy(c)}
              disabled={c === 'direction' && scanOverlay.length === 0}
              className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors disabled:opacity-30 ${colourBy === c ? 'bg-accent/10 text-accent' : 'bg-muted text-text-muted hover:text-text-secondary'}`}>
              {c === 'change' ? '24h %' : 'Trend'}
            </button>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Show:</span>
          {(['ALL', 'gainers', 'losers', 'LONG', 'SHORT'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              disabled={(f === 'LONG' || f === 'SHORT') && scanOverlay.length === 0}
              className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors disabled:opacity-30 ${
                filter === f
                  ? f === 'LONG' || f === 'gainers' ? 'bg-bull/10 text-bull'
                  : f === 'SHORT' || f === 'losers' ? 'bg-bear/10 text-bear'
                  : 'bg-accent/10 text-accent'
                  : 'bg-muted text-text-muted hover:text-text-secondary'
              }`}>
              {f}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Sort:</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className="input text-[10px] py-0.5 h-6 w-auto">
            <option value="volume">Volume ↓</option>
            <option value="change_desc">Gainers first</option>
            <option value="change_asc">Losers first</option>
            <option value="alpha">A–Z</option>
          </select>
        </div>

        <span className="text-[10px] text-text-muted">{filtered.length} shown</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 items-center text-[10px] text-text-muted px-1">
        {colourBy === 'change' ? (
          <>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: changeColour(10) }} /> Strong gain</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: changeColour(2) }} /> Mild gain</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: changeColour(-2) }} /> Mild loss</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: changeColour(-10) }} /> Strong loss</span>
            <span className="ml-2">· Tile size = 24h volume</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: directionColour('LONG') }} /> LONG signal</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: directionColour('SHORT') }} /> SHORT signal</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: directionColour(undefined) }} /> No signal</span>
            <span className="ml-2">· Border = A+/A/B tier</span>
          </>
        )}
      </div>

      {error && <div className="card border border-bear/30 bg-bear/5 text-bear text-sm">❌ {error}</div>}

      {loading && (
        <div className="card flex items-center justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      )}

      {/* Heatmap tiles */}
      {!loading && filtered.length > 0 && (
        <div
          className="card p-3"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignContent: 'flex-start', minHeight: 200 }}
        >
          {filtered.map(t => (
            <Tile
              key={t.symbol}
              t={t}
              size={tileSize(t)}
              scanData={scanMap[t.symbol]}
              colourBy={colourBy}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="card text-center py-12 text-text-muted text-sm">No coins match current filters.</div>
      )}

      {/* Scan overlay summary */}
      {scanOverlay.length > 0 && (
        <div className="card border border-accent/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-primary">📡 Signal Overlay — {scanOverlay.length} signals</span>
            <button onClick={() => { setScanOverlay([]); setColourBy('change'); }} className="text-[10px] text-text-muted hover:text-bear">✕ Clear</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scanOverlay.slice(0, 20).map(s => (
              <button
                key={s.symbol}
                onClick={() => onSelect(s.symbol)}
                className={`text-[10px] px-2 py-0.5 rounded font-bold border transition-all hover:opacity-80 ${
                  s.direction === 'LONG'
                    ? 'bg-bull/10 text-bull border-bull/30'
                    : 'bg-bear/10 text-bear border-bear/30'
                }`}
              >
                {s.symbol.replace('USDT', '')} {s.tier} {s.totalScore}
              </button>
            ))}
            {scanOverlay.length > 20 && <span className="text-[10px] text-text-muted self-center">+{scanOverlay.length - 20} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}
