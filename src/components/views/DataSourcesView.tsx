import React, { useCallback, useEffect, useState } from 'react';
import { Database, KeyRound, Layers, Loader2, Plug, RefreshCw, ServerCog, ShieldCheck } from 'lucide-react';
import { EDGE_FUNCTIONS, callEdge, fetchProviders, fetchRuns, track } from '@/lib/api';
import type { AnalysisRun, ProviderConfig } from '@/lib/types';
import { stampET } from '@/lib/format';
import { FACTOR_DEFINITIONS, PROVIDER_CONTRACTS, WEIGHTING_RULES } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import {
  DemoBadge, Disclaimer, Panel, SectionHeading, Spinner, Unavailable,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

const MODE_STYLE: Record<string, string> = {
  demo: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  connected: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
};

const TABLES = [
  ['tickers, watchlists, user_prefs', 'Universe, per-user watchlists and alert thresholds'],
  ['quotes, ohlcv_bars', 'Intraday quotes and daily price history with provenance'],
  ['option_contracts, option_quotes', 'Chains with bid/ask, volume, open interest, IV and Greeks'],
  ['news_items, filings, transcript_statements', 'Dated catalysts, SEC filings and extracted keynote statements'],
  ['economic_events, earnings_events', 'Macro and earnings calendars with impact levels'],
  ['sentiment_readings', 'Retail and professional cohorts, stored separately'],
  ['signals, signal_updates, signal_feed_events', 'Immutable signal ledger, material-change records, live feed'],
  ['opportunities, contract_candidates, risk_assessments', "The day's ranked set, three candidates per signal, risk cases"],
  ['paper_trades', 'Append-only paper-trading ledger, private per user'],
  ['backtest_runs, backtest_results', 'Saved replays with parameters, metrics and warnings'],
  ['ai_chat_messages', 'Analyst history per user, with the context each answer used'],
  ['market_snapshots, market_movers', 'Regime, index tape, breadth, movers and unusual activity'],
  ['analysis_runs, data_provenance', 'Run audit trail and per-datum source metadata'],
];

export const DataSourcesView: React.FC = () => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([fetchProviders(), fetchRuns(10)]);
      setProviders(p);
      setRuns(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runJob = useCallback(
    async (kind: 'manual' | 'premarket' | 'intraday') => {
      setBusy(kind);
      setError(null);
      try {
        await callEdge(EDGE_FUNCTIONS.analysis, { kind, refreshQuotes: kind !== 'premarket' });
        track('analysis_run', { kind });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  if (loading) return <Spinner label="Loading provider configuration" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Data sources & settings"
        title="Provider abstraction layer"
        description="Seven provider interfaces keep ingestion separate from signal generation, so market-data vendors can be connected or swapped without changing the scoring engine."
        right={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700" onClick={() => runJob('manual')} disabled={busy !== null}>
              {busy === 'manual' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              Run analysis now
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700" onClick={() => runJob('intraday')} disabled={busy !== null}>
              {busy === 'intraday' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ServerCog className="h-3.5 w-3.5" aria-hidden="true" />}
              Force intraday refresh
            </Button>
          </div>
        }
      />

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200">{error}</div>}

      <div className="grid gap-3 lg:grid-cols-2">
        {providers.map((p) => (
          <Panel
            key={p.id}
            title={p.display_name}
            subtitle={p.interface_name}
            right={
              <span className={cn('rounded-sm border px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wide', MODE_STYLE[p.mode])}>
                {p.mode}
              </span>
            }
          >
            <div className="space-y-2.5">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Active adapter</div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[12px] text-zinc-200">
                  <Plug className="h-3 w-3 text-sky-400" aria-hidden="true" />
                  {p.adapter}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Supplies</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.supplies.map((s) => (
                    <span key={s} className="rounded-sm border border-zinc-800 bg-black/30 px-1.5 py-[1px] text-[10px] text-zinc-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Last sync</div>
                  <div className="mt-0.5 font-mono text-[11px] text-zinc-300">{stampET(p.last_sync) ?? <Unavailable />}</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Last error</div>
                  <div className="mt-0.5 font-mono text-[11px] text-zinc-300">{p.last_error ?? 'none'}</div>
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Stubbed real adapters</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.candidate_providers.map((c) => (
                    <span key={c} className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[10px] text-zinc-400">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              {p.secret_env_name && (
                <div className="flex items-start gap-2 rounded-sm border border-zinc-800 bg-black/30 p-2">
                  <KeyRound className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                  <p className="text-[11px] leading-relaxed text-zinc-400">
                    Connecting this interface reads its credential from the server environment variable{' '}
                    <span className="font-mono text-zinc-200">{p.secret_env_name}</span>. Credentials live only in the
                    backend ingestion job — never in the browser, and never in a stored row.
                  </p>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-zinc-500">{p.notes}</p>
              {p.docs_url && (
                <a
                  href={p.docs_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-block font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                >
                  vendor documentation
                </a>
              )}
            </div>
          </Panel>
        ))}
      </div>

      <Panel
        title="Interface contracts"
        subtitle="What the ingestion layer calls, and which tables each interface writes. A real adapter must satisfy the same contract — nothing downstream changes."
        right={<DemoBadge />}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[11px]">
            <thead className="bg-black/40 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2">Interface</th>
                <th scope="col" className="px-3 py-2">Methods</th>
                <th scope="col" className="px-3 py-2">Writes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {PROVIDER_CONTRACTS.map((c) => (
                <tr key={c.interface_name} className="transition-colors hover:bg-black/30">
                  <td className="px-3 py-2 align-top font-mono text-sky-300">{c.interface_name}</td>
                  <td className="px-3 py-2 align-top font-mono text-[10px] leading-relaxed text-zinc-400">{c.methods.join('  ·  ')}</td>
                  <td className="px-3 py-2 align-top font-mono text-[10px] text-zinc-500">{c.writes.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Scheduled jobs" subtitle="Background work runs on the server, never in a browser tab.">
          <ul className="space-y-2 text-[12px] leading-relaxed text-zinc-400">
            <li>
              <span className="font-mono text-zinc-200">premarket-analysis</span> — weekdays at 06:30 ET. Refreshes
              quotes through the market-data interface, rebuilds the chain, re-scores every name and writes the day's
              ranked opportunity set.
            </li>
            <li>
              <span className="font-mono text-zinc-200">intraday-refresh</span> — every 5 minutes from 09:00 to 16:55
              ET on weekdays. Updates quotes, appends feed events, re-scores signals and emits a SIGNAL UPDATE record
              whenever direction flips or the opportunity score moves eight points or more.
            </li>
          </ul>
        </Panel>

        <Panel title="Recent analysis runs" subtitle="Audit trail for every execution of the pipeline." bodyClassName="p-0">
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-black/50 font-mono text-[10px] uppercase tracking-wider text-zinc-500 backdrop-blur">
                <tr>
                  {['Run', 'Kind', 'Finished', 'Signals', 'Updates', 'Feed'].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-2 py-1.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {runs.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-black/30">
                    <td className="max-w-[200px] truncate px-2 py-1.5 font-mono text-[10px] text-zinc-400">{r.run_id}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] uppercase text-zinc-300">{r.kind}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] text-zinc-500">{stampET(r.finished_at ?? r.started_at) ?? <Unavailable />}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-300">{r.signals_generated}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-sky-300">{r.updates_emitted}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-400">{r.feed_events}</td>
                  </tr>
                ))}
                {!runs.length && (
                  <tr><td className="px-2 py-2" colSpan={6}><Unavailable /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel
        title="Provenance contract"
        subtitle="What every ingested datum must carry before the engine is allowed to score it."
        className="border-emerald-500/30"
        right={
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            enforced
          </span>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['source_name', 'The vendor or feed the datum came from, shown on every card.'],
            ['source_type', 'Trust classification: Verified News, Company Source, SEC Filing, Analyst Report, Market Data, Social Sentiment or Unverified Discussion.'],
            ['published_at', 'When the upstream published it. Drives recency weighting and the backtest look-ahead guard.'],
            ['retrieved_at', 'When URSORA ingested it, so staleness is visible.'],
            ['confidence', 'Quality metadata from 0 to 1. Demo rows are capped low deliberately.'],
            ['is_demo', 'Whether the row is modelled. Any true value forces a SIMULATED DATA badge in the UI.'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
              <div className="font-mono text-[11px] text-sky-300">{k}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{v}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Signal-engine factors" subtitle="Baseline weights before the regime adjusts them.">
          <ul className="space-y-1.5">
            {FACTOR_DEFINITIONS.map((f) => (
              <li key={f.key} className="flex items-baseline justify-between gap-3 border-b border-zinc-800/60 pb-1.5 text-[11px] last:border-0">
                <span className="text-zinc-300">{f.label}</span>
                <span className="font-mono tabular-nums text-zinc-500">{Math.round(f.base_weight * 100)}%</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Dynamic weighting rules">
          <ul className="space-y-2 text-[11px] leading-relaxed">
            {WEIGHTING_RULES.map((r) => (
              <li key={r.trigger}>
                <span className="text-zinc-300">{r.trigger}</span>
                <span className="text-zinc-500"> — {r.effect}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Storage schema" subtitle="Where each class of data lives." right={<Database className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[11px]">
            <thead className="bg-black/40 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2">Tables</th>
                <th scope="col" className="px-3 py-2">Contents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {TABLES.map(([t, d]) => (
                <tr key={t} className="transition-colors hover:bg-black/30">
                  <td className="px-3 py-2 align-top font-mono text-[10px] text-sky-300">{t}</td>
                  <td className="px-3 py-2 align-top text-zinc-400">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2 border-t border-zinc-800 p-3">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Row-level security is enabled on every table. Reference data and the signal ledger are world-readable but
            writable only by the backend jobs; watchlists, alert preferences, paper trades, backtest runs and analyst
            chat history are readable and writable only by their owning account.
          </p>
        </div>
      </Panel>

      <Disclaimer />
    </div>
  );
};

export default DataSourcesView;
