import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, Search, X,
} from 'lucide-react';
import { fetchSignalHistory, fetchSignalUpdates, fetchTickers } from '@/lib/api';
import { fetchModifications, fetchStoredObservations, fetchTradeCycleThesisEvents, fetchTradeRecords } from '@/lib/behavioral/api';
import { isClosed, tradePl } from '@/lib/behavioral/engine';
import type { Observation, TradeCycleThesisEvent, TradeModification, TradeRecord } from '@/lib/behavioral/types';
import type { Signal, SignalUpdate, Ticker } from '@/lib/types';
import { num, scoreColor, signedMoney, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
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

const tradeDayKey = (trade: TradeRecord) =>
  trade.session_date ?? dayKey(trade.entry_at ?? trade.created_at);

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

const isFlaggedObservation = (observation: Observation) =>
  observation.severity === 'MODERATE' || observation.severity === 'ELEVATED' || observation.severity === 'HIGH';

export const SignalHistoryView: React.FC<{ onOpenThesis: (id: number) => void }> = ({ onOpenThesis }) => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [updates, setUpdates] = useState<SignalUpdate[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [thesisEvents, setThesisEvents] = useState<TradeCycleThesisEvent[]>([]);
  const [modifications, setModifications] = useState<TradeModification[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [symbol, setSymbol] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date());
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [sig, up, tk] = await Promise.all([
      fetchSignalHistory(undefined, 250),
      fetchSignalUpdates(undefined, 120),
      fetchTickers(),
    ]);

    setSignals(sig);
    setUpdates(up);
    setTickers(tk);

    let loadedTrades: TradeRecord[] = [];
    if (user?.id) {
      const [tradeResult, observationResult, thesisEventResult, modificationResult] = await Promise.allSettled([
        fetchTradeRecords(user.id),
        fetchStoredObservations(user.id),
        fetchTradeCycleThesisEvents(user.id),
        fetchModifications(user.id),
      ]);
      loadedTrades = tradeResult.status === 'fulfilled' ? tradeResult.value : [];
      setTrades(loadedTrades);
      setObservations(observationResult.status === 'fulfilled' ? observationResult.value : []);
      setThesisEvents(thesisEventResult.status === 'fulfilled' ? thesisEventResult.value : []);
      setModifications(modificationResult.status === 'fulfilled' ? modificationResult.value : []);
    } else {
      setTrades([]);
      setObservations([]);
      setThesisEvents([]);
      setModifications([]);
    }

    const dated = [
      ...sig.map((s) => s.generated_at),
      ...loadedTrades.map((trade) => trade.entry_at ?? trade.created_at),
    ].filter(Boolean).sort();

    const latest = dated.at(-1) ?? sig.map((s) => s.generated_at).filter(Boolean).sort().at(-1);
    if (latest) {
      const latestDate = new Date(latest);
      const latestKey = dayKey(latestDate);
      setMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1));
      setRangeStart(latestKey);
      setRangeEnd(latestKey);
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredSignals = useMemo(
    () =>
      signals.filter((signal) => {
        if (symbol !== 'all' && signal.symbol !== symbol) return false;
        if (query && !signal.symbol.includes(query.toUpperCase())) return false;
        return true;
      }),
    [signals, symbol, query],
  );

  const filteredTrades = useMemo(
    () =>
      trades.filter((trade) => {
        if (symbol !== 'all' && trade.symbol !== symbol) return false;
        if (query && !trade.symbol.includes(query.toUpperCase())) return false;
        return true;
      }),
    [trades, symbol, query],
  );

  const recordsByDay = useMemo(() => {
    const map = new Map<string, Signal[]>();
    for (const signal of filteredSignals) {
      const key = dayKey(signal.generated_at);
      map.set(key, [...(map.get(key) ?? []), signal]);
    }
    return map;
  }, [filteredSignals]);

  const tradesByDay = useMemo(() => {
    const map = new Map<string, TradeRecord[]>();
    for (const trade of filteredTrades) {
      const key = tradeDayKey(trade);
      map.set(key, [...(map.get(key) ?? []), trade]);
    }
    return map;
  }, [filteredTrades]);

  const observationsByDay = useMemo(() => {
    const map = new Map<string, Observation[]>();
    for (const observation of observations) {
      if (!observation.session_date) continue;
      if (!isFlaggedObservation(observation)) continue;
      map.set(observation.session_date, [...(map.get(observation.session_date) ?? []), observation]);
    }
    return map;
  }, [observations]);

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
    return filteredSignals
      .filter((signal) => {
        const key = dayKey(signal.generated_at);
        return key >= rangeStart && key <= end;
      })
      .sort((a, b) => +new Date(b.generated_at) - +new Date(a.generated_at));
  }, [filteredSignals, rangeStart, rangeEnd]);

  const selectedTrades = useMemo(() => {
    if (!rangeStart) return [];
    const end = rangeEnd ?? rangeStart;
    return filteredTrades
      .filter((trade) => {
        const key = tradeDayKey(trade);
        return key >= rangeStart && key <= end;
      })
      .sort((a, b) => +new Date(b.entry_at ?? b.created_at) - +new Date(a.entry_at ?? a.created_at));
  }, [filteredTrades, rangeStart, rangeEnd]);

  const selectedObservations = useMemo(() => {
    if (!rangeStart) return [];
    const end = rangeEnd ?? rangeStart;
    return observations.filter((observation) =>
      Boolean(
        observation.session_date &&
        observation.session_date >= rangeStart &&
        observation.session_date <= end &&
        isFlaggedObservation(observation),
      ));
  }, [observations, rangeStart, rangeEnd]);

  const selectedUpdates = useMemo(() => {
    if (!rangeStart) return [];
    const end = rangeEnd ?? rangeStart;
    return updates
      .filter((update) => {
        if (symbol !== 'all' && update.symbol !== symbol) return false;
        if (query && !update.symbol.includes(query.toUpperCase())) return false;
        const key = dayKey(update.created_at);
        return key >= rangeStart && key <= end;
      })
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [updates, rangeStart, rangeEnd, symbol, query]);

  const selectedTrade = useMemo(
    () => trades.find((trade) => trade.id === selectedTradeId) ?? null,
    [trades, selectedTradeId],
  );

  const selectedTradeSignal = useMemo(
    () => selectedTrade?.signal_id ? signals.find((signal) => signal.id === selectedTrade.signal_id) ?? null : null,
    [selectedTrade, signals],
  );

  const selectedTradeEvents = useMemo(
    () => selectedTrade ? thesisEvents.filter((event) => event.trade_id === selectedTrade.id) : [],
    [selectedTrade, thesisEvents],
  );

  const selectedTradeModifications = useMemo(
    () => selectedTrade ? modifications.filter((modification) => modification.trade_id === selectedTrade.id) : [],
    [selectedTrade, modifications],
  );

  const selectedTradeObservations = useMemo(
    () => selectedTrade
      ? observations.filter((observation) =>
          observation.trade_id === selectedTrade.id || observation.evidence_trade_ids.includes(selectedTrade.id))
      : [],
    [selectedTrade, observations],
  );

  const selectedTradeTimeline = useMemo(() => {
    if (!selectedTrade) return [];
    const items: {
      key: string;
      at: string;
      kind: 'entry' | 'thesis' | 'action' | 'exit';
      label: string;
      detail: string;
    }[] = [];

    const entryAt = selectedTrade.entry_at ?? selectedTrade.created_at;
    items.push({
      key: `entry-${selectedTrade.id}`,
      at: entryAt,
      kind: 'entry',
      label: 'Position entered',
      detail: [
        selectedTrade.direction ? selectedTrade.direction : null,
        selectedTrade.entry_price !== null ? `entry ${num(selectedTrade.entry_price)}` : null,
        selectedTrade.position_size !== null ? `size ${signedMoney(selectedTrade.position_size)?.replace('+', '')}` : null,
      ].filter(Boolean).join(' · ') || 'Brokerage or trade-ledger entry recorded.',
    });

    for (const event of selectedTradeEvents) {
      items.push({
        key: `thesis-${event.id}`,
        at: event.created_at,
        kind: 'thesis',
        label: event.event_type.replaceAll('_', ' '),
        detail: [
          event.thesis_state ? `thesis ${event.thesis_state}` : null,
          event.thesis_support !== null ? `support ${num(event.thesis_support, 0)}` : null,
          event.directional_agreement !== null ? `agreement ${num(event.directional_agreement, 0)}%` : null,
          event.underlying_price !== null ? `underlying ${num(event.underlying_price)}` : null,
        ].filter(Boolean).join(' · ') || 'Meaningful thesis event recorded.',
      });
    }

    for (const modification of selectedTradeModifications) {
      items.push({
        key: `mod-${modification.id}`,
        at: modification.occurred_at,
        kind: 'action',
        label: modification.modification_type.replaceAll('_', ' '),
        detail: [
          modification.field_changed ? modification.field_changed : null,
          modification.previous_value !== null && modification.new_value !== null
            ? `${modification.previous_value} → ${modification.new_value}`
            : modification.new_value,
          modification.rationale,
        ].filter(Boolean).join(' · ') || 'Trader action recorded.',
      });
    }

    const exitAt = selectedTrade.exit_at ?? selectedTrade.closed_at;
    if (exitAt) {
      const pl = tradePl(selectedTrade);
      items.push({
        key: `exit-${selectedTrade.id}`,
        at: exitAt,
        kind: 'exit',
        label: 'Position closed',
        detail: [
          selectedTrade.exit_price !== null ? `exit ${num(selectedTrade.exit_price)}` : null,
          pl !== null ? `realized ${signedMoney(pl)}` : null,
          selectedTrade.thesis_review_status ? `thesis review: ${selectedTrade.thesis_review_status.replaceAll('_', ' ')}` : null,
        ].filter(Boolean).join(' · ') || 'Position close recorded.',
      });
    }

    return items.sort((a, b) => +new Date(a.at) - +new Date(b.at));
  }, [selectedTrade, selectedTradeEvents, selectedTradeModifications]);

  const selectedClosed = selectedTrades.filter(isClosed);
  const selectedPl = selectedClosed
    .map(tradePl)
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);

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

  if (loading) return <Spinner label="Loading TradeCycle activity" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Activity"
        title="TradeCycle Calendar"
        description="A chronological view of analyses, trades, meaningful thesis changes, outcomes, and flagged behavior. Select one day or a range to zoom into the underlying activity."
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
                onChange={(event) => setSymbol(event.target.value)}
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
                  onChange={(event) => setQuery(event.target.value)}
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
        subtitle="Each date summarizes the activity URSORA actually has. Click once for a day; click another date to analyze a range."
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
            const dayTrades = tradesByDay.get(key) ?? [];
            const dayClosed = dayTrades.filter(isClosed);
            const dayPl = dayClosed
              .map(tradePl)
              .filter((value): value is number => value !== null)
              .reduce((sum, value) => sum + value, 0);
            const dayUpdates = updatesByDay.get(key) ?? [];
            const dayFlags = observationsByDay.get(key) ?? [];
            const inMonth = date.getMonth() === month.getMonth();
            const selected = Boolean(rangeStart && key >= rangeStart && key <= (rangeEnd ?? rangeStart));
            const symbols = [...new Set([...dayTrades.map((trade) => trade.symbol), ...daySignals.map((signal) => signal.symbol)])].slice(0, 3);
            const hasActivity = dayTrades.length > 0 || daySignals.length > 0 || dayUpdates.length > 0 || dayFlags.length > 0;

            return (
              <button
                type="button"
                key={key}
                onClick={() => handleDayClick(key)}
                className={cn(
                  'min-h-[108px] rounded-md border p-2 text-left transition-colors',
                  inMonth ? 'border-zinc-800 bg-black/20' : 'border-zinc-900 bg-black/10 opacity-35',
                  selected && 'border-sky-500/50 bg-sky-500/[0.08]',
                  !selected && hasActivity && 'hover:border-zinc-700 hover:bg-black/30',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={cn('font-mono text-[11px]', selected ? 'text-sky-300' : 'text-zinc-400')}>
                    {date.getDate()}
                  </span>
                  {dayUpdates.length > 0 && (
                    <span className="rounded-sm border border-sky-500/30 bg-sky-500/[0.08] px-1 py-[1px] font-mono text-[8px] text-sky-300">
                      {dayUpdates.length} thesis
                    </span>
                  )}
                </div>

                {dayTrades.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    <div className="font-mono text-[9px] text-zinc-300">
                      {dayTrades.length} trade{dayTrades.length === 1 ? '' : 's'} · {dayClosed.length} closed
                    </div>
                    <div className={cn('font-mono text-[10px] font-semibold', dayPl > 0 ? 'text-emerald-400' : dayPl < 0 ? 'text-red-400' : 'text-zinc-500')}>
                      {signedMoney(dayPl) ?? '$0.00'} realized
                    </div>
                    {dayFlags.length > 0 && (
                      <div className="font-mono text-[9px] text-amber-300">
                        {dayFlags.length} flagged behavior{dayFlags.length === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                )}

                {daySignals.length > 0 && (
                  <div className={cn('font-mono text-[9px] uppercase tracking-wider text-zinc-500', dayTrades.length ? 'mt-1.5' : 'mt-2')}>
                    {daySignals.length} analys{daySignals.length === 1 ? 'is' : 'es'}
                  </div>
                )}

                {symbols.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {symbols.map((ticker) => (
                      <span key={ticker} className="rounded-sm bg-zinc-800/80 px-1 py-[1px] font-mono text-[8px] text-zinc-300">
                        {ticker}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Panel>

      {rangeStart && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Trades</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{selectedTrades.length}</div>
              <div className="text-[10px] text-zinc-500">{selectedClosed.length} closed</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Realized return</div>
              <div className={cn('mt-1 text-lg font-semibold', selectedPl > 0 ? 'text-emerald-400' : selectedPl < 0 ? 'text-red-400' : 'text-zinc-300')}>
                {signedMoney(selectedPl) ?? '$0.00'}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Flagged behaviors</div>
              <div className="mt-1 text-lg font-semibold text-amber-300">{selectedObservations.length}</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Analyses reviewed</div>
              <div className="mt-1 text-lg font-semibold text-sky-300">{selectedSignals.length}</div>
              <div className="text-[10px] text-zinc-500">{selectedUpdates.length} material thesis changes</div>
            </div>
          </div>

          {selectedTrades.length > 0 && (
            <Panel
              title="TradeCycles in selected period"
              subtitle="Brokerage-connected trades will populate this automatically. A linked analysis opens the market thesis associated with that trade."
            >
              <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {selectedTrades.map((trade) => {
                  const pl = isClosed(trade) ? tradePl(trade) : null;
                  return (
                    <article key={trade.id} className="rounded-md border border-zinc-800 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-mono text-sm font-semibold text-zinc-100">{trade.symbol}</div>
                          <div className="mt-0.5 text-[10px] text-zinc-500">
                            {trade.option_type ? trade.option_type.toUpperCase() : trade.asset_type ?? 'position'}
                            {trade.strike ? ` · ${num(trade.strike)} strike` : ''}
                          </div>
                        </div>
                        <span className={cn(
                          'rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase',
                          isClosed(trade)
                            ? 'border-zinc-700 text-zinc-400'
                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                        )}>
                          {isClosed(trade) ? 'closed' : 'open'}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-2.5">
                        <div>
                          <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Entry</div>
                          <div className="mt-0.5 font-mono text-[10px] text-zinc-300">{stampET(trade.entry_at ?? trade.created_at)}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">P/L</div>
                          <div className={cn('mt-0.5 font-mono text-[10px] font-semibold', (pl ?? 0) > 0 ? 'text-emerald-400' : (pl ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400')}>
                            {pl === null ? 'open' : signedMoney(pl)}
                          </div>
                        </div>
                        <div>
                          <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Origin</div>
                          <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-400">{trade.origin ?? 'unclassified'}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedTradeId(trade.id)}
                          className="font-mono text-[10px] uppercase tracking-wider text-sky-400 hover:text-sky-300"
                        >
                          review TradeCycle
                        </button>
                        {trade.signal_id && (
                          <button
                            type="button"
                            onClick={() => onOpenThesis(trade.signal_id as number)}
                            className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                          >
                            linked analysis
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </Panel>
          )}

          {(selectedObservations.length > 0 || selectedUpdates.length > 0) && (
            <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
              {selectedObservations.length > 0 && (
                <Panel
                  title="Flagged behavior"
                  subtitle="Observed process deviations recorded during the selected period. These are behavioral measurements, not psychological judgments."
                >
                  <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                    {selectedObservations.map((observation, index) => (
                      <div key={observation.id ?? `${observation.observation_type}-${index}`} className="rounded-sm border border-amber-500/25 bg-amber-500/[0.04] p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="rounded-sm border border-amber-500/30 px-1.5 py-[1px] font-mono text-[8px] uppercase text-amber-300">
                            {observation.severity}
                          </span>
                          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                            {observation.category}
                          </span>
                        </div>
                        <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-zinc-400">{observation.statement}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {selectedUpdates.length > 0 && (
                <Panel
                  title="Material thesis changes"
                  subtitle="These are evidence changes substantial enough to be recorded separately from ordinary market noise."
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


            </div>
          )}

          <Panel
            title={rangeStart === rangeEnd ? `Analysis history for ${prettyDay(rangeStart)}` : 'Analysis history for selected range'}
            subtitle={`${selectedSignals.length} preserved market analysis record${selectedSignals.length === 1 ? '' : 's'} in this period.`}
            bodyClassName="p-0"
          >
            {selectedSignals.length ? (
              <div className="max-h-[440px] overflow-auto">
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

      <div className="rounded-md border border-zinc-800 bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-zinc-600">
        The calendar is the chronological index. Analyses and trades remain separate records underneath it so URSORA never treats an analyzed ticker as a trade unless brokerage or trade-ledger data confirms one.
      </div>

      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70" role="dialog" aria-modal="true" aria-label="TradeCycle review">
          <div className="h-full w-full max-w-3xl overflow-y-auto border-l border-zinc-800 bg-[#0b0d10] shadow-2xl">
            <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-zinc-800 bg-[#0b0d10]/95 p-4 backdrop-blur">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-sky-400">TradeCycle review</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="font-mono text-xl font-semibold text-zinc-100">{selectedTrade.symbol}</h2>
                  <span className={cn(
                    'rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase',
                    isClosed(selectedTrade)
                      ? 'border-zinc-700 text-zinc-400'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                  )}>
                    {isClosed(selectedTrade) ? 'completed' : 'monitoring'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {selectedTrade.option_type ? selectedTrade.option_type.toUpperCase() : selectedTrade.asset_type ?? 'position'}
                  {selectedTrade.strike ? ` · ${num(selectedTrade.strike)} strike` : ''}
                  {selectedTrade.expiration ? ` · expires ${selectedTrade.expiration}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTradeId(null)}
                aria-label="Close TradeCycle review"
                className="rounded-sm border border-zinc-800 p-1.5 text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-zinc-800 bg-[#14171c] p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Origin</div>
                  <div className="mt-1 text-[11px] text-zinc-200">{selectedTrade.origin ?? 'unclassified'}</div>
                </div>
                <div className="rounded-md border border-zinc-800 bg-[#14171c] p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Thesis</div>
                  <div className="mt-1 text-[11px] text-zinc-200">
                    {selectedTrade.thesis_status ?? selectedTradeSignal?.score_breakdown?.thesis_state ?? 'not classified'}
                  </div>
                </div>
                <div className="rounded-md border border-zinc-800 bg-[#14171c] p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Process adherence</div>
                  <div className="mt-1 text-[11px] text-zinc-200">
                    {selectedTrade.process_adherence !== null ? `${num(selectedTrade.process_adherence, 0)}/100` : 'not recorded'}
                  </div>
                </div>
                <div className="rounded-md border border-zinc-800 bg-[#14171c] p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Realized P/L</div>
                  <div className={cn(
                    'mt-1 font-mono text-[11px] font-semibold',
                    (tradePl(selectedTrade) ?? 0) > 0 ? 'text-emerald-400' : (tradePl(selectedTrade) ?? 0) < 0 ? 'text-red-400' : 'text-zinc-300',
                  )}>
                    {tradePl(selectedTrade) === null ? 'open' : signedMoney(tradePl(selectedTrade))}
                  </div>
                </div>
              </div>

              <Panel
                title="TradeCycle timeline"
                subtitle="Entry, meaningful thesis events, recorded trader actions, and exit are shown in chronological order."
                bodyClassName="p-0"
              >
                {selectedTradeTimeline.length ? (
                  <ol className="divide-y divide-zinc-800/70">
                    {selectedTradeTimeline.map((item) => (
                      <li key={item.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[110px_18px_1fr]">
                        <div className="font-mono text-[9px] text-zinc-600">{stampET(item.at)}</div>
                        <div className={cn(
                          'mt-1 h-2.5 w-2.5 rounded-full border',
                          item.kind === 'entry' ? 'border-emerald-500 bg-emerald-500/20'
                            : item.kind === 'thesis' ? 'border-sky-500 bg-sky-500/20'
                              : item.kind === 'action' ? 'border-amber-500 bg-amber-500/20'
                                : 'border-zinc-500 bg-zinc-500/20',
                        )} />
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-300">{item.label}</div>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{item.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="px-3 py-3 text-[11px] text-zinc-500">No lifecycle events have been recorded for this TradeCycle yet.</div>
                )}
              </Panel>

              <div className="grid gap-3 xl:grid-cols-2">
                <Panel
                  title="Thesis at origin"
                  subtitle="The starting directional idea and the basis URSORA stored or inferred when the position entered monitoring."
                >
                  <div className="space-y-2 text-[11px] leading-relaxed text-zinc-400">
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Direction · </span>
                      {selectedTrade.inferred_thesis_direction ?? selectedTrade.direction ?? selectedTradeSignal?.direction ?? 'not recorded'}
                    </div>
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Inference basis · </span>
                      {selectedTrade.thesis_inference_basis ?? 'No inference basis has been stored for this trade.'}
                    </div>
                    {selectedTradeSignal && (
                      <button
                        type="button"
                        onClick={() => onOpenThesis(selectedTradeSignal.id)}
                        className="font-mono text-[10px] uppercase tracking-wider text-sky-400 hover:text-sky-300"
                      >
                        open full origin analysis
                      </button>
                    )}
                  </div>
                </Panel>

                <Panel
                  title="Post-trade review"
                  subtitle="Thesis validity and execution outcome are kept separate."
                >
                  <div className="space-y-2 text-[11px] leading-relaxed text-zinc-400">
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Thesis review · </span>
                      {selectedTrade.thesis_review_status?.replaceAll('_', ' ') ?? (isClosed(selectedTrade) ? 'not reviewed yet' : 'position still open')}
                    </div>
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Review summary · </span>
                      {selectedTrade.thesis_review_summary ?? 'No post-trade thesis summary has been stored yet.'}
                    </div>
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Outcome · </span>
                      {selectedTrade.result ?? (isClosed(selectedTrade) ? 'closed' : 'open')}
                    </div>
                  </div>
                </Panel>
              </div>

              {selectedTradeObservations.length > 0 && (
                <Panel
                  title="Behavioral observations tied to this TradeCycle"
                  subtitle="Measured process observations associated with this specific trade or with evidence sets that include it."
                >
                  <div className="grid gap-2 md:grid-cols-2">
                    {selectedTradeObservations.map((observation, index) => (
                      <div key={observation.id ?? `${observation.observation_type}-${index}`} className="rounded-sm border border-amber-500/25 bg-amber-500/[0.04] p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-sm border border-amber-500/30 px-1.5 py-[1px] font-mono text-[8px] uppercase text-amber-300">{observation.severity}</span>
                          <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">{observation.category}</span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{observation.statement}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <div className="rounded-md border border-zinc-800 bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-zinc-600">
                The timeline only displays events URSORA has actually recorded. Missing thesis events or trader-response events remain absent rather than being inferred after the fact.
              </div>
            </div>
          </div>
        </div>
      )}

      <Disclaimer />
    </div>
  );
};

export default SignalHistoryView;
