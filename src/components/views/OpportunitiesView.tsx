import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon, Loader2, RefreshCw, Search, Star, X,
} from 'lucide-react';
import db from '@/lib/db';
import {
  fetchActiveAnalyses, fetchLatestQuotes, fetchRuns, fetchSymbolAnalysisMemory, fetchTickers, fetchTodaySignals,
  runFreshAnalysis, track,
} from '@/lib/api';
import type { ActiveAnalysis, AnalysisRun, Quote, Signal, Ticker } from '@/lib/types';
import { changeColor, money, pct, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DirectionTag, RiskTag, SectionHeading, Spinner,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

const MAX_ANALYSIS = 6;

const thesisSummary = (signal?: Signal | null) => {
  if (!signal) return null;
  if (signal.strategy === 'No Trade') {
    return signal.no_trade_reason || 'The latest full analysis did not clear URSORA’s evidence gate.';
  }

  const hierarchy = signal.score_breakdown?.thesis_hierarchy;
  const primary = hierarchy?.primary?.band ? String(hierarchy.primary.band).toLowerCase() : 'established';
  const confirmation = hierarchy?.confirmation?.state ? String(hierarchy.confirmation.state).replaceAll('_', ' ') : 'partial';
  const context = hierarchy?.context?.state ? String(hierarchy.context.state).replaceAll('_', ' ') : 'mixed';

  return `${signal.direction === 'bearish' ? 'Bearish' : signal.direction === 'bullish' ? 'Bullish' : 'Neutral'} ${signal.holding_period ?? 'swing'} thesis: ${primary} price structure, ${confirmation} confirmation, and ${context} context.`;
};

const curiosityTag = (quote?: Quote | null) => {
  if (!quote) return 'DATA GAP';
  const move = Math.abs(quote.change_pct ?? 0);
  const relVolume = quote.rel_volume ?? 0;
  const trend = String(quote.trend ?? '').toLowerCase();

  if (move >= 3) return 'LARGE MOVE';
  if (move >= 1.5) return 'PRICE MOVE';
  if (relVolume >= 1.5) return 'VOLUME';
  if (trend.includes('up')) return 'UPTREND';
  if (trend.includes('down')) return 'DOWNTREND';
  return 'ON RADAR';
};

const curiositySummary = (quote?: Quote | null) => {
  if (!quote) return 'No recent snapshot is stored yet. Select this ticker to refresh and analyze it.';
  const move = quote.change_pct ?? 0;
  const relVolume = quote.rel_volume ?? null;
  const trend = String(quote.trend ?? '').toLowerCase();

  if (Math.abs(move) >= 2) {
    return `${Math.abs(move).toFixed(1)}% recent move with ${move >= 0 ? 'upside' : 'downside'} pressure worth examining more closely.`;
  }
  if (relVolume !== null && relVolume >= 1.5) {
    return `Participation stands out at ${relVolume.toFixed(1)}x relative volume; direction still needs a full evidence pass.`;
  }
  if (trend.includes('up')) return 'Stored price structure is trending upward; full analysis is required before URSORA treats it as a setup.';
  if (trend.includes('down')) return 'Stored price structure is trending downward; full analysis is required before URSORA treats it as a setup.';
  return 'Recent market activity is available, but this ticker has not earned a suggestion without a full evidence analysis.';
};

type RouteCardProps = {
  symbol: string;
  quote?: Quote | null;
  ticker?: Ticker | null;
  signal?: Signal | null;
  active?: ActiveAnalysis | null;
  favorite?: boolean;
  selected?: boolean;
  selectable?: boolean;
  discovery?: boolean;
  route?: 'watchlist' | 'market' | 'suggested';
  onSelect?: () => void;
  onOpen?: () => void;
  onFavorite?: () => void;
};

const RouteCard: React.FC<RouteCardProps> = ({
  symbol, quote, ticker, signal, active, favorite = false, selected = false,
  selectable = false, discovery = false, route = 'watchlist', onSelect, onOpen, onFavorite,
}) => {
  const fullThesisAvailable = Boolean(onOpen);
  const setupText = discovery && !active
    ? curiositySummary(quote)
    : thesisSummary(signal) ?? curiositySummary(quote);
  const direction = signal?.direction ?? null;
  const directionSurface =
    direction === 'bullish'
      ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
      : direction === 'bearish'
        ? 'border-red-500/30 bg-red-500/[0.06]'
        : direction === 'neutral'
          ? 'border-sky-500/30 bg-sky-500/[0.06]'
          : 'border-zinc-800 bg-black/25';

  const openOrSelect = () => {
    if (onOpen) onOpen();
    else if (selectable && onSelect) onSelect();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openOrSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openOrSelect();
        }
      }}
      className={cn(
        'relative overflow-hidden rounded-md border p-3 transition-all',
        directionSurface,
        fullThesisAvailable ? 'cursor-pointer hover:brightness-110' : selectable ? 'cursor-pointer hover:brightness-110' : '',
        selected && 'ring-1 ring-sky-400/60',
        route === 'market' && 'border-zinc-700/80 bg-[#14171c] shadow-[0_0_0_1px_rgba(255,255,255,0.015)] hover:border-zinc-500',
        active && 'ring-1 ring-emerald-500/20',
      )}
    >
      {route === 'market' && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-b-[22px] border-l-[22px] border-b-zinc-700/80 border-l-transparent"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-r-[17px] border-t-[17px] border-r-sky-400/70 border-t-sky-400/70"
          />
        </>
      )}
      <div className="flex items-start gap-2 pr-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {onFavorite && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onFavorite();
                }}
                aria-label={favorite ? `Unfavorite ${symbol}` : `Favorite ${symbol}`}
                className={cn(
                  'rounded-sm p-0.5 transition-colors',
                  favorite ? 'text-amber-300' : 'text-zinc-600 hover:text-amber-300',
                )}
              >
                <Star className={cn('h-3.5 w-3.5', favorite && 'fill-current')} aria-hidden="true" />
              </button>
            )}
            <span className="font-mono text-sm font-semibold text-zinc-100">{symbol}</span>
            {discovery && (
              <span className="rounded-sm border border-zinc-600/80 bg-black/25 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-300">
                {curiosityTag(quote)}
              </span>
            )}
            {signal && <DirectionTag direction={signal.direction} />}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-zinc-500">{ticker?.company ?? '—'}</div>
        </div>

        {selectable && onSelect && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            className={cn(
              'shrink-0 rounded-sm border px-2 py-1 font-mono text-[9px] uppercase tracking-wider',
              selected
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-200',
            )}
          >
            {selected ? 'selected' : 'analyze'}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-base text-zinc-100">{money(quote?.price ?? signal?.stock_price_at_generation) ?? '—'}</span>
        <span className={cn('font-mono text-[10px]', changeColor(quote?.change_pct ?? null))}>
          {pct(quote?.change_pct ?? null) ?? '—'}
        </span>
        {signal && (
          <span className="font-mono text-[10px] text-zinc-500">
            score {signal.opportunity_score} · conf {signal.confidence_score}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {signal?.risk_level && <RiskTag level={signal.risk_level} />}
        {quote?.trend && (
          <span className="rounded-sm border border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
            {quote.trend}
          </span>
        )}
        {quote?.rel_volume !== null && quote?.rel_volume !== undefined && (
          <span className="rounded-sm border border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
            RVOL {Number(quote.rel_volume).toFixed(1)}x
          </span>
        )}
        {active && (
          <span className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
            active
          </span>
        )}
        {signal?.strategy === 'No Trade' && (
          <span className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300">
            last analysis · no trade
          </span>
        )}
      </div>

      {discovery ? (
        <div className="mt-3 rounded-sm border border-zinc-700/80 bg-black/20 px-2.5 py-2 shadow-[inset_2px_0_0_rgba(56,189,248,0.45)]">
          <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-400">Why it is on the radar</div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">{setupText}</p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">{setupText}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2 font-mono text-[9px] uppercase tracking-wider">
        <span className={fullThesisAvailable ? 'text-sky-300' : 'text-zinc-600'}>
          {fullThesisAvailable ? 'open full thesis' : 'select for full analysis'}
        </span>
        {active?.valid_until && <span className="text-zinc-600">through {stampET(active.valid_until)}</span>}
      </div>
    </div>
  );
};

export const OpportunitiesView: React.FC<{ onOpenThesis: (signalId: number) => void }> = ({ onOpenThesis }) => {
  const { user, favorites, toggleFavorite } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [activeAnalyses, setActiveAnalyses] = useState<ActiveAnalysis[]>([]);
  const [activeSignals, setActiveSignals] = useState<Record<string, Signal>>({});
  const [rememberedSignals, setRememberedSignals] = useState<Record<string, Signal>>({});
  const [analysisSelection, setAnalysisSelection] = useState<string[]>([]);
  const [symbolQuery, setSymbolQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipelineWarnings, setPipelineWarnings] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [latestSignals, latestQuotes, tickerRows, runRows, activeRows, memoryRows] = await Promise.all([
        fetchTodaySignals(),
        fetchLatestQuotes(),
        fetchTickers(),
        fetchRuns(6),
        fetchActiveAnalyses(),
        fetchSymbolAnalysisMemory(),
      ]);

      setSignals(latestSignals);
      setQuotes(latestQuotes);
      setTickers(Object.fromEntries(tickerRows.map((ticker) => [ticker.symbol, ticker])));
      setRuns(runRows);
      setActiveAnalyses(activeRows);

      const activeIds = [...new Set(activeRows.map((item) => item.signal_id).filter(Boolean))];
      if (activeIds.length) {
        const { data, error: signalError } = await db.from('signals').select('*').in('id', activeIds);
        if (signalError) throw signalError;
        const map: Record<string, Signal> = {};
        for (const signal of (data as Signal[]) ?? []) map[signal.symbol] = signal;
        setActiveSignals(map);
      } else {
        setActiveSignals({});
      }

      const memoryIds = [...new Set(memoryRows.map((item) => item.signal_id).filter(Boolean))];
      if (memoryIds.length) {
        const { data, error: memorySignalError } = await db.from('signals').select('*').in('id', memoryIds);
        if (memorySignalError) throw memorySignalError;
        const memoryMap: Record<string, Signal> = {};
        for (const signal of (data as Signal[]) ?? []) {
          memoryMap[String(signal.symbol).toUpperCase()] = signal;
        }
        setRememberedSignals(memoryMap);
      } else {
        setRememberedSignals({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onMarketRefreshed = () => void load();
    window.addEventListener('ursora-market-refreshed', onMarketRefreshed);
    return () => window.removeEventListener('ursora-market-refreshed', onMarketRefreshed);
  }, [load]);

  const latestSignalBySymbol = useMemo(
    () => Object.fromEntries(signals.map((signal) => [signal.symbol, signal])) as Record<string, Signal>,
    [signals],
  );

  const activeBySymbol = useMemo(
    () => Object.fromEntries(activeAnalyses.map((item) => [item.symbol, item])) as Record<string, ActiveAnalysis>,
    [activeAnalyses],
  );

  const signalFor = useCallback(
    (symbol: string) => rememberedSignals[symbol] ?? latestSignalBySymbol[symbol] ?? activeSignals[symbol] ?? null,
    [activeSignals, latestSignalBySymbol, rememberedSignals],
  );

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const normalizedQuery = symbolQuery.trim().toUpperCase();

  const watchlistSymbols = useMemo(
    () => favorites.filter((symbol) => !normalizedQuery || symbol.includes(normalizedQuery)),
    [favorites, normalizedQuery],
  );

  const otherSetupSymbols = useMemo(() => {
    const curiosityScore = (symbol: string) => {
      const quote = quotes[symbol];
      if (!quote) return -1;
      return Math.abs(quote.change_pct ?? 0) + Math.max(0, (quote.rel_volume ?? 1) - 1) * 2;
    };

    return Object.keys(tickers)
      .map((symbol) => symbol.toUpperCase())
      .filter((symbol) => !favoriteSet.has(symbol))
      .filter((symbol) => !normalizedQuery || symbol.includes(normalizedQuery))
      .sort((a, b) => curiosityScore(b) - curiosityScore(a));
  }, [favoriteSet, normalizedQuery, quotes, tickers]);

  const suggested = useMemo(
    () =>
      activeAnalyses
        .filter((item) => !normalizedQuery || item.symbol.includes(normalizedQuery))
        .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0)),
    [activeAnalyses, normalizedQuery],
  );

  const toggleAnalysisSelection = useCallback((symbol: string) => {
    const normalized = symbol.toUpperCase();
    setAnalysisSelection((previous) => {
      if (previous.includes(normalized)) return previous.filter((item) => item !== normalized);
      if (previous.length >= MAX_ANALYSIS) return previous;
      return [...previous, normalized];
    });
  }, []);

  const runAnalysisFor = useCallback(async (requestedSymbols: string[], offerFavorites = true) => {
    let selectedSymbols = [...new Set(requestedSymbols.map((symbol) => symbol.toUpperCase()))];

    if (!selectedSymbols.length) {
      setError('Select at least one ticker to analyze.');
      return;
    }
    if (selectedSymbols.length > MAX_ANALYSIS) {
      setError(`Select up to ${MAX_ANALYSIS} tickers per analysis run so URSORA can refresh each evidence set completely.`);
      return;
    }

    const omittedFavorites = favorites.filter((symbol) => !selectedSymbols.includes(symbol));
    if (offerFavorites && omittedFavorites.length) {
      const room = MAX_ANALYSIS - selectedSymbols.length;
      const canAddAll = omittedFavorites.length <= room;
      const confirmed = window.confirm(
        canAddAll
          ? `Your watchlist also contains ${omittedFavorites.join(', ')}. Add them to this analysis?\n\nOK = add watchlist · Cancel = run selected only`
          : `Your watchlist has ${omittedFavorites.length} additional ticker(s), but this run only has ${room} slot(s) left.\n\nOK = run selected only · Cancel = return and adjust your selection.`,
      );
      if (canAddAll && confirmed) selectedSymbols = [...selectedSymbols, ...omittedFavorites];
      if (!canAddAll && !confirmed) return;
    }

    setRunning(true);
    setError(null);
    setPipelineWarnings([]);

    try {
      const result = await runFreshAnalysis({ kind: 'manual', symbols: selectedSymbols });
      track('analysis_run', {
        signals: result.signals ?? 0,
        updates: result.updates ?? 0,
        symbols: selectedSymbols.join(','),
      });
      setPipelineWarnings(result.warnings);

      if (result.engine_version && result.engine_version !== 'tradecycle-5.6.0') {
        setError(
          `Analysis service returned ${result.engine_version}; expected tradecycle-5.6.0. Supabase is still serving an older run-analysis deployment.`,
        );
      }

      if (result.run_id) {
        const { data: runSignals, error: runSignalError } = await db
          .from('signals')
          .select('*')
          .eq('run_id', result.run_id)
          .in('symbol', selectedSymbols)
          .order('generated_at', { ascending: false });

        if (runSignalError) throw runSignalError;

        const exactRunMap: Record<string, Signal> = {};
        for (const signal of (runSignals as Signal[] | null) ?? []) {
          const symbol = String(signal.symbol).toUpperCase();
          if (!exactRunMap[symbol]) exactRunMap[symbol] = signal;
        }

        setRememberedSignals((previous) => ({ ...previous, ...exactRunMap }));
        setSignals((previous) => {
          const replaced = previous.filter((signal) => !selectedSymbols.includes(String(signal.symbol).toUpperCase()));
          return [...Object.values(exactRunMap), ...replaced];
        });
      }

      setAnalysisSelection([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [favorites, load]);

  const runFavorites = useCallback(() => {
    if (!favorites.length) {
      setError('Star at least one ticker before running a watchlist analysis.');
      return;
    }
    if (favorites.length > MAX_ANALYSIS) {
      setError(`Your watchlist has ${favorites.length} tickers. Select up to ${MAX_ANALYSIS} for one full analysis run.`);
      return;
    }
    void runAnalysisFor(favorites, false);
  }, [favorites, runAnalysisFor]);

  const onToggleFavorite = useCallback(async (symbol: string) => {
    if (!user) {
      setError('Sign in to save a persistent watchlist.');
      return;
    }
    try {
      setError(null);
      await toggleFavorite(symbol);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [toggleFavorite, user]);

  const lastRun = runs[0];

  if (loading) return <Spinner label="Loading URSORA routes" />;

  const columnClass =
    'flex h-[calc(100vh-235px)] min-h-[610px] w-[88vw] min-w-[88vw] snap-start flex-col overflow-hidden rounded-md border border-zinc-800 bg-[#111419] sm:w-[420px] sm:min-w-[420px] lg:w-auto lg:min-w-0';

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Today"
        title="Choose your trading route"
        description="Watch what matters to you, explore other market setups, or open a supported URSORA thesis. Full analysis only runs on the tickers you choose."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {lastRun && (
              <span className="hidden font-mono text-[10px] text-zinc-500 xl:inline">
                Last full run {stampET(lastRun.finished_at ?? lastRun.started_at)}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={running || analysisSelection.length === 0}
              onClick={() => void runAnalysisFor(analysisSelection)}
              className="gap-1.5 border-zinc-700"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              {running ? 'Analyzing…' : `Analyze selected (${analysisSelection.length}/${MAX_ANALYSIS})`}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-[#111419] px-3 py-2">
        <div className="flex w-full items-center gap-2 rounded-sm border border-zinc-700 bg-black/40 px-2.5 focus-within:border-sky-500/70 sm:w-[320px]">
          <Search className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
          <input
            value={symbolQuery}
            onChange={(event) => setSymbolQuery(event.target.value.toUpperCase())}
            placeholder="Search ticker — NVDA"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-xs uppercase text-zinc-100 placeholder:normal-case placeholder:text-zinc-600 focus:outline-none"
          />
          {symbolQuery && (
            <button type="button" onClick={() => setSymbolQuery('')} className="text-zinc-500 hover:text-zinc-200" aria-label="Clear search">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <span className="font-mono text-[10px] text-zinc-500">Full analysis cap: {MAX_ANALYSIS} tickers per run</span>
        <span className="ml-auto hidden text-[10px] text-zinc-600 md:inline">
          Watchlist quotes refresh on login · SPY / IWM / QQQ refresh daily
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200">
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {pipelineWarnings.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] text-amber-100">
          <div className="font-medium">Analysis completed with refresh warnings:</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-200/90">
            {pipelineWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="flex snap-x gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible">
        <section className={columnClass}>
          <div className="border-b border-zinc-800 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300">Static watchlist</div>
                <h2 className="mt-1 text-base font-semibold text-zinc-100">Your favorites</h2>
              </div>
              <Button size="sm" variant="outline" onClick={runFavorites} disabled={running || favorites.length === 0} className="border-zinc-700 text-[10px]">
                Analyze watchlist
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              Persistent across sessions. Your latest completed analysis stays attached to each ticker until that ticker is analyzed again; quote refreshes do not erase it.
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {watchlistSymbols.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-800 p-4 text-[11px] text-zinc-500">
                Star tickers in the center column to build your watchlist.
              </div>
            ) : (
              watchlistSymbols.map((symbol) => {
                const signal = signalFor(symbol);
                const active = activeBySymbol[symbol] ?? null;
                return (
                  <RouteCard
                    key={symbol}
                    symbol={symbol}
                    quote={quotes[symbol]}
                    ticker={tickers[symbol]}
                    signal={signal}
                    active={active}
                    favorite
                    selected={analysisSelection.includes(symbol)}
                    selectable
                    route="watchlist"
                    onSelect={() => toggleAnalysisSelection(symbol)}
                    onOpen={signal ? () => onOpenThesis(signal.id) : undefined}
                    onFavorite={() => void onToggleFavorite(symbol)}
                  />
                );
              })
            )}
          </div>
        </section>

        <section className={columnClass}>
          <div className="border-b border-zinc-800 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-300">Market setups</div>
            <h2 className="mt-1 text-base font-semibold text-zinc-100">Daily market scan</h2>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              The configured non-watchlist universe appears here every day. Market snapshots refresh once daily; missing data stays visible as unavailable rather than removing the ticker. Select what interests you for a full evidence analysis.
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {otherSetupSymbols.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-800 p-4 text-[11px] text-zinc-500">
                No un-favorited tickers match this search.
              </div>
            ) : (
              otherSetupSymbols.map((symbol) => {
                const quote = quotes[symbol] ?? null;
                const signal = signalFor(symbol);
                return (
                  <RouteCard
                    key={symbol}
                    symbol={symbol}
                    quote={quote}
                    ticker={tickers[symbol]}
                    signal={signal}
                    active={activeBySymbol[symbol] ?? null}
                    favorite={false}
                    selected={analysisSelection.includes(symbol)}
                    selectable
                    discovery
                    route="market"
                    onSelect={() => toggleAnalysisSelection(symbol)}
                    onOpen={signal ? () => onOpenThesis(signal.id) : undefined}
                    onFavorite={() => void onToggleFavorite(symbol)}
                  />
                );
              })
            )}
          </div>
        </section>

        <section className={columnClass}>
          <div className="border-b border-zinc-800 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300">Suggested trades</div>
            <h2 className="mt-1 text-base font-semibold text-zinc-100">Supported theses</h2>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              Only setups that cleared the full evidence gate appear here. They remain stored through their swing-analysis validity window instead of disappearing on unrelated runs.
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {suggested.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-800 p-4 text-[11px] text-zinc-500">
                No currently active supported thesis matches this search.
              </div>
            ) : (
              suggested.map((item) => {
                const signal = activeSignals[item.symbol] ?? latestSignalBySymbol[item.symbol] ?? null;
                return (
                  <RouteCard
                    key={item.symbol}
                    symbol={item.symbol}
                    quote={quotes[item.symbol]}
                    ticker={tickers[item.symbol]}
                    signal={signal}
                    active={item}
                    favorite={favoriteSet.has(item.symbol)}
                    route="suggested"
                    onOpen={() => onOpenThesis(item.signal_id)}
                    onFavorite={() => void onToggleFavorite(item.symbol)}
                  />
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default OpportunitiesView;
