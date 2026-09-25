import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, History, Loader2 } from 'lucide-react';
import { fetchHistoricalPlayback, type HistoricalPlaybackResponse } from '@/lib/api';
import { fetchBrokerageTradeRecords } from '@/lib/behavioral/api';
import type { TradeRecord } from '@/lib/behavioral/types';
import { useAuth } from '@/contexts/AuthContext';
import { SessionPlaybackChart } from '@/components/charts/PriceChart';
import { Disclaimer, EmptyState, Panel, SectionHeading, Spinner } from '@/components/common/Primitives';
import { cn } from '@/lib/utils';
import { signedMoney } from '@/lib/format';

const dateET = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date unavailable';

const timeET = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

const tradeLabel = (trade: TradeRecord) => {
  if (trade.option_symbol) return trade.option_symbol;
  if (trade.option_type && trade.strike && trade.expiration) {
    return trade.symbol + ' ' + trade.expiration + ' ' + trade.strike + ' ' + trade.option_type.toUpperCase();
  }
  return trade.symbol;
};

export const BacktestView: React.FC<{ initialTradeIds?: number[] }> = ({ initialTradeIds = [] }) => {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(initialTradeIds[0] ?? null);
  const [playback, setPlayback] = useState<HistoricalPlaybackResponse | null>(null);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = user ? await fetchBrokerageTradeRecords(user.id) : [];
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

  const visibleTrades = useMemo(() => {
    const closedBrokerageTrades = trades
      .filter((trade) => trade.broker === 'SnapTrade' && Boolean(trade.exit_at ?? trade.closed_at))
      .sort((a, b) => +new Date(b.exit_at ?? b.closed_at ?? b.entry_at ?? b.created_at) - +new Date(a.exit_at ?? a.closed_at ?? a.entry_at ?? a.created_at));

    if (initialTradeIds.length) {
      const wanted = new Set(initialTradeIds);
      return closedBrokerageTrades.filter((trade) => wanted.has(trade.id));
    }
    return closedBrokerageTrades;
  }, [initialTradeIds, trades]);

  useEffect(() => {
    if (!visibleTrades.length) {
      setSelectedTradeId(null);
      setPlayback(null);
      return;
    }
    if (selectedTradeId === null || !visibleTrades.some((trade) => trade.id === selectedTradeId)) {
      setSelectedTradeId(visibleTrades[0].id);
    }
  }, [selectedTradeId, visibleTrades]);

  const selectedTrade = useMemo(
    () => visibleTrades.find((trade) => trade.id === selectedTradeId) ?? null,
    [selectedTradeId, visibleTrades],
  );

  useEffect(() => {
    let active = true;
    if (!selectedTradeId) {
      setPlayback(null);
      return () => { active = false; };
    }

    setPlaybackBusy(true);
    setError(null);
    void fetchHistoricalPlayback(selectedTradeId)
      .then((result) => {
        if (active) setPlayback(result);
      })
      .catch((playbackError) => {
        if (active) {
          setPlayback(null);
          const message = playbackError instanceof Error
            ? playbackError.message
            : typeof playbackError === 'string'
              ? playbackError
              : (() => { try { return JSON.stringify(playbackError); } catch { return 'Historical playback could not be loaded.'; } })();
          setError(message);
        }
      })
      .finally(() => {
        if (active) setPlaybackBusy(false);
      });

    return () => { active = false; };
  }, [selectedTradeId]);

  if (loading) return <Spinner label="Loading brokerage trade history" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Historical evidence"
        title="Replay your actual trades against the market"
        description="Historical Evidence starts with your brokerage executions, then layers the underlying market session and TradeCycle evidence around what you actually did. It is not a portfolio-performance report."
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/35 bg-amber-500/[0.07] p-3 text-[11px] text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!user ? (
        <EmptyState
          title="Sign in to view Historical Evidence"
          body="Historical Evidence is built from your private brokerage history and TradeCycle records."
        />
      ) : visibleTrades.length === 0 ? (
        <EmptyState
          title={initialTradeIds.length ? 'No closed brokerage trades match this evidence set' : 'No closed brokerage trades available yet'}
          body={initialTradeIds.length
            ? 'The selected pattern currently points to records that are not closed SnapTrade trade episodes. Historical Evidence will not substitute analysis runs or paper records.'
            : 'Historical Evidence only uses closed trades from your SnapTrade brokerage history. Analysis-generated and simulated records are excluded.'}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[330px_minmax(0,1fr)]">
          <Panel
            title={initialTradeIds.length ? 'Pattern evidence episodes' : 'Brokerage trade history'}
            subtitle={String(visibleTrades.length) + ' actual trade episode' + (visibleTrades.length === 1 ? '' : 's') + ' available for review.'}
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

          <Panel
            title={selectedTrade ? selectedTrade.symbol + ' · ' + dateET(selectedTrade.entry_at ?? selectedTrade.created_at) : 'Trade playback'}
            subtitle="Underlying market session with brokerage execution markers and any timestamped TradeCycle thesis events available for this episode."
          >
            {playbackBusy ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-sky-400" aria-hidden="true" />
              </div>
            ) : playback ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border border-zinc-700 bg-black/20 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                    {playback.source}
                  </span>
                  {playback.episode.post_invalidation_minutes !== null && (
                    <span className="rounded-sm border border-red-500/30 bg-red-500/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-red-300">
                      {playback.episode.post_invalidation_minutes}m after invalidation
                    </span>
                  )}
                </div>

                <SessionPlaybackChart bars={playback.bars} markers={playback.markers} />

                {selectedTrade?.id && selectedTrade.id < 0 && !playback.episode.invalidation_at && (
                  <div className="flex items-start gap-2 rounded-sm border border-sky-500/25 bg-sky-500/[0.04] p-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                    <div>
                      <div className="text-[11px] font-medium text-zinc-200">TradeCycle reconstruction pending for this historical trade</div>
                      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                        Entry and exit come from the synced brokerage history. The next pipeline will replay historical market evidence through TradeCycle so weakening and invalidation can be timestamped on this same chart rather than inferred from profit or loss.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                    <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Entry</div>
                    <div className="mt-1 text-[11px] text-zinc-300">
                      {dateET(playback.episode.entry_at)} · {timeET(playback.episode.entry_at)}
                    </div>
                  </div>
                  <div className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                    <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Thesis invalidation</div>
                    <div className="mt-1 text-[11px] text-zinc-300">
                      {playback.episode.invalidation_at ? timeET(playback.episode.invalidation_at) : 'Not reconstructed yet'}
                    </div>
                  </div>
                  <div className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                    <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">Exit</div>
                    <div className="mt-1 text-[11px] text-zinc-300">
                      {playback.episode.exit_at ? timeET(playback.episode.exit_at) : 'Position still open'}
                    </div>
                  </div>
                </div>
              </div>
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
      )}

      <Disclaimer />
    </div>
  );
};

export default BacktestView;
