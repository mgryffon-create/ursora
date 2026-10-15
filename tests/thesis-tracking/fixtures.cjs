const thesis = { id: 'thesis-1', ownerId: '00000000-0000-4000-8000-000000000001', tradeId: 'episode-1', symbol: 'AAPL', marketSymbol: 'AAPL', direction: 'bullish', setup: 'breakout', enteredAt: '2026-10-14T14:00:00Z', evidenceKnownAt: '2026-10-14T13:59:59Z', entryUnderlyingPrice: 100, horizonSeconds: 300, supportBoundary: 99, invalidation: { price: 95, basis: 'completed_close' }, evidenceIds: ['entry-evidence-1'], modelVersion: 'fixture-only' };
// Synthetic parameters for behavior tests, not literature-derived production thresholds.
const policy = { version: 'fixture-only', validation: 'unvalidated', mode: 'offline_replay', maxDataAgeSeconds: 90, maxGapSeconds: 90, weakenAfterBars: 2, recoverAfterBars: 2, recoveryRatio: .5, weakenRatio: 1, maxSpreadBps: 20, minBaselineSamples: 5, scheduledEventBufferSeconds: 120 };
const baseline = { id: 'baseline-1', symbol: 'AAPL', sessionBucket: 'morning', regime: 'ordinary', horizonSeconds: 300, trainedThrough: '2026-10-13T20:00:00Z', availableAt: '2026-10-14T13:00:00Z', sampleCount: 30, expectedPullbackPct: 1, policyVersion: policy.version };
function bar(minute, close = 100, overrides = {}) {
  return { id: `bar-${minute}`, provider: 'synthetic', symbol: 'AAPL', barStart: new Date(Date.UTC(2026, 9, 14, 14, minute - 1)).toISOString(), eventAt: new Date(Date.UTC(2026, 9, 14, 14, minute)).toISOString(), receivedAt: new Date(Date.UTC(2026, 9, 14, 14, minute, 1)).toISOString(), complete: true, open: close, high: close + .1, low: close - .1, close, volume: 1000, spreadBps: 2, quality: 'valid', ...overrides };
}
const contextAt = () => ({ sessionBucket: 'morning', regime: 'ordinary', contextKnownAt: '2026-10-14T13:59:59Z' });
module.exports = { thesis, policy, baseline, bar, contextAt };
