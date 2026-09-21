import React from 'react';
import { AlertCircle, CircleSlash, Clock, Lock, Moon, RefreshCw, ServerCrash, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataState, DataStateKind } from '@/lib/errors';

/**
 * PHASE C3 — failure states are never collapsed into one message.
 * Each state says which condition it is, why, and what can be done about it.
 */

const ICONS: Record<DataStateKind, React.ElementType> = {
  OK: RefreshCw,
  NO_DATA: CircleSlash,
  STALE_DATA: Clock,
  PROVIDER_ERROR: ServerCrash,
  ANALYSIS_FAILED: AlertCircle,
  AUTHORIZATION_ERROR: Lock,
  RATE_LIMITED: Timer,
  MARKET_CLOSED: Moon,
  NO_PRIOR_ANALYSIS: CircleSlash,
};

const TONES = {
  ok: 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300',
  neutral: 'border-zinc-700 bg-black/30 text-zinc-400',
  warn: 'border-amber-500/30 bg-amber-500/[0.07] text-amber-300',
  error: 'border-red-500/30 bg-red-500/[0.07] text-red-300',
} as const;

export const StateNotice: React.FC<{
  state: DataState;
  /** What the user was trying to see, e.g. "Last analysis run". */
  subject?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}> = ({ state, subject, onRetry, retryLabel = 'Retry', className, compact }) => {
  const Icon = ICONS[state.kind];
  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-sm border px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wide',
          TONES[state.tone], className,
        )}
        title={state.explanation}
      >
        <Icon className="h-2.5 w-2.5" aria-hidden="true" />
        {state.label}
      </span>
    );
  }
  return (
    <div className={cn('rounded-md border p-3', TONES[state.tone], className)} role="status">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
            {subject ? `${subject} — ${state.label}` : state.label}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400" style={{ textWrap: 'pretty' }}>
            {state.explanation}
          </p>
          {state.remedy && <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{state.remedy}</p>}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-zinc-700 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300 transition-colors hover:border-sky-500/50 hover:text-sky-300"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              {retryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Inline error line — always a readable sentence, never a serialised object. */
export const ErrorLine: React.FC<{ message: string | null; className?: string }> = ({ message, className }) =>
  message ? (
    <p className={cn('flex items-start gap-1.5 text-[11px] leading-relaxed text-red-300', className)} role="alert">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span style={{ textWrap: 'pretty' }}>{message}</span>
    </p>
  ) : null;

export default StateNotice;
