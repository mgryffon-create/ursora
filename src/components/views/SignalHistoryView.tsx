import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import {
  fetchModifications,
  fetchStoredObservations,
  fetchBrokerageTradeRecords,
  fetchTradeCycleThesisEvents,
} from '@/lib/behavioral/api';
import { isClosed, tradePl } from '@/lib/behavioral/engine';
import type {
  Observation,
  TradeCycleThesisEvent,
  TradeModification,
  TradeRecord,
} from '@/lib/behavioral/types';
import { num, signedMoney, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { Disclaimer, EmptyState, Panel, SectionHeading, Spinner } from '@/components/common/Primitives';
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

const tradeInstrument = (trade: TradeRecord) => {
  if (trade.option_symbol) return trade.option_symbol;
  if (trade.option_type && trade.strike) {
    return `${trade.symbol} ${num(trade.strike)} ${trade.option_type.toUpperCase()}${trade.expiration ? ` · ${trade.expiration}` : ''}`;
  }
  return trade.symbol;
};

export const SignalHistoryView: React.FC<{
  onOpenThesis: (id: number) => void;
  onOpenHistoricalEvidence?: (tradeIds: number[]) => void;
}> = ({ onOpenThesis, onOpenHistoricalEvidence }) => {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [thesisEvents, setThesisEvents] = useState<TradeCycleThesisEvent[]>([]);
  const [modifications, setModifications] = useState<TradeModification[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    if (!user?.id) {
      setTrades([]);
      setObservations([]);
      setThesisEvents([]);
      setModifications([]);
      setLoading(false);
      return;
    }

    const [tradeResult, observationResult, thesisEventResult, modificationResult] = await Promise.allSettled([
      fetchBrokerageTradeRecords(user.id),
      fetchStoredObservations(user.id),
      fetchTradeCycleThesisEvents(user.id),
      fetchModifications(user.id),
    ]);

    const loadedTrades = (tradeResult.status === 'fulfilled' ? tradeResult.value : [])
      .slice()
      .sort((a, b) => +new Date(b.entry_at ?? b.created_at) - +new Date(a.entry_at ?? a.created_at));
    setTrades(loadedTrades);
    setObservations(observationResult.status === 'fulfilled' ? observationResult.value : []);
    setThesisEvents(thesisEventResult.status === 'fulfilled' ? thesisEventResult.value : []);
    setModifications(modificationResult.status === 'fulfilled' ? modificationResult.value : []);

    const latest = loadedTrades
      .map((trade) => trade.entry_at ?? trade.created_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    if (latest) {
      const latestDate = new Date(latest);
      const key = tradeDayKey(loadedTrades
        .slice()
        .sort((a, b) => +new Date(b.entry_at ?? b.created_at) - +new Date(a.entry_at ?? a.created_at))[0]);
      setMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1));
      setSelectedDay(key);
    } else {
      setSelectedDay(null);
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const filteredTrades = useMemo(() => {
    const needle = query.trim().toUpperCase();
    if (!needle) return trades;
    return trades.filter((trade) =>
      trade.symbol.toUpperCase().includes(needle)
      || tradeInstrument(trade).toUpperCase().includes(needle));
  }, [query, trades]);

  const tradesByDay = useMemo(() => {
    const map = new Map<string, TradeRecord[]>();
    for (const trade of filteredTrades) {
      const key = tradeDayKey(trade);
      map.set(key, [...(map.get(key) ?? []), trade]);
    }
    return map;
  }, [filteredTrades]);

  const flaggedByDay = useMemo(() => {
    const map = new Map<string, Observation[]>();
    for (const observation of observations) {
      if (!observation.session_date || !isFlaggedObservation(observation)) continue;
      map.set(observation.session_date, [...(map.get(observation.session_date) ?? []), observation]);
    }
    return map;
  }, [observations]);

  const calendarDays = useMemo(() => {
    const start = startOfMonthGrid(month);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const dayTrades = useMemo(
    () => selectedDay ? (tradesByDay.get(selectedDay) ?? []) : [],
    [selectedDay, tradesByDay],
  );

  const selectedTrade = useMemo(
    () => trades.find((trade) => trade.id === selectedTradeId) ?? null,
    [selectedTradeId, trades],
  );

  const selectedTradeEvents = useMemo(
    () => selectedTrade
      ? thesisEvents.filter((event) => event.trade_id === selectedTrade.id)
      : [],
    [selectedTrade, thesisEvents],
  );

  const selectedTradeModifications = useMemo(
    () => selectedTrade
      ? modifications.filter((modification) => modification.trade_id === selectedTrade.id)
      : [],
    [selectedTrade, modifications],
  );

  const selectedTradeObservations = useMemo(
    () => selectedTrade
      ? observations.filter((observation) =>
          observation.trade_id === selectedTrade.id
          || observation.evidence_trade_ids.includes(selectedTrade.id))
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
        tradeInstrument(selectedTrade),
        selectedTrade.entry_price !== null ? `fill ${num(selectedTrade.entry_price)}` : null,
        selectedTrade.position_size !== null ? `position ${signedMoney(selectedTrade.position_size)?.replace('+', '')}` : null,
      ].filter(Boolean).join(' · '),
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
        ].filter(Boolean).join(' · ') || 'Material TradeCycle change recorded.',
      });
    }

    for (const modification of selectedTradeModifications) {
      items.push({
        key: `mod-${modification.id}`,
        at: modification.occurred_at,
        kind: 'action',
        label: modification.modification_type.replaceAll('_', ' '),
        detail: [
          modification.field_changed,
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
          selectedTrade.exit_price !== null ? `fill ${num(selectedTrade.exit_price)}` : null,
          pl !== null ? `realized ${signedMoney(pl)}` : null,
        ].filter(Boolean).join(' · ') || 'Position close recorded.',
      });
    }

    return items.sort((a, b) => +new Date(a.at) - +new Date(b.at));
  }, [selectedTrade, selectedTradeEvents, selectedTradeModifications]);

  if (loading) return <Spinner label="Loading trading activity" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Activity"
        title="Your actual trading timeline"
        description="Activity is built from trades you actually placed. Market analyses only appear when they are attached to a trade or become relevant to its TradeCycle."
      />

      {!user ? (
        <EmptyState
          title="Sign in to view trading activity"
          body="Activity is based on your private brokerage and TradeCycle history."
        />
      ) : trades.length === 0 ? (
        <EmptyState
          title="No trade episodes available yet"
          body="URSORA has not reconstructed a brokerage trade episode for this account yet. Account balances and holdings are not treated as trading activity."
        />
      ) : (
        <>
          <Panel bodyClassName="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="activity-search" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Find a trade
                </label>
                <div className="mt-1 flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-black/40 px-2 focus-within:border-sky-500/60">
                  <Search className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                  <input
                    id="activity-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="NVDA or contract"
                    className="w-44 bg-transparent py-1 font-mono text-xs uppercase text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
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
            </div>
          </Panel>

          <Panel
            title="Trade dates"
            subtitle="Only dates with actual trade episodes are emphasized. Analyses without a trade do not populate this calendar."
          >
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                <div key={label} className="px-1 pb-1 text-center font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                  {label}
                </div>
              ))}
              {calendarDays.map((date) => {
                const key = dayKey(date);
                const dateTrades = tradesByDay.get(key) ?? [];
                const flags = flaggedByDay.get(key) ?? [];
                const inMonth = date.getMonth() === month.getMonth();
                const selected = selectedDay === key;
                const closed = dateTrades.filter(isClosed);
                const realized = closed
                  .map(tradePl)
                  .filter((value): value is number => value !== null)
                  .reduce((sum, value) => sum + value, 0);

                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => dateTrades.length && setSelectedDay(key)}
                    disabled={dateTrades.length === 0}
                    className={cn(
                      'min-h-[88px] rounded-md border p-2 text-left transition-colors',
                      inMonth ? 'border-zinc-800 bg-black/20' : 'border-zinc-900 bg-black/10 opacity-30',
                      dateTrades.length === 0 && 'cursor-default opacity-35',
                      dateTrades.length > 0 && 'hover:border-zinc-700',
                      selected && 'border-sky-500/55 bg-sky-500/[0.08]',
                    )}
                  >
                    <div className={cn('font-mono text-[10px]', selected ? 'text-sky-300' : 'text-zinc-500')}>
                      {date.getDate()}
                    </div>
                    {dateTrades.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        <div className="font-mono text-[9px] text-zinc-200">
                          {dateTrades.length} trade{dateTrades.length === 1 ? '' : 's'}
                        </div>
                        <div className={cn(
                          'font-mono text-[9px] font-semibold',
                          realized > 0 ? 'text-emerald-400' : realized < 0 ? 'text-red-400' : 'text-zinc-500',
                        )}>
                          {signedMoney(realized) ?? '$0.00'}
                        </div>
                        {flags.length > 0 && (
                          <div className="font-mono text-[8px] uppercase tracking-wider text-amber-300">
                            {flags.length} behavior flag{flags.length === 1 ? '' : 's'}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Panel>

          {selectedDay ? (
            <Panel
              title={`Trades on ${prettyDay(selectedDay)}`}
              subtitle="These are recorded trade episodes. Open one to inspect its TradeCycle timeline."
            >
              {dayTrades.length ? (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {dayTrades.map((trade) => {
                    const pl = tradePl(trade);
                    const heldMs = (trade.exit_at ?? trade.closed_at)
                      ? +new Date(trade.exit_at ?? trade.closed_at ?? 0) - +new Date(trade.entry_at ?? trade.created_at)
                      : null;
                    const heldMinutes = heldMs === null ? null : Math.max(0, Math.round(heldMs / 60000));

                    return (
                      <article key={trade.id} className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-[12px] font-semibold text-zinc-100">{trade.symbol}</div>
                            <div className="mt-0.5 text-[10px] text-zinc-400">{tradeInstrument(trade)}</div>
                          </div>
                          <span className={cn(
                            'rounded-sm border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider',
                            isClosed(trade)
                              ? 'border-zinc-700 text-zinc-400'
                              : 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300',
                          )}>
                            {isClosed(trade) ? 'closed' : 'open'}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-800 pt-2.5">
                          <div>
                            <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Entry</div>
                            <div className="mt-0.5 font-mono text-[10px] text-zinc-300">{stampET(trade.entry_at ?? trade.created_at)}</div>
                          </div>
                          <div>
                            <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Held</div>
                            <div className="mt-0.5 font-mono text-[10px] text-zinc-300">
                              {heldMinutes === null ? 'open' : heldMinutes < 60 ? `${heldMinutes}m` : `${Math.floor(heldMinutes / 60)}h ${heldMinutes % 60}m`}
                            </div>
                          </div>
                          <div>
                            <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Entry / exit</div>
                            <div className="mt-0.5 font-mono text-[10px] text-zinc-300">
                              {trade.entry_price !== null ? num(trade.entry_price) : '—'} → {trade.exit_price !== null ? num(trade.exit_price) : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Realized</div>
                            <div className={cn(
                              'mt-0.5 font-mono text-[10px] font-semibold',
                              (pl ?? 0) > 0 ? 'text-emerald-400' : (pl ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400',
                            )}>
                              {pl === null ? 'open' : signedMoney(pl)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedTradeId(trade.id)}
                            className="font-mono text-[10px] uppercase tracking-wider text-sky-400 hover:text-sky-300"
                          >
                            review TradeCycle
                          </button>
                          {onOpenHistoricalEvidence && isClosed(trade) && (
                            <button
                              type="button"
                              onClick={() => onOpenHistoricalEvidence([trade.id])}
                              className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                            >
                              historical evidence
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500">No trades match the current filter for this date.</div>
              )}
            </Panel>
          ) : (
            <EmptyState
              title="Select a trade date"
              body="Choose a highlighted date to inspect the trades you actually placed."
              action={<CalendarDays className="h-4 w-4 text-sky-400" aria-hidden="true" />}
            />
          )}
        </>
      )}

      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70" role="dialog" aria-modal="true" aria-label="TradeCycle review">
          <div className="h-full w-full max-w-3xl overflow-y-auto border-l border-zinc-800 bg-[#0b0d10] shadow-2xl">
            <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-zinc-800 bg-[#0b0d10]/95 p-4 backdrop-blur">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-sky-400">TradeCycle review</div>
                <h2 className="mt-1 font-mono text-xl font-semibold text-zinc-100">{tradeInstrument(selectedTrade)}</h2>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Actual brokerage episode · {stampET(selectedTrade.entry_at ?? selectedTrade.created_at)}
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
                  <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Entry</div>
                  <div className="mt-1 text-[11px] text-zinc-200">{num(selectedTrade.entry_price) ?? 'not recorded'}</div>
                </div>
                <div className="rounded-md border border-zinc-800 bg-[#14171c] p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Exit</div>
                  <div className="mt-1 text-[11px] text-zinc-200">{num(selectedTrade.exit_price) ?? (isClosed(selectedTrade) ? 'not recorded' : 'open')}</div>
                </div>
                <div className="rounded-md border border-zinc-800 bg-[#14171c] p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Direction</div>
                  <div className="mt-1 text-[11px] text-zinc-200">{selectedTrade.direction ?? 'not classified'}</div>
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
                subtitle="Entry, material thesis events, recorded trader actions, and exit. Nothing unrelated to this trade is included."
                bodyClassName="p-0"
              >
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
              </Panel>

              {onOpenHistoricalEvidence && isClosed(selectedTrade) && (
                <button
                  type="button"
                  onClick={() => onOpenHistoricalEvidence([selectedTrade.id])}
                  className="font-mono text-[10px] uppercase tracking-wider text-sky-400 hover:text-sky-300"
                >
                  open this trade in Historical Evidence
                </button>
              )}

              {selectedTrade.signal_id && (
                <button
                  type="button"
                  onClick={() => onOpenThesis(selectedTrade.signal_id as number)}
                  className="font-mono text-[10px] uppercase tracking-wider text-sky-400 hover:text-sky-300"
                >
                  open analysis linked to this trade
                </button>
              )}

              {selectedTradeObservations.length > 0 && (
                <Panel
                  title="Behavioral evidence tied to this trade"
                  subtitle="Only observations whose evidence set contains this trade."
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
                Activity is a record of trader behavior. General market analyses that never became part of a trade are intentionally excluded.
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
