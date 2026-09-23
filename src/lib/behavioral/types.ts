/**
 * URSORA — TRADER INTELLIGENCE domain types.
 *
 * The canonical trade record is the existing `paper_trades` row extended in the
 * PHASE D migration. There is no second trade model.
 */

import type { ConfidenceLabel, PlanDeviationType, RiskBand, TradeOrigin } from '@/lib/behavioral/config';

export interface TradeRecord {
  id: number;
  user_id: string | null;
  signal_id: number | null;
  symbol: string;
  direction: string | null;
  strategy: string | null;
  setup: string | null;
  option_type: string | null;
  strike: number | null;
  expiration: string | null;
  option_symbol: string | null;
  asset_type: string | null;
  broker: string | null;
  account_label: string | null;
  contracts: number | null;
  position_size: number | null;
  entry_at: string | null;
  entry_price: number | null;
  exit_at: string | null;
  exit_price: number | null;
  fees: number | null;
  realized_pl: number | null;
  unrealized_pl: number | null;
  origin: TradeOrigin | null;
  regime: string | null;
  opportunity_score: number | null;
  confidence_score: number | null;
  risk_level: string | null;
  thesis_id: number | null;
  trade_plan_id: number | null;
  intended_invalidation: number | null;
  intended_target: number | null;
  max_favorable_excursion: number | null;
  max_adverse_excursion: number | null;
  return_pct: number | null;
  result: string | null;
  closed_at: string | null;
  session_date: string | null;
  was_planned: boolean | null;
  process_adherence: number | null;
  is_synthetic: boolean | null;
  synthetic_profile: string | null;
  is_demo: boolean | null;
  notes: string | null;
  thesis_mode?: string | null;
  inferred_thesis_direction?: string | null;
  thesis_inference_basis?: string | null;
  thesis_status?: string | null;
  thesis_support?: number | null;
  thesis_agreement?: number | null;
  thesis_last_checked_at?: string | null;
  thesis_review_status?: string | null;
  thesis_review_summary?: string | null;
  created_at: string;
}

export interface TradeCycleThesisEvent {
  id: number;
  user_id: string | null;
  trade_id: number;
  signal_id: number | null;
  event_type: string;
  thesis_direction: string | null;
  thesis_state: string | null;
  thesis_support: number | null;
  directional_agreement: number | null;
  underlying_price: number | null;
  evidence: Record<string, unknown>;
  created_at: string;
}

export interface TradePlan {
  id: number;
  user_id: string | null;
  signal_id: number | null;
  symbol: string;
  setup: string | null;
  direction: string | null;
  strategy: string | null;
  opportunity_score: number | null;
  confidence_score: number | null;
  market_regime: string | null;
  catalyst: string | null;
  technical_evidence: string | null;
  contract_label: string | null;
  intended_entry_low: number | null;
  intended_entry_high: number | null;
  intended_invalidation: number | null;
  intended_target: number | null;
  expected_move_pct: number | null;
  risk_level: string | null;
  intended_position_size: number | null;
  intended_contracts: number | null;
  origin: TradeOrigin;
  is_synthetic: boolean;
  engine_version: string;
  created_at: string;
}

export interface TradeModification {
  id: number;
  trade_id: number | null;
  trade_plan_id: number | null;
  modification_type: string;
  field_changed: string | null;
  previous_value: string | null;
  new_value: string | null;
  rationale: string | null;
  deviation_type: PlanDeviationType | null;
  occurred_at: string;
  engine_version: string;
}

/** A single measured finding. Append-only; never recomputed in place. */
export interface Observation {
  id?: number;
  observation_type: string;
  category: string;
  /** What was measured. */
  statement: string;
  baseline_value: number | null;
  current_value: number | null;
  deviation_pct: number | null;
  unit: string;
  sample_size: number;
  observation_period: string;
  confidence_label: ConfidenceLabel;
  construct_key: string | null;
  evidence_trade_ids: number[];
  severity: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
  model_version: string;
  session_date?: string | null;
  trade_id?: number | null;
  /** PHASE L provenance — how the number was produced, in words. */
  formula: string;
}

export interface BehavioralRiskFactor {
  key: string;
  label: string;
  points: number;
  observation: Observation;
}

export interface BehavioralRisk {
  band: RiskBand;
  points: number;
  factors: BehavioralRiskFactor[];
  model_version: string;
  /** Empty factor list is a valid, honest answer. */
  note: string;
}

export interface WindowStat {
  key: string;
  label: string;
  trades: number;
  wins: number;
  winRate: number | null;
  expectancy: number | null;
  avgReturnPct: number | null;
  avgSize: number | null;
  totalPl: number;
}

export interface SegmentStat extends WindowStat {
  segment: string;
}

export interface Baseline {
  sampleSize: number;
  closedSample: number;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  tradesPerSessionMean: number | null;
  tradesPerSessionMedian: number | null;
  medianPositionSize: number | null;
  meanPositionSize: number | null;
  positionSizeP90: number | null;
  medianRiskPerTrade: number | null;
  medianHoldingMinutes: number | null;
  medianHoldingWinnersMin: number | null;
  medianHoldingLosersMin: number | null;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  payoffRatio: number | null;
  expectancy: number | null;
  maxDrawdown: number | null;
  avgMfe: number | null;
  avgMae: number | null;
  medianEntryScore: number | null;
  stopAdherencePct: number | null;
  plannedSharePct: number | null;
  medianSessionPl: number | null;
  sessions: number;
  byWindow: WindowStat[];
  byOrigin: SegmentStat[];
  byStrategy: SegmentStat[];
  bySetup: SegmentStat[];
  byRegime: SegmentStat[];
  bySymbol: SegmentStat[];
  byDayOfWeek: SegmentStat[];
  byDte: SegmentStat[];
  afterWin: SequenceStat;
  afterLoss: SequenceStat;
  model_version: string;
}

export interface SequenceStat {
  label: string;
  sample: number;
  medianNextSize: number | null;
  medianMinutesToNext: number | null;
  medianNextScore: number | null;
  nextExpectancy: number | null;
  nextWinRate: number | null;
}

export interface SessionSummary {
  sessionDate: string;
  trades: TradeRecord[];
  closedCount: number;
  realizedPl: number;
  highWaterPl: number;
  highWaterAt: string | null;
  finalPl: number;
  giveback: number;
  givebackPct: number | null;
  tradesAfterHighWater: number;
  plAfterHighWater: number;
  avgSize: number | null;
  avgScore: number | null;
  plannedCount: number;
  unplannedCount: number;
  rapidReentries: number;
  originBreakdown: { origin: string; count: number; pl: number }[];
  bestProcessTrade: TradeRecord | null;
  worstProcessTrade: TradeRecord | null;
  bestOutcomeTrade: TradeRecord | null;
  worstOutcomeTrade: TradeRecord | null;
}

export type ProcessOutcomeQuadrant =
  | 'GOOD PROCESS + GOOD OUTCOME'
  | 'GOOD PROCESS + BAD OUTCOME'
  | 'BAD PROCESS + GOOD OUTCOME'
  | 'BAD PROCESS + BAD OUTCOME';

export interface AdherenceResult {
  score: number;
  components: { key: string; label: string; earned: number; possible: number; note: string }[];
  deviations: { type: PlanDeviationType; label: string; detail: string }[];
  quadrant: ProcessOutcomeQuadrant | null;
  quadrantNote: string | null;
  model_version: string;
}

export interface LitStudy {
  id: number;
  study_key: string;
  title: string;
  authors: string;
  year: number;
  source: string;
  doi: string | null;
  doi_status: string;
  evidence_type: string;
  population_studied: string;
  known_limitations: string;
  finding_summary: string;
}

export interface LitConstruct {
  id: number;
  construct_key: string;
  name: string;
  plain_definition: string;
  matador_operationalization: string;
  variables_required: string;
  min_sample: number;
  confidence_requirement: string;
  evidence_grade: string;
  known_limitations: string | null;
  layer: string;
}

export interface LitLink {
  construct_key: string;
  study_key: string;
  relation: string;
  note: string | null;
}
