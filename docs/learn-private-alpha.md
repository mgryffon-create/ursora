# Learn private alpha

This first vertical slice uses original, seeded synthetic price/volume updates; it never requests Massive data. It is not historical replay. Three scenario endings share the same authored opening structure. Timestamps are fictional winter-session ET labels; all timing is simulated.

## Access and operation

An administrator-controlled `app_metadata.learn_tester === true` enables the Optional workspaces control in MyURSORA. It is enabled only for the verified owner account during this rollout. No user IDs or email addresses are embedded in source. Refresh authentication to pick up a metadata change. Enable Learn, then open it from MyURSORA or the navigation drawer. This is a presentation/rollout gate, not a protected data boundary: source is public and synthetic scenarios contain no secrets or private data.

Learn is lazy-loaded only when opened. Progress is versioned and scoped by authenticated user ID in browser localStorage. Disabling Learn keeps the attempt. Leaving the view pauses/unmounts playback. Different users never load each other's saved attempt. There is no database schema change, shared market-data cache, real brokerage execution, or modification of brokerage statistics. Browser clearing loses progress; cross-device progress is deferred.

## Included

- Self-report and four-question foundations screening before the practice view. Novices or any missed foundation receive a four-part introductory recap and guided practice. This is an alpha routing screen, not the final visual competency test or the full ground-zero curriculum.
- Original per-second synthetic ticks, forming five-minute candles, prior-session context, automatic replay at 1/10/30/60x, pause and background-tab pause. No step-through candle control.
- Guided stops at 10, 20 and 35 simulated minutes; independent attempts do not stop. Opening a ticket leaves playback running.
- Recorded bullish thesis, entry trigger, invalidation, exit area and total committed-premium budget. A plan locks before orders; every fill stores a plan/evidence snapshot.
- Two fictional calls with intrinsic/time/volatility-sensitive illustrative premiums, bid/ask spread, 100-share multiplier and fees. No claim to market calibration, American-option accuracy, queue simulation, partial fills, settlement or assignment.
- Market and working limit orders, cash/exposure reservations, oversell prevention, weighted costs, trims/adds/closes, bid-marked positions, realized gross result and separate fees.
- Frozen decision journal, wait/pass observations, interim/end review, and new seeded variations. Net equity outcome remains separate from rule checks. No automated interpretation-quality grades or competency milestones.

## Engine boundary

The training adapter imports the exact production `replayThesis` and `assessThesisEntry` ancestry/geometry functions. It supplies only closed candle prefixes plus a simplified, disclosed training direction detector. It does not run the full historical regime/direction detector or assert full production-thesis agreement. Completed-candle confirmation requires two session closes at/above $101.50. The active candle is excluded from confirmation/ancestry. Live visible price is used for entry movement. Scenario seeds/endings are never input to the detector.

## Verification

`node --test tests/*.test.cjs` covers 23 tests across existing historical behavior and synthetic determinism, causal candles/evidence, quotes, fills, costs, limits and exposure. `npm run build` passes. Focused ESLint passes. Existing unrelated app TypeScript errors remain; none originate in Learn or its AppLayout integration.

A DOM harness additionally exercises first-entry screening, foundations, recorded plan, order review/fill, interim review, continuous playback, pause and browser restoration. Browser engine installation was unavailable in this execution environment, so real mobile visual QA remains for owner testing.

## Next boundaries

Before broader release: full visual placement and foundation modules; competency/routing records; reviewed indicator teaching; calibrated option model and execution scenarios; deeper causal production-detector adapter; accessible mobile browser QA; durable server progress and appropriate access policies. Synthetic practice does not establish readiness for live trading.
