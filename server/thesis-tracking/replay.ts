import { evaluate, freezeThesis, initialState, timestamp, validatePolicy } from './engine';
import type { Baseline, EntryThesis, Evaluation, MarketObservation, NewsEvent, ResearchPolicy } from './types';

export interface ReplayInput {
  readonly runId: string;
  readonly mode: 'offline_replay';
  readonly thesis: EntryThesis;
  readonly policy: ResearchPolicy;
  readonly observations: readonly MarketObservation[];
  readonly news: readonly NewsEvent[];
  readonly baselines: readonly Baseline[];
  readonly contextAt: (at: string) => { sessionBucket: string; regime: string; contextKnownAt: string };
}

export interface ReplayReport {
  readonly runId: string;
  readonly thesis: EntryThesis;
  readonly policy: ResearchPolicy;
  readonly evaluations: readonly Evaluation[];
  readonly inputs: {
    readonly observations: readonly MarketObservation[];
    readonly news: readonly NewsEvent[];
    readonly baselines: readonly Baseline[];
    readonly contexts: readonly { sessionBucket: string; regime: string; contextKnownAt: string }[];
  };
  readonly summary: { observations: number; transitions: number; rejected: number; insufficient: number; riskBreaches: number };
  readonly liveEnabled: false;
  readonly notificationsEnabled: false;
}

export function runReplay(input: ReplayInput): ReplayReport {
  if (input.mode !== 'offline_replay' || !input.runId) throw new Error('A named offline replay is required; live execution is disabled.');
  const policy = Object.freeze({ ...input.policy });
  validatePolicy(policy);
  const thesis = freezeThesis(input.thesis);
  let previous = initialState(thesis, policy);
  const evaluations: Evaluation[] = [];
  const contexts: { sessionBucket: string; regime: string; contextKnownAt: string }[] = [];
  // Preserve arrival order. Sorting by market time would conceal delayed/out-of-order messages.
  const ordered = input.observations.map((bar, index) => ({ bar, index })).sort((a, b) => timestamp(a.bar.receivedAt) - timestamp(b.bar.receivedAt) || a.index - b.index);
  for (const { bar } of ordered) {
    const context = input.contextAt(bar.receivedAt);
    contexts.push({ ...context });
    const baseline = [...input.baselines].filter((candidate) => candidate.symbol === thesis.marketSymbol && candidate.policyVersion === policy.version && candidate.sessionBucket === context.sessionBucket && candidate.regime === context.regime && candidate.horizonSeconds === thesis.horizonSeconds && timestamp(candidate.availableAt) <= timestamp(bar.receivedAt) && timestamp(candidate.trainedThrough) < timestamp(bar.eventAt)).sort((a, b) => timestamp(b.availableAt) - timestamp(a.availableAt))[0] ?? null;
    const evaluation = evaluate({ thesis, policy, previous, observation: bar, baseline, news: input.news, asOf: bar.receivedAt, ...context });
    evaluations.push(evaluation);
    previous = evaluation.next;
  }
  return {
    runId: input.runId, thesis, policy, evaluations,
    inputs: JSON.parse(JSON.stringify({ observations: ordered.map(({ bar }) => bar), news: input.news, baselines: input.baselines, contexts })),
    summary: { observations: evaluations.length, transitions: evaluations.filter((e) => e.transition).length, rejected: evaluations.filter((e) => e.dataState === 'rejected' || e.dataState === 'stale').length, insufficient: evaluations.filter((e) => e.dataState === 'insufficient').length, riskBreaches: evaluations.filter((e) => e.riskBreach && e.transition?.to === 'invalidated').length },
    liveEnabled: false, notificationsEnabled: false,
  };
}

/** Persist a report as a single transaction; a run ID can never overwrite an earlier experiment. */
export interface ReplayRepository {
  saveReport(report: ReplayReport): Promise<'inserted' | 'already_saved'>;
  getReport(ownerId: string, runId: string): Promise<ReplayReport | null>;
}
