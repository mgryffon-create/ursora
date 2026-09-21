import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Database, Plug, ShieldCheck } from 'lucide-react';
import { fetchProviders } from '@/lib/api';
import type { ProviderConfig } from '@/lib/types';
import { stampET } from '@/lib/format';
import { Panel, SectionHeading, Spinner, Unavailable } from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  connected: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  demo: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
};

const FRIENDLY_NAMES: Record<string, string> = {
  MarketDataProvider: 'Market data',
  OptionsDataProvider: 'Options data',
  NewsProvider: 'News & catalysts',
  MacroProvider: 'Macro data',
  SentimentProvider: 'Sentiment data',
  FilingsProvider: 'Filings & company data',
  BrokerProvider: 'Broker / paper trading',
};

const friendlyName = (provider: ProviderConfig) =>
  FRIENDLY_NAMES[provider.interface_name] ?? provider.display_name;

const connectionCopy = (provider: ProviderConfig) => {
  if (provider.mode === 'connected') return 'Connected';
  if (provider.mode === 'error') return 'Needs attention';
  return 'Not connected';
};

export const DataSourcesView: React.FC = () => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProviders(await fetchProviders());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedCount = useMemo(
    () => providers.filter((p) => p.mode === 'connected').length,
    [providers],
  );

  if (loading) return <Spinner label="Loading data connections" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="System"
        title="Data Connections"
        description="See which external data sources URSORA can currently use. This page shows only the connection status relevant to using URSORA."
      />

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-zinc-800 bg-[#14171c] p-4">
          <div className="text-[11px] text-zinc-500">Connected sources</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-100">{connectedCount}</div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-[#14171c] p-4">
          <div className="text-[11px] text-zinc-500">Available source types</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-100">{providers.length}</div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-[#14171c] p-4">
          <div className="text-[11px] text-zinc-500">Current data mode</div>
          <div className="mt-1 text-sm font-medium text-amber-300">Sandbox</div>
        </div>
      </div>

      <Panel
        title="Connections"
        subtitle="URSORA will only use data that is actually available from a connected source."
        bodyClassName="p-0"
      >
        <div className="divide-y divide-zinc-800/70">
          {providers.map((provider) => {
            const connected = provider.mode === 'connected';
            const hasError = provider.mode === 'error';
            return (
              <div
                key={provider.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                      connected
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : hasError
                          ? 'border-red-500/30 bg-red-500/10 text-red-300'
                          : 'border-zinc-700 bg-black/20 text-zinc-500',
                    )}
                  >
                    {connected ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : hasError ? (
                      <CircleAlert className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Plug className="h-4 w-4" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-zinc-100">
                      {friendlyName(provider)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {provider.notes || provider.supplies.join(', ')}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-600">
                      <span>
                        Last sync:{' '}
                        <span className="text-zinc-400">{stampET(provider.last_sync) ?? 'Not yet synced'}</span>
                      </span>
                      {provider.last_error && (
                        <span className="text-red-300">Last error: {provider.last_error}</span>
                      )}
                    </div>
                  </div>
                </div>

                <span
                  className={cn(
                    'self-start rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wider sm:self-center',
                    STATUS_STYLE[provider.mode] ?? STATUS_STYLE.demo,
                  )}
                >
                  {connectionCopy(provider)}
                </span>
              </div>
            );
          })}

          {!providers.length && (
            <div className="p-4">
              <Unavailable />
            </div>
          )}
        </div>
      </Panel>

      <div className="rounded-md border border-zinc-800 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
          <div>
            <div className="text-[12px] font-medium text-zinc-300">Credentials are protected</div>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
              Provider credentials are kept outside the trading interface. This page simply shows whether the information URSORA depends on is currently available.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataSourcesView;
