/**
 * URSORA — shared domain types.
 * These mirror the database schema exactly; nothing is invented client-side.
 */

export type Direction = 'bullish' | 'bearish' | 'neutral';
export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Extreme';
export type SourceType =
  | 'Verified News'
  | 'Company Source'
  | 'SEC Filing'
  | 'Analyst Report'
  | 'Market Data'
  | 'Social Sentiment'
  | 'Unverified Discussion';

export interface Ticker {
  symbol: string;
  company: string;
  sector: string | null;
  is_default: boolean;
  priority: number;
}

export interface Quote {
  id: number;
  symbol: string;
  price: number | null;
  change_abs: number | null;
  change_pct: number | null;
  day_open: number | null;
  day_high: number | null;
  day_low: number | null;
  prev_close: number | null;
  prev_day_high: number | null;
  prev_day_low: number | null;
  premarket_price: number | null;
  premarket_change_pct: number | null;
  premarket_high: number | null;
  premarket_low: number | null;
  volume: number | null;
  avg_volume: number | null;
  rel_volume: number | null;
  vwap: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  support: number | null;
  resistance: number | null;
  gap_pct: number | null;
  atr: number | null;
  iv: number | null;
  iv_rank: number | null;
  iv_percentile: number | null;
  iv_change: number | null;
  call_volume: number | null;
  put_volume: number | null;
  put_call_ratio: number | null;
  total_oi: number | null;
  unusual_options_volume: boolean | null;
  momentum_score: number | null;
  trend: string | null;
  source_name: string | null;
  source_type: string | null;
  published_at: string | null;
  retrieved_at: string;
  confidence: number | null;
  is_demo: boolean;
  as_of: string;
}

export interface ScoreFactor {
  factor: string;
  label: string;
  raw_score: number;
  signed_score?: number | null;
  base_weight: number;
  effective_weight: number;
  weight_change: number;
  contribution: number;
  provenance?: 'observed' | 'derived' | 'imputed' | 'unavailable' | string;
  reliability?: number | null;
  source_quality?: number | null;
  strength_band?: 'Insufficient' | 'Weak' | 'Moderate' | 'Strong';
  thesis_vote?: 'ABSTAIN' | 'SUPPORT' | 'OPPOSE';
  effect: 'INCREASED' | 'DECREASED' | 'NEUTRAL';
  explanation: string;
}

export interface Signal {
  id: number;
  run_id: string;
  symbol: string;
  trading_day: string;
  direction: Direction;
  strategy: string;
  confidence_score: number;
  opportunity_score: number;
  risk_level: RiskLevel;
  holding_period: string | null;
  catalyst_summary: string | null;
  no_trade_reason: string | null;
  stock_price_at_generation: number | null;
  suggested_expiration: string | null;
  suggested_strike: number | null;
  break_even: number | null;
  est_premium: number | null;
  max_defined_loss: number | null;
  target_price: number | null;
  invalidation_level: number | null;
  expected_move_pct: number | null;
  score_breakdown: {
    factors?: ScoreFactor[];
    raw?: Record<string, number>;
    thesis_state?: 'Insufficient Evidence' | 'Mixed' | 'Opposed' | 'Rejected' | 'Supported' | 'Strongly Supported';
    evidence_completeness?: number;
    directional_completeness?: number;
    directional_uncertainty?: number;
    evidence_families?: Record<string, boolean>;
    available_families?: number;
    total_families?: number;
    agreement_score?: number | null;
    agreement_family_count?: number;
    support_share?: number | null;
    oppose_share?: number | null;
    strong_supporting_families?: number;
    strong_opposing_families?: number;
    thesis_hierarchy?: {
      primary?: { factor: string; band: string; vote: string };
      confirmation?: { state: string; supporting_families: string[]; opposing_families: string[] };
      context?: { state: string; supporting_families: string[]; opposing_families: string[] };
      auxiliary?: { options_vote: string; note: string };
    };
    interaction_flags?: Array<{
      key: string;
      role: string;
      state: string;
      label: string;
      detail: string;
    }>;
    blockers?: string[];
    thesis_blockers?: string[];
    trade_blockers?: string[];
    trade_eligible?: boolean;
    suggestion_eligible?: boolean;
    thesis_support?: number;
  };
  weights: {
    effective?: Record<string, number>;
    base?: Record<string, number>;
    decisions?: string[];
  };
  regime: string | null;
  regime_explanation: string | null;
  engine_version: string;
  is_demo: boolean;
  generated_at: string;
}

export interface TraderProfile {
  user_id: string;
  brokerages: string[];
  trading_styles: string[];
  trade_types: string[];
  primary_goals: string[];
  profit_target_type: 'none' | 'per_trade_dollar' | 'per_trade_percent' | 'weekly_dollar' | 'monthly_dollar';
  profit_target_value: number | null;
  risk_comfort: 'conservative' | 'moderate' | 'aggressive';
  max_loss_type: 'none' | 'dollar' | 'percent';
  max_loss_value: number | null;
  ursora_goals: string[];
  self_reported_habits: string[];
  created_at?: string;
  updated_at?: string;
}

export interface SnapTradeAccount {
  id: string;
  user_id: string;
  connection_id: string | null;
  institution_name: string | null;
  name: string | null;
  masked_number: string | null;
  account_category: string | null;
  raw_type: string | null;
  status: string | null;
  is_paper: boolean;
  total_value: number | null;
  total_value_currency: string | null;
  transactions_initial_sync_completed: boolean | null;
  transactions_last_successful_sync: string | null;
  holdings_initial_sync_completed: boolean | null;
  holdings_last_successful_sync: string | null;
  holdings_unavailable: boolean | null;
  synced_at: string;
}

export interface ActiveAnalysis {
  user_id: string;
  symbol: string;
  signal_id: number;
  status: string;
  direction: Direction;
  holding_period: string | null;
  analyzed_at: string;
  valid_until: string | null;
  suggested_expiration: string | null;
  target_price: number | null;
  invalidation_level: number | null;
  opportunity_score: number | null;
  confidence_score: number | null;
  updated_at: string;
}

export interface ContractCandidate {
  id: number;
  signal_id: number;
  profile: 'Aggressive' | 'Balanced' | 'Conservative';
  rank: number;
  symbol: string;
  option_type: string;
  strike: number;
  expiration: string;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  spread_pct: number | null;
  liquidity_score: number | null;
  selection_score: number | null;
  break_even: number | null;
  est_premium: number | null;
  max_loss: number | null;
  target_value: number | null;
  prob_thesis_pct: number | null;
  tradeoff: string | null;
  flags: string[];
}

export interface RiskAssessment {
  id: number;
  signal_id: number;
  bull_case: string | null;
  base_case: string | null;
  bear_case: string | null;
  premium_at_risk: number | null;
  break_even: number | null;
  theta_per_day: number | null;
  iv_risk: string | null;
  liquidity_risk: string | null;
  catalyst_risk: string | null;
  expected_move_pct: number | null;
  time_remaining: string | null;
  invalidation_level: number | null;
  why_it_could_fail: string[];
}

export interface NewsItem {
  id: number;
  symbol: string | null;
  headline: string;
  summary: string | null;
  category: string | null;
  url: string | null;
  source_name: string;
  source_type: SourceType;
  sentiment: 'bullish' | 'bearish' | 'neutral' | null;
  sentiment_score: number | null;
  impact: 'low' | 'medium' | 'high' | 'critical' | null;
  recency_weight: number | null;
  confidence: number | null;
  published_at: string;
  retrieved_at: string;
  is_demo: boolean;
}

export interface Filing {
  id: number;
  symbol: string | null;
  form_type: string;
  title: string | null;
  summary: string | null;
  url: string | null;
  source_name: string;
  source_type: SourceType;
  filed_at: string;
  retrieved_at: string;
  confidence: number | null;
}

export interface TranscriptStatement {
  id: number;
  symbol: string;
  speaker: string;
  speaker_role: string | null;
  event_name: string | null;
  quote: string;
  why_it_matters: string | null;
  market_impact: string | null;
  source_name: string;
  source_type: SourceType;
  source_url: string | null;
  said_at: string;
  retrieved_at: string;
  confidence: number | null;
}

export interface SentimentReading {
  id: number;
  symbol: string;
  cohort: 'retail' | 'professional';
  label: string;
  score: number | null;
  mention_volume: number | null;
  sources: string[];
  note: string | null;
  source_type: SourceType;
  as_of: string;
  retrieved_at: string;
  confidence: number | null;
}

export interface MarketSnapshot {
  id: number;
  as_of: string;
  regime: 'Risk-On' | 'Risk-Off' | 'Mixed';
  regime_note: string | null;
  spy_price: number | null;
  spy_change_pct: number | null;
  spy_trend: string | null;
  qqq_price: number | null;
  qqq_change_pct: number | null;
  qqq_trend: string | null;
  iwm_price: number | null;
  iwm_change_pct: number | null;
  vix: number | null;
  vix_change_pct: number | null;
  dxy: number | null;
  us10y: number | null;
  us02y: number | null;
  wti: number | null;
  gold: number | null;
  breadth_advancers: number | null;
  breadth_decliners: number | null;
  breadth_note: string | null;
  sector_performance: { sector: string; change_pct: number }[] | null;
  macro_note: string | null;
  market_status: string | null;
  retrieved_at: string;
  is_demo: boolean;
}

export interface MarketMover {
  id: number;
  symbol: string;
  company: string | null;
  kind: 'gainer' | 'loser' | 'rel_volume' | 'unusual_options';
  value: number | null;
  detail: string | null;
  as_of: string;
  source_name: string | null;
}

export interface EconomicEvent {
  id: number;
  title: string;
  category: string;
  event_time: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  affected_symbols: string[];
  detail: string | null;
  source_name: string;
  source_type: SourceType;
  source_url: string | null;
  retrieved_at: string;
}

export interface EarningsEvent {
  id: number;
  symbol: string;
  report_time: string;
  session: string | null;
  confirmed: boolean | null;
  eps_estimate: number | null;
  revenue_estimate: string | null;
  expected_move_pct: number | null;
  source_name: string;
  source_url: string | null;
}

export interface SignalUpdate {
  id: number;
  symbol: string;
  signal_id: number | null;
  prev_direction: string | null;
  prev_score: number | null;
  new_direction: string | null;
  new_score: number | null;
  reason: string;
  materiality: string | null;
  created_at: string;
}

export interface FeedEvent {
  id: number;
  symbol: string | null;
  category: string;
  message: string;
  source_name: string;
  source_type: SourceType;
  source_url: string | null;
  severity: string | null;
  event_time: string;
}


export interface PaperTrade {
  id: number;
  signal_id: number | null;
  symbol: string;
  direction: string | null;
  strategy: string | null;
  option_type: string | null;
  strike: number | null;
  expiration: string | null;
  confidence_score: number | null;
  opportunity_score: number | null;
  risk_level: string | null;
  regime: string | null;
  signal_timestamp: string | null;
  stock_price_at_generation: number | null;
  contract_price_at_generation: number | null;
  contracts: number;
  entry_assumptions: string | null;
  max_favorable_excursion: number | null;
  max_adverse_excursion: number | null;
  closing_price: number | null;
  result: 'open' | 'win' | 'loss' | 'scratch';
  return_pct: number | null;
  closed_at: string | null;
  origin?: string | null;
  thesis_mode?: 'monitoring' | 'review' | null;
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

export interface ProviderConfig {
  id: number;
  provider_key: string;
  interface_name: string;
  display_name: string;
  adapter: string;
  mode: 'demo' | 'connected' | 'error';
  supplies: string[];
  candidate_providers: string[];
  secret_env_name: string | null;
  docs_url: string | null;
  notes: string | null;
  last_sync: string | null;
  last_error: string | null;
}

export interface AnalysisRun {
  id: number;
  run_id: string;
  kind: string;
  trading_day: string;
  signals_generated: number;
  updates_emitted: number;
  feed_events: number;
  regime: string | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface Bar {
  bar_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChatMessage {
  id: number;
  thread: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context_used: Record<string, unknown> | null;
  symbol: string | null;
  created_at: string;
}
