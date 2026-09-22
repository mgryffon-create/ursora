import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeftRight, Flame, Gauge, Pause, Play, Radio, TrendingDown, TrendingUp } from 'lucide-react';
import {
  fetchFeed, fetchLatestQuotes, fetchMovers, fetchNews, fetchSignalUpdates, fetchSnapshot, fetchTodaySignals,
} from '@/lib/api';
import type { FeedEvent, MarketMover, MarketSnapshot, NewsItem, Quote, Signal, SignalUpdate } from '@/lib/types';
import { changeColor, clockET, compact, num, pct, scoreColor, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import {
  DemoBadge, Disclaimer, InfoHint, Metric, Panel, SectionHeading, SourceBadge, Spinner, Unavailable,
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

  const quoteList = useMemo(() => Object.values(quotes), [quotes]);

  const byKind = useMemo(() => {
    const g: Record<string, MarketMover[]> = { gainer: [], loser: [], rel_volume: [], unusual_options: [] };
    for (const m of movers) g[m.kind] = [...(g[m.kind] ?? []), m];

    // The dedicated market_movers table is not populated by the current Webull sync.
    // Fall back to the latest quote universe so Today remains useful without inventing data.
    if (!movers.length && quoteList.length) {
      const timestamp = new Date().toISOString();
      const gainers = [...quoteList]
        .filter((q) => q.change_pct !== null && q.change_pct !== undefined)
        .sort((a, b) => Number(b.change_pct) - Number(a.change_pct))
        .slice(0, 5);
      const losers = [...quoteList]
        .filter((q) => q.change_pct !== null && q.change_pct !== undefined)
        .sort((a, b) => Number(a.change_pct) - Number(b.change_pct))
        .slice(0, 5);
      const relVolume = [...quoteList]
        .filter((q) => q.rel_volume !== null && q.rel_volume !== undefined)
        .sort((a, b) => Number(b.rel_volume) - Number(a.rel_volume))
        .slice(0, 5);
      const unusual = quoteList
        .filter((q) => Boolean(q.unusual_options_volume))
        .sort((a, b) => Number(b.rel_volume ?? 0) - Number(a.rel_volume ?? 0))
        .slice(0, 5);

      g.gainer = gainers.map((q, index) => ({
        id: -(100 + index),
        symbol: q.symbol,
        company: null,
        kind: 'gainer',
        value: q.change_pct,
        detail: q.trend ?? 'latest tracked quote',
        as_of: q.as_of ?? timestamp,
        source_name: q.source_name,
      }));
      g.loser = losers.map((q, index) => ({
        id: -(200 + index),
        symbol: q.symbol,
        company: null,
        kind: 'loser',
        value: q.change_pct,
        detail: q.trend ?? 'latest tracked quote',
        as_of: q.as_of ?? timestamp,
        source_name: q.source_name,
      }));
      g.rel_volume = relVolume.map((q, index) => ({
        id: -(300 + index),
        symbol: q.symbol,
        company: null,
        kind: 'rel_volume',
        value: q.rel_volume,
        detail: q.avg_volume ? `vs 20-day avg volume ${compact(q.avg_volume)}` : 'relative to recent average volume',
        as_of: q.as_of ?? timestamp,
        source_name: q.source_name,
      }));
      g.unusual_options = unusual.map((q, index) => ({
        id: -(400 + index),
        symbol: q.symbol,
        company: null,
        kind: 'unusual_options',
        value: q.total_oi && q.call_volume !== null && q.put_volume !== null
          ? (Number(q.call_volume ?? 0) + Number(q.put_volume ?? 0)) / Math.max(Number(q.total_oi), 1)
          : q.rel_volume,
        detail: 'flagged by the stored options/quote data',
        as_of: q.as_of ?? timestamp,
        source_name: q.source_name,
      }));
    }

    return g;
  }, [movers, quoteList]);

  const spyQuote = quotes.SPY;
  const qqqQuote = quotes.QQQ;
  const iwmQuote = quotes.IWM;
  const derivedAdvancers = quoteList.filter((q) => Number(q.change_pct ?? 0) > 0).length;
  const derivedDecliners = quoteList.filter((q) => Number(q.change_pct ?? 0) < 0).length;
  const derivedRegime = (() => {
    const changes = [spyQuote?.change_pct, qqqQuote?.change_pct]
      .filter((v): v is number => v !== null && v !== undefined)
      .map(Number);
    if (!changes.length) return 'Mixed';
    if (changes.every((v) => v > 0.15)) return 'Risk-On';
    if (changes.every((v) => v < -0.15)) return 'Risk-Off';
    return 'Mixed';
  })();

  const watchlistMovers = useMemo(
    () =>
      watchlist
        .map((s) => quotes[s])
        .filter((q): q is Quote => Boolean(q))
        .sort((a, b) => Math.abs(Number(b.change_pct ?? 0)) - Math.abs(Number(a.change_pct ?? 0)))
        .slice(0, 10),
    [watchlist, quotes],
  );

  const signalBySymbol = useMemo(() => {
    const map = new Map<string, Signal>();
    for (const signal of signals) if (!map.has(signal.symbol)) map.set(signal.symbol, signal);
    return map;
  }, [signals]);

  const rankBySymbol = useMemo(() => {
    const ranked = [...signals].sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 5);
    return new Map(ranked.map((signal, index) => [signal.symbol, index + 1]));
  }, [signals]);

  const openTicker = useCallback((symbol: string) => {
    const signal = signalBySymbol.get(symbol);
    if (signal) onOpenThesis(signal.id);
  }, [onOpenThesis, signalBySymbol]);

  const tickerCell = useCallback((symbol: string, detail?: string | null) => {
    const rank = rankBySymbol.get(symbol);
    const clickable = signalBySymbol.has(symbol);
    return (
      <div className="min-w-0">
        <button
          type="button"
          disabled={!clickable}
          onClick={() => openTicker(symbol)}
          className={cn(
            'font-mono text-xs font-semibold',
            clickable ? 'text-zinc-100 underline-offset-2 hover:text-sky-300 hover:underline' : 'cursor-default text-zinc-100',
          )}
        >
          {symbol}
        </button>
        {rank && (
          <span
            className="ml-1.5 rounded-sm border border-sky-500/30 bg-sky-500/[0.08] px-1 py-[1px] font-mono text-[9px] text-sky-300"
            title={`Top-ranked opportunity #${rank}`}
          >
            #{rank}
          </span>
        )}
        {detail && <span className="ml-2 text-[10px] text-zinc-500">{detail}</span>}
      </div>
    );
  }, [openTicker, rankBySymbol, signalBySymbol]);

  if (loading) return <Spinner label="Loading the market overview" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Market overview"
        title="Current market conditions and notable activity"
        description="This page summarizes current market conditions, notable price activity, and recent signal changes using the data available to URSORA."
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
              {live ? 'auto-refresh on' : 'auto-refresh off'}
            </button>
            <span className="font-mono text-[10px] text-zinc-500">updated {clockET(lastPoll)}</span>
          </div>
        }
      />

      {/* REGIME STRIP */}
      <div className="grid gap-3 lg:grid-cols-[1.1fr_2fr]">
        <Panel
          title="Market environment"
          help="A compact view of the broader conditions surrounding individual trades. Risk-on generally means major equity indexes are rising while volatility is contained; risk-off means broad selling pressure or elevated volatility. Mixed means the signals are not aligned."
          right={<DemoBadge />}
        >
          {snapshot || spyQuote || qqqQuote ? (
            <div>
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wider',
                  REGIME_STYLE[snapshot?.regime ?? derivedRegime] ?? REGIME_STYLE.Mixed,
                )}
              >
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                {snapshot?.regime ?? derivedRegime}
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-400">
                {snapshot?.regime_note ?? 'Derived from the current SPY and QQQ direction in Ursora’s tracked quote universe.'}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
                {snapshot?.macro_note ?? 'Dedicated macro-series data are not connected yet, so no rates, dollar, or commodity regime is inferred.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="VIX" value={num(snapshot?.vix)} hint={pct(snapshot?.vix_change_pct) ?? undefined} valueClass={Number(snapshot?.vix) > 20 ? 'text-amber-300' : 'text-zinc-100'} />
                <Metric label="Dollar index" value={num(snapshot?.dxy)} />
                <Metric label="WTI crude" value={num(snapshot?.wti)} />
                <Metric label="Gold" value={num(snapshot?.gold)} />
              </div>
              <div className="mt-2 font-mono text-[10px] text-zinc-600">
                {snapshot ? `snapshot as of ${stampET(snapshot.as_of)}` : 'derived from latest tracked quotes'}
              </div>
            </div>
          ) : (
            <Unavailable />
          )}
        </Panel>

        <Panel
          title="Major indexes, volatility, and market participation"
          help="Major indexes show how broad parts of the market are moving. Volatility estimates how much price movement traders are pricing in. Market participation shows how many tracked stocks are rising versus falling."
          right={<DemoBadge />}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="SPY" value={num(snapshot?.spy_price ?? spyQuote?.price)} hint={snapshot?.spy_trend ?? spyQuote?.trend ?? undefined} valueClass={changeColor(snapshot?.spy_change_pct ?? spyQuote?.change_pct)} />
            <Metric label="SPY change" value={pct(snapshot?.spy_change_pct ?? spyQuote?.change_pct)} valueClass={changeColor(snapshot?.spy_change_pct ?? spyQuote?.change_pct)} />
            <Metric label="QQQ" value={num(snapshot?.qqq_price ?? qqqQuote?.price)} hint={snapshot?.qqq_trend ?? qqqQuote?.trend ?? undefined} valueClass={changeColor(snapshot?.qqq_change_pct ?? qqqQuote?.change_pct)} />
            <Metric label="QQQ change" value={pct(snapshot?.qqq_change_pct ?? qqqQuote?.change_pct)} valueClass={changeColor(snapshot?.qqq_change_pct ?? qqqQuote?.change_pct)} />
            <Metric label="IWM" value={num(snapshot?.iwm_price ?? iwmQuote?.price)} valueClass={changeColor(snapshot?.iwm_change_pct ?? iwmQuote?.change_pct)} />
            <Metric label="VIX" value={num(snapshot?.vix)} hint={pct(snapshot?.vix_change_pct) ?? undefined} valueClass={Number(snapshot?.vix) > 20 ? 'text-amber-300' : 'text-zinc-100'} />
            <Metric label="Stocks rising" value={snapshot?.breadth_advancers ?? (quoteList.length ? derivedAdvancers : null)} valueClass="text-emerald-300" />
            <Metric label="Stocks falling" value={snapshot?.breadth_decliners ?? (quoteList.length ? derivedDecliners : null)} valueClass="text-red-300" />
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-500">
            {snapshot?.breadth_note ?? (quoteList.length
              ? `${derivedAdvancers} of ${quoteList.length} tracked symbols are higher and ${derivedDecliners} are lower in the latest quote set.`
              : <Unavailable />)}
          </p>
          <div className="mt-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Sector movement</div>
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
          <div className="grid gap-3 md:grid-cols-[minmax(240px,0.9fr)_minmax(240px,0.9fr)] xl:grid-cols-[minmax(230px,0.8fr)_minmax(230px,0.8fr)_minmax(260px,1fr)_minmax(280px,1.1fr)]">
            <Panel title="Top gainers" help="Tracked stocks with the largest positive price change in the current session. A gain alone does not mean the move is sustainable or tradeable." right={<DemoBadge />}>
              <ul className="space-y-1.5">
                {byKind.gainer.map((m) => (
                  <li key={`g-${m.id}`} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 pb-1.5 last:border-0">
                    <div className="min-w-0">
                      {tickerCell(m.symbol, m.detail)}
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
            <Panel title="Top losers" help="Tracked stocks with the largest negative price change in the current session. A decline alone does not establish a bearish thesis." right={<DemoBadge />}>
              <ul className="space-y-1.5">
                {byKind.loser.map((m) => (
                  <li key={`l-${m.id}`} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 pb-1.5 last:border-0">
                    <div className="min-w-0">
                      {tickerCell(m.symbol, m.detail)}
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
            <Panel title="Highest relative volume" help="Relative volume compares current trading volume with the stock’s recent average. A value above 1.0 means the stock is trading more actively than usual." right={<DemoBadge />}>
              <ul className="space-y-1.5">
                {byKind.rel_volume.map((m) => (
                  <li key={`r-${m.id}`} className="flex items-baseline justify-between gap-2 border-b border-zinc-800/60 pb-1.5 last:border-0">
                    <div className="min-w-0">
                      {tickerCell(m.symbol)}
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
              help="Flags options contracts or symbols with activity that is large relative to existing open interest. This identifies unusual participation, not whether traders are bullish or bearish."
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

          <Panel title="Watchlist movers" help="A compact view of price movement and trading conditions for symbols you follow. Relative volume compares current volume with recent average volume; put/call compares put-option volume with call-option volume." subtitle="Your personal watchlist, ranked by absolute move." right={<DemoBadge />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-[11px]">
                <thead className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    {[
                      ['Symbol', 'The ticker symbol for the company or fund. Select it to open the current URSORA analysis.'],
                      ['Last', 'The latest available price.'],
                      ['Change', 'The percentage change from the previous regular-session close.'],
                      ['Rel vol', 'Relative volume compares current volume with recent average volume. Above 1.0 means activity is heavier than usual.'],
                      ['VWAP', 'Volume-weighted average price is the average price traded today, weighted by how much volume occurred at each price.'],
                      ['Trend', 'A simplified description of recent price structure based on moving averages and price direction.'],
                      ['Put/call', 'Put-option volume divided by call-option volume. Higher values mean relatively more put activity; it does not identify whether trades were opening, closing, hedging, or speculative.'],
                    ].map(([h, help]) => (
                      <th key={h} scope="col" className="whitespace-nowrap px-2 py-1.5">
                        <span className="inline-flex items-center gap-1">
                          {h}
                          <InfoHint text={help} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {watchlistMovers.map((q) => (
                    <tr key={q.symbol} className="transition-colors hover:bg-black/30">
                      <td className="px-2 py-1.5">{tickerCell(q.symbol)}</td>
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

          <Panel title="Recent market-moving events" help="Recent company or market news that may change the evidence behind a thesis. These items provide context and are not treated as trade instructions by themselves." subtitle="Recent dated events and announcements across tracked symbols." right={<DemoBadge />}>
            <ul className="space-y-2">
              {news.slice(0, 6).map((n) => (
                <li key={n.id} className="border-b border-zinc-800/60 pb-2 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.symbol ? tickerCell(n.symbol) : <span className="font-mono text-[11px] font-semibold text-zinc-100">MACRO</span>}
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
            title="Market & thesis activity"
            help="Only meaningful changes should appear here: material thesis changes, new catalysts, or evidence changes large enough to alter how a trade should be interpreted. Minor price noise should not generate activity."
            subtitle="Meaningful changes across tracked symbols and URSORA theses."
            right={
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                <Radio className={cn('h-3 w-3', live && 'animate-pulse')} aria-hidden="true" />
                {live ? 'live' : 'auto-refresh off'}
              </span>
            }
            bodyClassName="max-h-[620px] overflow-y-auto p-0"
          >
            <ul className="divide-y divide-zinc-800/60">
              {updates.map((u) => (
                <li key={`update-${u.id}`} className="border-l-2 border-l-sky-500 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] tabular-nums text-zinc-400">{clockET(u.created_at)}</span>
                    {tickerCell(u.symbol)}
                    <span className="rounded-sm border border-sky-500/30 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide text-sky-300">thesis change</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-zinc-300">{u.reason}</p>
                  {u.signal_id && (
                    <button type="button" onClick={() => onOpenThesis(u.signal_id as number)} className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-sky-400 hover:text-sky-300">
                      open analysis
                    </button>
                  )}
                </li>
              ))}
              {feed.map((f) => (
                <li key={`feed-${f.id}`} className={cn('border-l-2 px-3 py-2', SEVERITY_STYLE[f.severity ?? 'info'])}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] tabular-nums text-zinc-400">{clockET(f.event_time)}</span>
                    {f.symbol ? tickerCell(f.symbol) : null}
                    <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide text-zinc-400">{f.category}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-zinc-300">{f.message}</p>
                </li>
              ))}
              {!updates.length && !feed.length && (
                <li className="p-3 text-[12px] leading-relaxed text-zinc-500">
                  No material thesis or market changes have been recorded yet. This area is intentionally quiet when the evidence has not changed meaningfully.
                </li>
              )}
            </ul>
          </Panel>


        </div>
      </div>

      <Disclaimer />
    </div>
  );
};

export default CommandCenterView;
