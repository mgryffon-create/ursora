import React from 'react';
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Bar, ChartHorizon } from '@/lib/types';
import { isMissing } from '@/lib/format';
import { Unavailable } from '@/components/common/Primitives';

export interface KeyLevel {
  value: number | null | undefined;
  label: string;
  color: string;
  dash?: string;
}

const axisStyle = { fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' };

const TooltipBox: React.FC<{ active?: boolean; payload?: { payload: Bar }[]; horizon?: ChartHorizon }> = ({ active, payload, horizon = '1M' }) => {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-sm border border-zinc-700 bg-[#0b0d10]/95 p-2 font-mono text-[10px] text-zinc-300 shadow-xl">
      <div className="text-zinc-400">
        {horizon === '1D' || horizon === '1W'
          ? new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }).format(new Date(b.bar_time))
          : new Date(b.bar_time).toISOString().slice(0, 10)}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span className="text-zinc-500">O</span><span>{b.open}</span>
        <span className="text-zinc-500">H</span><span className="text-emerald-400">{b.high}</span>
        <span className="text-zinc-500">L</span><span className="text-red-400">{b.low}</span>
        <span className="text-zinc-500">C</span><span>{b.close}</span>
        <span className="text-zinc-500">V</span><span>{(b.volume / 1e6).toFixed(1)}M</span>
      </div>
    </div>
  );
};

export const PriceChart: React.FC<{
  bars: Bar[];
  levels?: KeyLevel[];
  height?: number;
  horizon?: ChartHorizon;
  barLabel?: string;
}> = ({
  bars, levels = [], height = 280, horizon = '1M', barLabel,
}) => {
  if (!bars.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-sm border border-dashed border-zinc-800">
        <Unavailable />
      </div>
    );
  }
  const drawn = levels.filter((l) => !isMissing(l.value));
  const lows = bars.map((b) => Number(b.low)).filter(Number.isFinite);
  const highs = bars.map((b) => Number(b.high)).filter(Number.isFinite);

  // The selected horizon owns the chart scale. Tactical/broader reference levels
  // must never stretch the Y axis and flatten the actual price movement.
  const barMin = Math.min(...lows);
  const barMax = Math.max(...highs);
  const barRange = Math.max(0, barMax - barMin);
  const midpoint = (barMin + barMax) / 2;
  const minimumPad = Math.max(Math.abs(midpoint) * 0.0025, 0.25);
  const pad = Math.max(barRange * (horizon === '1D' ? 0.16 : horizon === '1W' ? 0.12 : 0.10), minimumPad);
  const visibleMin = barMin - pad;
  const visibleMax = barMax + pad;

  const visibleLevels = drawn.filter((level) => {
    const value = Number(level.value);
    return value >= visibleMin && value <= visibleMax;
  });

  const offscreenLevels = drawn.filter((level) => {
    const value = Number(level.value);
    return value < visibleMin || value > visibleMax;
  });

  const shortLabel = (label: string) =>
    label
      .replace(/^1–5 day /i, '')
      .replace(/^Broader /i, 'Broad ')
      .replace(/^Recent swing /i, 'Swing ');

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bars} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="sfPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1c2027" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="bar_time"
              tick={axisStyle}
              tickLine={false}
              axisLine={{ stroke: '#1c2027' }}
              minTickGap={48}
              tickFormatter={(v: string) => {
                const date = new Date(v);
                if (horizon === '1D') {
                  return new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/New_York',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(date);
                }
                if (horizon === '1W') {
                  return new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/New_York',
                    weekday: 'short',
                    hour: 'numeric',
                  }).format(date);
                }
                return date.toISOString().slice(5, 10);
              }}
            />
            <YAxis
              orientation="right"
              domain={[visibleMin, visibleMax]}
              tick={axisStyle}
              tickLine={false}
              axisLine={{ stroke: '#1c2027' }}
              width={54}
              tickFormatter={(v: number) => v.toFixed(v > 100 ? 0 : 1)}
            />
            <Tooltip content={<TooltipBox horizon={horizon} />} />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#38bdf8"
              strokeWidth={1.6}
              fill="url(#sfPrice)"
              dot={false}
              animationDuration={800}
            />
            {visibleLevels.map((l) => (
              <ReferenceLine
                key={l.label}
                y={Number(l.value)}
                stroke={l.color}
                strokeDasharray={l.dash ?? '4 3'}
                strokeWidth={1}
                label={{
                  value: `${shortLabel(l.label)} ${Number(l.value).toFixed(2)}`,
                  position: 'insideTopRight',
                  fill: l.color,
                  fontSize: 9,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
        {visibleLevels.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4" style={{ backgroundColor: l.color }} />
            {shortLabel(l.label)} {Number(l.value).toFixed(2)}
          </span>
        ))}
        <span>{bars.length} {barLabel ?? (horizon === '1D' ? '5-minute bars' : horizon === '1W' ? '30-minute bars' : 'daily bars')} · {horizon}</span>
      </div>

      {offscreenLevels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {offscreenLevels.map((l) => {
            const value = Number(l.value);
            const direction = value > visibleMax ? 'above view' : 'below view';
            return (
              <span
                key={`${l.label}-offscreen`}
                className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-black/20 px-2 py-1 font-mono text-[9px] uppercase tracking-wider"
                style={{ color: l.color }}
              >
                <span>{value > visibleMax ? '↑' : '↓'}</span>
                <span>{shortLabel(l.label)} {value.toFixed(2)}</span>
                <span className="text-zinc-600">· {direction}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export interface SessionPlaybackMarker {
  kind: 'entry' | 'weakening' | 'invalidation' | 'exit';
  label: string;
  at: string;
  price: number | null;
  detail?: string;
}

const markerColor = (kind: SessionPlaybackMarker['kind']) =>
  kind === 'entry' ? '#34d399'
    : kind === 'weakening' ? '#fbbf24'
      : kind === 'invalidation' ? '#f87171'
        : '#60a5fa';

const sessionTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export const SessionPlaybackChart: React.FC<{
  bars: Bar[];
  markers: SessionPlaybackMarker[];
  height?: number;
}> = ({ bars, markers, height = 360 }) => {
  if (!bars.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-sm border border-dashed border-zinc-800">
        <Unavailable />
      </div>
    );
  }

  const validMarkers = markers.filter((item) => item.price !== null && Number.isFinite(Number(item.price)));
  const lows = bars.map((b) => b.low);
  const highs = bars.map((b) => b.high);
  const markerValues = validMarkers.map((item) => Number(item.price));
  const min = Math.min(...lows, ...markerValues);
  const max = Math.max(...highs, ...markerValues);
  const pad = (max - min) * 0.08 || 1;

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bars} margin={{ top: 20, right: 64, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="ursoraPlaybackPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1c2027" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="bar_time"
              tick={axisStyle}
              tickLine={false}
              axisLine={{ stroke: '#1c2027' }}
              minTickGap={56}
              tickFormatter={(v: string) => sessionTime(v)}
            />
            <YAxis
              orientation="right"
              domain={[min - pad, max + pad]}
              tick={axisStyle}
              tickLine={false}
              axisLine={{ stroke: '#1c2027' }}
              width={58}
              tickFormatter={(v: number) => v.toFixed(v > 100 ? 1 : 2)}
            />
            <Tooltip content={<TooltipBox />} />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#38bdf8"
              strokeWidth={1.5}
              fill="url(#ursoraPlaybackPrice)"
              dot={false}
              animationDuration={500}
            />
            {validMarkers.map((item) => (
              <ReferenceDot
                key={`${item.kind}-${item.at}`}
                x={bars.reduce((best, bar) => {
                  const target = new Date(item.at).getTime();
                  const bestD = Math.abs(new Date(best.bar_time).getTime() - target);
                  const nextD = Math.abs(new Date(bar.bar_time).getTime() - target);
                  return nextD < bestD ? bar : best;
                }, bars[0]).bar_time}
                y={Number(item.price)}
                r={5}
                fill={markerColor(item.kind)}
                stroke="#0b0d10"
                strokeWidth={2}
                label={{
                  value: item.label,
                  position: item.kind === 'invalidation' ? 'top' : 'bottom',
                  fill: markerColor(item.kind),
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {markers.map((item) => (
          <div key={`${item.kind}-${item.at}-legend`} className="rounded-sm border border-zinc-800 bg-black/20 px-2 py-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider" style={{ color: markerColor(item.kind) }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: markerColor(item.kind) }} />
              {item.label}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
              {sessionTime(item.at)}{item.price !== null ? ` · ${Number(item.price).toFixed(2)}` : ''}
            </div>
            {item.detail && <div className="mt-0.5 text-[9px] text-zinc-600">{item.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export const EquityCurve: React.FC<{
  data: { t: string; equity: number; drawdown: number }[];
  height?: number;
}> = ({ data, height = 220 }) => {
  if (!data.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-sm border border-dashed border-zinc-800">
        <Unavailable />
      </div>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1c2027" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="t" tick={axisStyle} tickLine={false} axisLine={{ stroke: '#1c2027' }} minTickGap={40} />
          <YAxis
            orientation="right"
            tick={axisStyle}
            tickLine={false}
            axisLine={{ stroke: '#1c2027' }}
            width={48}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{
              background: '#0b0d10', border: '1px solid #3f3f46', borderRadius: 3,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            }}
            labelStyle={{ color: '#a1a1aa' }}
          />
          <ReferenceLine y={0} stroke="#3f3f46" />
          <Line type="monotone" dataKey="equity" name="Cumulative return %" stroke="#34d399" strokeWidth={1.8} dot={false} />
          <Line type="monotone" dataKey="drawdown" name="Drawdown %" stroke="#f87171" strokeWidth={1.2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriceChart;
