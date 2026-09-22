import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Lock, Search } from 'lucide-react';
import { fetchSignalHistory, fetchSignalUpdates, fetchTickers } from '@/lib/api';
import type { Signal, SignalUpdate, Ticker } from '@/lib/types';
import { num, scoreColor, stampET } from '@/lib/format';
import {
  DemoBadge, DirectionTag, Disclaimer, EmptyState, Panel, RiskTag, SectionHeading, Spinner, Unavailable,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

export const SignalHistoryView: React.FC<{ onOpenThesis: (id: number) => void }> = ({ onOpenThesis }) => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [updates, setUpdates] = useState<SignalUpdate[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [symbol, setSymbol] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [sig, up, tk] = await Promise.all([
      fetchSignalHistory(undefined, 250), fetchSignalUpdates(undefined, 60), fetchTickers(),
    ]);
    setSignals(sig);
    setUpdates(up);
    setTickers(tk);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      signals.filter((s) => {
        if (symbol !== 'all' && s.symbol !== symbol) return false;
        if (query && !s.symbol.includes(query.toUpperCase())) return false;
        return true;
      }),
    [signals, symbol, query],
  );

  const runs = useMemo(() => {
    const m: Record<string, Signal[]> = {};
    for (const s of filtered) m[s.run_id] = [...(m[s.run_id] ?? []), s];
    return Object.entries(m).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  if (loading) return <Spinner label="Loading TradeCycle history" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="TradeCycle history"
        title="Historical evidence by ticker"
        description="This area is being migrated from analysis-run logs into ticker-centered TradeCycle episodes. Existing records remain preserved while the interface is reorganized around the user’s activity with each symbol."
        right={
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
            <Lock className="h-3 w-3" aria-hidden="true" />
            historical records preserved
          </span>
        }
      />

      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="sh-sym" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Ticker
            </label>
            <select
              id="sh-sym"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="mt-1 rounded-sm border border-zinc-800 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-200 focus-visible:border-sky-500/60 focus-visible:outline-none"
            >
              <option value="all">all</option>
              {tickers.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sh-q" className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Search
            </label>
            <div className="mt-1 flex items-center gap-1.5 rounded-sm border border-zinc-800 bg-black/40 px-2 focus-within:border-sky-500/60">
              <Search className="h-3 w-3 text-zinc-500" aria-hidden="true" />
              <input
                id="sh-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="NVDA"
                className="w-24 bg-transparent py-1 font-mono text-xs uppercase text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
          </div>
          <div className="ml-auto font-mono text-[10px] text-zinc-500">
            {filtered.length} records across {runs.length} runs
          </div>
        </div>
      </Panel>

      <Panel title="Material changes" subtitle="When an analysis changes meaningfully, URSORA records the change rather than replacing the earlier result." right={<DemoBadge />}>
        {updates.length === 0 ? (
          <p className="text-[12px] text-zinc-500">
            No material change has been recorded yet. URSORA records a change when the direction changes or when the opportunity score moves substantially between analyses.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {updates
              .filter((u) => symbol === 'all' || u.symbol === symbol)
              .map((u) => (
                <li key={u.id} className="rounded-sm border border-sky-500/30 bg-sky-500/[0.05] p-2.5">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                    <ArrowLeftRight className="h-3 w-3 text-sky-400" aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-zinc-100">{u.symbol}</span>
                    <span className="text-zinc-400">{u.prev_direction} {u.prev_score}</span>
                    <span className="text-zinc-600">to</span>
                    <span className={scoreColor(u.new_score)}>{u.new_direction} {u.new_score}</span>
                    <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] text-[9px] uppercase text-zinc-400">
                      {u.materiality === 'high' ? 'major change' : u.materiality === 'medium' ? 'notable change' : 'change'}
                    </span>
                    <span className="ml-auto text-zinc-500">{stampET(u.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{u.reason}</p>
                  {u.signal_id && (
                    <button
                      type="button"
                      onClick={() => onOpenThesis(u.signal_id as number)}
                      className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                    >
                      open analysis
                    </button>
                  )}
                </li>
              ))}
          </ul>
        )}
      </Panel>

      {runs.length === 0 ? (
        <EmptyState title="No analyses stored" body="Run an analysis from Today's Opportunities to begin building history." />
      ) : (
        runs.map(([runId, set]) => (
          <Panel
            key={runId}
            title={`Run ${runId}`}
            subtitle={`${set.length} records · ${stampET(set[0].generated_at)} · ${set[0].engine_version} · market environment ${set[0].regime ?? 'DATA UNAVAILABLE'}`}
            right={<DemoBadge />}
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[11px]">
                <thead className="bg-black/40 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    {['Time', 'Symbol', 'Direction', 'Strategy', 'Opportunity', 'Confidence', 'Risk', 'Strike', 'Expiration', 'Trade no longer valid below/above', 'Note', ''].map((h, i) => (
                      <th key={`${h}-${i}`} scope="col" className="whitespace-nowrap px-2 py-1.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {[...set].sort((a, b) => b.opportunity_score - a.opportunity_score).map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-black/30">
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-zinc-500">{stampET(s.generated_at)}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-zinc-100">{s.symbol}</td>
                      <td className="px-2 py-1.5"><DirectionTag direction={s.direction} /></td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-zinc-300">{s.strategy}</td>
                      <td className={cn('px-2 py-1.5 font-mono font-semibold tabular-nums', scoreColor(s.opportunity_score))}>{s.opportunity_score}</td>
                      <td className={cn('px-2 py-1.5 font-mono tabular-nums', scoreColor(s.confidence_score))}>{s.confidence_score}</td>
                      <td className="px-2 py-1.5"><RiskTag level={s.risk_level} /></td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{num(s.suggested_strike) ?? <Unavailable />}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-zinc-400">{s.suggested_expiration ?? <Unavailable />}</td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-amber-300">{num(s.invalidation_level) ?? <Unavailable />}</td>
                      <td className="max-w-[340px] px-2 py-1.5 text-[10px] leading-snug text-zinc-500">
                        <span className="line-clamp-2">{s.no_trade_reason ?? s.catalyst_summary ?? '—'}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenThesis(s.id)}
                          className="font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                        >
                          thesis
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}

      <Disclaimer />
    </div>
  );
};

export default SignalHistoryView;
