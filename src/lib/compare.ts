/**
 * URSORA — side-by-side comparison derivation.
 *
 * Everything in this module is derived ARITHMETICALLY from records already
 * stored on the signal, its contract candidates and its risk assessment.
 * No figure, catalyst or risk sentence is invented here: when a field is
 * missing on one side the row is reported as "not stored on every column"
 * rather than filled in.
 */

import type { ContractCandidate, Quote, RiskAssessment, Signal, Ticker } from '@/lib/types';
import { dte, num, pct } from '@/lib/format';

export type Profile = 'Aggressive' | 'Balanced' | 'Conservative';

export const PROFILES: Profile[] = ['Aggressive', 'Balanced', 'Conservative'];

export interface CompareColumn {
  signal: Signal;
  quote: Quote | null;
  ticker: Ticker | null;
  candidates: ContractCandidate[];
  risk: RiskAssessment | null;
}

/* -------------------------------------------------------------------------- */
/*  Generic row model                                                         */
/* -------------------------------------------------------------------------- */

export interface CompareRow {
  key: string;
  label: string;
  /** Display cell per column, already formatted. null renders DATA UNAVAILABLE. */
  cells: (string | null)[];
  /** Numeric values behind the cells, where the field is numeric. */
  values: (number | null)[];
  /** True when every present cell reads identically. */
  agrees: boolean;
  /** Absolute spread between the highest and lowest numeric value, when numeric. */
  spread: number | null;
  /** Index of the highest / lowest numeric column, when numeric and not agreed. */
  bestIndex: number | null;
  worstIndex: number | null;
  /** Some column is missing this field entirely. */
  partial: boolean;
  /** Higher numbers are the better reading for this row. */
  higherIsBetter?: boolean;
  hint?: string;
}

const numericStats = (values: (number | null)[], higherIsBetter: boolean) => {
  const present = values.map((v, i) => ({ v, i })).filter((x) => x.v !== null) as { v: number; i: number }[];
  if (present.length < 2) return { spread: null, bestIndex: null, worstIndex: null };
  const sorted = [...present].sort((a, b) => a.v - b.v);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const spread = Math.abs(hi.v - lo.v);
  if (spread === 0) return { spread: 0, bestIndex: null, worstIndex: null };
  return {
    spread,
    bestIndex: higherIsBetter ? hi.i : lo.i,
    worstIndex: higherIsBetter ? lo.i : hi.i,
  };
};

export function buildRow(opts: {
  key: string;
  label: string;
  values: (number | null)[];
  format?: (v: number) => string;
  higherIsBetter?: boolean;
  hint?: string;
}): CompareRow {
  const { key, label, values, format = (v) => num(v) ?? '', higherIsBetter = true, hint } = opts;
  const cells = values.map((v) => (v === null ? null : format(v)));
  const stats = numericStats(values, higherIsBetter);
  const present = cells.filter((c) => c !== null);
  return {
    key,
    label,
    cells,
    values,
    agrees: present.length > 1 && new Set(present).size === 1,
    spread: stats.spread,
    bestIndex: stats.bestIndex,
    worstIndex: stats.worstIndex,
    partial: cells.some((c) => c === null),
    higherIsBetter,
    hint,
  };
}

export function buildTextRow(opts: { key: string; label: string; cells: (string | null)[]; hint?: string }): CompareRow {
  const present = opts.cells.filter((c) => c !== null && c !== '');
  return {
    key: opts.key,
    label: opts.label,
    cells: opts.cells,
    values: opts.cells.map(() => null),
    agrees: present.length > 1 && new Set(present.map((c) => String(c).toLowerCase())).size === 1,
    spread: null,
    bestIndex: null,
    worstIndex: null,
    partial: opts.cells.some((c) => c === null || c === ''),
    hint: opts.hint,
  };
}

/* -------------------------------------------------------------------------- */
/*  Score breakdown, factor by factor                                         */
/* -------------------------------------------------------------------------- */

export interface FactorRow {
  factor: string;
  label: string;
  /** Per column: null when this factor is not stored on that signal. */
  raw: (number | null)[];
  signed: (number | null)[];
  weight: (number | null)[];
  contribution: (number | null)[];
  effect: (string | null)[];
  explanation: (string | null)[];
  spread: number | null;
  bestIndex: number | null;
  worstIndex: number | null;
  partial: boolean;
  tradeQuality: boolean;
}

export function factorRows(columns: CompareColumn[]): FactorRow[] {
  const order: string[] = [];
  const labels: Record<string, string> = {};
  for (const col of columns) {
    for (const f of col.signal.score_breakdown?.factors ?? []) {
      if (!order.includes(f.factor)) order.push(f.factor);
      labels[f.factor] = f.label;
    }
  }
  return order.map((factor) => {
    const found = columns.map((c) => (c.signal.score_breakdown?.factors ?? []).find((f) => f.factor === factor) ?? null);
    const raw = found.map((f) => (f ? Number(f.raw_score) : null));
    const signed = found.map((f) => {
      if (!f) return null;
      const value = Number((f as any).signed_score);
      return Number.isFinite(value) ? value : Number(f.raw_score);
    });
    const tradeQuality = factor === 'liquidity' || factor === 'risk_reward';
    const comparable = tradeQuality ? signed : raw;
    const stats = numericStats(comparable, true);
    return {
      factor,
      label: labels[factor] ?? factor,
      raw,
      signed,
      weight: found.map((f) => (f ? Number(f.effective_weight) : null)),
      contribution: found.map((f) => (f ? Number(f.contribution) : null)),
      effect: found.map((f) => f?.effect ?? null),
      explanation: found.map((f) => f?.explanation ?? null),
      spread: stats.spread,
      bestIndex: stats.bestIndex,
      worstIndex: stats.worstIndex,
      partial: found.some((f) => f === null),
      tradeQuality,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Section row builders                                                      */
/* -------------------------------------------------------------------------- */

export const headlineRows = (columns: CompareColumn[]): CompareRow[] => [
  buildRow({
    key: 'opportunity',
    label: 'Opportunity score',
    values: columns.map((c) => c.signal.opportunity_score ?? null),
    format: (v) => String(Math.round(v)),
  }),
  buildRow({
    key: 'confidence',
    label: 'Confidence score',
    values: columns.map((c) => c.signal.confidence_score ?? null),
    format: (v) => String(Math.round(v)),
  }),
  buildTextRow({ key: 'direction', label: 'Direction', cells: columns.map((c) => c.signal.direction) }),
  buildTextRow({ key: 'strategy', label: 'Strategy', cells: columns.map((c) => c.signal.strategy) }),
  buildTextRow({ key: 'risk-level', label: 'Risk level', cells: columns.map((c) => c.signal.risk_level) }),
  buildTextRow({ key: 'holding', label: 'Holding period', cells: columns.map((c) => c.signal.holding_period) }),
  buildTextRow({ key: 'regime', label: 'Regime at generation', cells: columns.map((c) => c.signal.regime) }),
  buildRow({
    key: 'expected-move',
    label: 'Expected move',
    values: columns.map((c) => c.signal.expected_move_pct ?? null),
    format: (v) => pct(v) ?? '',
  }),
];

export const contractRows = (columns: CompareColumn[], picked: (ContractCandidate | null)[]): CompareRow[] => [
  buildTextRow({
    key: 'contract-line',
    label: 'Contract line',
    cells: picked.map((c) => (c ? `${c.symbol} ${num(c.strike)} ${c.option_type.toUpperCase()} ${c.expiration}` : null)),
  }),
  buildRow({
    key: 'dte',
    label: 'Days to expiration',
    values: picked.map((c) => (c ? dte(c.expiration) : null)),
    format: (v) => `${Math.round(v)}d`,
    higherIsBetter: true,
    hint: 'More days is more time for the thesis to resolve, at a higher premium.',
  }),
  buildRow({ key: 'mid', label: 'Mid price', values: picked.map((c) => c?.mid ?? null), higherIsBetter: false }),
  buildTextRow({
    key: 'bidask',
    label: 'Bid / ask',
    cells: picked.map((c) => (c ? `${num(c.bid) ?? '—'} / ${num(c.ask) ?? '—'}` : null)),
  }),
  buildRow({
    key: 'spread-pct',
    label: 'Spread',
    values: picked.map((c) => c?.spread_pct ?? null),
    format: (v) => `${num(v)}%`,
    higherIsBetter: false,
    hint: 'A wider spread is an immediate cost on entry and exit.',
  }),
  buildRow({
    key: 'liquidity',
    label: 'Liquidity score',
    values: picked.map((c) => c?.liquidity_score ?? null),
    format: (v) => String(Math.round(v)),
  }),
  buildRow({ key: 'volume', label: 'Contract volume', values: picked.map((c) => c?.volume ?? null), format: (v) => Math.round(v).toLocaleString('en-US') }),
  buildRow({ key: 'oi', label: 'Open interest', values: picked.map((c) => c?.open_interest ?? null), format: (v) => Math.round(v).toLocaleString('en-US') }),
  buildRow({
    key: 'iv',
    label: 'Implied volatility',
    values: picked.map((c) => c?.implied_volatility ?? null),
    format: (v) => `${(v * 100).toFixed(1)}%`,
    higherIsBetter: false,
    hint: 'Higher IV means you are paying more for the same move.',
  }),
  buildRow({ key: 'delta', label: 'Delta', values: picked.map((c) => (c?.delta === null || c?.delta === undefined ? null : Math.abs(Number(c.delta))), ), format: (v) => num(v, 3) ?? '' }),
  buildRow({ key: 'gamma', label: 'Gamma', values: picked.map((c) => c?.gamma ?? null), format: (v) => num(v, 4) ?? '' }),
  buildRow({
    key: 'theta',
    label: 'Theta per day',
    values: picked.map((c) => c?.theta ?? null),
    format: (v) => num(v, 3) ?? '',
    higherIsBetter: true,
    hint: 'Theta is negative for long premium; closer to zero bleeds less each day.',
  }),
  buildRow({ key: 'vega', label: 'Vega', values: picked.map((c) => c?.vega ?? null), format: (v) => num(v, 3) ?? '' }),
  buildRow({
    key: 'premium',
    label: 'Premium outlay',
    values: picked.map((c) => c?.est_premium ?? null),
    format: (v) => `$${num(v)}`,
    higherIsBetter: false,
  }),
  buildRow({
    key: 'max-loss',
    label: 'Max defined loss',
    values: picked.map((c) => (c?.max_loss ?? null) === null ? null : Math.abs(Number(c?.max_loss))),
    format: (v) => `$${num(v)}`,
    higherIsBetter: false,
  }),
  buildRow({ key: 'break-even', label: 'Break-even', values: picked.map((c) => c?.break_even ?? null) }),
  buildRow({
    key: 'prob',
    label: 'Modelled thesis probability',
    values: picked.map((c) => c?.prob_thesis_pct ?? null),
    format: (v) => `${num(v, 0)}%`,
  }),
  buildRow({
    key: 'selection',
    label: 'Selection score',
    values: picked.map((c) => c?.selection_score ?? null),
    format: (v) => String(Math.round(v)),
  }),
];

export const riskRows = (columns: CompareColumn[]): CompareRow[] => [
  buildRow({
    key: 'premium-at-risk',
    label: 'Premium at risk',
    values: columns.map((c) => c.risk?.premium_at_risk ?? null),
    format: (v) => `$${num(v)}`,
    higherIsBetter: false,
  }),
  buildRow({
    key: 'theta-day',
    label: 'Theta cost per day',
    values: columns.map((c) => (c.risk?.theta_per_day === null || c.risk?.theta_per_day === undefined ? null : Math.abs(Number(c.risk.theta_per_day)))),
    format: (v) => `$${num(v)}`,
    higherIsBetter: false,
  }),
  buildRow({
    key: 'invalidation',
    label: 'Invalidation level',
    values: columns.map((c) => c.signal.invalidation_level ?? null),
  }),
  buildRow({
    key: 'distance-to-invalidation',
    label: 'Distance to invalidation',
    values: columns.map((c) => {
      const price = c.quote?.price ?? c.signal.stock_price_at_generation;
      const inv = c.signal.invalidation_level;
      if (price === null || price === undefined || inv === null || inv === undefined || Number(price) === 0) return null;
      return (Math.abs(Number(price) - Number(inv)) / Number(price)) * 100;
    }),
    format: (v) => `${v.toFixed(2)}%`,
    hint: 'How far price has to travel against the thesis before the stored invalidation level is hit.',
  }),
  buildRow({
    key: 'reward',
    label: 'Distance to target',
    values: columns.map((c) => {
      const price = c.quote?.price ?? c.signal.stock_price_at_generation;
      const tgt = c.signal.target_price;
      if (price === null || price === undefined || tgt === null || tgt === undefined || Number(price) === 0) return null;
      return (Math.abs(Number(tgt) - Number(price)) / Number(price)) * 100;
    }),
    format: (v) => `${v.toFixed(2)}%`,
  }),
  buildRow({
    key: 'fail-count',
    label: 'Stored disconfirming conditions',
    values: columns.map((c) => (c.risk?.why_it_could_fail?.length ?? null)),
    format: (v) => `${Math.round(v)} recorded`,
    higherIsBetter: false,
  }),
  buildTextRow({ key: 'time-remaining', label: 'Time remaining', cells: columns.map((c) => c.risk?.time_remaining ?? null) }),
];

/* -------------------------------------------------------------------------- */
/*  The written note: what actually differs                                   */
/* -------------------------------------------------------------------------- */

export interface DiffNote {
  section: 'Score breakdown' | 'Contract candidates' | 'Catalysts' | 'Risk case';
  text: string;
  tone: 'decisive' | 'agree' | 'gap';
}

const label = (c: CompareColumn) => c.signal.symbol;
const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export function buildDiffNotes(columns: CompareColumn[], picked: (ContractCandidate | null)[]): DiffNote[] {
  const notes: DiffNote[] = [];
  const names = columns.map(label);

  /* --- score breakdown: the factor with the widest raw-score gap --- */
  const factors = factorRows(columns);
  const scored = factors.filter((f) => !f.partial && f.spread !== null && f.spread > 0);
  const widest = [...scored].sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0))[0];
  const agreed = factors.filter((f) => !f.partial && (f.spread ?? 0) <= 3);

  if (widest && widest.bestIndex !== null && widest.worstIndex !== null) {
    const hi = widest.bestIndex;
    const lo = widest.worstIndex;
    notes.push({
      section: 'Score breakdown',
      tone: 'decisive',
      text:
        `The scores separate on ${widest.label}: ${names[hi]} holds ${Math.round(widest.raw[hi] ?? 0)} against ` +
        `${Math.round(widest.raw[lo] ?? 0)} for ${names[lo]}, a ${Math.round(widest.spread ?? 0)}-point gap — the widest of any ` +
        `shared factor. With the regime weighting that factor at ${((widest.weight[hi] ?? 0) * 100).toFixed(1)}%, it contributes ` +
        `${Math.round(widest.contribution[hi] ?? 0)} to ${names[hi]} versus ${Math.round(widest.contribution[lo] ?? 0)} to ${names[lo]}. ` +
        `The stored explanation for ${names[hi]} reads: “${widest.explanation[hi] ?? 'no explanation stored'}”`,
    });
  } else {
    notes.push({
      section: 'Score breakdown',
      tone: 'gap',
      text:
        'No single factor is stored on every column with a comparable raw score, so the score breakdown cannot be ' +
        'reduced to one differing piece of evidence here. Read the factor rows individually.',
    });
  }

  if (agreed.length) {
    notes.push({
      section: 'Score breakdown',
      tone: 'agree',
      text:
        `${agreed.length} factor${agreed.length === 1 ? '' : 's'} are effectively tied across these setups ` +
        `(${list(agreed.slice(0, 4).map((f) => f.label))}${agreed.length > 4 ? ', and others' : ''}) — within three points. ` +
        'Those rows are not what makes the choice; they are dimmed in the table below.',
    });
  }

  /* --- contract candidates --- */
  const have = picked.map((c, i) => ({ c, i })).filter((x) => x.c !== null) as { c: ContractCandidate; i: number }[];
  if (have.length >= 2) {
    const spreads = have.map((x) => ({ i: x.i, v: x.c.spread_pct === null ? null : Number(x.c.spread_pct) }));
    const prem = have.map((x) => ({ i: x.i, v: x.c.est_premium === null ? null : Number(x.c.est_premium) }));
    const ivs = have.map((x) => ({ i: x.i, v: x.c.implied_volatility === null ? null : Number(x.c.implied_volatility) }));
    const dtes = have.map((x) => ({ i: x.i, v: dte(x.c.expiration) }));
    const pieces: string[] = [];

    const widest2 = spreads.filter((s) => s.v !== null).sort((a, b) => (b.v as number) - (a.v as number));
    if (widest2.length >= 2 && (widest2[0].v as number) - (widest2[widest2.length - 1].v as number) >= 0.5) {
      pieces.push(
        `execution cost — ${names[widest2[0].i]} quotes a ${num(widest2[0].v)}% spread against ` +
        `${num(widest2[widest2.length - 1].v)}% on ${names[widest2[widest2.length - 1].i]}`,
      );
    }
    const pr = prem.filter((s) => s.v !== null).sort((a, b) => (b.v as number) - (a.v as number));
    if (pr.length >= 2 && (pr[0].v as number) !== (pr[pr.length - 1].v as number)) {
      pieces.push(
        `outlay — $${num(pr[0].v)} of premium for ${names[pr[0].i]} versus $${num(pr[pr.length - 1].v)} for ` +
        `${names[pr[pr.length - 1].i]}`,
      );
    }
    const iv = ivs.filter((s) => s.v !== null).sort((a, b) => (b.v as number) - (a.v as number));
    if (iv.length >= 2 && ((iv[0].v as number) - (iv[iv.length - 1].v as number)) >= 0.02) {
      pieces.push(
        `volatility paid — ${((iv[0].v as number) * 100).toFixed(1)}% IV on ${names[iv[0].i]} against ` +
        `${((iv[iv.length - 1].v as number) * 100).toFixed(1)}% on ${names[iv[iv.length - 1].i]}`,
      );
    }
    const dd = dtes.filter((s) => s.v !== null).sort((a, b) => (b.v as number) - (a.v as number));
    if (dd.length >= 2 && (dd[0].v as number) - (dd[dd.length - 1].v as number) >= 5) {
      pieces.push(
        `time bought — ${dd[0].v} days on ${names[dd[0].i]} versus ${dd[dd.length - 1].v} on ${names[dd[dd.length - 1].i]}`,
      );
    }

    notes.push({
      section: 'Contract candidates',
      tone: pieces.length ? 'decisive' : 'agree',
      text: pieces.length
        ? `On the same risk profile the contracts differ mainly on ${list(pieces)}. Everything else in the chain rows is close enough that it should not decide the trade.`
        : 'At this risk profile the two contract lines are close on spread, premium, implied volatility and time to expiration. The chain is not the deciding evidence — the score breakdown and the risk case are.',
    });
  } else {
    notes.push({
      section: 'Contract candidates',
      tone: 'gap',
      text:
        'At least one column has no contract stored at this profile. Ursora only creates contract candidates after a setup becomes suggestion-eligible, so unavailable contract rows may reflect gating rather than a failed options feed.',
    });
  }

  /* --- catalysts --- */
  const withCat = columns.filter((c) => (c.signal.catalyst_summary ?? '').trim().length > 0);
  const without = columns.filter((c) => !(c.signal.catalyst_summary ?? '').trim().length);
  if (withCat.length && without.length) {
    notes.push({
      section: 'Catalysts',
      tone: 'decisive',
      text:
        `Only ${list(withCat.map(label))} carr${withCat.length === 1 ? 'ies' : 'y'} a dated catalyst in the store; ` +
        `${list(without.map(label))} ${without.length === 1 ? 'has' : 'have'} none. That is a real asymmetry: the setup ` +
        'without a catalyst depends entirely on price, volume and options evidence holding.',
    });
  } else if (withCat.length === columns.length) {
    notes.push({
      section: 'Catalysts',
      tone: 'agree',
      text:
        'Every column has a dated catalyst stored, so the presence of a catalyst is not the differentiator — the ' +
        'catalyst text itself is. Read the two summaries side by side below.',
    });
  } else {
    notes.push({
      section: 'Catalysts',
      tone: 'gap',
      text: 'No column carries a dated catalyst. Nothing is inferred in place of one; the news and market-events factor is unavailable and contributes no directional evidence for these setups.',
    });
  }

  /* --- risk case --- */
  const riskPieces: string[] = [];
  const levels = Array.from(new Set(columns.map((c) => c.signal.risk_level)));
  if (levels.length > 1) {
    riskPieces.push(`the engine graded them at different risk levels (${list(columns.map((c) => `${label(c)} ${c.signal.risk_level}`))})`);
  }
  const pars = columns
    .map((c, i) => ({ i, v: c.risk?.premium_at_risk === null || c.risk?.premium_at_risk === undefined ? null : Number(c.risk.premium_at_risk) }))
    .filter((x) => x.v !== null)
    .sort((a, b) => (b.v as number) - (a.v as number));
  if (pars.length >= 2 && (pars[0].v as number) !== (pars[pars.length - 1].v as number)) {
    riskPieces.push(
      `the capital genuinely at risk differs — $${num(pars[0].v)} on ${names[pars[0].i]} against $${num(pars[pars.length - 1].v)} on ${names[pars[pars.length - 1].i]}`,
    );
  }
  const fails = columns
    .map((c, i) => ({ i, v: c.risk?.why_it_could_fail?.length ?? null }))
    .filter((x) => x.v !== null)
    .sort((a, b) => (b.v as number) - (a.v as number));
  if (fails.length >= 2 && (fails[0].v as number) !== (fails[fails.length - 1].v as number)) {
    riskPieces.push(
      `${names[fails[0].i]} stores ${fails[0].v} ways the thesis breaks versus ${fails[fails.length - 1].v} for ${names[fails[fails.length - 1].i]}`,
    );
  }
  notes.push({
    section: 'Risk case',
    tone: riskPieces.length ? 'decisive' : 'agree',
    text: riskPieces.length
      ? `On risk, ${list(riskPieces)}. The bear cases below are quoted verbatim from each record — they are the part worth reading in full before choosing.`
      : 'The risk grades, premium at risk and the count of stored disconfirming conditions are comparable across these columns. The bear cases still describe different failure mechanisms; read them verbatim below.',
  });

  return notes;
}

/** Shared grid template so every section's rows line up on the same columns. */
export const gridTemplate = (n: number) => ({
  gridTemplateColumns: `minmax(170px, 1.05fr) repeat(${n}, minmax(190px, 1fr))`,
});
