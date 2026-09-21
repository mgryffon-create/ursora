import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Lock, Percent, TrendingDown, TrendingUp } from 'lucide-react';
import { closePaperTrade, fetchLatestQuotes, fetchPaperTrades, fetchTodaySignals, fetchWebullPaperDashboard, paperTradeSignal, track, type WebullPaperDashboard } from '@/lib/api';
import type { PaperTrade, Quote, Signal } from '@/lib/types';
import { money, num, pct, scoreColor, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DemoBadge, Disclaimer, EmptyState, Metric, Panel, SectionHeading, Spinner, Unavailable,
} from '@/components/common/Primitives';
import { EquityCurve } from '@/components/charts/PriceChart';
import { cn } from '@/lib/utils';

const bucketOf = (score: number | null) =>
  score === null ? 'unscored' : score >= 90 ? '90-100' : score >= 80 ? '80-89' : score >= 70 ? '70-79' : score >= 60 ? '60-69' : 'below 60';

export const PaperTradingView: React.FC<{ onOpenThesis: (id: number) => void }> = ({ onOpenThesis }) => {
  const { user } = useAuth();
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paperAccount, setPaperAccount] = useState<WebullPaperDashboard | null>(null);
  const [paperAccountError, setPaperAccountError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, s, q, accountResult] = await Promise.all([
        fetchPaperTrades(),
        fetchTodaySignals(),
        fetchLatestQuotes(),
        fetchWebullPaperDashboard().catch((accountError) => {
          setPaperAccountError(accountError instanceof Error ? accountError.message : String(accountError));
          return null;
        }),
      ]);
      setTrades(t);
      setSignals(s);
      setQuotes(q);
      setPaperAccount(accountResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recordAll = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const tradable = signals.filter((s) => s.strategy !== 'No Trade' && !trades.some((t) => t.signal_id === s.id));
      for (const s of tradable) await paperTradeSignal(s, null);
      track('paper_trades_bulk_recorded', { count: tradable.length });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [load, signals, trades]);

  const close = useCallback(
    async (t: PaperTrade) => {
      setBusy(true);
      setError(null);
      try {
        const entry = t.contract_price_at_generation;
        const spot = quotes[t.symbol]?.price ?? t.stock_price_at_generation;
        // Mark the contract off the stored underlying move with a near-the-money
        // proxy: the platform does not store a historical chain in demo mode.
        const underlyingMove =
          spot && t.stock_price_at_generation
            ? ((Number(spot) - Number(t.stock_price_at_generation)) / Number(t.stock_price_at_generation)) *
              (t.direction === 'bearish' ? -1 : 1)
            : 0;
        const marked = entry ? Math.max(0.01, Number(entry) * (1 + underlyingMove * 3.2)) : 0;
        await closePaperTrade(t.id, Math.round(marked * 100) / 100, entry);
        track('paper_trade_closed', { symbol: t.symbol });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [load, quotes],
  );

  const closed = useMemo(() => trades.filter((t) => t.result !== 'open'), [trades]);
  const open = useMemo(() => trades.filter((t) => t.result === 'open'), [trades]);

  const stats = useMemo(() => {
    const wins = closed.filter((t) => t.result === 'win');
    const losses = closed.filter((t) => t.result === 'loss');
    const rets = closed.map((t) => Number(t.return_pct ?? 0));
    const grossWin = wins.reduce((a, t) => a + Number(t.return_pct ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + Number(t.return_pct ?? 0), 0));
    let equity = 0;
    let peak = 0;
    let maxDd = 0;
    const curve = [...closed]
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      .map((t) => {
        equity += Number(t.return_pct ?? 0);
        peak = Math.max(peak, equity);
        maxDd = Math.min(maxDd, equity - peak);
        return {
          t: new Date(t.closed_at ?? t.created_at).toISOString().slice(5, 10),
          equity: Math.round(equity * 100) / 100,
          drawdown: Math.round((equity - peak) * 100) / 100,
        };
      });
    return {
      n: closed.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : null,
      avgWin: wins.length ? grossWin / wins.length : null,
      avgLoss: losses.length ? -grossLoss / losses.length : null,
      expectancy: closed.length ? rets.reduce((a, b) => a + b, 0) / closed.length : null,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
      maxDd,
      curve,
      total: rets.reduce((a, b) => a + b, 0),
    };
  }, [closed]);

  const groupBy = useCallback(
    (key: (t: PaperTrade) => string) => {
      const m: Record<string, PaperTrade[]> = {};
      for (const t of closed) {
        const k = key(t) || 'unspecified';
        m[k] = [...(m[k] ?? []), t];
      }
      return Object.entries(m).map(([k, set]) => ({
        label: k,
        n: set.length,
        winRate: (set.filter((t) => t.result === 'win').length / set.length) * 100,
        expectancy: set.reduce((a, t) => a + Number(t.return_pct ?? 0), 0) / set.length,
      }));
    },
    [closed],
  );

  if (loading) return <Spinner label="Loading your paper-trading ledger" />;

  if (!user) {
    return (
      <EmptyState
        title="Sign in to use the paper-trading ledger"
        body="Paper trades are personal records tied to your account and are readable only by you at the database level, so the ledger is unavailable while signed out."
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Paper trading"
        title="Performance ledger"
        description="Each record stores the signal timestamp, the stock price and contract price at generation, both scores, the entry assumptions, the excursions and the result. Records are appended, never rewritten."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
              <Lock className="h-3 w-3" aria-hidden="true" />
              append-only ledger
            </span>
            <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700" onClick={recordAll} disabled={busy}>
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              Record all tradable signals
            </Button>
          </div>
        }
      />

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200">{error}</div>}

      <Panel
        title="Webull PaperTrade account"
        subtitle={paperAccount ? `${paperAccount.account.label ?? 'Paper account'} · ${paperAccount.environment}` : 'Live connection to the Webull sandbox paper account.'}
        right={<DemoBadge />}
      >
        {paperAccount ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <Metric label="Net liquidation" value={paperAccount.summary.net_liquidation === null ? null : money(paperAccount.summary.net_liquidation)} />
              <Metric label="Cash" value={paperAccount.summary.cash === null ? null : money(paperAccount.summary.cash)} />
              <Metric label="Option buying power" value={paperAccount.summary.option_buying_power === null ? null : money(paperAccount.summary.option_buying_power)} />
              <Metric label="Day buying power" value={paperAccount.summary.day_buying_power === null ? null : money(paperAccount.summary.day_buying_power)} />
              <Metric label="Overnight buying power" value={paperAccount.summary.overnight_buying_power === null ? null : money(paperAccount.summary.overnight_buying_power)} />
              <Metric label="Market value" value={paperAccount.summary.market_value === null ? null : money(paperAccount.summary.market_value)} />
              <Metric label="Day P/L" value={paperAccount.summary.day_pl === null ? null : money(paperAccount.summary.day_pl)} valueClass={Number(paperAccount.summary.day_pl) > 0 ? 'text-emerald-300' : Number(paperAccount.summary.day_pl) < 0 ? 'text-red-300' : undefined} />
              <Metric label="Open positions" value={paperAccount.position_count} hint={`day trades: ${paperAccount.summary.day_trades_left ?? '—'}`} />
            </div>

            {paperAccount.positions.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-zinc-800">
                <table className="w-full min-w-[760px] text-left text-[11px]">
                  <thead className="bg-black/40 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      {['Symbol', 'Side', 'Qty', 'Avg cost', 'Market', 'Value', 'Unrealized P/L'].map((h) => (
                        <th key={h} className="px-2 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {paperAccount.positions.map((position, index) => (
                      <tr key={`${position.instrument_id ?? position.symbol ?? 'position'}-${index}`}>
                        <td className="px-2 py-2 font-mono font-semibold text-zinc-100">{position.symbol ?? '—'}</td>
                        <td className="px-2 py-2 font-mono uppercase text-zinc-400">{position.side ?? '—'}</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{position.quantity ?? '—'}</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{position.average_cost === null ? '—' : money(position.average_cost)}</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{position.market_price === null ? '—' : money(position.market_price)}</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{position.market_value === null ? '—' : money(position.market_value)}</td>
                        <td className={cn('px-2 py-2 font-mono tabular-nums', Number(position.unrealized_pl) > 0 ? 'text-emerald-300' : Number(position.unrealized_pl) < 0 ? 'text-red-300' : 'text-zinc-400')}>
                          {position.unrealized_pl === null ? '—' : money(position.unrealized_pl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-md border border-zinc-800 bg-black/20 p-3 text-[11px] text-zinc-500">
                Connected successfully. No open Webull paper positions yet.
              </div>
            )}
          </div>
        ) : (
          <div className="text-[12px] text-zinc-500">
            {paperAccountError ? `Webull paper account unavailable: ${paperAccountError}` : 'Loading Webull paper account…'}
          </div>
        )}
      </Panel>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <Metric label="Closed trades" value={stats.n || null} hint="sample size" />
        <Metric label="Win rate" value={stats.winRate === null ? null : `${stats.winRate.toFixed(1)}%`} valueClass={scoreColor(stats.winRate)} />
        <Metric label="Average winner" value={stats.avgWin === null ? null : `${stats.avgWin.toFixed(1)}%`} valueClass="text-emerald-300" />
        <Metric label="Average loser" value={stats.avgLoss === null ? null : `${stats.avgLoss.toFixed(1)}%`} valueClass="text-red-300" />
        <Metric label="Expectancy" value={stats.expectancy === null ? null : `${stats.expectancy.toFixed(1)}%`} />
        <Metric label="Profit factor" value={stats.profitFactor === null ? null : stats.profitFactor.toFixed(2)} />
        <Metric label="Max drawdown" value={stats.maxDd ? `${stats.maxDd.toFixed(1)}%` : null} valueClass="text-red-300" />
      </div>

      {stats.n < 20 && stats.n > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200">
          SMALL SAMPLE: {stats.n} closed trade{stats.n === 1 ? '' : 's'}. Below roughly 30 observations these statistics
          are noise, not evidence. They are displayed for completeness, not for sizing decisions.
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Equity curve and drawdown" subtitle="Cumulative percentage return per closed trade, with running drawdown." right={<DemoBadge />}>
          <EquityCurve data={stats.curve} />
        </Panel>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <Panel title="By confidence bucket">
            <ul className="space-y-1.5">
              {groupBy((t) => bucketOf(t.confidence_score)).map((g) => (
                <li key={g.label} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-zinc-300">{g.label}</span>
                  <span className="font-mono text-zinc-500">n={g.n}</span>
                  <span className={cn('font-mono tabular-nums', scoreColor(g.winRate))}>{g.winRate.toFixed(0)}% win</span>
                  <span className={cn('font-mono tabular-nums', g.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {g.expectancy.toFixed(1)}%
                  </span>
                </li>
              ))}
              {!closed.length && <Unavailable />}
            </ul>
          </Panel>
          <Panel title="By market regime">
            <ul className="space-y-1.5">
              {groupBy((t) => t.regime ?? 'unspecified').map((g) => (
                <li key={g.label} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-zinc-300">{g.label}</span>
                  <span className="font-mono text-zinc-500">n={g.n}</span>
                  <span className={cn('font-mono tabular-nums', scoreColor(g.winRate))}>{g.winRate.toFixed(0)}% win</span>
                  <span className={cn('font-mono tabular-nums', g.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {g.expectancy.toFixed(1)}%
                  </span>
                </li>
              ))}
              {!closed.length && <Unavailable />}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="By ticker">
          <ul className="space-y-1.5">
            {groupBy((t) => t.symbol).map((g) => (
              <li key={g.label} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-mono font-semibold text-zinc-200">{g.label}</span>
                <span className="font-mono text-zinc-500">n={g.n}</span>
                <span className={cn('font-mono tabular-nums', scoreColor(g.winRate))}>{g.winRate.toFixed(0)}% win</span>
                <span className={cn('font-mono tabular-nums', g.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {g.expectancy.toFixed(1)}%
                </span>
              </li>
            ))}
            {!closed.length && <Unavailable />}
          </ul>
        </Panel>
        <Panel title="By strategy">
          <ul className="space-y-1.5">
            {groupBy((t) => t.strategy ?? 'unspecified').map((g) => (
              <li key={g.label} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-mono text-zinc-200">{g.label}</span>
                <span className="font-mono text-zinc-500">n={g.n}</span>
                <span className={cn('font-mono tabular-nums', scoreColor(g.winRate))}>{g.winRate.toFixed(0)}% win</span>
                <span className={cn('font-mono tabular-nums', g.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {g.expectancy.toFixed(1)}%
                </span>
              </li>
            ))}
            {!closed.length && <Unavailable />}
          </ul>
        </Panel>
      </div>

      <Panel
        title={`Ledger — ${trades.length} records (${open.length} open)`}
        subtitle="Marking a position closed uses a near-the-money proxy off the stored underlying move, because no historical option chain exists in demo mode. The assumption is written into each row."
        right={<DemoBadge />}
        bodyClassName="p-0"
      >
        {trades.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No paper trades yet"
              body="Open a thesis and use “Paper trade this signal”, or record every tradable signal from this run with the button above."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-[11px]">
              <thead className="bg-black/50 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  {['Signal time', 'Symbol', 'Dir', 'Contract', 'Stock @ gen', 'Contract @ gen', 'Conf', 'Opp', 'Regime',
                    'MFE', 'MAE', 'Close', 'Return', 'Result', 'Assumptions', ''].map((h, i) => (
                    <th key={`${h}-${i}`} scope="col" className="whitespace-nowrap px-2 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {trades.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-black/30">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-zinc-500">{stampET(t.signal_timestamp)}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold text-zinc-100">{t.symbol}</td>
                    <td className="px-2 py-1.5">
                      <span className={cn('font-mono text-[10px] uppercase', t.direction === 'bearish' ? 'text-red-300' : t.direction === 'bullish' ? 'text-emerald-300' : 'text-sky-300')}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-zinc-300">
                      {t.strike ? `${num(t.strike)} ${String(t.option_type).toUpperCase()} ${t.expiration}` : <Unavailable />}
                    </td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{num(t.stock_price_at_generation) ?? <Unavailable />}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{num(t.contract_price_at_generation) ?? <Unavailable />}</td>
                    <td className={cn('px-2 py-1.5 font-mono tabular-nums', scoreColor(t.confidence_score))}>{t.confidence_score ?? <Unavailable />}</td>
                    <td className={cn('px-2 py-1.5 font-mono tabular-nums', scoreColor(t.opportunity_score))}>{t.opportunity_score ?? <Unavailable />}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-zinc-400">{t.regime ?? <Unavailable />}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-emerald-300">{t.max_favorable_excursion === null ? <Unavailable /> : `${num(t.max_favorable_excursion)}%`}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-red-300">{t.max_adverse_excursion === null ? <Unavailable /> : `${num(t.max_adverse_excursion)}%`}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{num(t.closing_price) ?? <Unavailable />}</td>
                    <td className={cn('px-2 py-1.5 font-mono font-semibold tabular-nums', Number(t.return_pct) > 0 ? 'text-emerald-400' : Number(t.return_pct) < 0 ? 'text-red-400' : 'text-zinc-400')}>
                      {t.return_pct === null ? <Unavailable /> : `${num(t.return_pct)}%`}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase',
                        t.result === 'win' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : t.result === 'loss' ? 'border-red-500/40 bg-red-500/10 text-red-300'
                            : t.result === 'scratch' ? 'border-zinc-600 text-zinc-400'
                              : 'border-sky-500/40 bg-sky-500/10 text-sky-300',
                      )}>
                        {t.result === 'win' ? <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
                          : t.result === 'loss' ? <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
                            : t.result === 'scratch' ? <Percent className="h-2.5 w-2.5" aria-hidden="true" />
                              : <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />}
                        {t.result}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-2 py-1.5 text-[10px] leading-snug text-zinc-500">
                      <span className="line-clamp-2">{t.entry_assumptions ?? <Unavailable />}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {t.signal_id && (
                        <button
                          type="button"
                          onClick={() => onOpenThesis(t.signal_id as number)}
                          className="mr-2 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                        >
                          thesis
                        </button>
                      )}
                      {t.result === 'open' && (
                        <button
                          type="button"
                          onClick={() => close(t)}
                          disabled={busy}
                          className="font-mono text-[10px] uppercase tracking-wider text-amber-400 transition-colors hover:text-amber-300 disabled:opacity-50"
                        >
                          mark closed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Disclaimer />
    </div>
  );
};

export default PaperTradingView;
