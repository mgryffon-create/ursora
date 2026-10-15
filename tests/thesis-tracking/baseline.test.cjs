const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildBaseline } = require('./load.cjs')('baseline');
const samples = Array.from({ length: 10 }, (_, i) => ({ symbol: 'AAPL', sessionBucket: 'morning', regime: 'ordinary', horizonSeconds: 300, windowEnd: new Date(Date.UTC(2026, 9, 13, 14, i * 5)).toISOString(), receivedAt: new Date(Date.UTC(2026, 9, 13, 14, i * 5, 1)).toISOString(), pullbackPct: (i + 1) / 10 }));
const settings = { id: 'baseline-1', symbol: 'AAPL', sessionBucket: 'morning', regime: 'ordinary', horizonSeconds: 300, asOf: '2026-10-14T14:00:00Z', policyVersion: 'fixture-only', quantile: .9, minimumSamples: 5, samples };
test('exact-cohort baseline uses only prior available nonoverlapping windows', () => {
  const baseline = buildBaseline(settings);
  assert.equal(baseline.sampleCount, 10); assert(Math.abs(baseline.expectedPullbackPct - .91) < 1e-10);
  assert.equal(baseline.trainedThrough, samples[9].windowEnd);
});
test('future, wrong-cohort, negative and late-received samples cannot contaminate baseline', () => {
  const excluded = [{ ...samples[0], symbol: 'NVDA', pullbackPct: 100 }, { ...samples[0], windowEnd: '2026-10-15T14:00:00Z', pullbackPct: 100 }, { ...samples[0], receivedAt: '2026-10-15T14:00:00Z', pullbackPct: 100 }, { ...samples[0], pullbackPct: -1 }];
  assert.deepEqual(buildBaseline({ ...settings, samples: [...samples, ...excluded] }), buildBaseline(settings));
});
test('duplicates and overlapping windows do not inflate the baseline sample count', () => {
  const overlap = { ...samples[0], windowEnd: '2026-10-13T14:01:00Z' };
  assert.equal(buildBaseline({ ...settings, samples: [...samples, ...samples, overlap] }).sampleCount, 10);
});
test('sparse or zero-variation cohorts remain unavailable rather than using a guessed baseline', () => {
  assert.equal(buildBaseline({ ...settings, samples: samples.slice(0, 2) }), null);
  assert.equal(buildBaseline({ ...settings, samples: samples.map((row) => ({ ...row, pullbackPct: 0 })) }), null);
});
