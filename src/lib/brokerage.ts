/**
 * Provider-neutral read-only brokerage contract.
 *
 * Brokerage adapters normalize external data into these shapes before anything
 * reaches the TradeCycle engine. Providers may be direct broker APIs,
 * aggregation services, or user-authorized file imports.
 */

export type BrokerageAccessMode = 'read_only';
export type BrokerageConnectionStatus = 'pending' | 'connected' | 'reauthorization_required' | 'error' | 'disconnected';
export type TimestampPrecision = 'exact' | 'minute' | 'date' | 'unknown';

export interface BrokerageConnectionDescriptor {
  providerKey: string;
  displayName: string;
  externalConnectionId: string | null;
  status: BrokerageConnectionStatus;
  accessMode: BrokerageAccessMode;
  authMethod: 'oauth' | 'api_key' | 'aggregator' | 'file_import' | 'unknown';
}

export interface NormalizedBrokerageAccount {
  externalAccountId: string;
  accountName: string | null;
  accountType: string | null;
  accountMask: string | null;
  currency: string | null;
  status: string | null;
}

export interface NormalizedBrokerOrder {
  externalOrderId: string;
  symbol: string | null;
  assetType: string | null;
  optionType: 'CALL' | 'PUT' | null;
  strike: number | null;
  expiration: string | null;
  side: 'buy' | 'sell' | 'short' | 'cover' | null;
  positionEffect: 'open' | 'close' | 'unknown' | null;
  quantity: number | null;
  filledQuantity: number | null;
  averageFillPrice: number | null;
  status: string | null;
  orderType: string | null;
  submittedAt: string | null;
  filledAt: string | null;
  providerUpdatedAt: string | null;
  rawSource?: Record<string, unknown>;
}

export interface NormalizedBrokerActivity {
  externalActivityId: string | null;
  activityType: string;
  symbol: string | null;
  assetType: string | null;
  optionType: 'CALL' | 'PUT' | null;
  strike: number | null;
  expiration: string | null;
  side: 'buy' | 'sell' | 'short' | 'cover' | null;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fee: number | null;
  currency: string | null;
  occurredAt: string | null;
  occurredDate: string | null;
  timestampPrecision: TimestampPrecision;
  rawSource?: Record<string, unknown>;
}

export interface NormalizedPositionSnapshot {
  symbol: string;
  assetType: string | null;
  optionType: 'CALL' | 'PUT' | null;
  strike: number | null;
  expiration: string | null;
  quantity: number | null;
  averageCost: number | null;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedPl: number | null;
  capturedAt: string;
}

export interface BrokerageReadAdapter {
  readonly providerKey: string;
  readonly displayName: string;

  listAccounts(): Promise<NormalizedBrokerageAccount[]>;
  listPositions(externalAccountId: string): Promise<NormalizedPositionSnapshot[]>;
  listOrders(externalAccountId: string, since?: string): Promise<NormalizedBrokerOrder[]>;
  listActivities(externalAccountId: string, startDate?: string, endDate?: string): Promise<NormalizedBrokerActivity[]>;
}

/**
 * URSORA never infers intratrade behavior from P/L alone.
 *
 * Behavior reconstruction should compare timestamped broker events and position
 * snapshots with TradeCycle thesis events. A provider that only supplies daily
 * transaction dates can still create a completed episode, but cannot support
 * precise claims about how the trader responded to an intraday thesis change.
 */
export interface TradeBehaviorEvidenceQuality {
  orderTimestampPrecision: TimestampPrecision;
  activityTimestampPrecision: TimestampPrecision;
  hasIntradayOrders: boolean;
  hasPositionSnapshots: boolean;
  canInferIntradayResponse: boolean;
}
