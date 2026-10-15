const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load.cjs');
const { thesis, policy, baseline, bar, contextAt } = require('./fixtures.cjs');
const { freezeThesis, initialState, evaluate, capabilities } = load('engine');
const { runReplay } = load('replay');
const step = (observation, previous = initialState(thesis, policy), extra = {}) => evaluate({ thesis, previous, observation, policy, baseline, asOf: observation.receivedAt, news: [], ...contextAt(), ...extra });
const replay = (observations, extra = {}) => runReplay({ runId: 'fixture-run', mode: 'offline_replay', thesis, policy, observations, news: [], baselines: [baseline], contextAt, ...extra });

test('entry snapshot is copied and deeply frozen; future entry evidence is refused', () => {
  const original = { ...thesis, invalidation: { ...thesis.invalidation }, evidenceIds: [...thesis.evidenceIds] };
  const frozen = freezeThesis(original); original.invalidation.price = 50; original.evidenceIds.push('later');
  assert.equal(frozen.invalidation.price, 95); assert.equal(frozen.evidenceIds.length, 1); assert(Object.isFrozen(frozen.invalidation));
  assert.throws(() => freezeThesis({ ...thesis, evidenceKnownAt: '2026-10-14T14:01:00Z' }), /after entry/);
});
test('live execution and production policies cannot be enabled', () => {
  assert.equal(capabilities.liveEnabled, false); assert.equal(capabilities.notificationsEnabled, false);
  assert.throws(() => replay([], { mode: 'live' }), /live execution is disabled/);
  assert.throws(() => replay([], { policy: { ...policy, mode: 'live' } }), /offline research/);
});
test('ordinary pullbacks preserve thesis and isolated deterioration does not invalidate', () => {
  assert.equal(step(bar(1, 99.6)).next.thesisState, 'supported');
  const report = replay([bar(1, 98), bar(2, 100), bar(3, 100)]);
  assert.deepEqual(report.evaluations.map((e) => e.next.thesisState), ['watch', 'watch', 'supported']);
});
test('sustained deterioration weakens; recovery requires its own evidence', () => {
  const report = replay([bar(1, 98), bar(2, 98), bar(3, 100), bar(4, 100)]);
  assert.deepEqual(report.evaluations.map((e) => e.next.thesisState), ['watch', 'weakening', 'weakening', 'supported']);
  assert(report.evaluations.every((e) => e.notificationsEnabled === false));
});
test('invalidation overrides missing baseline and news gating and is terminal', () => {
  const first = step(bar(1, 94), undefined, { baseline: null });
  assert.equal(first.next.thesisState, 'invalidated'); assert.equal(first.executionRisk, 'limit_breached');
  assert.equal(step(bar(2, 110), first.next).next.thesisState, 'invalidated');
  assert.equal(thesis.invalidation.price, 95);
});
test('a transient wick does not meet a completed-close invalidation', () => {
  assert.equal(step(bar(1, 100, { low: 94 })).riskBreach, false);
  assert.equal(step(bar(1, 100, { low: 94 }), undefined, { thesis: { ...thesis, invalidation: { price: 95, basis: 'touch' } } }).riskBreach, true);
});
test('a wick in a bar spanning entry cannot be attributed to the post-entry period', () => {
  const t = { ...thesis, enteredAt: '2026-10-14T14:00:30Z', invalidation: { price: 95, basis: 'touch' } };
  assert.equal(step(bar(1, 100, { low: 94 }), initialState(t, policy), { thesis: t }).riskBreach, false);
});
test('partial updates cannot consume the completed-bar decision or persistence clock', () => {
  const partial = step(bar(1, 98, { complete: false }));
  assert.equal(partial.next.lastEventAt, null); assert.equal(partial.next.thesisState, 'supported');
  assert.equal(step(bar(1, 98), partial.next).next.adverseBars, 1);
});
test('suspect, future, wrong-symbol, stale and nonfinite prices do not alter the thesis', () => {
  for (const b of [bar(1, 98, { quality: 'suspect' }), bar(1, 98, { symbol: 'SPY' }), bar(1, NaN)]) assert.equal(step(b).dataState, 'rejected');
  assert.equal(step(bar(1, 98), undefined, { asOf: '2026-10-14T14:00:30Z' }).dataState, 'rejected');
  assert.equal(step(bar(1, 98), undefined, { asOf: '2026-10-14T14:03:00Z' }).dataState, 'stale');
});
test('duplicates and out-of-order messages cannot inflate persistence', () => {
  const first = step(bar(2, 98));
  for (const b of [bar(2, 98), bar(1, 98)]) {
    const result = step(b, first.next);
    assert.equal(result.dataState, 'rejected'); assert.equal(result.next.adverseBars, 1);
  }
});
test('data gaps break consecutive deterioration evidence', () => {
  const first = step(bar(1, 98));
  const second = step(bar(4, 98), first.next);
  assert.equal(second.next.thesisState, 'watch'); assert.equal(second.next.adverseBars, 1);
});
test('incompatible or unavailable baselines cannot manufacture a directional conclusion', () => {
  for (const b of [null, { ...baseline, symbol: 'SPY' }, { ...baseline, sampleCount: 1 }, { ...baseline, expectedPullbackPct: 0 }, { ...baseline, horizonSeconds: 900 }, { ...baseline, trainedThrough: '2026-10-15T00:00:00Z' }]) {
    const result = step(bar(1, 98), undefined, { baseline: b });
    assert.equal(result.dataState, 'insufficient'); assert.equal(result.next.thesisState, 'supported');
  }
});
test('late news is unavailable before receipt; unresolved verified news blocks ordinary transitions', () => {
  const event = { id: 'news-1', symbols: ['AAPL'], scheduledFor: null, publishedAt: '2026-10-14T14:00:00Z', receivedAt: '2026-10-14T14:01:30Z', verified: true, material: true, resolvedAt: null };
  assert.equal(step(bar(1, 98), undefined, { news: [event] }).eventState, 'ordinary');
  const pending = step(bar(2, 98), undefined, { news: [event] });
  assert.equal(pending.eventState, 'event_unresolved'); assert.equal(pending.next.thesisState, 'supported');
  assert.equal(step(bar(2, 94), undefined, { news: [event] }).riskBreach, true);
});
test('scheduled events are visible only if their schedule was already known', () => {
  const event = { id: 'scheduled', symbols: ['AAPL'], scheduledFor: '2026-10-14T14:02:00Z', publishedAt: null, receivedAt: '2026-10-14T13:00:00Z', verified: true, material: true, resolvedAt: null };
  assert.equal(step(bar(1), undefined, { news: [event] }).eventState, 'scheduled_event');
});
test('execution risk can rise without a directional thesis transition; missing spread stays unknown', () => {
  assert.equal(step(bar(1, 100, { spreadBps: 50 })).executionRisk, 'elevated');
  assert.equal(step(bar(1, 100, { spreadBps: null })).executionRisk, 'unknown');
  assert.equal(step(bar(1, 100, { spreadBps: 50 })).next.thesisState, 'supported');
});
test('bearish thresholds and invalidation are symmetric', () => {
  const bearish = { ...thesis, direction: 'bearish', supportBoundary: 101, invalidation: { price: 105, basis: 'completed_close' } };
  const first = step(bar(1, 102), initialState(bearish, policy), { thesis: bearish });
  assert.equal(first.next.thesisState, 'watch');
  assert.equal(step(bar(2, 106), first.next, { thesis: bearish }).next.thesisState, 'invalidated');
});
test('replay preserves arrival order and complete reproducibility inputs', () => {
  const observations = [bar(2), bar(1, 98, { receivedAt: '2026-10-14T14:03:00Z' })];
  const report = replay(observations);
  assert.equal(report.evaluations[1].dataState, 'rejected');
  assert.equal(report.inputs.observations[0].id, 'bar-2'); assert.equal(report.inputs.contexts.length, 2);
  assert.deepEqual(replay(observations), report);
});
test('another owner cannot reuse the same thesis ID or state; future regime context is rejected', () => {
  assert.throws(() => step(bar(1), { ...initialState(thesis, policy), ownerId: 'another-owner' }), /different thesis/);
  assert.equal(step(bar(1), undefined, { contextKnownAt: '2026-10-15T00:00:00Z' }).dataState, 'rejected');
});
