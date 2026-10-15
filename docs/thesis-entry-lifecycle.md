# Thesis ancestry and entry timing

A directionally aligned entry can still arrive after substantial movement. Historical reviews 1.5 now preserve the first confirmation observable in the loaded history, rather than treating the latest confirmation as the start of a new move. The shared thesis-lifecycle module also supplies current market-cycle details and v5.9 analysis evidence. Trader Intelligence includes prior-session entries with measurable original target geometry in its late-entry comparison.

The ancestry is reconstructed by running the existing direction detector on chronological prefixes of completed 30-minute candles. A same-direction reconfirmation does not reset it. Hard invalidation ends that ancestry; a later confirmation starts another. First observable confirmation is an evidence timestamp, not a claim to have found the absolute start of the market trend. Historical loading remains bounded to existing cached/provider history; missing ancestry is unknown.

Each anchor freezes its observed confirmation close, invalidation, volatility unit, and nearest historical price obstacle ahead of the confirmation. No projected target is manufactured if an obstacle is unavailable. Original-target consumption is distinct from the review's current tactical target; it can exceed 100%, and negative remaining reward/risk is retained. Targets already touched before entry are disclosed. These are underlying-price measurements, not option-premium returns.

The historical adapter excludes five-minute candles which had not closed at entry, and excludes incomplete 30-minute aggregates. The first-observed timestamp is when the detector could know the evidence, rather than the provider candle-open timestamp. Entry underlying price is a last-completed-candle proxy, not an execution tick. Future trade results do not affect the ancestry or its entry assessment.

Pullback status describes observable price behavior, not trader intent. A retracement of at least half the frozen move unit starts a developing pullback. A subsequent closed candle must recover at least half a unit with a directional body to record a hold. This is not automatically a retest of a named structural level. A developing pullback is explicitly unconfirmed. Hard invalidation is a failure.

Timing classification uses existing product heuristics: 60% target-distance consumption for late-confirmed movement; 80% or 1.5 frozen move units for extension. Thresholds are not literature-validated optimal entries or probabilities. A held pullback does not erase extension. Existing-thesis numerical scores remain unavailable without original target geometry. Elapsed minutes are wall-clock time; prior sessions count observed ET sessions, not unobserved market days.

## Validation and rollout

Run `node --test tests/*.test.cjs` and `npm run build`. Regression coverage includes prior-day confirmation, same-direction reconfirmation, bearish geometry, target overshoot, unknown target, invalidation and restart, candle completion, developing versus held pullbacks, and post-entry price invariance.

No schema migration is required: ancestry is persisted under historical review `evidence.thesis_entry` and cycle-state `details.thesis_entry`. Review version 1.5 triggers replacement of stale 1.4 reviews when playback is opened; batch reconstruction also recognizes the new version. Deploy the reconstruction and derive-market-cycle-state functions and the v5.9 analysis function with their shared module, then publish the frontend together. Current-cycle evidence is refreshed by the existing derivation path; this does not enable live streaming or trading.

The AAPL screenshot has not been rerun against the user's real market data. Existing bounded history may not contain its original confirmation. All changes are proposed for review, without a production deployment.
