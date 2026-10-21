export type Direction = 'bullish' | 'bearish';
export type ThesisState = 'supported' | 'watch' | 'weakening' | 'invalidated';
export type DataState = 'ready' | 'insufficient' | 'stale' | 'rejected';
export type EventState = 'ordinary' | 'scheduled_event' | 'event_unresolved';
export type ExecutionRisk = 'unknown' | 'normal' | 'elevated' | 'limit_breached';

export interface EntryThesis {
  readonly id: string;
  readonly ownerId: string;
  readonly tradeId: string;
  readonly symbol: string;
  readonly marketSymbol: string;
  readonly direction: Direction;
  readonly setup: string;
  readonly enteredAt: string;
  readonly evidenceKnownAt: string;
  readonly entryUnderlyingPrice: number;
  readonly horizonSeconds: number;
  readonly supportBoundary: number;
  readonly invalidation: { readonly price: number; readonly basis: 'touch' | 'completed_close' };
  readonly evidenceIds: readonly string[];
  readonly modelVersion: string;
}

export interface ResearchPolicy {
  readonly version: string;
  readonly validation: 'unvalidated';
  readonly mode: 'offline_replay';
  readonly maxDataAgeSeconds: number;
  readonly maxGapSeconds: number;
  readonly weakenAfterBars: number;
  readonly recoverAfterBars: number;
  readonly recoveryRatio: number;
  readonly weakenRatio: number;
  readonly maxSpreadBps: number;
  readonly minBaselineSamples: number;
  readonly scheduledEventBufferSeconds: number;
}

export interface MarketObservation {
  readonly id: string;
  readonly provider: string;
  readonly symbol: string;
  readonly barStart: string;
  readonly eventAt: string; // Bar end / observation timestamp, never bar start masquerading as end.
  readonly receivedAt: string;
  readonly complete: boolean;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
  readonly spreadBps: number | null;
  readonly quality: 'valid' | 'suspect';
}

export interface NewsEvent {
  readonly id: string;
  readonly symbols: readonly string[];
  readonly scheduledFor: string | null;
  readonly publishedAt: string | null;
  readonly receivedAt: string;
  readonly verified: boolean;
  readonly material: boolean;
  readonly resolvedAt: string | null;
}

export interface Baseline {
  readonly id: string;
  readonly symbol: string;
  readonly sessionBucket: string;
  readonly regime: string;
  readonly horizonSeconds: number;
  readonly trainedThrough: string;
  readonly availableAt: string;
  readonly sampleCount: number;
  readonly expectedPullbackPct: number;
  readonly policyVersion: string;
}

export interface MonitorState {
  readonly ownerId: string;
  readonly thesisId: string;
  readonly policyVersion: string;
  readonly thesisState: ThesisState;
  readonly favorableExtreme: number;
  readonly adverseBars: number;
  readonly recoveryBars: number;
  readonly lastEventAt: string | null;
  readonly lastObservationId: string | null;
}

export interface Evaluation {
  readonly id: string;
  readonly thesisId: string;
  readonly observationId: string;
  readonly policyVersion: string;
  readonly baselineId: string | null;
  readonly asOf: string;
  readonly dataState: DataState;
  readonly eventState: EventState;
  readonly executionRisk: ExecutionRisk;
  readonly normalizedPullback: number | null;
  readonly reasons: readonly string[];
  readonly next: MonitorState;
  readonly transition: { readonly from: ThesisState; readonly to: ThesisState } | null;
  readonly riskBreach: boolean;
  readonly notificationsEnabled: false;
}
