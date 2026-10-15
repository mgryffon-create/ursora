import { timestamp } from './engine';
import type { Baseline } from './types';

export interface HistoricalMovement {
  readonly symbol: string;
  readonly sessionBucket: string;
  readonly regime: string;
  readonly horizonSeconds: number;
  readonly windowEnd: string;
  readonly receivedAt: string;
  readonly pullbackPct: number;
}

/** Exact-cohort empirical baseline. No guessed fallback or automatic threshold tuning. */
export function buildBaseline(input: {
  id: string; symbol: string; sessionBucket: string; regime: string; horizonSeconds: number;
  asOf: string; policyVersion: string; quantile: number; minimumSamples: number;
  samples: readonly HistoricalMovement[];
}): Baseline | null {
  if (!input.id || !input.policyVersion || !Number.isInteger(input.minimumSamples) || input.minimumSamples < 1 || !Number.isFinite(input.quantile) || input.quantile <= 0 || input.quantile >= 1 || !Number.isFinite(input.horizonSeconds) || input.horizonSeconds <= 0) throw new Error('Explicit valid baseline research settings are required.');
  const cutoff = timestamp(input.asOf);
  const rows = input.samples.filter((row) => row.symbol === input.symbol && row.sessionBucket === input.sessionBucket && row.regime === input.regime && row.horizonSeconds === input.horizonSeconds && timestamp(row.windowEnd) < cutoff && timestamp(row.receivedAt) <= cutoff && Number.isFinite(row.pullbackPct) && row.pullbackPct >= 0);
  // Duplicate and overlapping windows would falsely inflate the sample count.
  const unique = new Map<string, HistoricalMovement>();
  rows.forEach((row) => unique.set(row.windowEnd, row));
  const ordered = [...unique.values()].sort((a, b) => timestamp(a.windowEnd) - timestamp(b.windowEnd));
  const independent: HistoricalMovement[] = [];
  for (const row of ordered) {
    const last = independent[independent.length - 1];
    if (!last || timestamp(row.windowEnd) - timestamp(last.windowEnd) >= input.horizonSeconds * 1000) independent.push(row);
  }
  if (independent.length < input.minimumSamples) return null;
  const values = independent.map((row) => row.pullbackPct).sort((a, b) => a - b);
  const position = (values.length - 1) * input.quantile;
  const lo = Math.floor(position), fraction = position - lo;
  const expected = values[lo] + (values[Math.min(lo + 1, values.length - 1)] - values[lo]) * fraction;
  if (!(expected > 0)) return null;
  return Object.freeze({ id: input.id, symbol: input.symbol, sessionBucket: input.sessionBucket, regime: input.regime, horizonSeconds: input.horizonSeconds, trainedThrough: independent[independent.length - 1].windowEnd, availableAt: input.asOf, sampleCount: independent.length, expectedPullbackPct: expected, policyVersion: input.policyVersion });
}
