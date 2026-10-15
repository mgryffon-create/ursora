import React, { useEffect, useRef, useState } from 'react';
import { candles, priorBars, clock, type Tick } from '@/lib/learn/market';
export default function LearnChart({ ticks, second }: { ticks: Tick[]; second: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  const rows = [...priorBars, ...candles(ticks, second)];
  const min = Math.min(...rows.map(b => b.low)) - .15, max = Math.max(...rows.map(b => b.high)) + .15;
  const plot = Math.max(180, width - 62), height = 285;
  const y = (p: number) => 20 + (max - p) / (max - min) * 210;
  const step = plot / Math.max(18, rows.length), body = Math.max(3, Math.min(16, step * .65));
  return <div ref={ref} className="w-full min-w-0"><svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`SIM five-minute candles through ${clock(second)}. Last candle is forming. Prior session shown at left.`}>
    {[0, 1, 2, 3, 4].map(i => { const p = min + (max - min) * i / 4; return <g key={i}><line x1={8} x2={plot} y1={y(p)} y2={y(p)} stroke="#27272a"/><text x={plot + 5} y={y(p) + 4} fill="#a1a1aa" fontSize="11">{p.toFixed(2)}</text></g>; })}
    {rows.map((b, i) => { const x = 12 + i * step, up = b.close >= b.open; return <g key={b.bar_time} opacity={i < priorBars.length ? .5 : 1}><line x1={x} x2={x} y1={y(b.high)} y2={y(b.low)} stroke={up ? '#34d399' : '#fb7185'}/><rect x={x - body / 2} y={Math.min(y(b.open), y(b.close))} width={body} height={Math.max(1.5, Math.abs(y(b.open) - y(b.close)))} fill={up ? '#34d399' : '#fb7185'}/><rect x={x - body / 2} y={260 - b.volume / Math.max(...rows.map(r => r.volume)) * 24} width={body} height={b.volume / Math.max(...rows.map(r => r.volume)) * 24} fill="#52525b"/></g>; })}
    <line x1={12 + (priorBars.length - .5) * step} x2={12 + (priorBars.length - .5) * step} y1="15" y2="260" stroke="#71717a" strokeDasharray="3 4"/>
    <text x="8" y="280" fill="#a1a1aa" fontSize="11">Prior session</text><text x={Math.max(100, plot - 112)} y="280" fill="#a1a1aa" fontSize="11">Today · {clock(second)}</text>
  </svg><div className="text-xs text-zinc-400">Green: close above open · Red: close below open · Bars below: volume · Last candle is forming</div></div>;
}
