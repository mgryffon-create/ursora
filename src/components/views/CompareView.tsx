import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowLeftRight, Ban, Layers, Minus, ShieldAlert, Sparkles, TrendingUp, Zap,
} from 'lucide-react';
import { fetchCandidates, fetchQuote, fetchRisk, fetchSignal, fetchTickers, track } from '@/lib/api';
import type { ContractCandidate } from '@/lib/types';
import { changeColor, dte, money, num, pct, scoreColor, stampET } from '@/lib/format';
import {
  buildDiffNotes, contractRows, factorRows, gridTemplate, headlineRows, PROFILES, riskRows,
  type CompareColumn, type CompareRow, type Profile,
} from '@/lib/compare';
import { Button } from '@/components/ui/button';
import {
  DataBadge, DemoBadge, DirectionTag, Disclaimer, EmptyState, FlagTag, Panel, RiskTag, ScoreBar, SectionHeading,
  Spinner, Unavailable,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Aligned row primitives                                                    */
/* -------------------------------------------------------------------------- */

const RowLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <div className="px-2.5 py-2">
    <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">{children}</div>
    {hint && <div className="mt-0.5 text-[10px] leading-snug text-zinc-600">{hint}</div>}
  </div>
);

const DiffRow: React.FC<{ row: CompareRow; n: number }> = ({ row, n }) => (
  <div
    className={cn(
      'grid border-t border-zinc-800/70 transition-colors',
      row.same ? 'bg-transparent opacity-60 hover:opacity-100' : 'bg-sky-500/[0.03] hover:bg-sky-500/[0.07]',
    )}
    style={gridTemplate(n)}
    role="row"
  >
    <div className="flex items-start justify-between gap-1 border-r border-zinc-800/70">
      <RowLabel hint={row.hint}>{row.label}</RowLabel>
      <div className="shrink-0 px-1.5 pt-2">
        {row.same ? (
          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-zinc-600">
            <Minus className="h-2.5 w-2.5" aria-hidden="true" />
            same
          </span>
        ) : row.spread !== null && row.spread > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-sm border border-sky-500/30 bg-sky-500/10 px-1 py-[1px] font-mono text-[9px] uppercase tracking-wide text-sky-300">
            <ArrowLeftRight className="h-2.5 w-2.5" aria-hidden="true" />
            different
          </span>
        ) : null}
      </div>
    </div>
    {row.cells.map((cell, i) => (
      <div
        key={i}
        role="cell"
        className={cn(
          'border-r border-zinc-800/40 px-2.5 py-2 font-mono text-[12px] tabular-nums last:border-r-0',
          cell === null
            ? 'text-zinc-500'
            : row.strongestIndex === i
              ? 'font-semibold text-emerald-300'
              : row.worstIndex === i
                ? 'text-amber-300'
                : 'text-zinc-200',
        )}
      >
        {cell === null ? <Unavailable /> : cell}
        {row.strongestIndex === i && row.spread !== null && row.spread > 0 && (
          <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wide text-emerald-400/70">strongest</span>
        )}
      </div>
    ))}
  </div>
);

const TextBlockRow: React.FC<{
  label: string;
  n: number;
  cells: React.ReactNode[];
  tone?: 'default' | 'emerald' | 'sky' | 'red';
  same?: boolean;
}> = ({ label, n, cells, tone = 'default', same = false }) => (
  <div
    className={cn('grid border-t border-zinc-800/70', same && 'opacity-70')}
    style={gridTemplate(n)}
    role="row"
  >
    <div className="border-r border-zinc-800/70">
      <RowLabel>{label}</RowLabel>
    </div>
    {cells.map((c, i) => (
      <div
        key={i}
        role="cell"
        className={cn(
          'border-r border-zinc-800/40 px-2.5 py-2 text-[11.5px] leading-relaxed last:border-r-0',
          tone === 'emerald' ? 'text-emerald-100/90' : tone === 'red' ? 'text-red-100/90' : tone === 'sky' ? 'text-sky-100/90' : 'text-zinc-300',
        )}
      >
        {c}
      </div>
    ))}
  </div>
);

const SectionBar: React.FC<{ title: string; note: string; Icon: React.ElementType; right?: React.ReactNode }> = ({
  title, note, Icon, right,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-black/40 px-3 py-2">
    <div className="min-w-0">
      <h3 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
        <Icon className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
        {title}
      </h3>
      <p className="mt-0.5 max-w-3xl text-[11px] leading-snug text-zinc-500">{note}</p>
    </div>
    {right}
  </div>
);

/* -------------------------------------------------------------------------- */
/*  View                                                                      */
/* -------------------------------------------------------------------------- */

export const CompareView: React.FC<{
  signalIds: number[];
  onBack: () => void;
  onOpenThesis: (id: number) => void;
  onRemove?: (id: number) => void;
}> = ({ signalIds, onBack, onOpenThesis, onRemove }) => {
  const [columns, setColumns] = useState<CompareColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>('Balanced');
  const [diffOnly, setDiffOnly] = useState(false);

  const key = signalIds.join(',');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const tickers = await fetchTickers();
        const built = await Promise.all(
          signalIds.map(async (id) => {
            const signal = await fetchSignal(id);
            if (!signal) return null;
            const [quote, candidates, risk] = await Promise.all([
              fetchQuote(signal.symbol), fetchCandidates(signal.id), fetchRisk(signal.id),
            ]);
            return {
              signal,
              quote,
              ticker: tickers.find((t) => t.symbol === signal.symbol) ?? null,
              candidates,
              risk,
            } as CompareColumn;
          }),
        );
        if (!active) return;
        const cols = built.filter((c): c is CompareColumn => c !== null);
        setColumns(cols);
        setLoading(false);
        track('signals_compared', { count: cols.length, symbols: cols.map((c) => c.signal.symbol).join('+') });
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const n = columns.length;

  const picked = useMemo<(ContractCandidate | null)[]>(
    () => columns.map((c) => c.candidates.find((x) => x.profile === profile) ?? null),
    [columns, profile],
  );

  const notes = useMemo(() => (n >= 2 ? buildDiffNotes(columns, picked) : []), [columns, n, picked]);
  const heads = useMemo(() => (n >= 2 ? headlineRows(columns) : []), [columns, n]);
  const chain = useMemo(() => (n >= 2 ? contractRows(columns, picked) : []), [columns, n, picked]);
  const risks = useMemo(() => (n >= 2 ? riskRows(columns) : []), [columns, n]);
  const factors = useMemo(() => (n >= 2 ? factorRows(columns) : []), [columns, n]);

  const comparisonHasSimulated = columns.some((column) => column.signal.is_demo);
  const comparisonHasInferred = columns.some((column) =>
    (column.signal.score_breakdown?.factors ?? []).some((factor) => factor.provenance === 'imputed')
  );
  const analysisBadge = comparisonHasSimulated
    ? <DemoBadge />
    : comparisonHasInferred
      ? <DataBadge kind="inferred" label="INCLUDES INFERRED DATA" />
      : <DataBadge kind="derived" label="DERIVED ANALYSIS" />;

  const show = (rows: CompareRow[]) => (diffOnly ? rows.filter((r) => !r.same) : rows);
  const differingFactors = useMemo(() => factors.filter((f) => (f.spread ?? 0) > 3 || f.partial).length, [factors]);

  if (loading) return <Spinner label="Preparing the comparison" />;

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200">{error}</div>
        <Button variant="outline" className="border-zinc-700" onClick={onBack}>Back to opportunities</Button>
      </div>
    );
  }

  if (n < 2) {
    return (
      <EmptyState
        title="Pick two or three signals"
        body="Select at least two opportunities to compare their evidence, risk, and contract information side by side."
        action={<Button onClick={onBack}>Back to opportunities</Button>}
      />
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHeading
        eyebrow="Opportunity comparison"
        title={columns.map((c) => c.signal.symbol).join('  vs  ')}
        description="The same information is shown for each opportunity so differences in evidence, risk, and contract characteristics are easier to review."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-zinc-800 bg-black/30 px-2.5 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-zinc-700">
              <input
                type="checkbox"
                checked={diffOnly}
                onChange={(e) => setDiffOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-sky-500"
              />
              Differences only
            </label>
            <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to opportunities
            </Button>
          </div>
        }
      />

      {/* THE WRITTEN NOTE */}
      <Panel
        title="What actually differs"
        subtitle="Derived from the stored records, not restated from the scores. Each line names the specific piece of evidence that separates these setups — or says plainly that a section does not separate them."
        right={analysisBadge}
        className="border-sky-500/30"
      >
        <ul className="space-y-2.5">
          {notes.map((note, i) => (
            <li
              key={i}
              className={cn(
                'rounded-sm border p-3',
                note.tone === 'decisive'
                  ? 'border-sky-500/40 bg-sky-500/[0.06]'
                  : note.tone === 'agree'
                    ? 'border-zinc-800 bg-black/25'
                    : 'border-amber-500/30 bg-amber-500/[0.05]',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide',
                    note.tone === 'decisive'
                      ? 'border-sky-500/40 text-sky-300'
                      : note.tone === 'agree'
                        ? 'border-zinc-700 text-zinc-500'
                        : 'border-amber-500/40 text-amber-300',
                  )}
                >
                  {note.section}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wide text-zinc-600">
                  {note.tone === 'decisive' ? 'this separates them' : note.tone === 'agree' ? 'this does not separate them' : 'evidence not stored on every column'}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-300" style={{ textWrap: 'pretty' }}>
                {note.text}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-zinc-800 pt-2.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          {differingFactors} of {factors.length} score factors differ by more than three points · contract rows shown at the {profile} profile
        </div>
      </Panel>

      {/* ALIGNED COLUMNS */}
      <div className="overflow-x-auto rounded-md border border-zinc-800 bg-[#14171c]">
        <div className="min-w-[760px]">
          {/* COLUMN HEADS */}
          <div className="grid border-b border-zinc-700 bg-black/50" style={gridTemplate(n)}>
            <div className="flex items-end border-r border-zinc-800/70 px-2.5 py-3">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                <Layers className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                evidence row
              </span>
            </div>
            {columns.map((c) => (
              <div key={c.signal.id} className="border-r border-zinc-800/40 px-2.5 py-3 last:border-r-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-semibold tracking-tight text-zinc-50">{c.signal.symbol}</span>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-200">
                    {money(c.quote?.price ?? c.signal.stock_price_at_generation) ?? <Unavailable />}
                  </span>
                  <span className={cn('font-mono text-[10px]', changeColor(c.quote?.change_pct))}>
                    {pct(c.quote?.change_pct) ?? ''}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-500">{c.ticker?.company ?? <Unavailable />}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <DirectionTag direction={c.signal.direction} />
                  <RiskTag level={c.signal.risk_level} />
                </div>
                <div className="mt-2 space-y-1.5">
                  <ScoreBar label="Opportunity" score={c.signal.opportunity_score} />
                  <ScoreBar label="Confidence" score={c.signal.confidence_score} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenThesis(c.signal.id)}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                  >
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    full analysis
                  </button>
                  {onRemove && n > 2 && (
                    <button
                      type="button"
                      onClick={() => onRemove(c.signal.id)}
                      className="font-mono text-[10px] uppercase tracking-wider text-zinc-600 transition-colors hover:text-red-300"
                    >
                      drop column
                    </button>
                  )}
                </div>
                <div className="mt-1.5 font-mono text-[9px] text-zinc-600">
                  generated {stampET(c.signal.generated_at) ?? 'DATA UNAVAILABLE'}
                </div>
              </div>
            ))}
          </div>

          {/* HEADLINE */}
          <SectionBar
            title="Headline read"
            note="The engine's own summary fields, aligned. A row marked same is identical on every column."
            Icon={Sparkles}
          />
          {show(heads).map((r) => <DiffRow key={r.key} row={r} n={n} />)}

          {/* SCORE BREAKDOWN */}
          <SectionBar
            title="Score breakdown, factor by factor"
            note="Each row shows the factor score, its importance in the analysis, and its contribution to the final score. Missing information is shown as unavailable rather than treated as zero."
            Icon={Zap}
            right={analysisBadge}
          />
          {factors
            .filter((f) => (diffOnly ? (f.spread ?? 0) > 3 || f.partial : true))
            .map((f) => {
              const same = !f.partial && (f.spread ?? 0) <= 3;
              return (
                <div
                  key={f.factor}
                  className={cn(
                    'grid border-t border-zinc-800/70 transition-colors',
                    same ? 'opacity-60 hover:opacity-100' : 'bg-sky-500/[0.03] hover:bg-sky-500/[0.07]',
                  )}
                  style={gridTemplate(n)}
                >
                  <div className="border-r border-zinc-800/70 px-2.5 py-2">
                    <div className="text-[11.5px] font-semibold text-zinc-200">{f.label}</div>
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-zinc-600">
                      {same ? (
                        <span className="inline-flex items-center gap-1">
                          <Minus className="h-2.5 w-2.5" aria-hidden="true" />
                          within 3 points
                        </span>
                      ) : f.spread !== null ? (
                        <span className="text-sky-300">{Math.round(f.spread)}-point gap</span>
                      ) : (
                        <span className="text-amber-300">not on every column</span>
                      )}
                    </div>
                  </div>
                  {f.raw.map((raw, i) => {
                    const signed = f.signed[i];
                    const display = f.tradeQuality ? signed : raw;
                    const barValue = f.tradeQuality
                      ? Math.max(0, Math.min(100, ((display ?? 0) + 100) / 2))
                      : Math.max(0, Math.min(100, display ?? 0));
                    return (
                      <div key={i} className="border-r border-zinc-800/40 px-2.5 py-2 last:border-r-0">
                        {display === null ? (
                          <Unavailable />
                        ) : (
                          <>
                            <div className="flex items-baseline gap-2">
                              <span className={cn('font-mono text-[13px] font-semibold tabular-nums', scoreColor(barValue))}>
                                {f.tradeQuality ? `${display > 0 ? '+' : ''}${Math.round(display)}` : Math.round(display)}
                              </span>
                              {f.strongestIndex === i && (
                                <span className="font-mono text-[9px] uppercase tracking-wide text-emerald-400/80">higher</span>
                              )}
                              {f.worstIndex === i && (
                                <span className="font-mono text-[9px] uppercase tracking-wide text-amber-400/80">lower</span>
                              )}
                            </div>
                            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-700',
                                  barValue >= 75 ? 'bg-emerald-500' : barValue >= 60 ? 'bg-sky-500' : barValue >= 45 ? 'bg-amber-500' : 'bg-red-500',
                                )}
                                style={{ width: `${barValue}%` }}
                              />
                            </div>
                            <div className="mt-1 font-mono text-[9px] text-zinc-500">
                              weight {((f.weight[i] ?? 0) * 100).toFixed(1)}% · contributes {Math.round(f.contribution[i] ?? 0)}
                              {f.tradeQuality
                                ? (display > 0 ? ' · improves trade quality' : display < 0 ? ' · reduces trade quality' : ' · neutral trade quality')
                                : (f.effect[i] ? ` · ${String(f.effect[i]).toLowerCase()}` : '')}
                            </div>
                            <p className="mt-1 text-[10.5px] leading-snug text-zinc-500">{f.explanation[i] ?? ''}</p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          <div className="grid border-t border-zinc-700 bg-black/40" style={gridTemplate(n)}>
            <div className="border-r border-zinc-800/70 px-2.5 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              Weighted opportunity score
            </div>
            {columns.map((c) => (
              <div key={c.signal.id} className="border-r border-zinc-800/40 px-2.5 py-2 last:border-r-0">
                <span className={cn('font-mono text-sm font-semibold tabular-nums', scoreColor(c.signal.opportunity_score))}>
                  {c.signal.opportunity_score}
                </span>
              </div>
            ))}
          </div>
          <TextBlockRow
            label="Why the weights look like this"
            n={n}
            cells={columns.map((c) => {
              const decisions = c.signal.weights?.decisions ?? [];
              return decisions.length ? (
                <ul className="space-y-1">
                  {decisions.slice(0, 4).map((d, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-sky-500" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Unavailable />
              );
            })}
          />

          {/* CONTRACTS */}
          <SectionBar
            title="Contract candidates"
            note="Contracts appear only after a setup clears suggestion eligibility. Empty rows can therefore mean the thesis or trade constraints did not clear the gate, not that options data is unavailable."
            Icon={Layers}
            right={
              <div className="flex items-center gap-1 rounded-sm border border-zinc-800 bg-black/40 p-0.5" role="group" aria-label="Contract risk profile">
                {PROFILES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProfile(p)}
                    className={cn(
                      'rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors',
                      profile === p ? 'bg-sky-500/15 text-sky-300' : 'text-zinc-500 hover:text-zinc-200',
                    )}
                    aria-pressed={profile === p}
                  >
                    {p}
                  </button>
                ))}
              </div>
            }
          />
          {show(chain).map((r) => <DiffRow key={r.key} row={r} n={n} />)}
          <TextBlockRow
            label="Suggestion status"
            n={n}
            cells={columns.map((c) =>
              c.signal.score_breakdown?.suggestion_eligible === true
                ? 'Eligible for proactive suggestion'
                : (c.signal.no_trade_reason ?? 'Not suggestion-eligible')
            )}
          />
          <TextBlockRow
            label="Flags on this contract"
            n={n}
            cells={picked.map((c) =>
              c && c.flags?.length ? (
                <div className="flex flex-wrap gap-1.5">{c.flags.map((f) => <FlagTag key={f} flag={f} />)}</div>
              ) : c ? (
                <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-600">no flag raised</span>
              ) : (
                <Unavailable />
              ),
            )}
          />
          <TextBlockRow
            label="Stored trade-off"
            n={n}
            cells={picked.map((c) => (c?.tradeoff ? c.tradeoff : <Unavailable />))}
          />

          {/* CATALYSTS */}
          <SectionBar
            title="Market events"
            note="Scheduled or dated market events associated with each opportunity. If no event is available, URSORA does not infer one."
            Icon={Sparkles}
            right={analysisBadge}
          />
          <TextBlockRow
            label="Market-event summary"
            n={n}
            tone="sky"
            cells={columns.map((c) =>
              c.signal.catalyst_summary ? (
                c.signal.catalyst_summary
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wide text-amber-300/80">no dated market event available</span>
              ),
            )}
          />
          {show(heads.filter((r) => r.key === 'holding')).map((r) => (
            <DiffRow key={`cat-${r.key}`} row={r} n={n} />
          ))}
          <TextBlockRow
            label="Expiration relative to event"
            n={n}
            cells={columns.map((c) =>
              c.signal.suggested_expiration ? (
                <span className="font-mono text-[11px]">
                  {c.signal.suggested_expiration}
                  <span className="ml-1.5 text-zinc-500">{dte(c.signal.suggested_expiration)}d of cover</span>
                </span>
              ) : (
                <Unavailable />
              ),
            )}
          />
          <TextBlockRow
            label="Market-environment note at analysis time"
            n={n}
            cells={columns.map((c) => c.signal.regime_explanation ?? <Unavailable />)}
          />

          {/* RISK */}
          <SectionBar
            title="Risk case"
            note="The comparison shows favorable, expected, and adverse cases, followed by measurable risk factors and the conditions that could make the analysis no longer valid."
            Icon={ShieldAlert}
            right={analysisBadge}
          />
          <TextBlockRow
            label="Bull case"
            n={n}
            tone="emerald"
            cells={columns.map((c) => c.risk?.bull_case ?? <Unavailable />)}
          />
          <TextBlockRow
            label="Base case"
            n={n}
            tone="sky"
            cells={columns.map((c) => c.risk?.base_case ?? <Unavailable />)}
          />
          <TextBlockRow
            label="Bear case"
            n={n}
            tone="red"
            cells={columns.map((c) => c.risk?.bear_case ?? <Unavailable />)}
          />
          {show(risks).map((r) => <DiffRow key={r.key} row={r} n={n} />)}
          <TextBlockRow
            label="Volatility / liquidity / event risk"
            n={n}
            cells={columns.map((c) => (
              <ul className="space-y-1">
                {[
                  { t: 'IV', v: c.risk?.iv_risk },
                  { t: 'Liquidity', v: c.risk?.liquidity_risk },
                  { t: 'Market event', v: c.risk?.catalyst_risk },
                ].map((x) => (
                  <li key={x.t}>
                    <span className="font-mono text-[9px] uppercase tracking-wide text-zinc-500">{x.t} · </span>
                    {x.v ?? <Unavailable />}
                  </li>
                ))}
              </ul>
            ))}
          />
          {columns.some((c) => (c.signal.score_breakdown?.trade_blockers ?? []).length > 0) && (
            <TextBlockRow
              label="Current trade constraints"
              n={n}
              cells={columns.map((c) => {
                const blockers = c.signal.score_breakdown?.trade_blockers ?? [];
                return blockers.length ? (
                  <ul className="space-y-1.5">
                    {blockers.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-600">none stored</span>
                );
              })}
            />
          )}
          <TextBlockRow
            label="Future thesis weakening / invalidation conditions"
            n={n}
            tone="red"
            cells={columns.map((c) =>
              c.risk?.why_it_could_fail?.length ? (
                <ol className="space-y-1.5">
                  {c.risk.why_it_could_fail.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-[1px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-red-500/40 bg-red-500/10 font-mono text-[8px] text-red-300">
                        {i + 1}
                      </span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Unavailable />
              ),
            )}
          />
          {columns.some((c) => c.signal.strategy === 'No Trade') && (
            <TextBlockRow
              label="NO TRADE reason"
              n={n}
              cells={columns.map((c) =>
                c.signal.no_trade_reason ? (
                  <span className="flex gap-1.5 text-amber-100/90">
                    <Ban className="mt-[2px] h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                    {c.signal.no_trade_reason}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-600">cleared the thresholds</span>
                ),
              )}
            />
          )}
        </div>
      </div>

      <Panel title="Reading this comparison honestly">
        <ul className="space-y-1.5 text-[11.5px] leading-relaxed text-zinc-400">
          <li>
            A higher score is not a recommendation to take that column. It means more of the stored evidence aligned
            with the analysis when it was generated, using the market conditions recorded at that time.
          </li>
          <li>
            Rows marked <span className="font-mono text-zinc-300">same</span> are dimmed on purpose. If two setups are
            separated only by rows nobody would trade on, the comparison has no verdict to give you.
          </li>
          <li>
            Where a field is not stored on one column it reads{' '}
            <span className="font-mono text-zinc-300">DATA UNAVAILABLE</span>. It is never zero-filled to keep the
            columns tidy, because that would manufacture a difference that does not exist.
          </li>
          <li>
            Every value in these columns comes from the same normalized market-data layer as the rest of the workstation. Comparing two
            demo records tells you about the engine, not about the market.
          </li>
        </ul>
        <Disclaimer className="mt-3 border-t border-zinc-800 pt-3" />
      </Panel>
    </div>
  );
};

export default CompareView;
