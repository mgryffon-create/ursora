import type { Baseline, EntryThesis, Evaluation, MarketObservation, MonitorState, NewsEvent, ResearchPolicy } from './types';

export const capabilities = Object.freeze({ liveEnabled: false, notificationsEnabled: false, ordersEnabled: false });
export const timestamp = (value: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp: ${value}`);
  return parsed;
};
const positive = (value: number) => Number.isFinite(value) && value > 0;

export function freezeThesis(input: EntryThesis): EntryThesis {
  if (![input.id, input.ownerId, input.tradeId, input.symbol, input.marketSymbol, input.setup, input.modelVersion].every((v) => typeof v === 'string' && v.length > 0)) throw new Error('Thesis identity and provenance are required.');
  if (!['bullish', 'bearish'].includes(input.direction) || !['touch', 'completed_close'].includes(input.invalidation.basis)) throw new Error('Invalid thesis direction or invalidation basis.');
  if (![input.entryUnderlyingPrice, input.supportBoundary, input.invalidation.price, input.horizonSeconds].every(positive)) throw new Error('Thesis prices and horizon must be positive.');
  if (timestamp(input.evidenceKnownAt) > timestamp(input.enteredAt)) throw new Error('Entry evidence cannot arrive after entry.');
  if (input.direction === 'bullish' ? input.invalidation.price >= input.entryUnderlyingPrice || input.supportBoundary < input.invalidation.price || input.supportBoundary > input.entryUnderlyingPrice : input.invalidation.price <= input.entryUnderlyingPrice || input.supportBoundary > input.invalidation.price || input.supportBoundary < input.entryUnderlyingPrice) throw new Error('Thesis boundaries are inconsistent with its direction.');
  if (!input.evidenceIds.length || !input.evidenceIds.every((id) => typeof id === 'string' && id.length)) throw new Error('Entry evidence IDs are required.');
  return Object.freeze({ ...input, invalidation: Object.freeze({ ...input.invalidation }), evidenceIds: Object.freeze([...input.evidenceIds]) });
}

export function validatePolicy(policy: ResearchPolicy): void {
  if (policy.mode !== 'offline_replay' || policy.validation !== 'unvalidated') throw new Error('Only unvalidated offline research is supported.');
  if (!policy.version || ![policy.maxDataAgeSeconds, policy.maxGapSeconds, policy.weakenRatio, policy.maxSpreadBps].every(positive)) throw new Error('Explicit research parameters are required.');
  if (![policy.weakenAfterBars, policy.recoverAfterBars, policy.minBaselineSamples].every((v) => Number.isSafeInteger(v) && v > 0)) throw new Error('Research sample and persistence counts must be positive integers.');
  if (!Number.isFinite(policy.recoveryRatio) || policy.recoveryRatio < 0 || policy.recoveryRatio >= policy.weakenRatio || !Number.isFinite(policy.scheduledEventBufferSeconds) || policy.scheduledEventBufferSeconds < 0) throw new Error('Recovery and event parameters are invalid.');
}

export function initialState(thesis: EntryThesis, policy: ResearchPolicy): MonitorState {
  freezeThesis(thesis);
  validatePolicy(policy);
  return { ownerId: thesis.ownerId, thesisId: thesis.id, policyVersion: policy.version, thesisState: 'supported', favorableExtreme: thesis.entryUnderlyingPrice, adverseBars: 0, recoveryBars: 0, lastEventAt: null, lastObservationId: null };
}

/** Pure, replay-only candidate evaluator. It opens no sockets and performs no I/O. */
export function evaluate(input: {
  thesis: EntryThesis; previous: MonitorState; observation: MarketObservation;
  baseline: Baseline | null; policy: ResearchPolicy; news: readonly NewsEvent[];
  asOf: string; sessionBucket: string; regime: string; contextKnownAt: string;
}): Evaluation {
  const { thesis, previous, observation: bar, baseline, policy } = input;
  freezeThesis(thesis);
  validatePolicy(policy);
  if (previous.ownerId !== thesis.ownerId || previous.thesisId !== thesis.id || previous.policyVersion !== policy.version) throw new Error('State belongs to a different thesis or policy.');
  if (!['supported', 'watch', 'weakening', 'invalidated'].includes(previous.thesisState) || !positive(previous.favorableExtreme) || ![previous.adverseBars, previous.recoveryBars].every((v) => Number.isSafeInteger(v) && v >= 0)) throw new Error('Invalid monitor state.');
  const now = timestamp(input.asOf), end = timestamp(bar.eventAt), received = timestamp(bar.receivedAt), start = timestamp(bar.barStart);
  const reasons: string[] = [];
  const id = JSON.stringify([thesis.ownerId, thesis.id, policy.version, bar.provider, bar.id]);
  const result: Evaluation = { id, thesisId: thesis.id, observationId: bar.id, policyVersion: policy.version, baselineId: baseline?.id ?? null, asOf: input.asOf, dataState: 'ready', eventState: 'ordinary', executionRisk: 'unknown', normalizedPullback: null, reasons, next: previous, transition: null, riskBreach: false, notificationsEnabled: false };
  const reject = (reason: string, dataState: Evaluation['dataState'] = 'rejected'): Evaluation => ({ ...result, dataState, reasons: [reason] });
  if (timestamp(input.contextKnownAt) > now) return reject('context_not_yet_available');
  if (bar.symbol !== thesis.marketSymbol) return reject('wrong_instrument');
  if (end > now || received > now) return reject('not_yet_available');
  if (end < timestamp(thesis.enteredAt)) return reject('before_entry');
  if (!bar.id || !bar.provider || start > end || ![bar.open, bar.high, bar.low, bar.close].every(positive) || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high) || (bar.volume !== null && (!Number.isFinite(bar.volume) || bar.volume < 0)) || (bar.spreadBps !== null && (!Number.isFinite(bar.spreadBps) || bar.spreadBps < 0)) || bar.quality !== 'valid') return reject('invalid_or_suspect_market_data');
  if (bar.id === previous.lastObservationId || (previous.lastEventAt && end <= timestamp(previous.lastEventAt))) return reject('duplicate_or_out_of_order');
  if ((now - end) / 1000 > policy.maxDataAgeSeconds) return reject('stale_market_data', 'stale');

  // News cannot influence the replay before it was actually received.
  const visibleNews = input.news.filter((event) => timestamp(event.receivedAt) <= now && (event.publishedAt === null || timestamp(event.publishedAt) <= now) && event.symbols.includes(thesis.marketSymbol));
  const unresolved = visibleNews.some((event) => event.verified && event.material && event.publishedAt !== null && (event.resolvedAt === null || timestamp(event.resolvedAt) > now));
  const scheduled = visibleNews.some((event) => event.scheduledFor !== null && Math.abs(timestamp(event.scheduledFor) - now) / 1000 <= policy.scheduledEventBufferSeconds);
  const eventState: Evaluation['eventState'] = unresolved ? 'event_unresolved' : scheduled ? 'scheduled_event' : 'ordinary';
  const executionRisk = bar.spreadBps === null ? 'unknown' : bar.spreadBps > policy.maxSpreadBps ? 'elevated' : 'normal';
  const bullish = thesis.direction === 'bullish';
  // A bar spanning the entry cannot establish that its pre-entry wick happened after entry.
  const fullyAfterEntry = start >= timestamp(thesis.enteredAt);
  const observedPrice = thesis.invalidation.basis === 'touch' && fullyAfterEntry ? (bullish ? bar.low : bar.high) : bar.close;
  const crossed = bullish ? observedPrice <= thesis.invalidation.price : observedPrice >= thesis.invalidation.price;
  const riskBreach = crossed && (thesis.invalidation.basis === 'touch' || bar.complete);
  const gap = previous.lastEventAt !== null && (end - timestamp(previous.lastEventAt)) / 1000 > policy.maxGapSeconds;
  const favorableExtreme = bullish ? Math.max(previous.favorableExtreme, bar.close) : Math.min(previous.favorableExtreme, bar.close);
  const next = { ...previous, favorableExtreme, lastEventAt: bar.eventAt, lastObservationId: bar.id, adverseBars: gap ? 0 : previous.adverseBars, recoveryBars: gap ? 0 : previous.recoveryBars };
  const finish = (overrides: Partial<Evaluation> = {}): Evaluation => ({ ...result, eventState, executionRisk, next, ...overrides, transition: next.thesisState === previous.thesisState ? null : { from: previous.thesisState, to: next.thesisState }, reasons });
  if (previous.thesisState === 'invalidated') { reasons.push('invalidation_is_terminal'); return finish({ riskBreach }); }
  if (riskBreach) {
    next.thesisState = 'invalidated'; next.adverseBars = 0; next.recoveryBars = 0;
    reasons.push('frozen_invalidation_condition_met');
    return finish({ riskBreach: true, executionRisk: 'limit_breached' });
  }
  if (!bar.complete) {
    reasons.push('partial_bar_no_thesis_transition');
    // Partial revisions must not consume the completed-bar identity or persistence clock.
    return { ...finish(), next: previous, transition: null };
  }
  const baselineReady = baseline && baseline.symbol === thesis.marketSymbol && baseline.policyVersion === policy.version && baseline.horizonSeconds === thesis.horizonSeconds && baseline.sessionBucket === input.sessionBucket && baseline.regime === input.regime && timestamp(baseline.trainedThrough) < end && timestamp(baseline.availableAt) <= now && Number.isSafeInteger(baseline.sampleCount) && baseline.sampleCount >= policy.minBaselineSamples && positive(baseline.expectedPullbackPct);
  if (!baselineReady || eventState !== 'ordinary') {
    next.adverseBars = 0; next.recoveryBars = 0;
    reasons.push(!baselineReady ? 'baseline_unavailable_or_incompatible' : 'event_requires_separate_assessment');
    return finish({ dataState: baselineReady ? 'ready' : 'insufficient' });
  }
  const pullback = Math.max(0, bullish ? (favorableExtreme - bar.close) / favorableExtreme : (bar.close - favorableExtreme) / favorableExtreme) * 100;
  const ratio = pullback / baseline.expectedPullbackPct;
  const structureBroken = bullish ? bar.close < thesis.supportBoundary : bar.close > thesis.supportBoundary;
  if (gap) reasons.push('gap_reset_persistence');
  if (structureBroken && ratio >= policy.weakenRatio) {
    next.adverseBars++; next.recoveryBars = 0;
    next.thesisState = next.adverseBars >= policy.weakenAfterBars ? 'weakening' : previous.thesisState === 'weakening' ? 'weakening' : 'watch';
    reasons.push('structure_and_normalized_pullback_deteriorated');
  } else if (!structureBroken && ratio <= policy.recoveryRatio) {
    next.adverseBars = 0; next.recoveryBars++;
    if (next.recoveryBars >= policy.recoverAfterBars) next.thesisState = 'supported';
    reasons.push('structure_reclaimed_with_recovery_evidence');
  } else {
    next.adverseBars = 0; next.recoveryBars = 0;
    reasons.push('inconclusive_no_state_flip');
  }
  return finish({ normalizedPullback: ratio });
}
