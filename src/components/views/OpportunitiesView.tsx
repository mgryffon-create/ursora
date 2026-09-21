import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon, Ban, Clock, Layers, Filter, Loader2, RefreshCw, Search, TrendingUp, X,
} from 'lucide-react';
import db from '@/lib/db';
import { EDGE_FUNCTIONS, callEdge, fetchLatestQuotes, fetchRuns, fetchTickers, fetchTodaySignals, paperTradeSignal, track } from '@/lib/api';
import type { AnalysisRun, ContractCandidate, Quote, Signal, Ticker } from '@/lib/types';
import { changeColor, compact, dte, ivPct, money, num, pct, scoreColor, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DemoBadge, DirectionTag, Disclaimer, EmptyState, FlagTag, Metric, Panel, RiskTag, ScoreBar,
  SectionHeading, Spinner, Unavailable, Val,
} from '@/components/common/Primitives';
import CompareView from '@/components/views/CompareView';
import { cn } from '@/lib/utils';

const DIRECTIONS = ['any', 'bullish', 'bearish', 'neutral'] as const;
const RISKS = ['any', 'Low', 'Moderate', 'High', 'Extreme'] as const;
const MAX_COMPARE = 3;

/** Checkbox that adds a signal to the side-by-side comparison. */
const CompareToggle: React.FC<{
  symbol: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  withLabel?: boolean;
}> = ({ symbol, checked, disabled, onChange, withLabel = false }) => (
  <label
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap',
      disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
    )}
    title={disabled ? `Comparison holds ${MAX_COMPARE} signals — drop one first` : `Compare ${symbol} side by side`}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={`Add ${symbol} to the comparison`}
      className="h-3.5 w-3.5 accent-sky-500"
    />
    {withLabel && (
      <span className={cn('font-mono text-[10px] uppercase tracking-wider', checked ? 'text-sky-300' : 'text-zinc-500')}>
        compare
      </span>
    )}
  </label>
);

export const OpportunitiesView: React.FC<{ onOpenThesis: (signalId: number) => void }> = ({ onOpenThesis }) => {
  const { user, watchlist } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [candidates, setCandidates] = useState<Record<number, ContractCandidate[]>>({});
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradedIds, setTradedIds] = useState<number[]>([]);

  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>('any');
  const [risk, setRisk] = useState<(typeof RISKS)[number]>('any');
  const [minScore, setMinScore] = useState(0);
  const [symbolQuery, setSymbolQuery] = useState('');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sig, q, tk, rn] = await Promise.all([
        fetchTodaySignals(), fetchLatestQuotes(), fetchTickers(), fetchRuns(6),
      ]);
      setSignals(sig);
      setQuotes(q);
      setTickers(Object.fromEntries(tk.map((t) => [t.symbol, t])));
      setRuns(rn);
      if (sig.length) {
        const { data } = await db
          .from('contract_candidates')
          .select('*')
          .in('signal_id', sig.map((s) => s.id))
          .order('rank', { ascending: true });
        const map: Record<number, ContractCandidate[]> = {};
        for (const c of (data as ContractCandidate[]) ?? []) {
          map[c.signal_id] = [...(map[c.signal_id] ?? []), c];
        }
        setCandidates(map);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await callEdge<{ signals: number; updates: number }>(EDGE_FUNCTIONS.analysis, { kind: 'manual' });
      track('analysis_run', { signals: res.signals ?? 0, updates: res.updates ?? 0 });
      setCompareIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [load]);

  const paperTrade = useCallback(
    async (signal: Signal) => {
      try {
        const balanced = (candidates[signal.id] ?? []).find((c) => c.profile === 'Balanced') ?? null;
        await paperTradeSignal(signal, balanced);
        setTradedIds((prev) => [...prev, signal.id]);
        track('paper_trade_opened', { symbol: signal.symbol, opportunity: signal.opportunity_score });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [candidates],
  );

  const toggleCompare = useCallback((id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  }, []);

  const meetingCriteria = useMemo(() => signals.filter((s) => s.strategy !== 'No Trade'), [signals]);
  const noTrade = useMemo(() => signals.filter((s) => s.strategy === 'No Trade'), [signals]);

  const filtered = useMemo(
    () =>
      meetingCriteria.filter((s) => {
        if (direction !== 'any' && s.direction !== direction) return false;
        if (risk !== 'any' && s.risk_level !== risk) return false;
        if (s.opportunity_score < minScore) return false;
        if (symbolQuery && !s.symbol.includes(symbolQuery.toUpperCase())) return false;
        if (watchlistOnly && !watchlist.includes(s.symbol)) return false;
        return true;
      }),
    [meetingCriteria, direction, risk, minScore, symbolQuery, watchlistOnly, watchlist],
  );

  const selected = useMemo(
    () => compareIds.map((id) => signals.find((s) => s.id === id)).filter((s): s is Signal => Boolean(s)),
    [compareIds, signals],
  );
  const compareFull = compareIds.length >= MAX_COMPARE;

  const lastRun = runs[0];

  if (loading) return <Spinner label="Loading today's ranked opportunities" />;

  if (comparing && compareIds.length >= 2) {
    return (
      <CompareView
        signalIds={compareIds}
        onBack={() => setComparing(false)}
        onOpenThesis={onOpenThesis}
        onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Today"
        title="Today's Opportunities"
        description="A ranked list of opportunities identified by URSORA. Open an analysis to review the supporting evidence, available contract information, and risk considerations."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {lastRun && (
              <span className="hidden font-mono text-[10px] text-zinc-500 lg:inline">
                Last run {stampET(lastRun.finished_at ?? lastRun.started_at)} · {lastRun.signals_generated} signals
              </span>
            )}
            <Button size="sm" variant="outline" onClick={runAnalysis} disabled={running} className="gap-1.5 border-zinc-700">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              {running ? 'Running…' : 'Run analysis'}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200">
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-[#111419] px-3 py-2">
        <button
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] transition-colors',
            showFilters ? 'bg-sky-500/15 text-sky-200' : 'text-zinc-400 hover:text-zinc-200',
          )}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          Filters
        </button>
        <span className="font-mono text-[10px] text-zinc-500">
          {filtered.length} meetingCriteria · {noTrade.length} not selected
        </span>
        {compareIds.length > 0 && (
          <span className="font-mono text-[10px] text-sky-300">{compareIds.length} selected to compare</span>
        )}
        <span className="ml-auto hidden text-[10px] text-zinc-600 md:inline">Select up to {MAX_COMPARE} rows for side-by-side comparison.</span>
      </div>

      {showFilters && (
        <Panel>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="flt-dir" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">Direction</label>
              <select
                id="flt-dir"
                value={direction}
                onChange={(e) => setDirection(e.target.value as (typeof DIRECTIONS)[number])}
                className="mt-1 rounded-sm border border-zinc-800 bg-black/40 px-2 py-1 text-xs text-zinc-200 focus-visible:border-sky-500/60 focus-visible:outline-none"
              >
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="flt-risk" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">Risk</label>
              <select
                id="flt-risk"
                value={risk}
                onChange={(e) => setRisk(e.target.value as (typeof RISKS)[number])}
                className="mt-1 rounded-sm border border-zinc-800 bg-black/40 px-2 py-1 text-xs text-zinc-200 focus-visible:border-sky-500/60 focus-visible:outline-none"
              >
                {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label htmlFor="flt-score" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Min opportunity: <span className="text-zinc-200">{minScore}</span>
              </label>
              <input
                id="flt-score"
                type="range"
                min={0}
                max={95}
                step={5}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="mt-2 w-full accent-sky-500"
              />
            </div>
            <div>
              <label htmlFor="flt-sym" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">Ticker</label>
              <div className="mt-1 flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-black/40 px-2 focus-within:border-sky-500/60">
                <Search className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                <input
                  id="flt-sym"
                  value={symbolQuery}
                  onChange={(e) => setSymbolQuery(e.target.value)}
                  placeholder="NVDA"
                  className="w-24 bg-transparent py-1 font-mono text-xs uppercase text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-1 text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={watchlistOnly}
                onChange={(e) => setWatchlistOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-sky-500"
              />
              Watchlist only
            </label>
          </div>
        </Panel>
      )}

      <div className="hidden overflow-hidden rounded-md border border-zinc-800 bg-[#14171c] xl:block">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-black/50 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th scope="col" className="w-9 px-3 py-2"><span className="sr-only">Compare</span><Layers className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" /></th>
              {['Ticker', 'Price', 'Direction', 'Opportunity', 'Confidence', 'Risk', 'Contract', ''].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {filtered.map((s) => {
              const c = (candidates[s.id] ?? []).find((x) => x.profile === 'Balanced') ?? (candidates[s.id] ?? [])[0];
              const q = quotes[s.symbol];
              const picked = compareIds.includes(s.id);
              const contract = s.suggested_expiration && s.suggested_strike
                ? `${num(s.suggested_strike)} ${s.direction === 'bearish' ? 'PUT' : 'CALL'} · ${s.suggested_expiration}`
                : c?.contract_symbol ?? null;
              return (
                <tr key={s.id} className={cn('transition-colors', picked ? 'bg-sky-500/[0.08]' : 'hover:bg-sky-500/[0.04]')}>
                  <td className="px-3 py-3">
                    <CompareToggle
                      symbol={s.symbol}
                      checked={picked}
                      disabled={!picked && compareFull}
                      onChange={() => toggleCompare(s.id)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-mono text-[12px] font-semibold text-zinc-100">{s.symbol}</div>
                    <div className="max-w-[170px] truncate text-[10px] text-zinc-500">{tickers[s.symbol]?.company ?? <Unavailable />}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-mono tabular-nums text-zinc-100">{money(q?.price ?? s.stock_price_at_generation) ?? <Unavailable />}</div>
                    <div className={cn('font-mono text-[10px]', changeColor(q?.change_pct))}>{pct(q?.change_pct) ?? '—'}</div>
                  </td>
                  <td className="px-3 py-3"><DirectionTag direction={s.direction} /></td>
                  <td className={cn('px-3 py-3 font-mono text-base font-semibold tabular-nums', scoreColor(s.opportunity_score))}>{s.opportunity_score}</td>
                  <td className={cn('px-3 py-3 font-mono font-semibold tabular-nums', scoreColor(s.confidence_score))}>{s.confidence_score}</td>
                  <td className="px-3 py-3"><RiskTag level={s.risk_level} /></td>
                  <td className="max-w-[260px] px-3 py-3">
                    {contract ? (
                      <div>
                        <div className="font-mono text-[11px] text-zinc-300">{contract}</div>
                        {(c?.bid || c?.ask) && <div className="mt-0.5 font-mono text-[9px] text-zinc-500">bid {num(c?.bid) ?? '—'} · ask {num(c?.ask) ?? '—'}</div>}
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-600">Options data pending</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <Button size="sm" variant="outline" className="h-7 gap-1 border-zinc-700 text-[10px]" onClick={() => onOpenThesis(s.id)}>
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                      Open analysis
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-4">
            <EmptyState title="No opportunity matches these filters" body="Adjust the filters or review the opportunities that did not meet the minimum criteria." />
          </div>
        )}
      </div>

      {/* MOBILE / TABLET CARDS */}
      <div className="grid gap-3 md:grid-cols-2 xl:hidden">
        {filtered.map((s, i) => {
          const c = (candidates[s.id] ?? []).find((x) => x.profile === 'Balanced') ?? (candidates[s.id] ?? [])[0];
          const q = quotes[s.symbol];
          const picked = compareIds.includes(s.id);
          return (
            <article
              key={s.id}
              className={cn(
                'rounded-md border bg-[#14171c] p-3 transition-colors',
                picked ? 'border-sky-500/60 bg-sky-500/[0.05]' : 'border-zinc-800 hover:border-sky-500/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500">#{i + 1}</span>
                    <span className="font-mono text-sm font-semibold text-zinc-100">{s.symbol}</span>
                    <DemoBadge />
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{tickers[s.symbol]?.company ?? <Unavailable />}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums text-zinc-100">{money(q?.price ?? s.stock_price_at_generation) ?? <Unavailable />}</div>
                  <div className={cn('font-mono text-[10px]', changeColor(q?.change_pct))}>{pct(q?.change_pct) ?? '—'}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <DirectionTag direction={s.direction} />
                <RiskTag level={s.risk_level} />
                <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[10px] text-zinc-300">{s.strategy}</span>
                <span className="ml-auto">
                  <CompareToggle
                    symbol={s.symbol}
                    checked={picked}
                    disabled={!picked && compareFull}
                    onChange={() => toggleCompare(s.id)}
                    withLabel
                  />
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ScoreBar label="Opportunity" score={s.opportunity_score} />
                <ScoreBar label="Confidence" score={s.confidence_score} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric label="Strike" value={num(s.suggested_strike)} />
                <Metric label="Expiration" value={s.suggested_expiration} hint={dte(s.suggested_expiration) !== null ? `${dte(s.suggested_expiration)} days` : undefined} />
                <Metric label="Mid" value={num(c?.mid)} />
                <Metric label="Bid / Ask" value={c ? `${num(c.bid)} / ${num(c.ask)}` : null} />
                <Metric label="IV" value={ivPct(c?.implied_volatility)} />
                <Metric label="Delta" value={num(c?.delta, 3)} />
                <Metric label="Break-even" value={num(s.break_even)} />
                <Metric label="Premium" value={money(s.est_premium)} />
                <Metric label="Max loss" value={money(s.max_defined_loss)} valueClass="text-red-300" />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{s.catalyst_summary ?? 'No dated catalyst in store.'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" className="h-7 gap-1 text-[10px]" onClick={() => onOpenThesis(s.id)}>
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  VIEW TRADE THESIS
                </Button>
                {user && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-zinc-700 text-[10px]"
                    disabled={tradedIds.includes(s.id)}
                    onClick={() => paperTrade(s)}
                  >
                    {tradedIds.includes(s.id) ? 'Paper trade logged' : 'Paper trade this signal'}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* NO TRADE */}
      <Panel
        title="NO TRADE / WAIT"
        subtitle="These names were analysed and deliberately rejected. The rule that fired is stated on each card — the engine does not manufacture a setup to fill the board."
        right={<DemoBadge />}
      >
        {noTrade.length === 0 ? (
          <EmptyState title="No rejections in this run" body="Every analysed name cleared the engine's minimum evidence thresholds for this run." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {noTrade.map((s) => {
              const picked = compareIds.includes(s.id);
              return (
                <article
                  key={s.id}
                  className={cn(
                    'rounded-md border p-3 transition-colors',
                    picked ? 'border-sky-500/50 bg-sky-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.04]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Ban className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                      <span className="font-mono text-sm font-semibold text-zinc-100">{s.symbol}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">no trade</span>
                    </div>
                    <span className={cn('font-mono text-xs font-semibold tabular-nums', scoreColor(s.opportunity_score))}>
                      {s.opportunity_score}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{s.no_trade_reason}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <DirectionTag direction={s.direction} />
                    <FlagTag flag="evidence below threshold" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenThesis(s.id)}
                      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                    >
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      view the evidence anyway
                    </button>
                    <CompareToggle
                      symbol={s.symbol}
                      checked={picked}
                      disabled={!picked && compareFull}
                      onChange={() => toggleCompare(s.id)}
                      withLabel
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Disclaimer />

      {/* COMPARE TRAY */}
      {selected.length > 0 && (
        <div className="pointer-events-none fixed bottom-[62px] left-0 right-0 z-30 px-3 lg:bottom-4 lg:pl-64">
          <div className="pointer-events-auto mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-2 rounded-md border border-sky-500/40 bg-[#0e1116]/98 p-2.5 shadow-lg shadow-black/60 backdrop-blur animate-fade-in">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-sky-300">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              compare
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {selected.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-black/40 px-1.5 py-[2px] font-mono text-[10px] text-zinc-200"
                >
                  {s.symbol}
                  <span className={cn('tabular-nums', scoreColor(s.opportunity_score))}>{s.opportunity_score}</span>
                  <button
                    type="button"
                    onClick={() => toggleCompare(s.id)}
                    aria-label={`Remove ${s.symbol} from the comparison`}
                    className="text-zinc-500 transition-colors hover:text-red-300"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <span className="font-mono text-[10px] text-zinc-500">
              {selected.length < 2 ? 'tick one more row to open the comparison' : `${selected.length} columns, aligned row by row`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompareIds([])}
                className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-200"
              >
                clear
              </button>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-[10px]"
                disabled={selected.length < 2}
                onClick={() => {
                  setComparing(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <Layers className="h-3 w-3" aria-hidden="true" />
                COMPARE {selected.length} SIGNALS
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpportunitiesView;
