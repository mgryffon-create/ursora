import React, { useEffect, useRef, useState } from 'react';
import {
  Area, AreaChart, Bar, Brush, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Bar as MarketBar, ChartHorizon } from '@/lib/types';
import { isMissing } from '@/lib/format';
import { Unavailable } from '@/components/common/Primitives';

export interface KeyLevel {
  value: number | null | undefined;
  label: string;
  color: string;
  dash?: string;
  detail?: string;
  group?: 'setup' | 'structure';
  rangeLow?: number | null;
  rangeHigh?: number | null;
  displayValue?: string;
  entryOptions?: Array<{
    label: string;
    range?: string;
    state?: string;
    detail: string;
  }>;
}

const axisStyle = { fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' };

type PriceChartStyle = 'candles' | 'line';
const PRICE_CHART_STYLE_KEY = 'ursora_price_chart_style_v1';

const readPriceChartStyle = (): PriceChartStyle => {
  if (typeof window === 'undefined') return 'candles';
  return window.localStorage.getItem(PRICE_CHART_STYLE_KEY) === 'line' ? 'line' : 'candles';
};

const usePriceChartStyle = () => {
  const [chartStyle, setChartStyleState] = useState<PriceChartStyle>(readPriceChartStyle);

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<PriceChartStyle>).detail;
      setChartStyleState(detail === 'line' ? 'line' : 'candles');
    };
    window.addEventListener('ursora-price-chart-style', sync);
    return () => window.removeEventListener('ursora-price-chart-style', sync);
  }, []);

  const setChartStyle = (next: PriceChartStyle) => {
    setChartStyleState(next);
    window.localStorage.setItem(PRICE_CHART_STYLE_KEY, next);
    window.dispatchEvent(new CustomEvent('ursora-price-chart-style', { detail: next }));
  };

  return [chartStyle, setChartStyle] as const;
};

const ChartStyleToggle: React.FC<{
  value: PriceChartStyle;
  onChange: (value: PriceChartStyle) => void;
}> = ({ value, onChange }) => (
  <div className="flex items-center gap-1 rounded-sm border border-zinc-800 bg-black/20 p-0.5">
    {(['candles', 'line'] as PriceChartStyle[]).map((style) => (
      <button
        key={style}
        type="button"
        onClick={() => onChange(style)}
        className={
          'rounded-sm px-2 py-1 font-mono text-[8px] uppercase tracking-wider transition-colors ' +
          (value === style
            ? 'bg-sky-500/15 text-sky-300'
            : 'text-zinc-600 hover:text-zinc-300')
        }
      >
        {style === 'candles' ? 'Candles' : 'Line'}
      </button>
    ))}
  </div>
);

const CandleShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  const high = Number(payload?.high);
  const low = Number(payload?.low);
  const open = Number(payload?.open);
  const close = Number(payload?.close);
  if (![high, low, open, close].every(Number.isFinite) || high <= low) return null;

  const center = Number(x) + Number(width) / 2;
  const pxPerPrice = Number(height) / (high - low);
  const bodyTop = Number(y) + (high - Math.max(open, close)) * pxPerPrice;
  const bodyBottom = Number(y) + (high - Math.min(open, close)) * pxPerPrice;
  const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
  const bodyWidth = Math.max(2, Math.min(Number(width) * 0.72, 8));
  const color = close >= open ? '#34d399' : '#f87171';

  return (
    <g>
      <line
        x1={center}
        x2={center}
        y1={Number(y)}
        y2={Number(y) + Number(height)}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={center - bodyWidth / 2}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={color}
        stroke={color}
        strokeWidth={0.8}
      />
    </g>
  );
};

const TooltipBox: React.FC<{ active?: boolean; payload?: { payload: MarketBar }[]; horizon?: ChartHorizon }> = ({ active, payload, horizon = '1M' }) => {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-sm border border-zinc-700 bg-[#0b0d10]/95 p-2 font-mono text-[10px] text-zinc-300 shadow-xl">
      <div className="text-zinc-400">
        {horizon === '1D' || horizon === '1W'
          ? new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              year: 'numeric',
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
  bars: MarketBar[];
  levels?: KeyLevel[];
  height?: number;
  horizon?: ChartHorizon;
  barLabel?: string;
}> = ({
  bars, levels = [], height = 280, horizon = '1M', barLabel,
}) => {
  const [chartStyle, setChartStyle] = usePriceChartStyle();
  const drawn = levels.filter((l) => !isMissing(l.value));
  const cardLevels = levels.filter((level) =>
    !isMissing(level.value) ||
    Boolean(level.displayValue) ||
    Boolean(level.entryOptions?.length) ||
    Boolean(level.detail)
  );
  const lows = bars.map((b) => Number(b.low)).filter(Number.isFinite);
  const highs = bars.map((b) => Number(b.high)).filter(Number.isFinite);
  const plotBars = bars.map((b) => ({
    ...b,
    priceRange: [Number(b.low), Number(b.high)] as [number, number],
  }));

  // Preserve a readable price scale for the selected history. Tactical levels
  // still belong to the same Y axis, but when they extend materially beyond the
  // candle range the chart becomes vertically scrollable instead of flattening the
  // candles to fit everything into one viewport.
  const barMin = lows.length ? Math.min(...lows) : 0;
  const barMax = highs.length ? Math.max(...highs) : 1;
  const barRange = Math.max(0, barMax - barMin);
  const barMidpoint = (barMin + barMax) / 2;
  const minimumPad = Math.max(Math.abs(barMidpoint) * 0.0025, 0.25);
  const basePad = Math.max(
    barRange * (horizon === '1D' ? 0.16 : horizon === '1W' ? 0.12 : 0.10),
    minimumPad,
  );
  const baseMin = barMin - basePad;
  const baseMax = barMax + basePad;
  const baseRange = Math.max(baseMax - baseMin, 0.5);

  const levelValues = drawn.flatMap((level) => [
    Number(level.value),
    Number(level.rangeLow),
    Number(level.rangeHigh),
  ]).filter(Number.isFinite);
  const rawDomainMin = Math.min(baseMin, ...(levelValues.length ? levelValues : [baseMin]));
  const rawDomainMax = Math.max(baseMax, ...(levelValues.length ? levelValues : [baseMax]));
  const outerPad = Math.max(baseRange * 0.18, minimumPad);
  const visibleMin = rawDomainMin - outerPad;
  const visibleMax = rawDomainMax + outerPad;
  const fullRange = Math.max(visibleMax - visibleMin, baseRange);

  // Keep roughly the same dollars-per-pixel as the selected price history. Cap the
  // canvas so pathological distant levels do not create an enormous DOM surface.
  const scaleRatio = Math.max(1, fullRange / baseRange);
  const chartCanvasHeight = Math.round(Math.min(height * scaleRatio * 0.72, height * 4.5));
  const visibleLevels = drawn;

  // Use a continuous price ladder instead of sparse auto-generated labels. Tight
  // trading ranges get $0.50 increments; wider ranges step up to preserve legibility.
  const tickStep = baseRange <= 15 ? 0.5
    : baseRange <= 40 ? 1
      : baseRange <= 100 ? 2
        : 5;
  const tickStart = Math.floor(visibleMin / tickStep) * tickStep;
  const tickEnd = Math.ceil(visibleMax / tickStep) * tickStep;
  const yTicks: number[] = [];
  for (let value = tickStart; value <= tickEnd + tickStep * 0.25; value += tickStep) {
    yTicks.push(Number(value.toFixed(4)));
  }

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const anchorValue = Number(
    drawn.find((level) => /thesis anchor/i.test(level.label))?.value ?? barMidpoint,
  );

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || chartCanvasHeight <= height || !Number.isFinite(anchorValue)) return;
    const normalized = (visibleMax - anchorValue) / fullRange;
    const anchorY = Math.max(0, Math.min(chartCanvasHeight, normalized * chartCanvasHeight));
    viewport.scrollTop = Math.max(
      0,
      Math.min(chartCanvasHeight - height, anchorY - height / 2),
    );
  }, [anchorValue, chartCanvasHeight, fullRange, height, horizon, visibleMax]);

  if (!bars.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-sm border border-dashed border-zinc-800">
        <Unavailable />
      </div>
    );
  }

  const shortLabel = (label: string) =>
    label
      .replace(/^1–5 day /i, '')
      .replace(/^Broader /i, 'Broad ')
      .replace(/^Recent swing /i, 'Swing ');

  const setupLevels = cardLevels.filter((level) => (level.group ?? 'structure') === 'setup');
  const structureLevels = cardLevels.filter((level) => (level.group ?? 'structure') === 'structure');

  const LevelCard = ({ level, compact = false }: { level: KeyLevel; compact?: boolean }) => {
    const value = Number(level.value);
    const rangeLow = Number(level.rangeLow);
    const rangeHigh = Number(level.rangeHigh);
    const hasValue = !isMissing(level.value) && Number.isFinite(value);
    const hasRange = !isMissing(level.rangeLow) && !isMissing(level.rangeHigh) &&
      Number.isFinite(rangeLow) && Number.isFinite(rangeHigh);
    const expanded = expandedLevel === level.label;
    return (
      <div className="rounded-sm border border-zinc-800/80 bg-[#0f1216] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
            <span className="inline-block h-[2px] w-3 shrink-0" style={{ backgroundColor: level.color }} />
            <span className="truncate">{shortLabel(level.label)}</span>
          </span>
          <span className="font-mono text-[10px] tabular-nums" style={{ color: level.color }}>
            {level.displayValue ?? (hasRange ? `${rangeLow.toFixed(2)}–${rangeHigh.toFixed(2)}` : hasValue ? value.toFixed(2) : 'WAIT')}
          </span>
        </div>
        {(level.detail || level.entryOptions?.length) && (
          <>
            <button
              type="button"
              onClick={() => setExpandedLevel(expanded ? null : level.label)}
              aria-expanded={expanded}
              className="mt-1 font-mono text-[8px] uppercase tracking-wider text-sky-400/80 transition-colors hover:text-sky-300"
            >
              {expanded
                ? (level.entryOptions?.length ? 'hide entry setups' : 'hide why')
                : (level.entryOptions?.length ? 'view entry setups' : 'why this level?')}
            </button>
            {expanded && (
              <div className={compact
                ? "mt-1.5 border-t border-zinc-800 pt-1.5 text-[9px] leading-relaxed text-zinc-500"
                : "mt-2 border-t border-zinc-800 pt-2 text-[10px] leading-relaxed text-zinc-500"}>
                {level.entryOptions?.length ? (
                  <div className="space-y-2">
                    {level.entryOptions.map((option) => (
                      <div key={option.label} className="rounded-sm border border-zinc-800 bg-black/20 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-400">{option.label}</span>
                          <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">
                            {option.state ?? ''}
                          </span>
                        </div>
                        {option.range && (
                          <div className="mt-1 font-mono text-[10px] tabular-nums text-zinc-200">{option.range}</div>
                        )}
                        <div className="mt-1 text-[9px] leading-relaxed text-zinc-500">{option.detail}</div>
                      </div>
                    ))}
                    {level.detail && (
                      <div className="border-t border-zinc-800 pt-2 text-[9px] leading-relaxed text-zinc-500">
                        {level.detail}
                      </div>
                    )}
                  </div>
                ) : level.detail}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <ChartStyleToggle value={chartStyle} onChange={setChartStyle} />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <div
            ref={scrollRef}
            className="overflow-y-auto overscroll-contain rounded-sm"
            style={{ height }}
            title={chartCanvasHeight > height ? 'Scroll vertically to inspect tactical levels outside the local price range.' : undefined}
          >
            <div style={{ height: chartCanvasHeight, minHeight: height }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={plotBars} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
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
              allowDataOverflow
              tick={axisStyle}
              tickLine={false}
              axisLine={{ stroke: '#1c2027' }}
              width={62}
              ticks={yTicks}
              tickFormatter={(v: number) => v.toFixed(tickStep < 1 ? 2 : tickStep === 1 ? 1 : 0)}
            />
            <Tooltip content={<TooltipBox horizon={horizon} />} />
            {chartStyle === 'candles' ? (
              <Bar
                dataKey="priceRange"
                barSize={horizon === '1D' ? 7 : horizon === '1W' ? 7 : horizon === '1M' ? 8 : 5}
                shape={<CandleShape />}
                isAnimationActive={false}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="close"
                stroke="#38bdf8"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {visibleLevels.map((l) => {
              const rangeLow = Number(l.rangeLow);
              const rangeHigh = Number(l.rangeHigh);
              const hasRange = Number.isFinite(rangeLow) && Number.isFinite(rangeHigh);
              if (hasRange) {
                return (
                  <ReferenceArea
                    key={l.label}
                    y1={Math.min(rangeLow, rangeHigh)}
                    y2={Math.max(rangeLow, rangeHigh)}
                    stroke={l.color}
                    strokeOpacity={0.8}
                    fill={l.color}
                    fillOpacity={0.08}
                  />
                );
              }
              return (
                <ReferenceLine
                  key={l.label}
                  y={Number(l.value)}
                  stroke={l.color}
                  strokeDasharray={l.dash ?? '4 3'}
                  strokeWidth={1}
                />
              );
            })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          {chartCanvasHeight > height && (
            <div className="mt-1 font-mono text-[8px] uppercase tracking-wider text-zinc-600">
              scroll vertically to inspect the full tactical range
            </div>
          )}
        </div>

        <aside className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
            Trade setup
          </div>
          <div className="mt-2 space-y-1.5">
            {setupLevels.map((level) => (
              <LevelCard key={`${level.label}-setup`} level={level} compact />
            ))}
          </div>
          <div className="mt-2 border-t border-zinc-800 pt-2 font-mono text-[9px] leading-relaxed text-zinc-600">
            The setup frame stays fixed to this TradeCycle run. Market structure below provides context around it.
          </div>
        </aside>
      </div>

      {structureLevels.length > 0 && (
        <section className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">Market structure</div>
              <div className="mt-0.5 text-[10px] text-zinc-600">
                Reaction zones and nearby support/resistance that frame the setup.
              </div>
            </div>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {structureLevels.map((level) => (
              <LevelCard key={`${level.label}-structure`} level={level} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-2 font-mono text-[10px] text-zinc-500">
        {bars.length} {barLabel ?? (horizon === '1D' ? '5-minute bars' : horizon === '1W' ? '30-minute bars' : 'daily bars')} · {horizon}
      </div>
    </div>
  );
};

export interface SessionPlaybackMarker {
  kind: 'confirmation' | 'entry' | 'weakening' | 'invalidation' | 'conflict' | 'target' | 'exit';
  label: string;
  at: string;
  price: number | null;
  detail?: string;
}

const markerColor = (kind: SessionPlaybackMarker['kind']) =>
  kind === 'entry' ? '#a78bfa'
    : kind === 'confirmation' ? '#38bdf8'
      : kind === 'target' ? '#34d399'
        : kind === 'weakening' ? '#fbbf24'
          : kind === 'invalidation' ? '#f87171'
            : kind === 'conflict' ? '#fb7185'
              : '#60a5fa';

export interface SessionPlaybackLevel {
  kind: 'reversal' | 'confirmation' | 'target' | 'invalidation' | 'support' | 'resistance';
  label: string;
  value: number;
  detail?: string;
}

const playbackLevelColor = (kind: SessionPlaybackLevel['kind']) =>
  kind === 'reversal' ? '#c084fc'
    : kind === 'confirmation' ? '#38bdf8'
    : kind === 'target' ? '#34d399'
      : kind === 'invalidation' ? '#f59e0b'
        : kind === 'support' ? '#a78bfa'
          : '#2dd4bf';

const sessionTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export const SessionPlaybackChart: React.FC<{
  bars: MarketBar[];
  markers: SessionPlaybackMarker[];
  levels?: SessionPlaybackLevel[];
  height?: number;
  showStructureCards?: boolean;
  compactEvents?: boolean;
  syncId?: string;
  responsiveHeight?: boolean;
  indicatorOverlay?: (at: string | null) => React.ReactNode;
}> = ({
  bars,
  markers,
  levels = [],
  height = 360,
  showStructureCards = true,
  compactEvents = false,
  syncId,
  responsiveHeight = false,
  indicatorOverlay,
}) => {
  const [chartStyle, setChartStyle] = usePriceChartStyle();
  const [zoomStart, setZoomStart] = useState(0);
  const [zoomEnd, setZoomEnd] = useState(Math.max(0, bars.length - 1));
  const [indicatorAt, setIndicatorAt] = useState<string | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<SessionPlaybackMarker | null>(null);

  useEffect(() => {
    setZoomStart(0);
    setZoomEnd(Math.max(0, bars.length - 1));
    setIndicatorAt(null);
  }, [bars]);

  if (!bars.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-sm border border-dashed border-zinc-800">
        <Unavailable />
      </div>
    );
  }

  const plotBars = bars.map((bar) => ({
    ...bar,
    priceRange: [Number(bar.low), Number(bar.high)] as [number, number],
  }));
  const validMarkers = markers.filter((item) => item.price !== null && Number.isFinite(Number(item.price)));
  const visibleBars = bars.slice(zoomStart, zoomEnd + 1);
  const lows = (visibleBars.length ? visibleBars : bars).map((b) => b.low);
  const highs = (visibleBars.length ? visibleBars : bars).map((b) => b.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const pad = (max - min) * 0.08 || 1;

  const markerIndices = validMarkers.map((item) => {
    const target = new Date(item.at).getTime();
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    bars.forEach((bar, index) => {
      const distance = Math.abs(new Date(bar.bar_time).getTime() - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return { item, index: bestIndex };
  });

  const tradeIndices = markerIndices
    .filter(({ item }) => item.kind === 'entry' || item.kind === 'exit')
    .map(({ index }) => index);
  const zoomToTrade = () => {
    if (!tradeIndices.length) return;
    const start = Math.max(0, Math.min(...tradeIndices) - 12);
    const end = Math.min(bars.length - 1, Math.max(...tradeIndices) + 12);
    setZoomStart(start);
    setZoomEnd(end);
  };
  const updateRange = (range: { startIndex?: number; endIndex?: number }) => {
    if (typeof range.startIndex === 'number') setZoomStart(range.startIndex);
    if (typeof range.endIndex === 'number') setZoomEnd(range.endIndex);
  };
  const resetZoom = () => {
    setZoomStart(0);
    setZoomEnd(Math.max(0, bars.length - 1));
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={zoomToTrade}
          className="rounded-sm border border-zinc-800 bg-black/20 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
        >
          Trade zoom
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="rounded-sm border border-zinc-800 bg-black/20 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
        >
          Full
        </button>
        <ChartStyleToggle value={chartStyle} onChange={setChartStyle} />
      </div>

      <div
        className={responsiveHeight ? "relative h-[340px] sm:h-[440px]" : "relative"}
        style={responsiveHeight ? undefined : { height }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={plotBars} syncId={syncId} margin={{ top: indicatorOverlay ? 88 : 20, right: 64, bottom: 4, left: 0 }}
            onMouseMove={(state) => { if (indicatorOverlay) setIndicatorAt(typeof state.activeLabel === 'string' ? state.activeLabel : null); }}
            onMouseLeave={() => setIndicatorAt(null)}
          >
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
            {chartStyle === 'candles' ? (
              <Bar
                dataKey="priceRange"
                barSize={6}
                shape={<CandleShape />}
                isAnimationActive={false}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="close"
                stroke="#38bdf8"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {levels.map((level) => (
              <ReferenceLine
                key={`historical-level-${level.kind}-${level.value}`}
                y={Number(level.value)}
                stroke={playbackLevelColor(level.kind)}
                strokeWidth={1}
                strokeDasharray={level.kind === 'confirmation' ? '3 3' : '5 4'}
                ifOverflow="extendDomain"
              />
            ))}
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
                onMouseEnter={() => setHoveredMarker(item)}
                onMouseLeave={() => setHoveredMarker(null)}
                style={{ cursor: 'help' }}
              />
            ))}
            <Brush
              dataKey="bar_time"
              height={18}
              travellerWidth={7}
              startIndex={zoomStart}
              endIndex={zoomEnd}
              onChange={updateRange}
              tickFormatter={(value: string) => sessionTime(value)}
              stroke="#3f3f46"
              fill="#0b0d10"
            />
          </ComposedChart>
        </ResponsiveContainer>
        {indicatorOverlay?.(indicatorAt)}
        {hoveredMarker && (
          <div className={`pointer-events-none absolute left-3 ${indicatorOverlay ? "top-24" : "top-3"} z-20 max-w-[260px] rounded-sm border border-zinc-700 bg-[#0b0d10]/95 px-2.5 py-2 shadow-xl`}>
            <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: markerColor(hoveredMarker.kind) }}>
              {hoveredMarker.label}
            </div>
            <div className="mt-1 font-mono text-[10px] text-zinc-300">
              {sessionTime(hoveredMarker.at)} · {hoveredMarker.price === null ? '—' : Number(hoveredMarker.price).toFixed(2)}
            </div>
            {hoveredMarker.detail && (
              <div className="mt-1 text-[9px] leading-relaxed text-zinc-500">{hoveredMarker.detail}</div>
            )}
          </div>
        )}
      </div>

      {showStructureCards && levels.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Historical trade structure</div>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {levels.map((level) => (
              <div key={`historical-card-${level.kind}-${level.value}`} className="rounded-sm border border-zinc-800 bg-black/20 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[8px] uppercase tracking-wider" style={{ color: playbackLevelColor(level.kind) }}>
                    {level.label}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-zinc-300">{Number(level.value).toFixed(2)}</span>
                </div>
                {level.detail && <div className="mt-1 text-[9px] leading-relaxed text-zinc-600">{level.detail}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={compactEvents ? "mt-2 flex gap-2 overflow-x-auto pb-1 [&>div]:shrink-0" : "mt-3 flex flex-wrap gap-2"}>
        {markers.map((item) => (
          <div key={`${item.kind}-${item.at}-legend`} className="rounded-sm border border-zinc-800 bg-black/20 px-2 py-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider" style={{ color: markerColor(item.kind) }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: markerColor(item.kind) }} />
              {item.label}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
              {sessionTime(item.at)}{item.price !== null ? ` · ${Number(item.price).toFixed(2)}` : ''}
            </div>
            {!compactEvents && item.detail && <div className="mt-0.5 text-[9px] text-zinc-600">{item.detail}</div>}
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