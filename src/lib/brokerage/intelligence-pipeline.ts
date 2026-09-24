/**
 * Brokerage -> Trader Intelligence normalization contract.
 *
 * Provider adapters (SnapTrade first) should map external activity into this shape.
 * The behavioral engine consumes canonical trade records rather than provider-specific
 * payloads, which keeps MyURSORA comparisons provider-agnostic.
 */

export interface BrokerageExecutionInput {
  provider: string;
  connection_id: string;
  account_id: string;
  account_label?: string | null;
  brokerage_name?: string | null;
  external_activity_id: string;
  symbol: string;
  asset_type?: string | null;
  option_symbol?: string | null;
  option_type?: string | null;
  strike?: number | null;
  expiration?: string | null;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees?: number | null;
  executed_at: string;
  raw_type?: string | null;
}

export interface BrokerageAccountContextInput {
  provider: string;
  connection_id: string;
  account_id: string;
  account_label?: string | null;
  brokerage_name?: string | null;
  cash?: number | null;
  buying_power?: number | null;
  net_liquidation?: number | null;
  captured_at: string;
}

export interface BrokeragePositionInput {
  provider: string;
  connection_id: string;
  account_id: string;
  symbol: string;
  asset_type?: string | null;
  option_symbol?: string | null;
  quantity: number;
  average_price?: number | null;
  market_value?: number | null;
  unrealized_pl?: number | null;
  captured_at: string;
}

/**
 * Pipeline stages:
 * 1. Provider adapter -> normalized executions/account/positions.
 * 2. Execution matcher -> canonical trade episodes (entry, adds, reductions, exit).
 * 3. Thesis linker -> URSORA signal/plan/origin when a linkage exists.
 * 4. Behavioral engine -> baseline/session/process/pattern observations.
 * 5. MyURSORA context layer -> compares observed behavior with stated preferences/goals.
 *
 * No profile preference is permitted to modify market direction or market evidence.
 */
export const BROKERAGE_INTELLIGENCE_PIPELINE_VERSION = '1.0.0';
