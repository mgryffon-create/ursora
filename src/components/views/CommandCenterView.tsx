import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeftRight, Flame, Gauge, Pause, Play, Radio, TrendingDown, TrendingUp } from 'lucide-react';
import {
  fetchFeed, fetchLatestQuotes, fetchMovers, fetchNews, fetchSignalUpdates, fetchSnapshot, fetchTodaySignals,
} from '@/lib/api';
import type { FeedEvent, MarketMover, MarketSnapshot, NewsItem, Quote, Signal, SignalUpdate } from '@/lib/types';
import { changeColor, clockET, compact, num, pct, scoreColor, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import {
  DemoBadge, Disclaimer, Metric, Panel, SectionHeading, SourceBadge, Spinner, Unavailable,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

const REGIME_STYLE: Record<string, string> = {
  'Risk-On': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  'Risk-Off': 'border-red-500/40 bg-red-500/10 text-red-300',
  Mixed: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
};

const SEVERITY_STYLE: Record<string, string> = {
  info: 'border-l-zinc-600',
  warn: 'border-l-amber-500',
  alert: 'border-l-sky-500',
};

export const CommandCenterView: React.FC<{ onOpenThesis: (id: number) => void }> = ({ onOpenThesis }) => {
  const { watchlist } = useAuth();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [movers, setMovers] = useState<MarketMover[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [updates, setUpdates] = useState<SignalUpdate[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [signals, setSignals] = useState<Signal[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [lastPoll, setLastPoll] = useState<string>(new Date().toISOString());

  const loadStatic = useCallback(async () => {
    const [snap, mv, sig, nw] = await Promise.all([fetchSnapshot(), fetchMovers(), fetchTodaySignals(), fetchNews(undefined, 12)]);
    setSnapshot(snap);
    setMovers(mv);
    setSignals(sig);
    setNews(nw);
    setLoading(false);
  }, []);

  const poll = useCallback(async () => {
    const [fd, up, q] = await Promise.all([fetchFeed(40), fetchSignalUpdates(undefined, 10), fetchLatestQuotes()]);
    setFeed(fd);
    setUpdates(up);
    setQuotes(q);
    setLastPoll(new Date().toISOString());
  }, []);

  useEffect(() => {
    void loadStatic();
    void poll();
  }, [loadStatic, poll]);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      void poll();
    }, 20000);
    return () => window.clearInterval(id);
  }, [live, poll]);

  const byKind = useMemo(() => {
    const g: Record<string, MarketMover[]> = { gainer: [], loser: [], rel_volume: [], unusual_options: [] };
    for (const m of movers) g[m.kind] = [...(g[m.kind] ?? []), m];
    return g;
  }, [movers]);

  const watchlistMovers = useMemo(
    () =>
      watchlist
        .map((s) => quotes[s])
        .filter((q): q is Quote => Boolean(q))
        .sort((a, b) => Math.abs(Number(b.change_pct ?? 0)) - Math.abs(Number(a.change_pct ?? 0)))
        .slice(0, 10),
    [watchlist, quotes],
  );

  if (loading) return <Spinner label="Loading the live command center" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Live market command center"
        title="Intraday regime, movers and signal feed"
        description="Everything on this page is stored, timestamped and attributed. The feed polls the database continuously while it is running."
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors',
                live
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-zinc-700 bg-black/30 text-zinc-400 hover:text-zinc-200',
              )}
            >
              {live ? <Pause className="h-3 w-3" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
              {live ? 'streaming' : 'paused'}
            </button>
            <span className="font-mono text-[10px] text-zinc-500">polled {clockET(lastPoll)}</span>
          </div>
        }
      />

      {/* REGIME STRIP */}
      <div className="grid gap-3 lg:grid-cols-[1.1fr_2fr]">
        <Panel title="Market regime" right={<DemoBadge />}>
          {snapshot ? (
            <div>
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wider',
                  REGIME_STYLE[snapshot.regime] ?? REGIME_STYLE.Mixed,
                )}
              >
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                {snapshot.regime}
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-400">{snapshot.regime_note}</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{snapshot.macro_note}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="US 10Y" value={num(snapshot.us10y)} />
                <Metric label="US 2Y" value={num(snapshot.us02y)} />
                <Metric label="Dollar index" value={num(snapshot.dxy)} />
                <Metric label="WTI crude" value={num(snapshot.wti)} />
              </div>
              <div className="mt-2 font-mono text-[10px] text-zinc-600">snapshot as of {stampET(snapshot.as_of)}</div>
            </div>
          ) : (
            <Unavailable />
          )}
        </Panel>

        <Panel title="Index tape, volatility and breadth" right={<DemoBadge />}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="SPY" value={num(snapshot?.spy_price)} hint={snapshot?.spy_trend ?? undefined} valueClass={changeColor(snapshot?.spy_change_pct)} />
            <Metric label="SPY change" value={pct(snapshot?.spy_change_pct)} valueClass={changeColor(snapshot?.spy_change_pct)} />
            <Metric label="QQQ" value={num(snapshot?.qqq_price)} hint={snapshot?.qqq_trend ?? undefined} valueClass={changeColor(snapshot?.qqq_change_pct)} />
            <Metric label="QQQ change" value={pct(snapshot?.qqq_change_pct)} valueClass={changeColor(snapshot?.qqq_change_pct)} />
            <Metric label="IWM" value={num(snapshot?.iwm_price)} valueClass={changeColor(snapshot?.iwm_change_pct)} />
            <Metric label="VIX" value={num(snapshot?.vix)} hint={pct(snapshot?.vix_change_pct) ?? undefined} valueClass={Number(snapshot?.vix) > 20 ? 'text-amber-300' : 'text-zinc-100'} />
            <Metric label="Advancers" value={snapshot?.breadth_advancers} valueClass="text-emerald-300" />
            <Metric label="Decliners" value={snapshot?.breadth_decliners} valueClass="text-red-300" />
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-500">{snapshot?.breadth_note ?? <Unavailable />}</p>
          <div className="mt-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Sector performance</div>
            <div className="mt-1.5 space-y-1">
              {(snapshot?.sector_performance ?? []).map((s) => (
                <div key={s.sector} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 truncate text-[11px] text-zinc-400">{s.sector}</span>
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={cn('absolute top-0 h-full rounded-full transition-all duration-700', s.change_pct >= 0 ? 'bg-emerald-500' : 'bg-red-500')}
                      style={{
                        width: `${Math.min(Math.abs(s.change_pct) * 28, 50)}%`,
                        left: s.change_pct >= 0 ? '50%' : undefined,
                        right: s.change_pct < 0 ? '50%' : undefined,
                      }}
                    />
                    <div className="absolute left-1/2 top-0 h-full w-px bg-zinc-700" />
                  </div>
                  <span className={cn('w-14 shrink-0 text-right font-mono text-[10px] tabular-nums', changeColor(s.change_pct))}>
                    {pct(s.change_pct)}
                  </span>
                </div>
              ))}
              {!snapshot?.sector_performance?.length && <Unavailable />}
            </div>
          </div>
        </Panel>
      </div>

      {/* MOVERS + FEED */}
      <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title="Top gainers" right={<DemoBadge />}>
              <ul className="space-y-1.5">
                {byKind.gainer.map((m) => (
                  <li key={`g-${m.id}`} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 pb-1.5 last:border-0">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-zinc-100">{m.symbol}</span>
                      <span className="ml-2 truncate text-[10px] text-zinc-500">{m.detail}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-emerald-400">
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                      {pct(m.value)}
                    </span>
                  </li>
                ))}
                {!byKind.gainer.length && <Unavailable />}
              </ul>
            </Panel>
            <Panel title="Top losers" right={<DemoBadge />}>
              <ul className="space-y-1.5">
                {byKind.loser.map((m) => (
                  <li key={`l-${m.id}`} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 pb-1.5 last:border-0">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-zinc-100">{m.symbol}</span>
                      <span className="ml-2 truncate text-[10px] text-zinc-500">{m.detail}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-red-400">
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                      {pct(m.value)}
                    </span>
                  </li>
                ))}
                {!byKind.loser.length && <Unavailable />}
              </ul>
            </Panel>
            <Panel title="Highest relative volume" right={<DemoBadge />}>
              <ul className="space-y-1.5">
                {byKind.rel_volume.map((m) => (
                  <li key={`r-${m.id}`} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 pb-1.5 last:border-0">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-zinc-100">{m.symbol}</span>
                      <span className="ml-2 truncate text-[10px] text-zinc-500">{m.detail}</span>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-sky-300">{num(m.value)}x</span>
                  </li>
                ))}
                {!byKind.rel_volume.length && <Unavailable />}
              </ul>
            </Panel>
            <Panel
              title="Unusual options activity"
              subtitle="Volume against open interest only. Never auto-read as bullish or bearish."
              right={<DemoBadge />}
            >
              <ul className="space-y-1.5">
                {byKind.unusual_options.map((m) => (
                  <li key={`u-${m.id}`} className="border-b border-zinc-800/60 pb-1.5 last:border-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-zinc-100">{m.symbol}</span>
                      <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-amber-300">
                        <Flame className="h-3 w-3" aria-hidden="true" />
                        {num(m.value)}x OI
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{m.detail}</p>
                  </li>
                ))}
                {!byKind.unusual_options.length && <Unavailable />}
              </ul>
            </Panel>
          </div>

          <Panel title="Watchlist movers" subtitle="Your personal watchlist, ranked by absolute move." right={<DemoBadge />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-[11px]">
                <thead className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    {['Symbol', 'Last', 'Change', 'Rel vol', 'VWAP', 'Trend', 'Put/call'].map((h) => (
                      <th key={h} scope="col" className="px-2 py-1.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {watchlistMovers.map((q) => (
                    <tr key={q.symbol} className="transition-colors hover:bg-black/30">
                      <td className="px-2 py-1.5 font-mono font-semibold text-zinc-100">{q.symbol}</td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-200">{num(q.price)}</td>
                      <td className={cn('px-2 py-1.5 font-mono tabular-nums', changeColor(q.change_pct))}>{pct(q.change_pct)}</td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-sky-300">{num(q.rel_volume)}x</td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-400">{num(q.vwap)}</td>
                      <td className="max-w-[240px] truncate px-2 py-1.5 text-zinc-500">{q.trend ?? <Unavailable />}</td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-400">{num(q.put_call_ratio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!watchlistMovers.length && <Unavailable />}
            </div>
          </Panel>

          <Panel title="Breaking catalysts" subtitle="Most recent dated items across the universe." right={<DemoBadge />}>
            <ul className="space-y-2">
              {news.slice(0, 6).map((n) => (
                <li key={n.id} className="border-b border-zinc-800/60 pb-2 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-zinc-100">{n.symbol ?? 'MACRO'}</span>
                    <SourceBadge type={n.source_type} />
                    <span className="font-mono text-[10px] text-zinc-500">{clockET(n.published_at)}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-zinc-300">{n.headline}</p>
                </li>
              ))}
              {!news.length && <Unavailable />}
            </ul>
          </Panel>
        </div>

        {/* SIGNAL FEED */}
        <div className="space-y-3">
          <Panel
            title="Signal feed"
            subtitle="Append-only, timestamped, attributed. Each item carries a ticker, a category and a source."
            right={
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                <Radio className={cn('h-3 w-3', live && 'animate-pulse')} aria-hidden="true" />
                {live ? 'live' : 'paused'}
              </span>
            }
            bodyClassName="max-h-[560px] overflow-y-auto p-0"
          >
            <ul className="divide-y divide-zinc-800/60">
              {feed.map((f) => (
                <li
                  key={f.id}
                  className={cn('border-l-2 px-3 py-2 transition-colors hover:bg-black/30 animate-fade-in', SEVERITY_STYLE[f.severity ?? 'info'])}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] tabular-nums text-zinc-400">{clockET(f.event_time)}</span>
                    {f.symbol && <span className="font-mono text-[11px] font-semibold text-zinc-100">{f.symbol}</span>}
                    <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide text-zinc-400">
                      {f.category}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-zinc-300">{f.message}</p>
                  <div className="mt-1 font-mono text-[9px] text-zinc-600">source: {f.source_name}</div>
                </li>
              ))}
            </ul>
            {!feed.length && <div className="p-3"><Unavailable /></div>}
          </Panel>

          <Panel title="Signal updates" subtitle="A recommendation never changes silently." right={<DemoBadge />}>
            <ul className="space-y-2">
              {updates.map((u) => (
                <li key={u.id} className="rounded-sm border border-sky-500/30 bg-sky-500/[0.06] p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ArrowLeftRight className="h-3 w-3 text-sky-400" aria-hidden="true" />
                    <span className="font-mono text-[11px] font-semibold text-zinc-100">{u.symbol}</span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      {u.prev_direction} {u.prev_score} <span className="text-zinc-600">to</span>{' '}
                      <span className={scoreColor(u.new_score)}>{u.new_direction} {u.new_score}</span>
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-zinc-500">{clockET(u.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">{u.reason}</p>
                  {u.signal_id && (
                    <button
                      type="button"
                      onClick={() => onOpenThesis(u.signal_id as number)}
                      className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                    >
                      open thesis
                    </button>
                  )}
                </li>
              ))}
              {!updates.length && (
                <li className="text-[12px] text-zinc-500">
                  No material change since the previous run. Updates appear here the moment a direction flips or a score
                  moves eight points or more.
                </li>
              )}
            </ul>
          </Panel>

          <Panel title="Top ranked right now" right={<DemoBadge />}>
            <ul className="space-y-1.5">
              {signals.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpenThesis(s.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-black/20 px-2.5 py-1.5 text-left transition-colors hover:border-sky-500/40"
                  >
                    <span className="flex items-center gap-2">
                      <Activity className="h-3 w-3 text-sky-400" aria-hidden="true" />
                      <span className="font-mono text-[11px] font-semibold text-zinc-100">{s.symbol}</span>
                      <span className="text-[10px] text-zinc-500">{s.strategy}</span>
                    </span>
                    <span className={cn('font-mono text-xs font-semibold tabular-nums', scoreColor(s.opportunity_score))}>
                      {s.opportunity_score}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
};

export default CommandCenterView;
