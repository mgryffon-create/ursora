import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FlaskConical, Loader2, Play } from 'lucide-react';
import { EDGE_FUNCTIONS, callEdge, fetchTickers, track } from '@/lib/api';
import type { Ticker } from '@/lib/types';
import { DEFAULT_UNIVERSE, useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DemoBadge, Disclaimer, EmptyState, Metric, Panel, SectionHeading, Unavailable,
} from '@/components/common/Primitives';
import { EquityCurve } from '@/components/charts/PriceChart';
import { cn } from '@/lib/utils';

interface BacktestMetrics {
  sample_size: number;
  win_rate_pct: number | null;
  avg_winner_pct: number | null;
  avg_loser_pct: number | null;
  expectancy_pct: number | null;
  profit_factor: number | null;
  max_drawdown_pct: number | null;
  total_return_pct: number | null;
  scratches: number;
  news_rows_excluded_by_guard: number;
}

interface BacktestTrade {
  symbol: string;
  entry_date: string;
  direction: string;
  score: number;
  entry_price: number;
  exit_price: number;
  underlying_return_pct: number;
  option_return_pct: number;
  mfe_pct: number;
  mae_pct: number;
  result: string;
  news_visible: number;
}

interface BucketRow {
  bucket: string;
  n: number;
  win_rate: number | null;
  expectancy: number | null;
}

interface BacktestResponse {
  metrics: BacktestMetrics;
  equity_curve: { t: string; equity: number; drawdown: number }[];
  trades: BacktestTrade[];
  by_score_bucket: BucketRow[];
  by_symbol: BucketRow[];
  warnings: string[];
  look_ahead_guard: string;
  run_id: number | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const BacktestView: React.FC = () => {
  const { user } = useAuth();
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [selected, setSelected] = useState<string[]>(['NVDA', 'AAPL', 'TSLA', 'SPY']);
  const [start, setStart] = useState(iso(new Date(Date.now() - 90 * 86400000)));
  const [end, setEnd] = useState(iso(new Date()));
  const [minScore, setMinScore] = useState(60);
  const [directionFilter, setDirectionFilter] = useState<'any' | 'bullish' | 'bearish'>('any');
  const [hold, setHold] = useState(3);
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchTickers().then(setTickers).catch(() => setTickers([]));
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await callEdge<BacktestResponse>(EDGE_FUNCTIONS.backtest, {
        symbols: selected.length ? selected : DEFAULT_UNIVERSE.slice(0, 4),
        start_date: start,
        end_date: end,
        min_opportunity_score: minScore,
        direction_filter: directionFilter,
        holding_period_days: hold,
        label: `${selected.join('/')} ${start} to ${end}`,
      });
      setResult(res);
      track('backtest_run', { symbols: selected.length, sample: res.metrics?.sample_size ?? 0, min_score: minScore });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [directionFilter, end, hold, minScore, selected, start]);

  const toggle = (sym: string) =>
    setSelected((prev) => (prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]));

  const m = result?.metrics;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Historical evidence"
        title="See how similar setups behaved in past market conditions"
        description="Historical evidence helps test whether a setup has appeared before, how often it occurred, and how price behaved afterward. It is context for learning and model validation, not a prediction of the next trade."
        right={<DemoBadge />}
      />

      <Panel
        title="How historical evidence is evaluated"
        subtitle="Backtests use only information that would have been available at each point in time. Future information is excluded from the decision process."
      >
        <p className="text-[12px] leading-relaxed text-zinc-400">
          This prevents the test from benefiting from information that was not yet known. Historical results remain separate from
          connected brokerage outcomes so users can distinguish model evidence from their own trading record.
        </p>
      </Panel>

      <Panel title="Test settings" subtitle="Define the historical period and the signal criteria to evaluate.">
        <div className="space-y-3">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Tickers</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(tickers.length ? tickers.map((t) => t.symbol) : DEFAULT_UNIVERSE).map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggle(sym)}
                  className={cn(
                    'rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors',
                    selected.includes(sym)
                      ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                      : 'border-zinc-800 bg-black/30 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                  )}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="bt-start" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">Start date</label>
              <input
                id="bt-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-sm border border-zinc-800 bg-black/40 px-2 py-1.5 font-mono text-xs text-zinc-200 focus-visible:border-sky-500/60 focus-visible:outline-none"
              />
            </div>
            <div>
              <label htmlFor="bt-end" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">End date</label>
              <input
                id="bt-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-sm border border-zinc-800 bg-black/40 px-2 py-1.5 font-mono text-xs text-zinc-200 focus-visible:border-sky-500/60 focus-visible:outline-none"
              />
            </div>
            <div>
              <label htmlFor="bt-score" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Minimum opportunity score: <span className="text-zinc-200">{minScore}</span>
              </label>
              <input
                id="bt-score"
                type="range"
                min={40}
                max={90}
                step={5}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="mt-3 w-full accent-sky-500"
              />
            </div>
            <div>
              <label htmlFor="bt-dir" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">Direction</label>
              <select
                id="bt-dir"
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as 'any' | 'bullish' | 'bearish')}
                className="mt-1 w-full rounded-sm border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus-visible:border-sky-500/60 focus-visible:outline-none"
              >
                {['any', 'bullish', 'bearish'].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bt-hold" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Holding period: <span className="text-zinc-200">{hold} session{hold === 1 ? '' : 's'}</span>
              </label>
              <input
                id="bt-hold"
                type="range"
                min={1}
                max={10}
                step={1}
                value={hold}
                onChange={(e) => setHold(Number(e.target.value))}
                className="mt-3 w-full accent-sky-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              {busy ? 'Running historical test…' : 'Run historical test'}
            </Button>
            <span className="text-[11px] text-zinc-500">
              {user ? 'This test will be saved to your private backtest history.' : 'Sign in to save historical tests to your account.'}
            </span>
          </div>
        </div>
      </Panel>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="space-y-3">
          {!result ? (
            <EmptyState
              title="No historical test has been run in this session"
              body="Choose the symbols, date range and criteria above, then run the historical test. The number of historical trades is shown before any performance statistic."
              action={<Button onClick={run} disabled={busy} className="gap-2"><FlaskConical className="h-4 w-4" aria-hidden="true" />Run historical test</Button>}
            />
          ) : (
            <>
              <div className={cn(
                'rounded-md border p-3',
                (m?.sample_size ?? 0) < 30 ? 'border-amber-500/50 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/[0.06]',
              )}>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Sample size</span>
                  <span className={cn('font-mono text-2xl font-semibold tabular-nums', (m?.sample_size ?? 0) < 30 ? 'text-amber-300' : 'text-emerald-300')}>
                    {m?.sample_size ?? 0}
                  </span>
                  <span className="text-[12px] text-zinc-400">simulated trades</span>
                </div>
                {(result.warnings ?? []).map((w) => (
                  <p key={w} className="mt-1.5 text-[12px] leading-relaxed text-zinc-300">{w}</p>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
                <Metric label="Win rate" value={m?.win_rate_pct === null || m?.win_rate_pct === undefined ? null : `${m.win_rate_pct}%`} />
                <Metric label="Average winner" value={m?.avg_winner_pct === null || m?.avg_winner_pct === undefined ? null : `${m.avg_winner_pct}%`} valueClass="text-emerald-300" />
                <Metric label="Average loser" value={m?.avg_loser_pct === null || m?.avg_loser_pct === undefined ? null : `${m.avg_loser_pct}%`} valueClass="text-red-300" />
                <Metric label="Average return per trade" value={m?.expectancy_pct === null || m?.expectancy_pct === undefined ? null : `${m.expectancy_pct}%`} />
                <Metric label="Gross gains ÷ gross losses" value={m?.profit_factor ?? null} />
                <Metric label="Largest decline" value={m?.max_drawdown_pct === null || m?.max_drawdown_pct === undefined ? null : `${m.max_drawdown_pct}%`} valueClass="text-red-300" />
                <Metric label="Future-dated items excluded" value={m?.news_rows_excluded_by_guard ?? null} hint="not yet available at that time" />
              </div>

              <Panel title="Portfolio performance over time" right={<DemoBadge />}>
                <EquityCurve data={result.equity_curve ?? []} />
              </Panel>

              <div className="grid gap-3 lg:grid-cols-2">
                <Panel title="Results by opportunity score">
                  <table className="w-full text-left text-[11px]">
                    <thead className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      <tr>{['Score range', 'Trades', 'Win rate', 'Average return'].map((h) => <th key={h} scope="col" className="px-2 py-1.5">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {(result.by_score_bucket ?? []).map((b) => (
                        <tr key={b.bucket}>
                          <td className="px-2 py-1.5 font-mono text-zinc-200">{b.bucket}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-400">{b.n}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{b.win_rate === null ? <Unavailable /> : `${b.win_rate}%`}</td>
                          <td className={cn('px-2 py-1.5 font-mono tabular-nums', (b.expectancy ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {b.expectancy === null ? <Unavailable /> : `${b.expectancy}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
                <Panel title="Results by symbol">
                  <table className="w-full text-left text-[11px]">
                    <thead className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      <tr>{['Symbol', 'Trades', 'Win rate', 'Average return'].map((h) => <th key={h} scope="col" className="px-2 py-1.5">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {(result.by_symbol ?? []).map((b) => (
                        <tr key={b.bucket}>
                          <td className="px-2 py-1.5 font-mono font-semibold text-zinc-200">{b.bucket}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-400">{b.n}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{b.win_rate === null ? <Unavailable /> : `${b.win_rate}%`}</td>
                          <td className={cn('px-2 py-1.5 font-mono tabular-nums', (b.expectancy ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {b.expectancy === null ? <Unavailable /> : `${b.expectancy}%`}
                          </td>
                        </tr>
                      ))}
                      {!(result.by_symbol ?? []).length && (
                        <tr><td className="px-2 py-2" colSpan={4}><Unavailable /></td></tr>
                      )}
                    </tbody>
                  </table>
                </Panel>
              </div>

              <Panel title="Historical trades" subtitle="Each row shows the signal, entry, exit and outcome for the historical test." bodyClassName="p-0">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[860px] text-left text-[11px]">
                    <thead className="sticky top-0 bg-black/60 font-mono text-[10px] uppercase tracking-wider text-zinc-500 backdrop-blur">
                      <tr>
                        {['Entry date', 'Symbol', 'Direction', 'Score', 'Entry price', 'Exit price', 'Stock return', 'Estimated option return', 'Best move', 'Worst move', 'Result', 'News available'].map((h) => (
                          <th key={h} scope="col" className="whitespace-nowrap px-2 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {(result.trades ?? []).map((t, i) => (
                        <tr key={`${t.symbol}-${t.entry_date}-${i}`} className="transition-colors hover:bg-black/30">
                          <td className="px-2 py-1.5 font-mono text-zinc-400">{t.entry_date}</td>
                          <td className="px-2 py-1.5 font-mono font-semibold text-zinc-100">{t.symbol}</td>
                          <td className={cn('px-2 py-1.5 font-mono text-[10px] uppercase', t.direction === 'bearish' ? 'text-red-300' : 'text-emerald-300')}>{t.direction}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{t.score}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-400">{t.entry_price}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-400">{t.exit_price}</td>
                          <td className={cn('px-2 py-1.5 font-mono tabular-nums', t.underlying_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{t.underlying_return_pct}%</td>
                          <td className={cn('px-2 py-1.5 font-mono font-semibold tabular-nums', t.option_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{t.option_return_pct}%</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-emerald-300">{t.mfe_pct}%</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-red-300">{t.mae_pct}%</td>
                          <td className="px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-400">{t.result}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-500">{t.news_visible}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
      </div>

      <Disclaimer />
    </div>
  );
};

export default BacktestView;
