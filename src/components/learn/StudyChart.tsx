import React, { useEffect, useState } from 'react';
import type { StudyBar } from '@/lib/learn/patterns';
import MarketClassChart from './MarketClassChart';
type Props = { bars?: StudyBar[]; points?: number[]; focus?: number; title: string; labels?: boolean; levels?: { price: number; label: string }[]; average?: boolean; compact?: boolean; simpleInspection?: boolean };
export default function StudyChart(props:Props) {
 if(props.points && !props.compact){
  const points=props.points, bars:StudyBar[]=[];
  for(let i=1;i<points.length;i++)for(let step=0;step<4;step++){const open=points[i-1]+(points[i]-points[i-1])*step/4,close=points[i-1]+(points[i]-points[i-1])*(step+1)/4;bars.push({open,close,high:Math.max(open,close)+.12,low:Math.min(open,close)-.12,volume:Math.round(300+Math.abs(close-open)*1000+step*70)});}
  return <MarketClassChart bars={bars} title={props.title} levels={props.levels} persistKey={'formation:'+points.join(',')}/>;
 }
 return <SchematicCandleChart {...props}/>;
}
function SchematicCandleChart({ bars, points, focus = -1, title, labels = true, levels = [], average = false, compact = false, simpleInspection = false }:Props) {
 const [selected, setSelected] = useState<number | null>(null);
 const [progress, setProgress] = useState(1);
 const [playing, setPlaying] = useState(false);
 useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setProgress(value => { const next = Math.min(1, value + .025); return next; }), 200); return () => window.clearInterval(timer); }, [playing]);
 useEffect(() => { if (progress >= 1) setPlaying(false); }, [progress]);
 const observed = bars?.map((value, i) => {
  if (i !== bars.length - 1 || progress >= 1) return value;
  // A fixed original tick path; high/low include only the path revealed so far.
  const path = [value.open,value.low,value.high,value.close], stage = Math.min(2,Math.floor(progress * 3)), local = progress * 3 - stage;
  const close = path[stage] + (path[stage + 1] - path[stage]) * local, seen = [...path.slice(0,stage + 1),close];
  return {...value,close,high:Math.max(...seen),low:Math.min(...seen),volume:Math.round(value.volume * progress)};
 });
 const values = observed ? observed.flatMap(value => [value.low,value.high]) : points ?? [0,1];
 const min = Math.min(...values,...levels.map(level=>level.price)) - .8, max = Math.max(...values,...levels.map(level=>level.price)) + .8;
 const y = (price: number) => 218 - (price - min) / (max - min) * 180;
 const count = observed?.length ?? points?.length ?? 1, x = (i: number) => 45 + (i + .5) * 490 / count;
 const active = Math.min(selected ?? count - 1,count - 1), candle = observed?.[active];
 let total = 0, weighted = 0;
 const vwap = observed?.map(value => { total += value.volume; weighted += ((value.high + value.low + value.close) / 3) * value.volume; return total ? weighted / total : value.close; });
 return <figure className={`learn-study-chart${compact ? ' learn-study-chart-compact' : ''}`}>
  <figcaption className={compact ? 'sr-only' : undefined}>{title}</figcaption>
  <svg viewBox="0 0 600 265" role="img" tabIndex={simpleInspection ? 0 : undefined} aria-label={simpleInspection ? `${title}. Tap a candle or use left and right arrow keys to inspect.` : title} onKeyDown={event=>{if(!simpleInspection || !['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();setSelected(Math.max(0,Math.min(count-1,active+(event.key==='ArrowRight'?1:-1))));}}>
   {[min + (max-min)*.25,min + (max-min)*.5,min + (max-min)*.75].map(value=><g key={value}><line x1="36" x2="545" y1={y(value)} y2={y(value)} stroke="#d9e4ef"/><text x="550" y={y(value)+4}>{value.toFixed(1)}</text></g>)}
   {observed?.map((value,i)=><g key={i} opacity={focus >= 0 && i < focus ? .45 : 1}><line x1={x(i)} x2={x(i)} y1={y(value.high)} y2={y(value.low)} stroke={value.close >= value.open ? '#168451' : '#c23b3b'} strokeWidth="2"/><rect x={x(i)-Math.min(16,150/count)} y={y(Math.max(value.open,value.close))} width={Math.min(32,300/count)} height={Math.max(2,Math.abs(y(value.close)-y(value.open)))} fill={value.close >= value.open ? '#b9e8cd' : '#f5c2bf'} stroke={value.close >= value.open ? '#168451' : '#c23b3b'} strokeWidth="2"/>{labels && focus === i && <text x={x(i)} y="25" textAnchor="middle">Pattern begins</text>}</g>)}
   {points && <polyline points={points.map((price,i)=>`${x(i)},${y(price)}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth="3"/>}
   {average && vwap && <polyline points={vwap.map((price,i)=>`${x(i)},${y(price)}`).join(' ')} fill="none" stroke="#7c3aed" strokeWidth="2" strokeDasharray="6 4"/>}
   {labels && levels.map(level=><g key={level.label}><line x1="36" x2="545" y1={y(level.price)} y2={y(level.price)} stroke="#64748b" strokeDasharray="5 4"/><text x="38" y={y(level.price)-6}>{level.label}</text></g>)}
   <line x1={x(active)} x2={x(active)} y1="35" y2="225" stroke="#7195bf" strokeDasharray="3 4"/>
   {Array.from({length:count},(_,i)=><g key={i}><text x={x(i)} y="248" textAnchor="middle">{i+1}</text><rect x={x(i)-245/count} y="34" width={490/count} height="195" fill="transparent" onMouseEnter={()=>setSelected(i)} onClick={()=>setSelected(i)}/></g>)}
  </svg>
  {!simpleInspection && <label className="learn-chart-inspector">Inspect {bars ? 'candle' : 'point'}<select value={active} onChange={event=>setSelected(Number(event.target.value))}>{Array.from({length:count},(_,i)=><option key={i} value={i}>{i+1}{focus >= 0 && i >= focus ? ' · formation' : ''}</option>)}</select></label>}
  <p className="learn-chart-values" aria-live="polite">{candle ? `Candle ${active+1} · Open ${candle.open.toFixed(2)} · High ${candle.high.toFixed(2)} · Low ${candle.low.toFixed(2)} · ${progress < 1 && active === count-1 ? 'Current' : 'Close'} ${candle.close.toFixed(2)} · Volume ${candle.volume}${average && vwap ? ` · VWAP approx. ${vwap[active].toFixed(2)}` : ''}` : `Point ${active+1} · Price ${points?.[active].toFixed(2)}`}</p>
  {bars && !simpleInspection && <div className="flex flex-wrap items-center gap-2"><button onClick={()=>{ if(progress >= 1) setProgress(0); setSelected(count-1); setPlaying(value=>!value); }}>{playing ? 'Pause candle' : progress < 1 ? 'Resume candle' : 'Watch last candle form'}</button><span className="text-sm">{progress < 1 ? 'Last candle forming; its final shape is not known yet.' : 'All displayed candles closed.'}</span></div>}
  <p className={compact ? 'sr-only' : 'learn-chart-caption'}>Original schematic example · Equal time intervals · Hover, tap or use the inspector. {average ? 'Dashed purple line: cumulative typical-price × volume approximation of VWAP.' : bars ? 'Green: close above open. Red: close below open.' : 'The line connects observed swings; it does not show every candle.'}</p>
 </figure>;
}
