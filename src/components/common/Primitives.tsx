import React from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Building2, Database,
  FileText, Gauge, Info, Loader2, MessagesSquare, Newspaper, ShieldQuestion,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DATA_UNAVAILABLE, isMissing, riskColor, scoreColor } from '@/lib/format';

/* -------------------------------------------------------------------------- */
/*  Provenance and honesty primitives                                         */
/* -------------------------------------------------------------------------- */

export const DemoBadge: React.FC<{ className?: string; label?: string }> = ({ className, label = 'SIMULATED DATA' }) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center gap-1 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-[1px]',
      'font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300',
      className,
    )}
    title="Simulated development data. This is not live market data."

  >
    <Database className="h-2.5 w-2.5" aria-hidden="true" />
    {label}
  </span>
);

export type DataBadgeKind = 'observed' | 'delayed' | 'derived' | 'inferred' | 'simulated';

export const DataBadge: React.FC<{
  kind: DataBadgeKind;
  className?: string;
  label?: string;
}> = ({ kind, className, label }) => {
  const config = {
    observed: {
      cls: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
      label: 'MARKET DATA',
      title: 'Observed provider data stored by URSORA.',
    },
    delayed: {
      cls: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
      label: 'DELAYED MARKET DATA',
      title: 'Observed provider data delivered on a delayed feed.',
    },
    derived: {
      cls: 'border-violet-500/35 bg-violet-500/10 text-violet-300',
      label: 'DERIVED ANALYSIS',
      title: 'Calculated by URSORA from stored source data; not itself a market observation.',
    },
    inferred: {
      cls: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
      label: 'INFERRED DATA',
      title: 'An inferred or imputed value rather than a direct observation.',
    },
    simulated: {
      cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
      label: 'SIMULATED DATA',
      title: 'Simulated development data. This is not observed market data.',
    },
  } as const;
  const selected = config[kind];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-[1px]',
        'font-mono text-[10px] font-semibold uppercase tracking-wider',
        selected.cls,
        className,
      )}
      title={selected.title}
    >
      <Database className="h-2.5 w-2.5" aria-hidden="true" />
      {label ?? selected.label}
    </span>
  );
};

export const Unavailable: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={cn('font-mono text-[11px] uppercase tracking-wide text-zinc-500', className)}
    title="URSORA does not currently have data for this field."
  >
    {DATA_UNAVAILABLE}
  </span>
);


/** Renders a value, or DATA UNAVAILABLE when the value is missing. */
export const Val: React.FC<{ value: string | number | null | undefined; className?: string }> = ({ value, className }) =>
  isMissing(value) ? <Unavailable /> : <span className={cn('font-mono tabular-nums', className)}>{value}</span>;

const SOURCE_STYLES: Record<string, { cls: string; Icon: React.ElementType }> = {
  'Verified News': { cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', Icon: BadgeCheck },
  'Company Source': { cls: 'border-sky-500/30 bg-sky-500/10 text-sky-300', Icon: Building2 },
  'SEC Filing': { cls: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300', Icon: FileText },
  'Analyst Report': { cls: 'border-violet-500/30 bg-violet-500/10 text-violet-300', Icon: Newspaper },
  'Market Data': { cls: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300', Icon: Gauge },
  'Social Sentiment': { cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300', Icon: MessagesSquare },
  'Unverified Discussion': { cls: 'border-red-500/30 bg-red-500/10 text-red-300', Icon: ShieldQuestion },
};

export const SourceBadge: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
  const style = SOURCE_STYLES[type] ?? SOURCE_STYLES['Market Data'];
  const { Icon } = style;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wide',
        style.cls,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {type}
    </span>
  );
};

export const Provenance: React.FC<{
  sourceName: string;
  sourceType: string;
  publishedAt?: string | null;
  retrievedAt?: string | null;
  url?: string | null;
  confidence?: number | null;
}> = ({ sourceName, sourceType, publishedAt, retrievedAt, url, confidence }) => (
  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-800/80 pt-2 font-mono text-[10px] text-zinc-500">
    <SourceBadge type={sourceType} />
    <span className="text-zinc-400">{sourceName}</span>
    <span>
      published {publishedAt ? new Date(publishedAt).toISOString().slice(0, 16).replace('T', ' ') : DATA_UNAVAILABLE} UTC
    </span>
    <span>
      retrieved {retrievedAt ? new Date(retrievedAt).toISOString().slice(0, 16).replace('T', ' ') : DATA_UNAVAILABLE} UTC
    </span>
    <span>
      quality {isMissing(confidence) ? DATA_UNAVAILABLE : `${Math.round(Number(confidence) * 100)}/100`}
    </span>
    {url ? (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-sky-400 underline-offset-2 transition-colors hover:text-sky-300 hover:underline"
      >
        open source
        <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
      </a>
    ) : (
      <span className="text-zinc-600">no link stored</span>
    )}
  </div>
);

export const InfoHint: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label="Explain this information"
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-500/50',
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </TooltipTrigger>
    <TooltipContent
      side="top"
      className="max-w-xs border-zinc-700 bg-[#111419] text-[12px] leading-relaxed text-zinc-200"
    >
      {text}
    </TooltipContent>
  </Tooltip>
);

/* -------------------------------------------------------------------------- */
/*  Layout primitives                                                         */
/* -------------------------------------------------------------------------- */

export const Panel: React.FC<{
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  help?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, subtitle, right, help, children, className, bodyClassName }) => (
  <section className={cn('rounded-md border border-zinc-800 bg-[#14171c]', className)}>
    {(title || right) && (
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div>
          {title && (
            <div className="flex items-center gap-1.5">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{title}</h3>
              {help && <InfoHint text={help} />}
            </div>
          )}
          {subtitle && <p className="mt-0.5 max-w-3xl text-[11px] leading-snug text-zinc-500">{subtitle}</p>}
        </div>
        {right}
      </header>
    )}
    <div className={cn('p-3', bodyClassName)}>{children}</div>
  </section>
);

export const Metric: React.FC<{
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  valueClass?: string;
  mono?: boolean;
}> = ({ label, value, hint, valueClass, mono = true }) => (
  <div className="min-w-0 rounded-sm border border-zinc-800/80 bg-black/20 px-2.5 py-2">
    <div className="truncate font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
    <div className={cn('mt-1 truncate text-sm text-zinc-100', mono && 'font-mono tabular-nums', valueClass)}>
      {isMissing(value) ? <Unavailable /> : value}
    </div>
    {hint && <div className="mt-0.5 truncate text-[10px] text-zinc-500">{hint}</div>}
  </div>
);

export const DirectionTag: React.FC<{ direction: string; className?: string }> = ({ direction, className }) => {
  const bull = direction === 'bullish';
  const bear = direction === 'bearish';
  const Icon = bull ? ArrowUpRight : bear ? ArrowDownRight : ArrowRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-wide',
        bull
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : bear
            ? 'border-red-500/40 bg-red-500/10 text-red-300'
            : 'border-sky-500/40 bg-sky-500/10 text-sky-300',
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {direction}
    </span>
  );
};

export const RiskTag: React.FC<{ level: string; className?: string }> = ({ level, className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-sm border px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-wide',
      riskColor(level),
      className,
    )}
  >
    {level} risk
  </span>
);

export const FlagTag: React.FC<{ flag: string }> = ({ flag }) => (
  <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-300">
    <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
    {flag}
  </span>
);

export const ScoreBar: React.FC<{ score: number | null | undefined; label?: string; className?: string }> = ({
  score, label, className,
}) => {
  const v = isMissing(score) ? 0 : Math.max(0, Math.min(100, Number(score)));
  const tone = v >= 75 ? 'bg-emerald-500' : v >= 60 ? 'bg-sky-500' : v >= 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-baseline justify-between gap-2">
        {label && <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>}
        <span className={cn('font-mono text-xs font-semibold tabular-nums', scoreColor(score))}>
          {isMissing(score) ? DATA_UNAVAILABLE : v}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className={cn('h-full rounded-full transition-all duration-700', tone)} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
};

export const Spinner: React.FC<{ label?: string; className?: string }> = ({ label = 'Loading', className }) => (
  <div className={cn('flex items-center gap-2 py-8 text-sm text-zinc-500', className)}>
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
  </div>
);

export const EmptyState: React.FC<{ title: string; body: string; action?: React.ReactNode }> = ({ title, body, action }) => (
  <div className="rounded-md border border-dashed border-zinc-800 bg-black/20 px-4 py-3 text-center">
    <h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300">{title}</h4>
    <p className="mx-auto mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-500">{body}</p>
    {action && <div className="mt-2.5 flex justify-center">{action}</div>}
  </div>
);

export const Disclaimer: React.FC<{ className?: string }> = ({ className }) => (
  <p className={cn('text-[11px] leading-relaxed text-zinc-500', className)}>
    Opportunity and confidence scores summarize the evidence currently available to URSORA. They are <strong className="text-zinc-400">not probabilities of profit</strong>. URSORA is a research tool, not investment advice or an offer to trade. Options can lose the full premium paid.
  </p>
);

export const SectionHeading: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
}> = ({ eyebrow, title, description, right }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      {eyebrow && (
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400/80">{eyebrow}</div>
      )}
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">{title}</h2>
      {description && <p className="mt-1 max-w-3xl text-sm text-zinc-500">{description}</p>}
    </div>
    {right}
  </div>
);
