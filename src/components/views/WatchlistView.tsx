import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Plus, Star, Trash2, TriangleAlert } from 'lucide-react';
import { fetchLatestQuotes, fetchTickers, fetchTodaySignals } from '@/lib/api';
import type { Quote, Signal, Ticker } from '@/lib/types';
import { changeColor, compact, ivPct, num, pct, scoreColor } from '@/lib/format';
import { DEFAULT_UNIVERSE, useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DemoBadge, DirectionTag, Disclaimer, EmptyState, Panel, SectionHeading, Spinner, Unavailable,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

export const WatchlistView: React.FC<{ onOpenThesis: (id: number) => void }> = ({ onOpenThesis }) => {
  const { user, watchlist, addToWatchlist, removeFromWatchlist, prefs, savePrefs } = useAuth();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [q, t, s] = await Promise.all([fetchLatestQuotes(), fetchTickers(), fetchTodaySignals()]);
      setQuotes(q);
      setTickers(Object.fromEntries(t.map((x) => [x.symbol, x])));
      setSignals(s);
      setLoading(false);
    })();
  }, []);

  const add = useCallback(async () => {
    const sym = input.trim().toUpperCase();
    setError(null);
    if (!sym) return;
    if (!user) {
      setError('Sign in to persist a personal watchlist.');
      return;
    }
    try {
      await addToWatchlist(sym);
      setInput('');
      if (!tickers[sym]) {
        setError(`${sym} added. No provider data is stored for it yet, so its row will read DATA UNAVAILABLE until ingestion covers it.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [addToWatchlist, input, tickers, user]);

  const signalBySymbol = useMemo(() => {
    const m: Record<string, Signal> = {};
    for (const s of signals) if (!m[s.symbol]) m[s.symbol] = s;
    return m;
  }, [signals]);

  const alertHits = useMemo(
    () =>
      signals.filter(
        (s) =>
          watchlist.includes(s.symbol) &&
          s.opportunity_score >= prefs.alert_min_score &&
          prefs.alert_directions.includes(s.direction) &&
          s.strategy !== 'No Trade',
      ),
    [signals, watchlist, prefs],
  );

  if (loading) return <Spinner label="Loading your watchlist" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Watchlist"
        title="Your universe"
        description="The 14 prioritised default tickers are seeded on first sign-in. Add or remove any symbol — the list is stored per user and is private to your account at the database level."
        right={<DemoBadge />}
      />

      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="wl-add" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Add a ticker
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="wl-add"
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void add();
                }}
                placeholder="e.g. SMCI"
                className="w-32 rounded-sm border border-zinc-800 bg-black/40 px-2 py-1.5 font-mono text-xs uppercase text-zinc-100 placeholder:text-zinc-600 focus-visible:border-sky-500/60 focus-visible:outline-none"
              />
              <Button size="sm" onClick={add} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </Button>
            </div>
          </div>
          <div className="text-[11px] text-zinc-500">
            {watchlist.length} symbols tracked · default universe: {DEFAULT_UNIVERSE.join(' ')}
          </div>
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2 text-[12px] text-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {!user && (
          <p className="mt-3 text-[12px] text-zinc-500">
            You are viewing the default universe. Sign in to keep your own watchlist, alert thresholds and paper-trading
            ledger.
          </p>
        )}
      </Panel>

      <Panel title="Watchlist board" right={<DemoBadge />} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-[11px]">
            <thead className="bg-black/50 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                {['Symbol', 'Company', 'Last', 'Change', 'Rel vol', 'VWAP', '20MA', 'Support', 'Resistance', 'IV',
                  'Put/call', 'Signal', 'Opp', ''].map((h, i) => (
                  <th key={`${h}-${i}`} scope="col" className="whitespace-nowrap px-2 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {watchlist.map((sym) => {
                const q = quotes[sym];
                const s = signalBySymbol[sym];
                return (
                  <tr key={sym} className="transition-colors hover:bg-black/30">
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[12px] font-semibold text-zinc-100">
                        <Star className="h-3 w-3 text-amber-400" aria-hidden="true" />
                        {sym}
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-2 text-zinc-400">{tickers[sym]?.company ?? <Unavailable />}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-zinc-100">{num(q?.price) ?? <Unavailable />}</td>
                    <td className={cn('px-2 py-2 font-mono tabular-nums', changeColor(q?.change_pct))}>{pct(q?.change_pct) ?? <Unavailable />}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-sky-300">{q?.rel_volume ? `${num(q.rel_volume)}x` : <Unavailable />}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-zinc-400">{num(q?.vwap) ?? <Unavailable />}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-zinc-400">{num(q?.sma20) ?? <Unavailable />}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-red-300">{num(q?.support) ?? <Unavailable />}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-emerald-300">{num(q?.resistance) ?? <Unavailable />}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{ivPct(q?.iv) ?? <Unavailable />}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-zinc-400">{num(q?.put_call_ratio) ?? <Unavailable />}</td>
                    <td className="px-2 py-2">
                      {s ? (
                        s.strategy === 'No Trade' ? (
                          <span className="font-mono text-[10px] uppercase text-amber-300">no trade</span>
                        ) : (
                          <DirectionTag direction={s.direction} />
                        )
                      ) : (
                        <Unavailable />
                      )}
                    </td>
                    <td className={cn('px-2 py-2 font-mono font-semibold tabular-nums', scoreColor(s?.opportunity_score))}>
                      {s ? s.opportunity_score : <Unavailable />}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {s && (
                        <button
                          type="button"
                          onClick={() => onOpenThesis(s.id)}
                          className="mr-2 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                        >
                          thesis
                        </button>
                      )}
                      {user && (
                        <button
                          type="button"
                          onClick={() => removeFromWatchlist(sym)}
                          aria-label={`Remove ${sym} from watchlist`}
                          className="text-zinc-600 transition-colors hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {watchlist.length === 0 && (
          <div className="p-4">
            <EmptyState title="Your watchlist is empty" body="Add a ticker above to start tracking it." />
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Alert preferences" subtitle="Stored per user. The board and command center use these thresholds to surface what matters to you.">
          <div className="space-y-3">
            <div>
              <label htmlFor="al-score" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Minimum opportunity score: <span className="text-zinc-200">{prefs.alert_min_score}</span>
              </label>
              <input
                id="al-score"
                type="range"
                min={40}
                max={95}
                step={5}
                value={prefs.alert_min_score}
                onChange={(e) => savePrefs({ alert_min_score: Number(e.target.value) })}
                disabled={!user}
                className="mt-2 w-full accent-sky-500 disabled:opacity-50"
              />
            </div>
            <fieldset>
              <legend className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Directions to alert on</legend>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {['bullish', 'bearish', 'neutral'].map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-1.5 text-[12px] text-zinc-300">
                    <input
                      type="checkbox"
                      checked={prefs.alert_directions.includes(d)}
                      disabled={!user}
                      onChange={(e) =>
                        savePrefs({
                          alert_directions: e.target.checked
                            ? [...prefs.alert_directions, d]
                            : prefs.alert_directions.filter((x) => x !== d),
                        })
                      }
                      className="h-3.5 w-3.5 accent-sky-500"
                    />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="al-risk" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Maximum risk level
              </label>
              <select
                id="al-risk"
                value={prefs.alert_risk_max}
                disabled={!user}
                onChange={(e) => savePrefs({ alert_risk_max: e.target.value })}
                className="mt-1 rounded-sm border border-zinc-800 bg-black/40 px-2 py-1 text-xs text-zinc-200 focus-visible:border-sky-500/60 focus-visible:outline-none disabled:opacity-50"
              >
                {['Low', 'Moderate', 'High', 'Extreme'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-300">
              <input
                type="checkbox"
                checked={prefs.auto_paper_trade}
                disabled={!user}
                onChange={(e) => savePrefs({ auto_paper_trade: e.target.checked })}
                className="h-3.5 w-3.5 accent-sky-500"
              />
              Auto-record every qualifying signal in my paper-trading ledger
            </label>
            {!user && <p className="text-[11px] text-zinc-500">Sign in to save preferences.</p>}
          </div>
        </Panel>

        <Panel title="Matching your alert thresholds now" right={<DemoBadge />}>
          {alertHits.length === 0 ? (
            <p className="text-[12px] text-zinc-500">
              Nothing in this run clears your thresholds. That is a normal outcome — the engine does not lower its bar
              to produce alerts.
            </p>
          ) : (
            <ul className="space-y-2">
              {alertHits.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Bell className="h-3 w-3 text-sky-400" aria-hidden="true" />
                      <span className="font-mono text-[12px] font-semibold text-zinc-100">{s.symbol}</span>
                      <DirectionTag direction={s.direction} />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-zinc-500">{s.catalyst_summary}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={cn('font-mono text-sm font-semibold tabular-nums', scoreColor(s.opportunity_score))}>
                      {s.opportunity_score}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 border-zinc-700 text-[10px]" onClick={() => onOpenThesis(s.id)}>
                      thesis
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Universe coverage" subtitle="Symbols the ingestion layer currently stores data for." right={<DemoBadge />}>
        <div className="flex flex-wrap gap-1.5">
          {Object.values(tickers).map((t) => (
            <span
              key={t.symbol}
              className={cn(
                'rounded-sm border px-2 py-1 font-mono text-[10px]',
                watchlist.includes(t.symbol)
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                  : 'border-zinc-800 bg-black/30 text-zinc-400',
              )}
              title={`${t.company} · ${t.sector ?? 'sector DATA UNAVAILABLE'} · volume ${compact(quotes[t.symbol]?.volume) ?? 'n/a'}`}
            >
              {t.symbol}
            </span>
          ))}
        </div>
      </Panel>

      <Disclaimer />
    </div>
  );
};

export default WatchlistView;
