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
        title="Ask questions against the platform's own data"
        description="The analyst reads the stored signals, score breakdowns, contract candidates, risk assessments, news items, filings, transcripts, sentiment readings and calendar — and nothing else. It cites what it used and says DATA UNAVAILABLE rather than guessing."
        right={<DemoBadge label="GROUNDED ANSWERS ONLY" />}
      />

      <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
        <AnalystChat
          symbol={focus}
          thread={focus ? `analyst-${focus}` : 'analyst-main'}
          heightClass="h-[520px]"
        />

        <div className="space-y-3">
          <Panel title="Focus a ticker" subtitle="Narrowing the focus loads that name's quote, news, sentiment, transcripts and signal history into the answer context.">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFocus(null)}
                className={cn(
                  'rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors',
                  focus === null ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-zinc-800 bg-black/30 text-zinc-400 hover:text-zinc-200',
                )}
              >
                whole board
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

          <Panel title="Today's ranked context" subtitle="Everything below is already in the analyst's context window.">
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

          <Panel title="How grounding works">
            <ul className="space-y-2 text-[11px] leading-relaxed text-zinc-400">
              <li className="flex gap-2">
                <Database className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />
                Each question sends the current market snapshot, the ranked signal set with full score breakdowns,
                recent signal updates, upcoming catalysts and the live feed. Focusing a ticker adds its quote, news,
                filings, transcripts, sentiment and signal history.
              </li>
              <li className="flex gap-2">
                <QuoteIcon className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />
                The model is instructed to cite the fields it used, to refuse outside knowledge about prices or news,
                and to answer DATA UNAVAILABLE when a field is missing.
              </li>
              <li className="flex gap-2">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                Confidence scores are evidence-quality measures, not probabilities of profit. The analyst is instructed
                to keep that framing and to never present a score as a likelihood of making money.
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
