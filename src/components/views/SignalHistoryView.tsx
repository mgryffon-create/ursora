import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { fetchSignalHistory, fetchSignalUpdates, fetchTickers } from '@/lib/api';
import type { Signal, SignalUpdate, Ticker } from '@/lib/types';
import { num, scoreColor, stampET } from '@/lib/format';
import {
  DemoBadge, DirectionTag, Disclaimer, EmptyState, Panel, RiskTag, SectionHeading, Spinner, Unavailable,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

const dayKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const prettyDay = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const monthTitle = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const startOfMonthGrid = (date: Date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  first.setDate(first.getDate() - first.getDay());
  return first;
};

export const SignalHistoryView: React.FC<{ onOpenThesis: (id: number) => void }> = ({ onOpenThesis }) => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [updates, setUpdates] = useState<SignalUpdate[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [symbol, setSymbol] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date());
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sig, up, tk] = await Promise.all([
      fetchSignalHistory(undefined, 250), fetchSignalUpdates(undefined, 120), fetchTickers(),
    ]);
    setSignals(sig);
    setUpdates(up);
    setTickers(tk);

    const latest = sig
      .map((s) => s.generated_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    if (latest) {
      const latestDate = new Date(latest);
      const latestKey = dayKey(latestDate);
      setMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1));
      setRangeStart(latestKey);
      setRangeEnd(latestKey);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      signals.filter((s) => {
        if (symbol !== 'all' && s.symbol !== symbol) return false;
        if (query && !s.symbol.includes(query.toUpperCase())) return false;
        return true;
      }),
    [signals, symbol, query],
  );

  const recordsByDay = useMemo(() => {
    const map = new Map<string, Signal[]>();
    for (const signal of filtered) {
      const key = dayKey(signal.generated_at);
      map.set(key, [...(map.get(key) ?? []), signal]);
    }
    return map;
  }, [filtered]);

  const updatesByDay = useMemo(() => {
    const map = new Map<string, SignalUpdate[]>();
    for (const update of updates) {
      if (symbol !== 'all' && update.symbol !== symbol) continue;
      if (query && !update.symbol.includes(query.toUpperCase())) continue;
      const key = dayKey(update.created_at);
      map.set(key, [...(map.get(key) ?? []), update]);
    }
    return map;
  }, [updates, symbol, query]);

  const calendarDays = useMemo(() => {
    const start = startOfMonthGrid(month);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const selectedSignals = useMemo(() => {
    if (!rangeStart) return [];
    const end = rangeEnd ?? rangeStart;
    return filtered
      .filter((s) => {
        const key = dayKey(s.generated_at);
        return key >= rangeStart && key <= end;
      })
      .sort((a, b) => +new Date(b.generated_at) - +new Date(a.generated_at));
  }, [filtered, rangeStart, rangeEnd]);

  const selectedUpdates = useMemo(() => {
    if (!rangeStart) return [];
    const end = rangeEnd ?? rangeStart;
    return updates
      .filter((u) => {
        if (symbol !== 'all' && u.symbol !== symbol) return false;
        if (query && !u.symbol.includes(query.toUpperCase())) return false;
        const key = dayKey(u.created_at);
        return key >= rangeStart && key <= end;
      })
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [updates, rangeStart, rangeEnd, symbol, query]);

  const handleDayClick = (key: string) => {
    if (!rangeStart || (rangeStart && rangeEnd && rangeStart !== rangeEnd)) {
      setRangeStart(key);
      setRangeEnd(key);
      return;
    }

    if (rangeStart === rangeEnd) {
      if (key === rangeStart) {
        setRangeStart(null);
        setRangeEnd(null);
        return;
      }
      const [start, end] = key < rangeStart ? [key, rangeStart] : [rangeStart, key];
      setRangeStart(start);
      setRangeEnd(end);
      return;
    }

    setRangeStart(key);
    setRangeEnd(key);
  };

  const clearRange = () => {
    setRangeStart(null);
    setRangeEnd(null);
  };

  const rangeLabel = !rangeStart
    ? 'No dates selected'
    : rangeStart === rangeEnd
      ? prettyDay(rangeStart)
      : `${prettyDay(rangeStart)} – ${prettyDay(rangeEnd ?? rangeStart)}`;

  if (loading) return <Spinner label="Loading TradeCycle history" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="TradeCycle history"
        title="Review recorded activity by date"
        description="Select one day or a range of days to inspect the market analyses and material changes URSORA recorded during that period."
      />

      <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
        <Panel bodyClassName="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="sh-sym" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Ticker
              </label>
              <select
                id="sh-sym"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="mt-1 rounded-sm border border-zinc-800 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-200 focus-visible:border-sky-500/60 focus-visible:outline-none"
              >
                <option value="all">all</option>
                {tickers.map((ticker) => <option key={ticker.symbol} value={ticker.symbol}>{ticker.symbol}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sh-q" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Search
              </label>
              <div className="mt-1 flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-black/40 px-2 focus-within:border-sky-500/60">
                <Search className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                <input
                  id="sh-q"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="NVDA"
                  className="w-24 bg-transparent py-1 font-mono text-xs uppercase text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">Selected period</div>
              <div className="mt-0.5 text-[12px] font-medium text-zinc-300">{rangeLabel}</div>
            </div>
          </div>
        </Panel>

        {rangeStart && (
          <button
            type="button"
            onClick={clearRange}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-800 px-3 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear dates
          </button>
        )}
      </div>

      <Panel
        title="Calendar"
        subtitle="Dates with recorded activity show the number of analyses and any material thesis changes. Click once for a day; click another date to create a range."
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}
              className="rounded-sm border border-zinc-800 p-1.5 text-zinc-500 hover:text-zinc-200"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[140px] text-center font-mono text-[11px] uppercase tracking-wider text-zinc-300">
              {monthTitle(month)}
            </span>
            <button
              type="button"
              onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}
              className="rounded-sm border border-zinc-800 p-1.5 text-zinc-500 hover:text-zinc-200"
              aria-label="Next month"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
            <div key={label} className="px-1 pb-1 text-center font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              {label}
            </div>
          ))}
          {calendarDays.map((date) => {
            const key = dayKey(date);
            const daySignals = recordsByDay.get(key) ?? [];
            const dayUpdates = updatesByDay.get(key) ?? [];
            const inMonth = date.getMonth() === month.getMonth();
            const selected = Boolean(rangeStart && key >= rangeStart && key <= (rangeEnd ?? rangeStart));
            const symbols = [...new Set(daySignals.map((s) => s.symbol))].slice(0, 3);

            return (
              <button
                type="button"
                key={key}
                onClick={() => handleDayClick(key)}
                className={cn(
                  'min-h-[86px] rounded-md border p-2 text-left transition-colors',
                  inMonth ? 'border-zinc-800 bg-black/20' : 'border-zinc-900 bg-black/10 opacity-35',
                  selected && 'border-sky-500/50 bg-sky-500/[0.08]',
                  !selected && daySignals.length > 0 && 'hover:border-zinc-700 hover:bg-black/30',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={cn('font-mono text-[11px]', selected ? 'text-sky-300' : 'text-zinc-400')}>
                    {date.getDate()}
                  </span>
                  {dayUpdates.length > 0 && (
                    <span className="rounded-sm border border-sky-500/30 bg-sky-500/[0.08] px-1 py-[1px] font-mono text-[8px] text-sky-300">
                      {dayUpdates.length} change{dayUpdates.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {daySignals.length > 0 && (
                  <div className="mt-2">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                      {daySignals.length} analys{daySignals.length === 1 ? 'is' : 'es'}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {symbols.map((ticker) => (
                        <span key={ticker} className="rounded-sm bg-zinc-800/80 px-1 py-[1px] font-mono text-[8px] text-zinc-300">
                          {ticker}
                        </span>
                      ))}
                      {new Set(daySignals.map((s) => s.symbol)).size > 3 && (
                        <span className="font-mono text-[8px] text-zinc-600">
                          +{new Set(daySignals.map((s) => s.symbol)).size - 3}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Panel>

      {rangeStart && (
        <>
          {selectedUpdates.length > 0 && (
            <Panel
              title="Material changes in selected period"
              subtitle="These are recorded changes in direction or evidence strength, not ordinary price movement."
              right={<DemoBadge />}
            >
              <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                {selectedUpdates.map((update) => (
                  <div key={update.id} className="rounded-sm border border-sky-500/25 bg-sky-500/[0.04] p-2.5">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                      <ArrowLeftRight className="h-3 w-3 text-sky-400" aria-hidden="true" />
                      <span className="font-semibold text-zinc-100">{update.symbol}</span>
                      <span className="text-zinc-500">{update.prev_direction} {update.prev_score}</span>
                      <span className="text-zinc-700">→</span>
                      <span className={scoreColor(update.new_score)}>{update.new_direction} {update.new_score}</span>
                      <span className="ml-auto text-zinc-600">{stampET(update.created_at)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{update.reason}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel
            title={rangeStart === rangeEnd ? `Records for ${prettyDay(rangeStart)}` : 'Records for selected date range'}
            subtitle={`${selectedSignals.length} preserved analysis record${selectedSignals.length === 1 ? '' : 's'} in this period.`}
            bodyClassName="p-0"
          >
            {selectedSignals.length ? (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[980px] text-left text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[#101318] font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      {['Time', 'Symbol', 'Direction', 'Trade state', 'Opportunity', 'Confidence', 'Risk', 'Strike', 'Expiration', 'Invalidation', 'Context', ''].map((heading, index) => (
                        <th key={`${heading}-${index}`} scope="col" className="whitespace-nowrap px-2 py-2">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {selectedSignals.map((signal) => (
                      <tr key={signal.id} className="transition-colors hover:bg-black/30">
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-zinc-500">{stampET(signal.generated_at)}</td>
                        <td className="px-2 py-1.5 font-mono font-semibold text-zinc-100">{signal.symbol}</td>
                        <td className="px-2 py-1.5"><DirectionTag direction={signal.direction} /></td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-zinc-300">{signal.strategy}</td>
                        <td className={cn('px-2 py-1.5 font-mono font-semibold tabular-nums', scoreColor(signal.opportunity_score))}>{signal.opportunity_score}</td>
                        <td className={cn('px-2 py-1.5 font-mono tabular-nums', scoreColor(signal.confidence_score))}>{signal.confidence_score}</td>
                        <td className="px-2 py-1.5"><RiskTag level={signal.risk_level} /></td>
                        <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{num(signal.suggested_strike) ?? <Unavailable />}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-zinc-400">{signal.suggested_expiration ?? <Unavailable />}</td>
                        <td className="px-2 py-1.5 font-mono tabular-nums text-amber-300">{num(signal.invalidation_level) ?? <Unavailable />}</td>
                        <td className="max-w-[280px] px-2 py-1.5 text-[10px] leading-snug text-zinc-500">
                          <span className="line-clamp-2">{signal.no_trade_reason ?? signal.catalyst_summary ?? '—'}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenThesis(signal.id)}
                            className="font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                          >
                            analysis
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-3 py-3 text-[11px] text-zinc-500">
                No preserved analysis records match this date range and ticker filter.
              </div>
            )}
          </Panel>
        </>
      )}

      {!rangeStart && (
        <EmptyState
          title="Select a date to inspect"
          body="Choose a day on the calendar, then optionally choose a second date to analyze a range."
          action={<CalendarDays className="h-4 w-4 text-sky-400" aria-hidden="true" />}
        />
      )}

      <Disclaimer />
    </div>
  );
};

export default SignalHistoryView;
