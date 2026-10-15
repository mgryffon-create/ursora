# Learn private alpha

Learn is an opt-in header workspace, visible only to accounts granted administrator-controlled `app_metadata.learn_tester`. It has independent light styling, a complete module sidebar, current-activity highlighting, a compact module menu on small screens, introductory lesson pages, and Next lesson progression. Placement precedes lesson access; all modules remain visible during placement with their availability labeled.

## Learning and simulated market

The placement assessment and foundation recaps use centered, click-through cards. Concept diagrams accompany plain-language definitions, activity context and practical purpose. The seven introductory modules are a beginning, not the full planned interactive curriculum or a validated competency/readiness assessment. Passing, waiting and alternative reasoning remain legitimate; dropdown explanations are not automatically treated as true observations.

Original, seeded per-second synthetic price/volume updates form five-minute candles. Prior-session context is synthetic too. Nothing in Learn requests Massive. Three scenario endings share an authored opening structure. Replay supports 1/10/30/60x, guided stops, pause, and background-tab pause. Opening a ticket leaves playback running; editing a plan pauses it. Candle OHLCV supports hover, tap-to-pin and keyboard inspection without future-candle leakage.

Chart-adjacent bid/ask and buy/sell controls launch a contextual three-step ticket. Desktop places the ticket beside the chart; narrower screens use a modal. Two fictional calls use an illustrative intrinsic/time/volatility-sensitive model with spreads, a 100-share multiplier and fees. There is no claim to calibrated exchange pricing, American-option accuracy, partial fills, settlement or assignment. Market and limit orders, reservations, trim/add/close and bid-marked positions are included. Plan levels do not place automatic orders. Fills and working orders retain their original plan snapshots; edits have a timestamp and reason. Brokerage history/statistics remain separate.

The training adapter uses production `replayThesis` and `assessThesisEntry` with closed prefixes and a disclosed simplified direction detector. It is not the complete production regime/direction detector. Scenario outcome metadata is never input to evidence detection.

## Durable progress

`learn_progress` stores one owner-scoped account document with optimistic revision checks. `save_learn_progress(owner_id, expected_revision, next_payload)` checks authenticated identity, row ownership and revision before saving. A stale write returns a conflict instead of overwriting newer work. `learn_progress_history` preserves recovery checkpoints at decisions/plan changes/new attempts and periodic intervals. Functions use security invoker and a fixed search path; anonymous access is revoked. Existing browser simulation records are imported when no account save exists and left untouched.

The stable `ursora:learn-progress:<user-id>` browser key is independent of deployment/scenario build IDs. It provides immediate local backup; the account save is throttled during replay and debounced for forms. Saved data includes assessment answers/recap card, current lesson and lesson answers, practice seed/clock/account/plan/journal, plan edits and unfinished editor, selected contract, partial order ticket/quantity/limit/reason/step, wait/pass draft, and replay speed. Replay always resumes paused. The actual account document loads before defaults mount, preventing a blank mount from replacing a saved attempt.

The UI reports account saves, pending saves, local-only recovery, load failure and conflicting revisions. A failed initial account read without a browser copy blocks starting fresh. Offline changes are retained and retried; switching devices requires an account-confirmed save. Conflicting copies are backed up before the learner chooses which to resume. Before a new attempt replaces an existing seed, the browser saves the previous attempt as a recovery copy. Account requests include the expected owner ID so a sign-out/account-switch race cannot write the prior user's document into the newly signed-in account.

The old client did not save mid-assessment answers, recap cards, lesson position or unfinished forms. Data that was never recorded cannot be reconstructed; available browser simulation checkpoints can be recovered.

## Deployment interruption fix

The previous app automatically navigated to a new deployment every 15 seconds, on focus and on returning to a visible tab. It now announces an update without navigating. The learner chooses Later or Save & update. An active Learn provider must confirm its account save before the manual update can navigate. Failed or conflicted saves leave the session open.

## Verification

- `node --test tests/*.test.cjs`: 33 passing tests, including synthetic execution, causal evidence, legacy migration, clean-browser account hydration, offline retries, stale-tab conflicts, separate user keys and non-interrupting deployment checks.
- Focused ESLint and production build pass. Existing unrelated TypeScript errors remain; changed Learn files have no new errors.
- Chromium tests cover mid-recap reload, lesson answer/page reload, partial plan and partial order reload, completed fill retention, account hydration after clearing local storage, offline recovery/retry, update announcements with no navigation, manual update refusal while unsaved, successful manual update with retained position, current module navigation, and 390px overflow checks. Backend transport is isolated in that UI test; live database ownership/revision/history behavior is separately verified using authenticated-role transactions rolled back after assertions.
- Database tests verify stale-write rejection, owner mismatch rejection, cross-user read isolation, recovery checkpoints and revoked anonymous/legacy-RPC access. Security advisors report no findings for the new Learn tables/functions.
