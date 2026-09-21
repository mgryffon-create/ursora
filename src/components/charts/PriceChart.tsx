import React from 'react';
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Bar } from '@/lib/types';
import { isMissing } from '@/lib/format';
import { Unavailable } from '@/components/common/Primitives';

export interface KeyLevel {
  value: number | null | undefined;
  label: string;
  color: string;
  dash?: string;
}

const axisStyle = { fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' };

const TooltipBox: React.FC<{ active?: boolean; payload?: { payload: Bar }[] }> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-sm border border-zinc-700 bg-[#0b0d10]/95 p-2 font-mono text-[10px] text-zinc-300 shadow-xl">
      <div className="text-zinc-400">{new Date(b.bar_time).toISOString().slice(0, 10)}</div>
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

export const PriceChart: React.FC<{ bars: Bar[]; levels?: KeyLevel[]; height?: number }> = ({
  bars, levels = [], height = 280,
}) => {
  if (!bars.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-sm border border-dashed border-zinc-800">
        <Unavailable />
      </div>
    );
  }
  const drawn = levels.filter((l) => !isMissing(l.value));
  const lows = bars.map((b) => b.low);
  const highs = bars.map((b) => b.high);
  const levelValues = drawn.map((l) => Number(l.value));
  const min = Math.min(...lows, ...levelValues);
  const max = Math.max(...highs, ...levelValues);
  const pad = (max - min) * 0.08 || 1;

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
              tickFormatter={(v: string) => new Date(v).toISOString().slice(5, 10)}
            />
            <YAxis
              orientation="right"
              domain={[min - pad, max + pad]}
              tick={axisStyle}
              tickLine={false}
              axisLine={{ stroke: '#1c2027' }}
              width={54}
              tickFormatter={(v: number) => v.toFixed(v > 100 ? 0 : 1)}
            />
            <Tooltip content={<TooltipBox />} />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#38bdf8"
              strokeWidth={1.6}
              fill="url(#sfPrice)"
              dot={false}
              animationDuration={800}
            />
            {drawn.map((l) => (
              <ReferenceLine
                key={l.label}
                y={Number(l.value)}
                stroke={l.color}
                strokeDasharray={l.dash ?? '4 3'}
                strokeWidth={1}
                label={{
                  value: `${l.label} ${l.value}`,
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
        {drawn.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
        <span>{bars.length} daily bars, modelled by the simulation adapter</span>
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
