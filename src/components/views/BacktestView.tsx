import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3, History, Loader2 } from 'lucide-react';
import { fetchHistoricalPlayback, normalizeStoredBrokerageTrades, reconstructHistoricalTrades, type HistoricalPlaybackResponse } from '@/lib/api';
import { fetchBrokerageTradeRecords } from '@/lib/behavioral/api';
import type { TradeRecord } from '@/lib/behavioral/types';
import { useAuth } from '@/contexts/AuthContext';
import { SessionPlaybackChart } from '@/components/charts/PriceChart';
import { Disclaimer, EmptyState, Panel, SectionHeading, Spinner } from '@/components/common/Primitives';
import { cn } from '@/lib/utils';
import { signedMoney } from '@/lib/format';
import type { Bar as MarketBar } from '@/lib/types';
import { historicalEntryHeadline } from '@/lib/historicalEntryHeadline';

const dateET = (value: string | null | undefined) => {
  if (!value) return 'Date unavailable';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  return new Date(normalized).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const timeET = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

const tradeDayKey = (trade: TradeRecord) => {
  const value = trade.entry_at ?? trade.created_at;
  return new Date(value).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const prettyDay = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const tradeLabel = (trade: TradeRecord) => {
  if (trade.option_symbol) return trade.option_symbol;
  if (trade.option_type && trade.strike && trade.expiration) {
    return trade.symbol + ' ' + trade.expiration + ' ' + trade.strike + ' ' + trade.option_type.toUpperCase();
  }
  return trade.symbol;
};

const etKey = (value: string) =>
  new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const etMinute = (value: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
};

const medianLocal = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};

const HistoricalIndicatorReadouts: React.FC<{
  bars: MarketBar[];
  entryAt: string;
  at: string | null;
}> = ({ bars, entryAt, at }) => {
  const data = useMemo(() => {
    const ordered = [...bars].sort((a, b) => +new Date(a.bar_time) - +new Date(b.bar_time));
    if (!ordered.length) return [];

    const sessions = new Map<string, MarketBar[]>();
    ordered.forEach((bar) => {
      const key = etKey(bar.bar_time);
      const list = sessions.get(key) ?? [];
      list.push(bar);
      sessions.set(key, list);
    });

    return ordered.map((bar) => {
      const sessionKey = etKey(bar.bar_time);
      const sessionBars = sessions.get(sessionKey) ?? [];
      const index = sessionBars.findIndex((candidate) => candidate.bar_time === bar.bar_time);
      const throughBar = sessionBars.slice(0, Math.max(0, index) + 1);

      let cumulativePV = 0;
      let cumulativeVolume = 0;
      throughBar.forEach((candidate) => {
        const volume = Number(candidate.volume ?? 0);
        const typical = (Number(candidate.high) + Number(candidate.low) + Number(candidate.close)) / 3;
        cumulativePV += typical * Math.max(0, volume);
        cumulativeVolume += Math.max(0, volume);
      });
      const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : null;

      const slot = Math.floor((etMinute(bar.bar_time) - 570) / 5);
      const barTime = +new Date(bar.bar_time);
      const comparable = ordered
        .filter((candidate) => +new Date(candidate.bar_time) < barTime)
        .filter((candidate) => etKey(candidate.bar_time) !== sessionKey)
        .filter((candidate) => Math.floor((etMinute(candidate.bar_time) - 570) / 5) === slot)
        .map((candidate) => Number(candidate.volume ?? 0))
        .filter((value) => value > 0);
      const baseVolume = medianLocal(comparable);
      const volume = Number(bar.volume ?? 0);
      const relativeVolume = baseVolume && baseVolume > 0 ? volume / baseVolume : null;

      const momentumIndex = Math.max(0, index - 6);
      const momentumBase = Number(sessionBars[momentumIndex]?.close ?? bar.close);
      const momentum30 = index >= 6 && momentumBase !== 0 ? ((Number(bar.close) - momentumBase) / momentumBase) * 100 : null;

      let rsi14: number | null = null;
      if (throughBar.length >= 15) {
        const recent = throughBar.slice(-15).map((candidate) => Number(candidate.close));
        const changes = recent.slice(1).map((value, i) => value - recent[i]);
        const gains = changes.map((value) => Math.max(0, value));
        const losses = changes.map((value) => Math.max(0, -value));
        const avgGain = gains.reduce((sum, value) => sum + value, 0) / gains.length;
        const avgLoss = losses.reduce((sum, value) => sum + value, 0) / losses.length;
        rsi14 = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - (100 / (1 + avgGain / avgLoss));
      }

      return {
        at: bar.bar_time,
        relativeVolume,
        vwapDistance: vwap && vwap !== 0 ? ((Number(bar.close) - vwap) / vwap) * 100 : null,
        momentum30,
        rsi14,
      };
    });
  }, [bars]);

  if (!data.length) return null;

  const metric = (value: number | null | undefined, suffix = '', digits = 2) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? '—'
      : `${value.toFixed(digits)}${suffix}`;

  const cutoff = +new Date(at ?? entryAt);
  const preceding = data.filter((point) => at ? +new Date(point.at) <= cutoff : +new Date(point.at) + 5 * 60_000 <= cutoff);
  const snapshot = preceding[preceding.length - 1];
  const recent = preceding.slice(-12);
  const metrics = [
    { key: 'relativeVolume' as const, label: 'RVOL', suffix: '×', color: '#38bdf8', digits: 2 },
    { key: 'vwapDistance' as const, label: 'VWAP Δ', suffix: '%', color: '#a78bfa', digits: 2 },
    { key: 'momentum30' as const, label: '30m MOM', suffix: '%', color: '#38bdf8', digits: 2 },
    { key: 'rsi14' as const, label: 'RSI 14', suffix: '', color: '#34d399', digits: 1 },
  ];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[80px] border-b border-zinc-800 bg-[#14171c]">
      <div className="grid grid-cols-4 divide-x divide-zinc-800">
        {metrics.map(({ key, label, suffix, color, digits }) => {
          const values = recent.map((point) => point[key]).filter((value): value is number => value !== null && Number.isFinite(value));
          const min = Math.min(...values), max = Math.max(...values);
          const span = max - min || 1;
          const points = recent.map((point, index) => point[key] === null ? null : `${(index / Math.max(1, recent.length - 1)) * 100},${20 - ((Number(point[key]) - min) / span) * 18}`);
          // Missing values break the trace instead of being plotted as zero.
          const segments = points.reduce<string[][]>((result, point) => {
            if (point === null) result.push([]);
            else result[result.length - 1].push(point);
            return result;
          }, [[]]);
          return (
            <div key={key} className="min-w-0 px-2 pt-1">
              <div className="font-mono text-[8px] text-zinc-500">{label}</div>
              <div className="font-mono text-[11px] tabular-nums" style={{ color }}>{metric(snapshot?.[key], suffix, digits)}</div>
              <svg aria-hidden="true" className="mt-0.5 h-[20px] w-full" viewBox="0 0 100 22" preserveAspectRatio="none">
                {segments.filter((segment) => segment.length > 1).map((segment, index) => <polyline key={index} points={segment.join(' ')} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />)}
              </svg>
            </div>
          );
        })}
      </div>
      <div className="px-2 pt-1 font-mono text-[8px] text-zinc-500">{at ? 'Bar' : 'Before entry'} · {timeET(at ?? entryAt)} · recent indicator context</div>
    </div>
  );
};

export const BacktestView: React.FC<{ initialTradeIds?: number[]; initialDay?: string | null }> = ({ initialTradeIds = [], initialDay = null }) => {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(initialTradeIds[0] ?? null);
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDay);
  const [tradeListCollapsed, setTradeListCollapsed] = useState(false);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [playback, setPlayback] = useState<HistoricalPlaybackResponse | null>(null);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [reconstructionBusy, setReconstructionBusy] = useState(false);
  const [reconstructionNote, setReconstructionNote] = useState<string | null>(null);
  const [reviewGeneration, setReviewGeneration] = useState(0);
  const reconstructedKey = useRef<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        let rows = user ? await fetchBrokerageTradeRecords(user.id) : [];

        // Activity-derived fallback trades use temporary synthetic IDs beginning at
        // -1000000. Historical replay requires canonical snaptrade_trade_episodes
        // IDs, so normalize the already-synced activities locally before rendering.
        // This does not call the brokerage provider or consume provider quota.
        const usingSyntheticActivityFallback = rows.some((trade) => trade.id <= -1000000);
        if (user && usingSyntheticActivityFallback) {
          setReconstructionNote('Preparing synced brokerage activity for historical replay…');
          const normalized = await normalizeStoredBrokerageTrades();
          rows = await fetchBrokerageTradeRecords(user.id);
          if (active) {
            setReconstructionNote(
              `Prepared ${normalized.closed} closed brokerage episode${normalized.closed === 1 ? '' : 's'} for Historical Evidence.`,
            );
          }
        }

        if (!active) return;
        setTrades(rows);
      } catch (loadError) {
        if (active) {
          const message = loadError instanceof Error
            ? loadError.message
            : typeof loadError === 'string'
              ? loadError
              : (() => { try { return JSON.stringify(loadError); } catch { return 'Historical Evidence could not load brokerage history.'; } })();
          setError(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [user]);

  const closedTrades = useMemo(
    () => trades
      .filter((trade) => trade.broker === 'SnapTrade' && Boolean(trade.exit_at ?? trade.closed_at))
      .sort((a, b) => +new Date(b.entry_at ?? b.created_at) - +new Date(a.entry_at ?? a.created_at)),
    [trades],
  );

  const tradesByDay = useMemo(() => {
    const map = new Map<string, TradeRecord[]>();
    for (const trade of closedTrades) {
      const key = tradeDayKey(trade);
      map.set(key, [...(map.get(key) ?? []), trade]);
    }
    for (const [key, rows] of map) {
      map.set(key, rows.sort((a, b) => +new Date(a.entry_at ?? a.created_at) - +new Date(b.entry_at ?? b.created_at)));
    }
    return map;
  }, [closedTrades]);

  const tradeDays = useMemo(
    () => [...tradesByDay.keys()].sort((a, b) => b.localeCompare(a)),
    [tradesByDay],
  );

  useEffect(() => {
    if (!closedTrades.length) {
      setSelectedDay(null);
      return;
    }
    if (initialDay && tradesByDay.has(initialDay)) {
      setSelectedDay(initialDay);
      return;
    }
    if (initialTradeIds.length) {
      const wanted = new Set(initialTradeIds);
      const matched = closedTrades.find((trade) => wanted.has(trade.id));
      if (matched) {
        setSelectedDay(tradeDayKey(matched));
        return;
      }
    }
    setSelectedDay((current) => current && tradesByDay.has(current) ? current : tradeDays[0] ?? null);
  }, [closedTrades, initialDay, initialTradeIds, tradeDays, tradesByDay]);

  const visibleTrades = useMemo(
    () => selectedDay ? (tradesByDay.get(selectedDay) ?? []) : [],
    [selectedDay, tradesByDay],
  );

  const daySummary = useMemo(() => {
    if (!selectedDay) return null;
    const rows = tradesByDay.get(selectedDay) ?? [];
    const realized = rows.reduce((sum, trade) => sum + (Number(trade.realized_pl) || 0), 0);
    const tickers = [...new Set(rows.map((trade) => trade.symbol))];
    return { count: rows.length, realized, tickers };
  }, [selectedDay, tradesByDay]);

  useEffect(() => {
    reconstructedKey.current = '';
    if (!visibleTrades.length) {
      setSelectedTradeId(null);
      setPlayback(null);
      return;
    }
    if (selectedTradeId === null || !visibleTrades.some((trade) => trade.id === selectedTradeId)) {
      setSelectedTradeId(visibleTrades[0].id);
    }
  }, [selectedDay, selectedTradeId, visibleTrades]);

  const selectedTrade = useMemo(
    () => visibleTrades.find((trade) => trade.id === selectedTradeId) ?? null,
    [selectedTradeId, visibleTrades],
  );

  useEffect(() => {
    let active = true;
    setEvidenceExpanded(false);
    if (!selectedTradeId) {
      setPlayback(null);
      return () => { active = false; };
    }

    const loadSelectedReplay = async () => {
      setPlaybackBusy(true);
      setError(null);
      try {
        // First load/fill the immutable playback window. If the historical TradeCycle
        // review does not exist yet, reconstruct from those persisted bars and reload.
        let result = await fetchHistoricalPlayback(selectedTradeId);
        if (!active) return;
        setPlayback(result);

        const canonicalEpisode = selectedTradeId < 0 && selectedTradeId > -1000000;
        const episodeId = Math.abs(selectedTradeId);
        const reconstructionKey = String(episodeId);

        const needsDecisionEvidence = result.bars.length > 0 && (!result.review || result.review.engine_version !== 'historical-cycle-1.5');
        if (canonicalEpisode && needsDecisionEvidence && reconstructedKey.current !== reconstructionKey) {
          reconstructedKey.current = reconstructionKey;
          setReconstructionBusy(true);
          setReconstructionNote('Building the TradeCycle lookback from this trade’s stored historical bars…');

          const reconstruction = await reconstructHistoricalTrades([episodeId]);
          if (!active) return;

          if (reconstruction.failures.length) {
            setReconstructionNote(
              `TradeCycle lookback could not fully reconstruct: ${reconstruction.failures[0]}`,
            );
          } else {
            setReconstructionNote('Historical TradeCycle lookback ready.');
            result = await fetchHistoricalPlayback(selectedTradeId);
            if (!active) return;
            setPlayback(result);
          }
          setReviewGeneration((value) => value + 1);
        }
      } catch (playbackError) {
        if (!active) return;
        setPlayback(null);
        const message = playbackError instanceof Error
          ? playbackError.message
          : typeof playbackError === 'string'
            ? playbackError
            : (() => { try { return JSON.stringify(playbackError); } catch { return 'Historical playback could not be loaded.'; } })();
        setError(message);
      } finally {
        if (active) {
          setPlaybackBusy(false);
          setReconstructionBusy(false);
        }
      }
    };

    void loadSelectedReplay();
    return () => { active = false; };
  }, [selectedTradeId]);

  if (loading) return <Spinner label="Loading brokerage trade history" />;

  return (
    <div className="space-y-4">
      <div className="hidden sm:block"><SectionHeading
        eyebrow="Historical evidence"
        title="Replay your actual trades against the market"
        description="Historical Evidence starts with your brokerage executions, then layers the underlying market session and TradeCycle evidence around what you actually did. It is not a portfolio-performance report."
      /></div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/35 bg-amber-500/[0.07] p-3 text-[11px] text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {reconstructionNote && reconstructionBusy && (
        <div className="flex items-start gap-2 rounded-md border border-sky-500/25 bg-sky-500/[0.04] p-3 text-[11px] text-sky-100">
          {reconstructionBusy
            ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-400" aria-hidden="true" />
            : <History className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />}
          <span>{reconstructionNote}</span>
        </div>
      )}

      {!user ? (
        <EmptyState
          title="Sign in to view Historical Evidence"
          body="Historical Evidence is built from your private brokerage history and TradeCycle records."
        />
      ) : closedTrades.length === 0 ? (
        <EmptyState
          title="No closed brokerage trades available yet"
          body="Historical Evidence only uses closed trades from your SnapTrade brokerage history. Analysis-generated and simulated records are excluded."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 xl:hidden">
            <label className="min-w-0 text-[10px] text-zinc-400">Trade day
              <select aria-label="Trade day" value={selectedDay ?? ''} onChange={(event) => setSelectedDay(event.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-md border border-zinc-700 bg-[#111419] px-2 text-[12px] text-zinc-100">
                {tradeDays.map((day) => <option key={day} value={day}>{prettyDay(day)} · {tradesByDay.get(day)?.length} trades</option>)}
              </select>
            </label>
            <label className="min-w-0 text-[10px] text-zinc-400">Trade
              <select aria-label="Trade" value={selectedTradeId ?? ''} onChange={(event) => setSelectedTradeId(Number(event.target.value))} className="mt-1 h-11 w-full min-w-0 rounded-md border border-zinc-700 bg-[#111419] px-2 text-[12px] text-zinc-100">
                {visibleTrades.map((trade) => <option key={trade.id} value={trade.id}>{trade.symbol} · {timeET(trade.entry_at ?? trade.created_at)}</option>)}
              </select>
            </label>
          </div>
          <Panel
            className="hidden xl:block"
            title="Trade-day navigator"
            subtitle="Choose a day, then choose a trade. Trades are grouped by entry date; multi-day positions continue through their actual exit in the replay."
            bodyClassName="p-3"
          >
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tradeDays.map((day) => {
                const rows = tradesByDay.get(day) ?? [];
                const realized = rows.reduce((sum, trade) => sum + (Number(trade.realized_pl) || 0), 0);
                const tickers = [...new Set(rows.map((trade) => trade.symbol))];
                const active = day === selectedDay;
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      'min-w-[150px] rounded-md border px-3 py-2 text-left transition-colors',
                      active
                        ? 'border-sky-500/55 bg-sky-500/[0.08]'
                        : 'border-zinc-800 bg-black/20 hover:border-zinc-700',
                    )}
                  >
                    <div className={cn('font-mono text-[10px] uppercase tracking-wider', active ? 'text-sky-300' : 'text-zinc-400')}>
                      {prettyDay(day)}
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-zinc-500">
                      {rows.length} trade{rows.length === 1 ? '' : 's'} · {tickers.slice(0, 3).join(' · ')}
                    </div>
                    <div className={cn(
                      'mt-1 font-mono text-[10px] font-semibold',
                      realized > 0 ? 'text-emerald-400' : realized < 0 ? 'text-red-400' : 'text-zinc-500',
                    )}>
                      {signedMoney(realized) ?? '$0.00'}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className={cn(
            'grid gap-3',
            tradeListCollapsed
              ? 'xl:grid-cols-[44px_minmax(0,1fr)]'
              : 'xl:grid-cols-[330px_minmax(0,1fr)]',
          )}>
          {tradeListCollapsed ? (
            <button
              type="button"
              onClick={() => setTradeListCollapsed(false)}
              className="hidden min-h-[520px] rounded-md border border-zinc-800 bg-[#111419] font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500 hover:border-sky-500/40 hover:text-sky-300 xl:flex xl:items-center xl:justify-center"
              title="Show trades for this day"
            >
              <span className="[writing-mode:vertical-rl] rotate-180">Trades · {visibleTrades.length}</span>
            </button>
          ) : (
            <div className="hidden space-y-2 xl:block">
              <button
                type="button"
                onClick={() => setTradeListCollapsed(true)}
                className="flex w-full items-center justify-between rounded-sm border border-zinc-800 bg-black/20 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              >
                <span>Trades on {selectedDay ? prettyDay(selectedDay) : 'selected day'}</span>
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
          <Panel
            title={selectedDay ? `Trades on ${prettyDay(selectedDay)}` : 'Trade day'}
            subtitle={daySummary
              ? `${daySummary.count} trade${daySummary.count === 1 ? '' : 's'} · ${signedMoney(daySummary.realized) ?? '$0.00'} · ${daySummary.tickers.join(' · ')}`
              : 'Choose a trade day above.'}
            bodyClassName="p-2"
          >
            <div className="max-h-[720px] space-y-1.5 overflow-auto pr-1">
              {visibleTrades.map((trade) => {
                const active = trade.id === selectedTradeId;
                const closed = Boolean(trade.exit_at ?? trade.closed_at);
                return (
                  <button
                    type="button"
                    key={trade.id}
                    onClick={() => setSelectedTradeId(trade.id)}
                    className={cn(
                      'w-full rounded-sm border p-2.5 text-left transition-colors',
                      active
                        ? 'border-sky-500/55 bg-sky-500/[0.08]'
                        : 'border-zinc-800 bg-black/20 hover:border-zinc-700',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-[12px] font-semibold text-zinc-100">{trade.symbol}</div>
                        <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-zinc-400">{tradeLabel(trade)}</div>
                      </div>
                      <span className={cn(
                        'rounded-sm border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider',
                        closed
                          ? 'border-zinc-700 text-zinc-400'
                          : 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300',
                      )}>
                        {closed ? 'closed' : 'open'}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[9px] text-zinc-500">
                      <span>{dateET(trade.entry_at ?? trade.created_at)}</span>
                      <span>{timeET(trade.entry_at ?? trade.created_at)}</span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-zinc-600">
                      {trade.entry_price !== null && <span>entry {Number(trade.entry_price).toFixed(2)}</span>}
                      {trade.exit_price !== null && <span>exit {Number(trade.exit_price).toFixed(2)}</span>}
                      {trade.realized_pl !== null && (
                        <span className={trade.realized_pl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {signedMoney(trade.realized_pl)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>
            </div>
          )}

          <Panel
            title={selectedTrade ? selectedTrade.symbol + ' · ' + dateET(selectedTrade.entry_at ?? selectedTrade.created_at) : 'Trade playback'}
            bodyClassName="p-2 sm:p-3"
          >
            {playbackBusy ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-sky-400" aria-hidden="true" />
              </div>
            ) : playback ? (
              <div className="space-y-3">
                <div>
                  <h2 className="text-[15px] font-semibold leading-snug text-zinc-100">{historicalEntryHeadline(playback, selectedTrade?.direction)}</h2>
                  {playback.underlying_symbol && playback.underlying_symbol !== playback.symbol && <div className="mt-1 text-[10px] text-zinc-500">Underlying chart: {playback.underlying_symbol.replace(/^I:/, '')} · contract root: {playback.symbol}</div>}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-400">
                    <span>{playback.instrument?.asset_type === 'option' ? `${playback.instrument.symbol} ${playback.instrument.strike ?? '—'} ${String(playback.instrument.option_type ?? '').toUpperCase()} · ${dateET(playback.instrument.expiration)}` : playback.symbol}</span>
                    <span>Entry {playback.instrument?.entry_option_price?.toFixed(2) ?? selectedTrade?.entry_price ?? '—'} · {timeET(playback.episode.entry_at)}</span>
                    <span>Exit {playback.instrument?.exit_option_price?.toFixed(2) ?? selectedTrade?.exit_price ?? '—'} · {timeET(playback.episode.exit_at)}</span>
                    <span className={Number(playback.episode.realized_pl) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{signedMoney(playback.episode.realized_pl)}</span>
                  </div>
                </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
                <div className="min-w-0">
                  {!playback.bars.length ? (
                    <div role="status" className="rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-4">
                      <div className="text-[13px] font-semibold text-amber-200">Historical market replay unavailable</div>
                      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{playback.data_availability?.message ?? 'No historical market prices were returned for this trade window. Brokerage executions are available, but there is not enough market data to reconstruct the lookback.'}</p>
                    </div>
                  ) : <SessionPlaybackChart
                    bars={playback.bars}
                    markers={playback.markers}
                    levels={playback.levels}
                    height={380}
                    responsiveHeight
                    showStructureCards={false}
                    compactEvents
                    syncId={`historical-evidence-${playback.trade_id}`}
                    indicatorOverlay={(at) => (
                      <HistoricalIndicatorReadouts bars={playback.bars} entryAt={playback.episode.entry_at} at={at} />
                    )}
                  />}
                </div>

                <aside className="space-y-2 xl:sticky xl:top-3 xl:self-start">
                  <button type="button" onClick={() => setEvidenceExpanded((value) => !value)} aria-expanded={evidenceExpanded} aria-controls="historical-evidence-breakdown" className="flex min-h-11 w-full items-center justify-between rounded-md border border-zinc-700 px-3 text-[12px] text-sky-300 xl:hidden">
                    Why this assessment?<ChevronRight className={cn('h-4 w-4', evidenceExpanded && 'rotate-90')} />
                  </button>
                  <div id="historical-evidence-breakdown" className={cn('space-y-2 xl:block', !evidenceExpanded && 'hidden')}>
                  {playback.review && playback.replay_summary ? (
                    <div className="rounded-md border border-sky-500/35 bg-sky-500/[0.055] p-3.5">
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-sky-400">Evidence behind the assessment</div>
                      <div className="mt-2 text-[9px] leading-relaxed text-zinc-500">{playback.source}. Thesis evidence is cut off at entry; later results do not change the entry assessment.</div>

                      <div className="mt-3 space-y-3">
                        {playback.review.regime_summary && (
                          <div className="rounded-sm border border-cyan-500/20 bg-cyan-500/[0.035] p-2.5">
                            <div className="font-mono text-[8px] uppercase tracking-wider text-cyan-300/80">Session regime</div>
                            <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                              {playback.review.regime_summary}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[8px] text-zinc-500">
                              {playback.review.context_direction && playback.review.context_direction !== 'neutral' && (
                                <span>broader context · {playback.review.context_direction}</span>
                              )}
                              {playback.review.relative_volume_at_entry !== null && (
                                <span>· entry rvol {playback.review.relative_volume_at_entry.toFixed(2)}×</span>
                              )}
                              {playback.review.momentum_30m_pct !== null && (
                                <span>· 30m momentum {playback.review.momentum_30m_pct >= 0 ? '+' : ''}{playback.review.momentum_30m_pct.toFixed(2)}%</span>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="border-l-2 border-sky-500/35 pl-3">
                          <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Before entry</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                            {playback.review.retro_direction === 'neutral'
                              ? (playback.review.retest_before_entry
                                  ? 'No directional thesis was substantiated for this trade window. A local session level was tested and held before entry, but that retest did not independently confirm direction.'
                                  : 'No directional thesis was substantiated for this trade window before entry.')
                              : playback.review.session_state === 'existing_thesis'
                                ? `The broader ${playback.review.retro_direction} thesis was already established${playback.review.context_confirmation_at ? ` at ${timeET(playback.review.context_confirmation_at)} on ${dateET(playback.review.context_confirmation_at)}` : ' before this trade window'}.${playback.review.retest_before_entry ? ' During the session, price retested and held a local level, but there was no fresh directional confirmation before entry.' : ' The session did not produce a fresh directional confirmation before entry.'}`
                                : `Fresh ${playback.review.retro_direction} evidence was ${playback.review.session_state === 'session_reconfirmed' ? 'reconfirmed' : 'confirmed'} ${playback.review.confirmation_to_entry_minutes === null ? 'before entry' : `${playback.review.confirmation_to_entry_minutes} minute${playback.review.confirmation_to_entry_minutes === 1 ? '' : 's'} before entry`}.${playback.review.retest_before_entry ? ' Price then tested and held the confirmed area before the user entered.' : ''}`}
                          </div>
                        </div>

                        {playback.review.evidence?.thesis_entry && (
                          <div className="border-l-2 border-amber-400/40 pl-3">
                            <div className="font-mono text-[8px] uppercase tracking-wider text-amber-300">Thesis age and entry location</div>
                            <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">{playback.review.evidence.thesis_entry.summary}</div>
                          </div>
                        )}
                        <div className="border-l-2 border-violet-400/35 pl-3">
                          <div className="font-mono text-[8px] uppercase tracking-wider text-violet-300/80">Your entry</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                            {playback.review.directional_agreement === 'opposed'
                              ? `The position was opened against the confirmed ${playback.review.retro_direction} thesis.`
                              : playback.review.directional_agreement === 'aligned'
                                ? playback.review.session_state === 'existing_thesis'
                                  ? `The position was directionally aligned with the already-established ${playback.review.retro_direction} thesis.`
                                  : `The position was directionally aligned with the fresh ${playback.review.retro_direction} session thesis.`
                                : 'The position was opened without a confirmed directional thesis to compare against.'}
                            {playback.review.session_state !== 'existing_thesis' && playback.review.move_consumed_to_target_pct !== null
                              ? ` About ${Math.round(playback.review.move_consumed_to_target_pct)}% of the fresh confirmation-to-target move had already occurred by entry.`
                              : ''}
                            {playback.review.momentum_state_at_entry
                              ? ` Momentum was ${playback.review.momentum_state_at_entry.replaceAll('_', ' ')}.`
                              : ''}
                          </div>
                        </div>

                        <div className="border-l-2 border-emerald-400/35 pl-3">
                          <div className="font-mono text-[8px] uppercase tracking-wider text-emerald-300/80">While you held</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                            {playback.review.target_hit_at
                              ? `The reconstructed tactical target was reached at ${timeET(playback.review.target_hit_at)} while the position was still open.`
                              : 'The reconstructed tactical target was not reached while the position was open.'}
                            {' '}
                            {playback.review.weakening_at
                              ? `The thesis began weakening at ${timeET(playback.review.weakening_at)} as short-term structure deteriorated.`
                              : ''}
                            {' '}
                            {playback.invalidation_context?.status === 'during_trade'
                              ? `Hard invalidation followed at ${timeET(playback.invalidation_context.at)} before the position was closed.`
                              : playback.invalidation_context?.status === 'pre_entry_conflict'
                                ? 'The user’s direction was already unsupported before entry.'
                                : 'No hard thesis invalidation was observed while the position was open.'}
                          </div>
                        </div>

                        <div className="border-l-2 border-blue-400/35 pl-3">
                          <div className="font-mono text-[8px] uppercase tracking-wider text-blue-300/80">Your exit</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-zinc-300">
                            {playback.episode.exit_at
                              ? `The position was closed at ${timeET(playback.episode.exit_at)}.`
                              : 'No recorded exit timestamp is available.'}
                            {' '}
                            {playback.review.exit_relationship
                              ? `TradeCycle classifies that exit as ${playback.review.exit_relationship.replaceAll('_', ' ')}.`
                              : ''}
                            {playback.invalidation_context?.status === 'after_exit' && playback.invalidation_context.at
                              ? ` The thesis remained intact at exit and invalidated later at ${timeET(playback.invalidation_context.at)}.`
                              : ''}
                          </div>
                        </div>

                        <div className="rounded-sm border border-amber-500/20 bg-amber-500/[0.04] p-2.5">
                          <div className="font-mono text-[8px] uppercase tracking-wider text-amber-300/80">What URSORA sees</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-zinc-200">
                            {playback.replay_summary.guidance ?? playback.replay_summary.execution ?? playback.review.review_summary}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded-sm border border-zinc-800 bg-black/20 px-2 py-1.5">
                            <div className="font-mono text-[7px] uppercase tracking-wider text-zinc-600">Entry quality</div>
                            <div className="mt-0.5 font-mono text-[9px] uppercase text-zinc-300">
                              {playback.review.entry_quality_label?.replaceAll('_', ' ') ?? '—'}
                            </div>
                          </div>
                          <div className="rounded-sm border border-zinc-800 bg-black/20 px-2 py-1.5">
                            <div className="font-mono text-[7px] uppercase tracking-wider text-zinc-600">Alignment</div>
                            <div className={cn(
                              'mt-0.5 font-mono text-[9px] uppercase',
                              playback.review.directional_agreement === 'aligned' ? 'text-emerald-300'
                                : playback.review.directional_agreement === 'opposed' ? 'text-red-300'
                                  : 'text-zinc-300',
                            )}>
                              {playback.review.directional_agreement.replaceAll('_', ' ')}
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-sky-500/15 pt-2">
                          <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">What to compare in your history</div>
                          <div className="mt-1 text-[9px] leading-relaxed text-zinc-400">{playback.replay_summary.compare}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-zinc-800 bg-[#0d1015] p-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-sky-400">Evidence behind the assessment</div>
                      <div className="mt-2 flex items-start gap-2 text-[10px] leading-relaxed text-zinc-500">
                        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                        <span>{reconstructionBusy ? 'Building the historical decision review…' : 'Historical decision evidence is not available yet.'}</span>
                      </div>
                    </div>
                  )}

                  <details className="group rounded-md border border-zinc-800 bg-[#0d1015]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-sky-400">Historical TradeCycle details</div>
                        <div className="mt-0.5 text-[9px] text-zinc-600">Setup classification, levels, and reconstructed evidence</div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform group-open:rotate-90" />
                    </summary>

                    <div className="space-y-2 border-t border-zinc-800 p-3">
                      {playback.review ? (
                        <div>
                          <div className="text-[12px] font-semibold text-zinc-100">
                            {playback.review.retro_direction === 'neutral'
                              ? 'No confirmed thesis at entry'
                              : playback.review.session_state === 'existing_thesis'
                                ? `${playback.review.retro_direction.toUpperCase()} · broader thesis active${playback.review.context_confirmation_at ? ` since ${dateET(playback.review.context_confirmation_at)} ${timeET(playback.review.context_confirmation_at)}` : ''}`
                                : `${playback.review.retro_direction.toUpperCase()} · ${playback.review.setup_class.replaceAll('_', ' ')}`}
                          </div>
                          <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-500">{playback.review.review_summary}</p>
                        </div>
                      ) : (
                        <div className="text-[9px] text-zinc-600">No reconstructed setup available.</div>
                      )}

                      <div className="border-t border-zinc-800 pt-2">
                        <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-600">Meaningful levels</div>
                        <div className="mt-2 space-y-1.5">
                          {playback.levels.length ? playback.levels.map((level) => (
                            <div key={`${level.kind}-${level.value}`} className="rounded-sm border border-zinc-800 bg-black/20 px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-400">
                                  {level.kind === 'invalidation' ? 'Invalidation threshold' : level.label}
                                </span>
                                <span className="font-mono text-[10px] tabular-nums text-zinc-200">{Number(level.value).toFixed(2)}</span>
                              </div>
                              <div className="mt-1 text-[8px] leading-relaxed text-zinc-600">{level.detail}</div>
                            </div>
                          )) : (
                            <div className="text-[9px] leading-relaxed text-zinc-600">No reconstructed levels yet.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                  </div>
                </aside>
              </div>              </div>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-sm border border-dashed border-zinc-800">
                <div className="text-center">
                  <History className="mx-auto h-5 w-5 text-zinc-600" aria-hidden="true" />
                  <div className="mt-2 text-[11px] text-zinc-500">Select a brokerage episode to replay it.</div>
                </div>
              </div>
            )}
          </Panel>
          </div>
        </>
      )}

      <Disclaimer />
    </div>
  );
};

export default BacktestView;
