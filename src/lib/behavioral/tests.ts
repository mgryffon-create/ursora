/**
 * URSORA — BEHAVIOURAL ENGINE TEST HARNESS (PHASE M).
 *
 * Pure assertions over the deterministic engines using the synthetic profiles.
 * Runs in-browser from the admin Research inspector so results are visible to
 * the owner rather than hidden in a CI log. No network, no database, no LLM.
 */

import { generateProfile, PROFILES, type ProfileKey } from '@/lib/behavioral/synthetic';
import {
  assessAdherence, assessBehavioralRisk, buildBaseline, computeTraderIntelligence,
  frequencyObservation, groupSessions, highWaterFinding, rapidReentryObservation,
  sequenceFinding, sizeObservation, summariseSession,
} from '@/lib/behavioral/engine';
import { MODEL_VERSION, SESSION_WINDOWS, confidenceFor } from '@/lib/behavioral/config';
import type { Observation, TradeRecord } from '@/lib/behavioral/types';

export interface TestResult {
  name: string;
  group: string;
  passed: boolean;
  detail: string;
}

const ok = (name: string, group: string, condition: boolean, detail: string): TestResult => ({
  name, group, passed: condition, detail,
});

export function runBehavioralTests(): TestResult[] {
  const r: TestResult[] = [];
  const cache = new Map<ProfileKey, TradeRecord[]>();
  const trades = (k: ProfileKey) => {
    if (!cache.has(k)) cache.set(k, generateProfile(k));
    return cache.get(k) as TradeRecord[];
  };

  /* ---------------------------- baseline engine ---------------------------- */
  const bA = buildBaseline(trades('A'));
  r.push(ok('Baseline computes a median position size', 'Baseline', bA.medianPositionSize !== null && bA.medianPositionSize > 0,
    `median position size = ${bA.medianPositionSize}`));
  r.push(ok('Baseline counts sessions and trades separately', 'Baseline', bA.sessions > 0 && bA.sampleSize > bA.sessions,
    `${bA.sampleSize} trades across ${bA.sessions} sessions`));
  r.push(ok('Baseline expectancy is derived from closed trades only', 'Baseline', bA.closedSample > 0 && bA.expectancy !== null,
    `${bA.closedSample} closed trades, expectancy ${bA.expectancy}`));
  r.push(ok('Baseline segments by every session window', 'Baseline', bA.byWindow.length === SESSION_WINDOWS.length,
    `${bA.byWindow.length} windows produced`));
  r.push(ok('Baseline carries its model version', 'Baseline', bA.model_version === MODEL_VERSION, bA.model_version));

  /* --------------------------- sample thresholds --------------------------- */
  r.push(ok('0 observations → INSUFFICIENT DATA', 'Sample thresholds', confidenceFor(0) === 'INSUFFICIENT DATA', confidenceFor(0)));
  r.push(ok('8 observations → EARLY SIGNAL', 'Sample thresholds', confidenceFor(8) === 'EARLY SIGNAL', confidenceFor(8)));
  r.push(ok('20 observations → EMERGING PATTERN', 'Sample thresholds', confidenceFor(20) === 'EMERGING PATTERN', confidenceFor(20)));
  r.push(ok('35 observations → ESTABLISHED PERSONAL PATTERN', 'Sample thresholds', confidenceFor(35) === 'ESTABLISHED PERSONAL PATTERN', confidenceFor(35)));
  r.push(ok('80 observations → HIGH-CONFIDENCE PERSONAL PATTERN', 'Sample thresholds', confidenceFor(80) === 'HIGH-CONFIDENCE PERSONAL PATTERN', confidenceFor(80)));

  /* -------------------------- new user isolation --------------------------- */
  const newUser = computeTraderIntelligence(trades('NEW'));
  r.push(ok('New user produces no personalised claims', 'New user', !newUser.hasEnoughData && newUser.patterns.length === 0 && newUser.observations.length === 0,
    `${newUser.patterns.length} patterns, ${newUser.observations.length} observations`));
  r.push(ok('New user behavioural risk is LOW with an explicit note', 'New user', newUser.risk.band === 'LOW' && newUser.risk.factors.length === 0,
    newUser.risk.note.slice(0, 60)));

  /* --------------------------- size deviation (C) -------------------------- */
  const bC = buildBaseline(trades('C'));
  const seqC = sequenceFinding(bC, 'win');
  r.push(ok('Profile C: post-win size exceeds baseline', 'Size escalation', seqC !== null && (seqC.deviation_pct ?? 0) > 25,
    seqC ? `deviation ${seqC.deviation_pct}% on ${seqC.sample} pairs` : 'no finding produced'));
  const bigC = trades('C').slice().sort((a, b) => (b.position_size ?? 0) - (a.position_size ?? 0))[0];
  const sizeObsC = sizeObservation(bigC, bC, 'STANDARD');
  r.push(ok('Profile C: largest trade raises a size observation', 'Size escalation', sizeObsC !== null,
    sizeObsC?.statement.slice(0, 80) ?? 'none'));

  /* --------------- Profile A must NOT inherit Profile C warnings ------------ */
  const bigA = trades('A').slice().sort((a, b) => (b.position_size ?? 0) - (a.position_size ?? 0))[0];
  const sizeObsA = sizeObservation(bigA, bA, 'STANDARD');
  r.push(ok('Profile A gets no size warning merely because Profile C does', 'User isolation', sizeObsA === null,
    sizeObsA ? `unexpected: ${sizeObsA.statement}` : 'no size observation, as required'));
  const seqA = sequenceFinding(bA, 'win');
  r.push(ok('Profile A post-win sizing is within baseline', 'User isolation', seqA === null || Math.abs(seqA.deviation_pct ?? 0) < 25,
    seqA ? `deviation ${seqA.deviation_pct}%` : 'no finding'));

  /* --------------------------- frequency deviation ------------------------- */
  const bB = buildBaseline(trades('B'));
  const sessB = groupSessions(trades('B'));
  const freq = frequencyObservation(sessB[0], { ...bB, tradesPerSessionMedian: 3, sessions: 12 }, 'STANDARD');
  r.push(ok('Frequency deviation fires above the configured multiple', 'Frequency', freq !== null,
    freq ? `${freq.current_value} vs median ${freq.baseline_value}` : 'no observation'));
  const freqNone = frequencyObservation(sessB[0], { ...bB, tradesPerSessionMedian: 20, sessions: 12 }, 'STANDARD');
  r.push(ok('Frequency deviation stays silent within baseline', 'Frequency', freqNone === null, 'silent as required'));

  /* ------------------------ high-water / giveback (B) ---------------------- */
  const hw = highWaterFinding(sessB);
  r.push(ok('Profile B: session high-water giveback is detected', 'High-water giveback', hw !== null && (hw.deviation_pct ?? 0) > 50,
    hw ? `${hw.deviation_pct}% of ${hw.sample_size} sessions reduced the final result` : 'no finding'));
  const sumB = summariseSession(sessB[0].sessionDate, sessB[0].trades);
  r.push(ok('Session summary records a high-water mark and giveback', 'High-water giveback', sumB.highWaterPl >= sumB.finalPl,
    `high ${sumB.highWaterPl}, final ${sumB.finalPl}, giveback ${sumB.giveback}`));

  /* ------------------------------ post-loss (D) ---------------------------- */
  const bD = buildBaseline(trades('D'));
  r.push(ok('Profile D: median gap after a loss is shorter than after a win', 'Post-win / post-loss',
    (bD.afterLoss.medianMinutesToNext ?? 999) < (bD.afterWin.medianMinutesToNext ?? 0),
    `after loss ${bD.afterLoss.medianMinutesToNext}m vs after win ${bD.afterWin.medianMinutesToNext}m`));
  const sessD = groupSessions(trades('D'));
  const rapid = rapidReentryObservation(sessD[0], 'STANDARD');
  r.push(ok('Profile D: rapid re-entry observation is produced', 'Rapid re-entry', rapid !== null,
    rapid ? `${rapid.current_value} rapid entries` : 'no observation'));
  const sessA = groupSessions(trades('A'));
  r.push(ok('Profile A: no rapid re-entry observation', 'Rapid re-entry', rapidReentryObservation(sessA[0], 'STANDARD') === null,
    'silent as required'));

  /* ---------------------------- time-of-day split -------------------------- */
  const populated = bB.byWindow.filter((w) => w.trades > 0);
  r.push(ok('Trades are segmented into named session windows', 'Time of day', populated.length >= 2,
    populated.map((w) => `${w.label}:${w.trades}`).join(', ')));

  /* --------------------------- origin classification ----------------------- */
  const bE = buildBaseline(trades('E'));
  const ext = bE.byOrigin.find((o) => o.segment === 'External Trader Signal');
  const spon = bE.byOrigin.find((o) => o.segment === 'Spontaneous');
  r.push(ok('Profile E: expectancy separates by trade origin', 'Trade origin',
    !!ext && !!spon && (ext.expectancy ?? 0) > (spon.expectancy ?? 0),
    ext && spon ? `external ${ext.expectancy} vs spontaneous ${spon.expectancy}` : 'origins not segmented'));
  r.push(ok('Origin segmentation never collapses into one score', 'Trade origin', bE.byOrigin.length >= 2,
    `${bE.byOrigin.length} origin segments`));

  /* -------------------- process adherence + four quadrants ----------------- */
  const planStub = {
    intended_entry_low: 1, intended_entry_high: 100, intended_invalidation: 0.7,
    intended_target: 1.6, intended_position_size: 1000, setup: 'Momentum continuation',
  };
  const goodProcessWin: TradeRecord = { ...trades('A')[0], entry_price: 9, position_size: 900, setup: 'Momentum continuation', realized_pl: 300, result: 'win', was_planned: true };
  const goodProcessLoss: TradeRecord = { ...goodProcessWin, realized_pl: -200, result: 'loss' };
  const badProcessWin: TradeRecord = { ...goodProcessWin, position_size: 4000, setup: 'Mean reversion', was_planned: false };
  const badProcessLoss: TradeRecord = { ...badProcessWin, realized_pl: -400, result: 'loss' };
  const q1 = assessAdherence(goodProcessWin, planStub, []);
  const q2 = assessAdherence(goodProcessLoss, planStub, []);
  const q3 = assessAdherence(badProcessWin, null, []);
  const q4 = assessAdherence(badProcessLoss, null, []);
  r.push(ok('GOOD PROCESS + GOOD OUTCOME classified', 'Process × outcome', q1.quadrant === 'GOOD PROCESS + GOOD OUTCOME', `${q1.score}/100 → ${q1.quadrant}`));
  r.push(ok('GOOD PROCESS + BAD OUTCOME classified', 'Process × outcome', q2.quadrant === 'GOOD PROCESS + BAD OUTCOME', `${q2.score}/100 → ${q2.quadrant}`));
  r.push(ok('BAD PROCESS + GOOD OUTCOME classified', 'Process × outcome', q3.quadrant === 'BAD PROCESS + GOOD OUTCOME', `${q3.score}/100 → ${q3.quadrant}`));
  r.push(ok('BAD PROCESS + BAD OUTCOME classified', 'Process × outcome', q4.quadrant === 'BAD PROCESS + BAD OUTCOME', `${q4.score}/100 → ${q4.quadrant}`));
  r.push(ok('Process adherence excludes profitability', 'Process × outcome', q1.score === q2.score,
    `identical process, opposite outcomes: ${q1.score} vs ${q2.score}`));
  r.push(ok('Missing plan is recorded as a deviation, not assumed compliant', 'Plan deviation',
    q3.deviations.some((d) => d.type === 'no_stored_plan'), q3.deviations.map((d) => d.type).join(', ') || 'none'));

  /* ---------------------- invalidation change deviation -------------------- */
  const withMod = assessAdherence(goodProcessWin, planStub, [{
    id: 1, trade_id: goodProcessWin.id, trade_plan_id: null, modification_type: 'adjust',
    field_changed: 'intended_invalidation', previous_value: '0.70', new_value: '0.40',
    rationale: null, deviation_type: 'invalidation_widened', occurred_at: new Date().toISOString(), engine_version: MODEL_VERSION,
  }]);
  r.push(ok('Widening an invalidation lowers process adherence', 'Plan deviation', withMod.score < q1.score,
    `${q1.score} → ${withMod.score}`));
  r.push(ok('Modification log is reflected as a named deviation', 'Plan deviation',
    withMod.deviations.some((d) => d.type === 'invalidation_widened'), withMod.deviations.map((d) => d.type).join(', ')));

  /* ------------------------- behavioural risk banding ---------------------- */
  const mk = (sev: Observation['severity']): Observation => ({
    observation_type: 't', category: 'sizing', statement: 's', baseline_value: 1, current_value: 2,
    deviation_pct: 100, unit: 'USD', sample_size: 30, observation_period: 'x', confidence_label: 'ESTABLISHED PERSONAL PATTERN',
    construct_key: null, evidence_trade_ids: [], severity: sev, model_version: MODEL_VERSION, formula: 'f',
  });
  r.push(ok('No observations → LOW behavioural risk', 'Behavioural risk', assessBehavioralRisk([]).band === 'LOW', 'LOW'));
  r.push(ok('One moderate observation → MODERATE or below', 'Behavioural risk',
    ['LOW', 'MODERATE'].includes(assessBehavioralRisk([mk('MODERATE')]).band), assessBehavioralRisk([mk('MODERATE')]).band));
  r.push(ok('Multiple high observations → HIGH', 'Behavioural risk',
    assessBehavioralRisk([mk('HIGH'), mk('HIGH'), mk('ELEVATED')]).band === 'HIGH',
    assessBehavioralRisk([mk('HIGH'), mk('HIGH'), mk('ELEVATED')]).band));
  r.push(ok('Disabled categories are excluded from the risk band', 'Behavioural risk',
    assessBehavioralRisk([mk('HIGH'), mk('HIGH')], new Set(['frequency'])).band === 'LOW', 'category filter respected'));

  /* ----------------------------- Profile F silence -------------------------- */
  const fIntel = computeTraderIntelligence(trades('F'));
  const fDirectional = fIntel.patterns.filter((p) => Math.abs(p.deviation_pct ?? 0) > 40 && p.severity !== 'LOW');
  r.push(ok('Profile F yields no strong directional pattern', 'No forced insights', fDirectional.length === 0,
    `${fIntel.patterns.length} patterns recorded, ${fDirectional.length} strong`));
  r.push(ok('Profile F behavioural risk is not inflated', 'No forced insights', ['LOW', 'MODERATE'].includes(fIntel.risk.band),
    fIntel.risk.band));

  /* ------------------------ immutability + versioning ---------------------- */
  const snapshot = JSON.stringify(trades('A').slice(0, 3));
  buildBaseline(trades('A'));
  computeTraderIntelligence(trades('A'));
  r.push(ok('Engines do not mutate their input trades', 'Immutability', JSON.stringify(trades('A').slice(0, 3)) === snapshot,
    'input unchanged after two full passes'));
  r.push(ok('Every produced observation carries a model version', 'Model versioning',
    [...fIntel.patterns, ...fIntel.observations].every((o) => o.model_version === MODEL_VERSION),
    MODEL_VERSION));
  r.push(ok('Every produced observation carries a sample size', 'Model versioning',
    [...fIntel.patterns, ...fIntel.observations].every((o) => typeof o.sample_size === 'number'),
    'all findings sampled'));

  /* ------------------------- literature mapping ---------------------------- */

  const constructRefs = [seqC, hw, rapid].filter(Boolean).map((o) => (o as Observation).construct_key);
  r.push(ok('Findings map to a literature construct key', 'Literature mapping',
    constructRefs.every((k) => typeof k === 'string' && k.length > 0), constructRefs.join(', ')));

  /* ------------------ look-ahead protection for historical runs ------------ */
  const ordered = trades('B').slice().sort((a, b) => new Date(a.entry_at ?? '').getTime() - new Date(b.entry_at ?? '').getTime());
  const cutIndex = Math.floor(ordered.length / 2);
  const partialBaseline = buildBaseline(ordered.slice(0, cutIndex));
  const fullBaseline = buildBaseline(ordered);
  r.push(ok('Historical baseline uses only trades up to the cut-off', 'Look-ahead protection',
    partialBaseline.sampleSize === cutIndex && partialBaseline.sampleSize < fullBaseline.sampleSize,
    `${partialBaseline.sampleSize} of ${fullBaseline.sampleSize} trades used`));

  /* ---------------------------- profile coverage --------------------------- */
  r.push(ok('All seven synthetic profiles generate without error', 'Synthetic data',
    PROFILES.every((p) => Array.isArray(generateProfile(p.key))),
    PROFILES.map((p) => `${p.key}:${generateProfile(p.key).length}`).join(' ')));
  r.push(ok('Every synthetic record is tagged synthetic', 'Synthetic data',
    trades('A').every((t) => t.is_synthetic === true && (t.synthetic_profile ?? '').startsWith('PROFILE_')),
    'is_synthetic true on all records'));

  return r;
}

export const summariseTests = (results: TestResult[]) => ({
  total: results.length,
  passed: results.filter((t) => t.passed).length,
  failed: results.filter((t) => !t.passed).length,
});
