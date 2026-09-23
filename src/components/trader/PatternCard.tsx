import React, { useState } from 'react';
import { BookOpen, ChevronDown, Microscope, ShieldAlert, Sigma } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoHint } from '@/components/common/Primitives';
import { multiple, signedMoney } from '@/lib/format';
import type { LitConstruct, LitLink, LitStudy, Observation } from '@/lib/behavioral/types';
import { CONFIDENCE_RANK, MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM, type ConfidenceLabel } from '@/lib/behavioral/config';

/**
 * PHASE J — PERSONAL PATTERN CARD.
 * Observation, sample, comparison values, confidence, literature context and an
 * explicit statement of what URSORA can and cannot conclude. The four-panel
 * "why" drawer is required on every card: no finding is asserted without it.
 */

const CONF_TONE: Record<ConfidenceLabel, string> = {
  'INSUFFICIENT DATA': 'border-zinc-700 bg-zinc-800/40 text-zinc-400',
  'EARLY SIGNAL': 'border-zinc-600 bg-zinc-800/60 text-zinc-300',
  'EMERGING PATTERN': 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  'ESTABLISHED PERSONAL PATTERN': 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  'HIGH-CONFIDENCE PERSONAL PATTERN': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
};

export const ConfidenceTag: React.FC<{ label: ConfidenceLabel; sample: number }> = ({ label, sample }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-sm border px-1.5 py-[1px] font-mono text-[9px] font-semibold uppercase tracking-wide',
      CONF_TONE[label],
    )}
    title={`Confidence labels are assigned by sample size alone. This finding rests on ${sample} observations.`}
  >
    {label} · n={sample}
  </span>
);

const fmtValue = (v: number | null, unit: string): string => {
  if (v === null || v === undefined) return 'not recorded';
  if (unit === 'USD') return signedMoney(v)?.replace('+', '') ?? String(v);
  if (unit === 'multiple') return multiple(v) ?? String(v);
  return `${Math.round(v * 100) / 100}${unit === 'score' ? '' : ` ${unit}`}`;
};

const Panel4: React.FC<{ title: string; Icon: React.ElementType; tone: string; children: React.ReactNode }> = ({
  title, Icon, tone, children,
}) => (
  <div className="rounded-sm border border-zinc-800 bg-black/30 p-2.5">
    <div className={cn('flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider', tone)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {title}
    </div>
    <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-zinc-400" style={{ textWrap: 'pretty' }}>
      {children}
    </div>
  </div>
);

export const PatternCard: React.FC<{
  observation: Observation;
  construct?: LitConstruct | null;
  studies?: LitStudy[];
  links?: LitLink[];
}> = ({ observation: o, construct, studies = [], links = [] }) => {
  const [open, setOpen] = useState(false);
  const directional = o.sample_size >= MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM;
  const linked = links.filter((l) => l.construct_key === o.construct_key);

  return (
    <article className="rounded-md border border-zinc-800 bg-[#14171c] transition-colors hover:border-zinc-700">
      <div className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-sky-400/80">
            {o.observation_type.replace(/_/g, ' ')}
          </span>
          <span className="inline-flex items-center gap-1">
            <ConfidenceTag label={o.confidence_label} sample={o.sample_size} />
            <InfoHint text="Pattern confidence is based on how many comparable observations URSORA has recorded. A larger sample supports a more stable personal-pattern label; it does not mean the pattern will continue or cause future results." />
          </span>
          {CONFIDENCE_RANK[o.confidence_label] < 2 && (
            <span className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide text-amber-300">
              not asserted
            </span>
          )}
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-zinc-200" style={{ textWrap: 'pretty' }}>
          {o.statement}
        </p>

        <dl className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <div className="rounded-sm border border-zinc-800/80 bg-black/20 px-2 py-1.5">
            <dt className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Baseline<InfoHint text="Your comparison point: the typical or reference value calculated from the relevant portion of your recorded trading history." /></dt>
            <dd className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-zinc-200">{fmtValue(o.baseline_value, o.unit)}</dd>
          </div>
          <div className="rounded-sm border border-zinc-800/80 bg-black/20 px-2 py-1.5">
            <dt className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Observed<InfoHint text="The value measured in the specific behavior or sequence being examined." /></dt>
            <dd className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-zinc-200">{fmtValue(o.current_value, o.unit)}</dd>
          </div>
          <div className="rounded-sm border border-zinc-800/80 bg-black/20 px-2 py-1.5">
            <dt className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Deviation<InfoHint text="How far the observed value differs from the baseline. Positive and negative describe direction of difference, not whether the behavior is good or bad." /></dt>
            <dd className={cn('mt-0.5 truncate font-mono text-[11px] tabular-nums',
              o.deviation_pct === null ? 'text-zinc-500' : Math.abs(o.deviation_pct) >= 50 ? 'text-amber-300' : 'text-zinc-200')}>
              {o.deviation_pct === null ? 'not applicable' : `${o.deviation_pct > 0 ? '+' : ''}${o.deviation_pct}%`}
            </dd>
          </div>
          <div className="rounded-sm border border-zinc-800/80 bg-black/20 px-2 py-1.5">
            <dt className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Period<InfoHint text="The number or span of comparable observations included in this finding." /></dt>
            <dd className="mt-0.5 truncate font-mono text-[11px] text-zinc-200">{o.observation_period}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
        >
          <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          why URSORA is showing this
        </button>
      </div>

      {open && (
        <div className="grid gap-2 border-t border-zinc-800 p-3 md:grid-cols-2">
          <Panel4 title="Your data" Icon={Sigma} tone="text-sky-300">
            <p>{o.statement}</p>
            <p className="text-zinc-500">
              Calculation — {o.formula}
            </p>
            <p className="font-mono text-[10px] text-zinc-600">
              sample {o.sample_size} · model {o.model_version}
              {o.evidence_trade_ids.length ? ` · ${o.evidence_trade_ids.length} trades used` : ''}
            </p>
          </Panel4>

          <Panel4 title="What the literature says" Icon={BookOpen} tone="text-indigo-300">
            {construct ? (
              <>
                <p><span className="text-zinc-300">{construct.name}</span> — {construct.plain_definition}</p>
                <p className="text-zinc-500">Evidence grade: {construct.evidence_grade}. Layer: {construct.layer}.</p>
                {linked.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {linked.map((l) => {
                      const st = studies.find((s) => s.study_key === l.study_key);
                      if (!st) return null;
                      return (
                        <li key={l.study_key} className="text-[10px] text-zinc-500">
                          <span className={cn('font-mono uppercase',
                            l.relation === 'SUPPORTS' ? 'text-emerald-400/80' : l.relation === 'CHALLENGES' ? 'text-red-400/80' : 'text-amber-400/80')}>
                            {l.relation}
                          </span>{' '}
                          {st.authors} ({st.year}), {st.source}.
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <p>No literature construct is linked to this measurement. It is a user-specific observed pattern only.</p>
            )}
          </Panel4>

          <Panel4 title="What URSORA can conclude" Icon={Microscope} tone="text-emerald-300">
            <p>
              {directional
                ? `That across ${o.sample_size} comparable observations in your own recorded history, the measured values above differ as stated. This is an observed association within your history.`
                : `Only that the measurement was taken. With ${o.sample_size} observations — below the ${MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM} URSORA requires — no direction is asserted.`}
            </p>
            {construct && <p className="text-zinc-500">URSORA operationalisation — {construct.matador_operationalization}</p>}
          </Panel4>

          <Panel4 title="What URSORA cannot conclude" Icon={ShieldAlert} tone="text-amber-300">
            <p>
              That the association is causal, that it will persist, or why it occurred. URSORA observes trade records
              only; it does not observe your reasoning, your intent, or your state of mind, and it does not diagnose them.
            </p>
            <p className="text-zinc-500">
              Population findings in the research literature describe groups, not you. A finding in your own data
              describes your recorded history, not any individual future trade.
            </p>
            {construct?.known_limitations && (
              <p className="text-zinc-500">Known limitations — {construct.known_limitations}</p>
            )}
          </Panel4>
        </div>
      )}
    </article>
  );
};

export default PatternCard;
