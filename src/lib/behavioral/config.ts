/**
 * URSORA — TRADER INTELLIGENCE configuration.
 *
 * Every threshold the behavioural engines use lives here and nowhere else, so
 * the sample requirements, session windows and risk weights can be tuned in one
 * place without touching engine logic (PHASE E / PHASE G / PHASE H).
 */

export const MODEL_VERSION = 'behavioral-1.0.0';

/* --------------------------- confidence labelling -------------------------- */

export type ConfidenceLabel =
  | 'INSUFFICIENT DATA'
  | 'EARLY SIGNAL'
  | 'EMERGING PATTERN'
  | 'ESTABLISHED PERSONAL PATTERN'
  | 'HIGH-CONFIDENCE PERSONAL PATTERN';

/** Minimum observations required before a finding may carry each label. */
export const SAMPLE_THRESHOLDS: { label: ConfidenceLabel; min: number }[] = [
  { label: 'HIGH-CONFIDENCE PERSONAL PATTERN', min: 60 },
  { label: 'ESTABLISHED PERSONAL PATTERN', min: 30 },
  { label: 'EMERGING PATTERN', min: 15 },
  { label: 'EARLY SIGNAL', min: 6 },
  { label: 'INSUFFICIENT DATA', min: 0 },
];

export function confidenceFor(sampleSize: number): ConfidenceLabel {
  for (const t of SAMPLE_THRESHOLDS) if (sampleSize >= t.min) return t.label;
  return 'INSUFFICIENT DATA';
}

/** A finding below this may be computed and inspected, but is never asserted. */
export const MIN_SAMPLE_TO_DISPLAY = 6;
/** Below this, URSORA refuses to state a direction at all. */
export const MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM = 15;

export const CONFIDENCE_RANK: Record<ConfidenceLabel, number> = {
  'INSUFFICIENT DATA': 0,
  'EARLY SIGNAL': 1,
  'EMERGING PATTERN': 2,
  'ESTABLISHED PERSONAL PATTERN': 3,
  'HIGH-CONFIDENCE PERSONAL PATTERN': 4,
};

/* ------------------------------ deviation gates ---------------------------- */

export const DEVIATION = {
  /** Position size above this multiple of the rolling median is an observation. */
  sizeMultipleNotable: 1.5,
  sizeMultipleElevated: 2.0,
  sizeMultipleHigh: 3.0,
  /** Minutes between an exit and the next entry below which re-entry is "rapid". */
  rapidReentryMinutes: 10,
  /** Session trade count as a multiple of the user's median session count. */
  frequencyMultipleNotable: 1.5,
  frequencyMultipleElevated: 2.0,
  /** Giveback from session high-water, as a fraction of the high-water figure. */
  givebackFractionNotable: 0.3,
  givebackFractionElevated: 0.5,
  /** Opportunity score below the user's own median entry score by this many points. */
  qualityDropPoints: 12,
} as const;

/* ------------------------------ session windows ---------------------------- */

export interface SessionWindow {
  key: string;
  label: string;
  /** Minutes from ET midnight, inclusive start, exclusive end. */
  startMin: number;
  endMin: number;
}

export const SESSION_WINDOWS: SessionWindow[] = [
  { key: 'premarket', label: 'PREMARKET', startMin: 240, endMin: 570 },
  { key: 'open', label: 'OPEN', startMin: 570, endMin: 600 },
  { key: 'morning', label: 'MORNING', startMin: 600, endMin: 690 },
  { key: 'midday', label: 'MIDDAY', startMin: 690, endMin: 810 },
  { key: 'afternoon', label: 'AFTERNOON', startMin: 810, endMin: 900 },
  { key: 'power_hour', label: 'POWER HOUR', startMin: 900, endMin: 960 },
  { key: 'after_hours', label: 'AFTER HOURS', startMin: 960, endMin: 1200 },
];

export function windowFor(iso: string | null | undefined): SessionWindow | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = et.getHours() * 60 + et.getMinutes();
  return SESSION_WINDOWS.find((w) => mins >= w.startMin && mins < w.endMin) ?? null;
}

/* --------------------------- trade origin taxonomy ------------------------- */

export const TRADE_ORIGINS = [
  { key: 'MATADOR_SUPPORTED', label: 'URSORA-Supported', hint: 'Entered from a URSORA opportunity with its stored TradeCycle plan.' },
  { key: 'EXTERNAL_SIGNAL', label: 'External Trader Signal', hint: 'Sourced from another trader or service. Never inferred — you set it.' },
  { key: 'INDEPENDENT_PLANNED', label: 'Independent Planned', hint: 'Your own analysis, planned before entry.' },
  { key: 'SPONTANEOUS', label: 'Spontaneous', hint: 'Entered without a stored pre-entry plan.' },
  { key: 'OTHER', label: 'Other', hint: 'Anything that does not fit the categories above.' },
] as const;

export type TradeOrigin = (typeof TRADE_ORIGINS)[number]['key'];

/* -------------------------- process adherence weights ---------------------- */
/** PHASE G — profitability is deliberately absent and must never be added. */
export const ADHERENCE_WEIGHTS = {
  planned_entry: 20,
  size_adherence: 20,
  invalidation_adherence: 25,
  target_process: 15,
  setup_adherence: 10,
  unplanned_penalty: 10,
} as const;

export const PLAN_DEVIATION_TYPES = [
  { key: 'entered_before_confirmation', label: 'Entered before intended confirmation' },
  { key: 'entered_after_zone', label: 'Entered materially after the intended entry zone' },
  { key: 'chased_extended_move', label: 'Entered after the move was already extended' },
  { key: 'size_beyond_plan', label: 'Size beyond the planned size' },
  { key: 'unplanned_average_down', label: 'Unplanned averaging down' },
  { key: 'invalidation_widened', label: 'Invalidation moved farther away' },
  { key: 'invalidation_removed', label: 'Invalidation removed' },
  { key: 'exited_before_criteria', label: 'Exited well before the stated criteria' },
  { key: 'held_past_invalidation', label: 'Held after the invalidation was reached' },
  { key: 'reentry_after_stop', label: 'Re-entered after a stop-out' },
  { key: 'added_into_deterioration', label: 'Added after target conditions deteriorated' },
  { key: 'no_stored_plan', label: 'Traded a ticker with no stored plan' },
  { key: 'outside_strategy_rules', label: 'Outside the stated strategy rules' },
] as const;

export type PlanDeviationType = (typeof PLAN_DEVIATION_TYPES)[number]['key'];

/* --------------------------- behavioural risk bands ------------------------ */

export type RiskBand = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';

export const RISK_BANDS: { band: RiskBand; min: number; tone: string }[] = [
  { band: 'HIGH', min: 70, tone: 'text-red-300 border-red-500/40 bg-red-500/10' },
  { band: 'ELEVATED', min: 45, tone: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
  { band: 'MODERATE', min: 22, tone: 'text-sky-300 border-sky-500/40 bg-sky-500/10' },
  { band: 'LOW', min: 0, tone: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' },
];

export function bandFor(points: number): RiskBand {
  for (const b of RISK_BANDS) if (points >= b.min) return b.band;
  return 'LOW';
}

export const bandTone = (band: RiskBand): string =>
  RISK_BANDS.find((b) => b.band === band)?.tone ?? RISK_BANDS[3].tone;

/* -------------------------- alert categories (PHASE J) --------------------- */

export const ALERT_CATEGORIES = [
  { key: 'sizing', label: 'Position sizing', hint: 'Size measured against your own rolling median.' },
  { key: 'frequency', label: 'Trade frequency', hint: 'Session trade count against your median session.' },
  { key: 'giveback', label: 'Session giveback', hint: 'Distance from the session high-water mark.' },
  { key: 'rapid_reentry', label: 'Rapid re-entry', hint: 'Time between an exit and the next entry.' },
  { key: 'plan_deviation', label: 'Plan deviation', hint: 'Entries and exits that depart from the stored plan.' },
  { key: 'stop_modification', label: 'Invalidation changes', hint: 'Invalidation levels moved or removed after entry.' },
  { key: 'time_of_day', label: 'Time of day', hint: 'Trading outside your historically stronger windows.' },
  { key: 'low_quality_setup', label: 'Setup quality', hint: 'Entries below your own median opportunity score.' },
  { key: 'unplanned_trade', label: 'Unplanned trades', hint: 'Entries with no stored pre-entry plan.' },
] as const;

export type AlertCategory = (typeof ALERT_CATEGORIES)[number]['key'];

export const SENSITIVITY = ['CONSERVATIVE', 'STANDARD', 'SENSITIVE'] as const;
export type Sensitivity = (typeof SENSITIVITY)[number];

/** Sensitivity scales every deviation gate; it never changes the arithmetic. */
export const sensitivityFactor = (s: Sensitivity): number =>
  s === 'CONSERVATIVE' ? 1.3 : s === 'SENSITIVE' ? 0.8 : 1;

/* ------------------------------- language guard ---------------------------- */
/**
 * GUARDRAILS. These strings must never reach a user. The dev-time assertion in
 * `assertLanguage` is the last line of defence for any generated sentence.
 */
export const FORBIDDEN_PHRASES = [
  'stop trading now', 'you are tilted', 'tilted', 'you are greedy', 'greedy',
  'revenge trading', 'you are revenge', 'addicted', 'reckless', 'undisciplined trader',
  'emotional trader', 'bad trader', 'gambling problem', 'compulsive', 'you panicked',
];

export function assertLanguage(text: string): string {
  const lower = text.toLowerCase();
  const hit = FORBIDDEN_PHRASES.find((p) => lower.includes(p));
  if (hit && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[URSORA:language-guard] blocked phrasing "${hit}" in: ${text}`);
  }
  return hit ? text.replace(new RegExp(hit, 'ig'), '[phrasing removed]') : text;
}
