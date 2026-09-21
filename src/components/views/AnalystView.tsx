import React, { useEffect, useState } from 'react';
import { Bot, Database, Quote as QuoteIcon, ShieldAlert } from 'lucide-react';
import { fetchTodaySignals } from '@/lib/api';
import type { Signal } from '@/lib/types';
import { scoreColor } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import AnalystChat from '@/components/AnalystChat';
import {
  DemoBadge, DirectionTag, Disclaimer, Panel, SectionHeading, Spinner,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

export const AnalystView: React.FC<{ onOpenThesis: (id: number) => void }> = ({ onOpenThesis }) => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    void fetchTodaySignals()
      .then(setSignals)
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading the analyst workspace" />;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="AI analyst"
        title="Ask questions using URSORA's available data"
        description="The analyst answers from data already available in URSORA, including signals, scoring details, contracts, risk information, news, filings, transcripts, sentiment, and scheduled events. When information is missing, it states that clearly rather than inferring unsupported details."
        right={<DemoBadge label="URSORA DATA ONLY" />}
      />

      <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
        <AnalystChat
          symbol={focus}
          thread={focus ? `analyst-${focus}` : 'analyst-main'}
          heightClass="h-[520px]"
        />

        <div className="space-y-3">
          <Panel title="Focus on a symbol" subtitle="Selecting a symbol limits the analyst to information associated with that company or instrument.">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFocus(null)}
                className={cn(
                  'rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors',
                  focus === null ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-zinc-800 bg-black/30 text-zinc-400 hover:text-zinc-200',
                )}
              >
                all symbols
              </button>
              {signals.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFocus(s.symbol)}
                  className={cn(
                    'rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors',
                    focus === s.symbol ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-zinc-800 bg-black/30 text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  {s.symbol}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Today's opportunities" subtitle="These opportunities are available to the analyst for reference.">
            <ul className="space-y-1.5">
              {signals.slice(0, 8).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpenThesis(s.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-black/20 px-2.5 py-1.5 text-left transition-colors hover:border-sky-500/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-zinc-100">{s.symbol}</span>
                      <DirectionTag direction={s.direction} />
                      <span className="truncate text-[10px] text-zinc-500">{s.strategy}</span>
                    </span>
                    <span className={cn('font-mono text-xs font-semibold tabular-nums', scoreColor(s.opportunity_score))}>
                      {s.opportunity_score}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="How the analyst uses data">
            <ul className="space-y-2 text-[11px] leading-relaxed text-zinc-400">
              <li className="flex gap-2">
                <Database className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />
                The analyst receives the current market summary, today's opportunities, recent signal changes, scheduled market events, and recent activity. Selecting a symbol adds its price, news, filings, transcripts, sentiment, and prior signals.
              </li>
              <li className="flex gap-2">
                <QuoteIcon className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />
                The analyst identifies the information used in its answer and does not substitute outside market facts when URSORA does not have the requested data.
              </li>
              <li className="flex gap-2">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                Confidence scores describe the quality and completeness of the available evidence. They do not represent the probability of a profitable trade.
              </li>
              <li className="flex gap-2">
                <Bot className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />
                {user
                  ? 'Your chat history is stored against your account and is readable only by you.'
                  : 'Sign in to ask questions and keep a persistent history.'}
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
};

export default AnalystView;
