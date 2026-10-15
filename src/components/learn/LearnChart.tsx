import React, { useEffect, useRef, useState } from 'react';
import { candles, priorBars, clock, type Tick } from '@/lib/learn/market';
export default function LearnChart({ ticks, second }: { ticks: Tick[]; second: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [selected, setSelected] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  const rows = [...priorBars, ...candles(ticks, second)];
  const index = Math.min(selected ?? rows.length - 1, rows.length - 1);
  const inspected = rows[index];
  const min = Math.min(...rows.map(b => b.low)) - .15, max = Math.max(...rows.map(b => b.high)) + .15;
  const plot = Math.max(160, width - 64), height = 265;
  const y = (p: number) => 15 + (max - p) / (max - min) * 190;
  const step = (plot - 16) / Math.max(18, rows.length), body = Math.max(3, Math.min(16, step * .65));
  const timestamp = new Date(inspected.bar_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const hitIndex = (clientX: number, element: SVGSVGElement) => Math.max(0, Math.min(rows.length - 1, Math.round(((clientX - element.getBoundingClientRect().left) * width / element.getBoundingClientRect().width - 12) / step)));
  return <div ref={ref} className="w-full min-w-0">
    <div className="learn-candle-readout" aria-live={pinned ? 'polite' : 'off'} data-testid="candle-readout">
      <span>{index < priorBars.length ? 'Prior session' : 'Today'} · {timestamp} · {inspected.complete ? 'Closed' : 'Forming'}{pinned ? ' · Pinned' : ''}</span>
      <dl>{[['Open', inspected.open.toFixed(2)], ['High', inspected.high.toFixed(2)], ['Low', inspected.low.toFixed(2)], [inspected.complete ? 'Close' : 'Current', inspected.close.toFixed(2)], ['Volume', inspected.volume.toLocaleString('en-US')]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" tabIndex={0}
      aria-label={`SIM five-minute candle inspector through ${clock(second)}. Hover or tap a candle. Use left and right arrow keys to inspect candles.`}
      onMouseMove={e => { if (!pinned) setSelected(hitIndex(e.clientX, e.currentTarget)); }}
      onMouseLeave={() => { if (!pinned) setSelected(null); }}
      onClick={e => { setSelected(hitIndex(e.clientX, e.currentTarget)); setPinned(true); }}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setSelected(Math.max(0, Math.min(rows.length - 1, index + (e.key === 'ArrowLeft' ? -1 : 1)))); setPinned(true); } if (e.key === 'Escape') { setPinned(false); setSelected(null); } }}>
      {[0, 1, 2, 3, 4].map(i => { const p = min + (max - min) * i / 4; return <g key={i}><line x1={8} x2={plot} y1={y(p)} y2={y(p)} stroke="#dce6f0"/><text x={plot + 5} y={y(p) + 4} fill="#4a6078" fontSize="11">{p.toFixed(2)}</text></g>; })}
      <line x1={12 + index * step} x2={12 + index * step} y1="8" y2="240" stroke="#4a6078" strokeDasharray="3 4"/>
      {rows.map((b, i) => { const x = 12 + i * step, up = b.close >= b.open; return <g key={b.bar_time} opacity={i < priorBars.length ? .6 : 1}><line x1={x} x2={x} y1={y(b.high)} y2={y(b.low)} stroke={up ? '#168451' : '#c23b3b'}/><rect x={x - body / 2} y={Math.min(y(b.open), y(b.close))} width={body} height={Math.max(1.5, Math.abs(y(b.open) - y(b.close)))} fill={up ? '#168451' : '#c23b3b'}/><rect x={x - body / 2} y={238 - b.volume / Math.max(...rows.map(r => r.volume)) * 22} width={body} height={b.volume / Math.max(...rows.map(r => r.volume)) * 22} fill="#a8bbd0"/></g>; })}
      <line x1={12 + (priorBars.length - .5) * step} x2={12 + (priorBars.length - .5) * step} y1="8" y2="240" stroke="#6d8299" strokeDasharray="3 4"/>
      <text x="8" y="259" fill="#4a6078" fontSize="11">Prior session</text><text x={Math.max(100, plot - 112)} y="259" fill="#4a6078" fontSize="11">Today · {clock(second)}</text>
    </svg>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400"><span>Hover or tap to inspect · Arrow keys when focused · Green up / red down</span>{pinned && <button onClick={() => { setPinned(false); setSelected(null); }}>Follow current candle</button>}</div>
    <details className="mt-2 text-xs text-zinc-400"><summary>What does OHLCV mean?</summary>Open is the first price in the candle, high and low are its extremes, close is its final price, and volume is the number of simulated shares traded. A forming candle shows the current price and volume so far.</details>
  </div>;
}
