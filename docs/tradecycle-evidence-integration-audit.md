# URSORA Evidence Integration Audit

## Purpose

TradeCycle 5.2 is intentionally conservative. Before tuning thresholds, validate whether each evidence family has the data quality, freshness, and semantic depth required to earn Moderate or Strong evidence.

This audit distinguishes:

- **Structurally capable** — current schema/provider can supply the evidence needed by the model.
- **Partially capable** — useful data exist, but an important limitation prevents reliable Moderate/Strong interpretation.
- **Not yet capable** — the current integration cannot provide the evidence semantics required by the model.

## Executive summary

| Evidence family | Current source | Current capability | Main limitation | Readiness |
| --- | --- | --- | --- | --- |
| Price / structure | Webull PaperTrade sandbox quotes + 260 daily bars | SMA20/50/200, swing structure, 20-session breakout, ATR, DMI/ADX | Sandbox provenance; production entitlement not yet active | Structurally capable |
| Momentum | Same Webull daily history | MACD, RSI, 5D/20D persistence | Same sandbox/provenance constraint | Structurally capable |
| Volume / participation | Webull daily OHLCV | latest volume, 20-day average, relative volume | Depends on most recent bar being current and complete; no intraday participation model yet | Structurally capable for daily model |
| Market / sector context | Yahoo public chart endpoints + SPY/QQQ Webull quotes | SPY/QQQ daily direction, VIX, sector ETF daily changes | Public Yahoo endpoint is best-effort; refresh currently fails intermittently; sector logic is shallow (mostly current-day change) | Partially capable |
| News / catalysts | Alpha Vantage + Yahoo supplemental | ticker-targeted headlines, sentiment, relevance, recency | Alpha rate limits / refresh failures; Yahoo is best-effort and sentiment-less | Partially capable |
| Options positioning | Webull sandbox option snapshots | bid/ask, volume, OI, IV, Greeks, aggregate put/call | No trade-side, opening/closing, multi-leg or hedge context; aggregate put/call is ambiguous | Not capable of thesis voting yet |
| Earnings risk | Alpha Vantage calendar | upcoming report date, EPS estimate | report time is approximated, confirmed=false, expected move absent | Adequate as blocker/context only |
| Macro / economic events | market snapshot + existing economic-event table | VIX/DXY/WTI/Gold when Yahoo works | Treasury yields absent; no robust economic-calendar refresh in the analysis pipeline | Partially capable |
| Brokerage / TradeCycle behavior | Webull sandbox today; SnapTrade planned | sandbox positions/history; provider-neutral schema exists | real brokerage timestamps/fills/history not connected | Not capable for production behavioral validation |

---

## 1. Price trend & structure

### Current inputs

Source:
- `sync-webull-market`
- `sync-webull-history`
- `ohlcv_bars`
- latest `quotes`

Current historical request:
- up to 260 daily bars per tracked symbol

TradeCycle 5.2 derives:
- price vs SMA20
- SMA20 vs SMA50
- SMA50 vs SMA200
- SMA20 slope
- 5-bar swing structure
- 20-session breakout/breakdown
- ATR14
- DMI/ADX14

### Assessment

**Structurally capable.**

The existing history depth is enough to compute the current price-family rules. The main limitation is provenance: current rows come from the Webull PaperTrade sandbox and are marked demo/sandbox.

### Before production validation

- confirm production Webull or replacement market-data entitlement
- verify split-adjusted OHLCV behavior
- verify daily-bar timestamp/session semantics
- verify today's daily bar is complete before using closing-volume logic
- retain provider + retrieval timestamp on every bar/snapshot

---

## 2. Momentum

### Current inputs

Derived from the same daily history:
- RSI14
- MACD 12/26/9
- 5-session return
- 20-session return

The legacy `momentum_score` is now only a fallback.

### Assessment

**Structurally capable.**

No new provider is strictly necessary to validate daily momentum logic. Production-quality historical bars are the dependency.

### Future improvement

For live TradeCycle monitoring, add an intraday timeframe rather than applying daily momentum logic repeatedly during the session.

---

## 3. Volume & participation

### Current inputs

`sync-webull-history` stores volume and writes:
- 20-day average volume
- relative volume

TradeCycle can also recompute relative volume from `ohlcv_bars`.

### Assessment

**Structurally capable for end-of-day / daily evidence.**

An Insufficient participation result is not automatically a data failure. It can legitimately mean relative volume is ordinary or participation is not confirming the move.

### Important limitation

For intraday recommendations, comparing partial-session volume directly with full-day historical average volume is invalid unless normalized for time of day.

Before intraday participation becomes meaningful, add:
- intraday bars
- same-time-of-day historical volume baseline or volume curve
- session-progress normalization

Until then, daily participation is reliable only when the underlying bar semantics are clear.

---

## 4. Broader market & sector context

### Current inputs

`sync-market-context` uses:
- Webull SPY / QQQ / IWM quotes
- Yahoo chart endpoint for VIX, DXY, WTI, Gold
- Yahoo chart endpoint for sector ETFs
- ticker sector mapping from `tickers.sector`

TradeCycle currently turns:
- SPY direction/trend
- QQQ direction/trend
- current sector ETF percentage change

into the market-context family.

### Assessment

**Partially capable.**

The current source is fragile and the model is too shallow.

The screenshot warning:
- `market context: refresh did not complete`

directly explains why market alignment often abstains.

### Required upgrade

Use a production/reliable market-data source for:
- SPY, QQQ, IWM
- sector ETFs
- VIX
- ideally breadth

And deepen sector context from one-day percentage change to:
- sector 5D/20D trend
- sector vs broad-market relative strength
- ticker vs sector relative strength
- optionally breadth within the sector

This family should not depend on a public Yahoo endpoint for production thesis voting.

---

## 5. Verified news & catalysts

### Current sources

**Alpha Vantage**
- ticker-targeted News Sentiment
- ticker relevance
- sentiment score
- headline
- impact derived from sentiment magnitude + relevance
- 18-hour per-symbol cache

**Yahoo supplemental**
- headline
- URL
- summary when available
- ticker relationship
- no native sentiment
- best-effort public endpoint

### Assessment

**Partially capable.**

The current pipeline can create useful evidence when Alpha Vantage returns data, but the refresh warnings show availability is not reliable enough to judge the model yet.

Yahoo rows cannot become directional evidence because sentiment is null.

### Required upgrade

For production thesis voting, prefer a provider with:
- dependable low-latency ticker news
- stable API terms
- article timestamps
- source identity
- ticker/entity relevance
- full-text or high-quality summary access
- event/category metadata

Direction should continue to be derived conservatively and ideally from multiple independent reports for Strong evidence.

---

## 6. Options positioning

### Current inputs

Webull sandbox supplies:
- bid
- ask
- volume
- open interest
- IV
- delta/gamma/theta/vega
- option type
- strike
- expiration

URSORA derives aggregate:
- call volume
- put volume
- put/call ratio
- total OI
- unusual volume flag

### Assessment

**Not capable of Moderate/Strong directional thesis voting.**

The data are useful for:
- liquidity
- contract selection
- IV context
- execution quality

They are not sufficient to infer directional institutional/speculative intent.

Missing semantics:
- buyer- vs seller-initiated trade
- opening vs closing
- single-leg vs multi-leg
- spread identification
- hedge vs directional intent
- sweep/block context
- changes in OI after settlement

### Current model rule

Correctly capped at **Weak / abstain**.

### Upgrade path

Do not loosen this rule simply because options are available.

Only promote this family after integrating a source that provides enough transaction/flow context to infer direction with defensible confidence.

---

## 7. Earnings and scheduled event risk

### Current source

Alpha Vantage earnings calendar.

Currently stored:
- report date
- estimated EPS
- `confirmed=false`
- session=`unknown`
- report time hard-coded to 16:00Z
- expected move unavailable

### Assessment

**Adequate only as a coarse blocker/context flag.**

It should not be used as precise intraday event timing.

### Required upgrade

A production earnings/events provider should supply:
- confirmed date
- before-open / after-close / exact time where known
- revisions
- earnings status
- expected move if used, with methodology/provenance

---

## 8. Macro and economic events

### Current state

`market_snapshots` can hold:
- VIX
- DXY
- WTI
- Gold
- breadth
- sector data
- Treasury fields

But:
- 10Y and 2Y are currently null
- no reliable economic-calendar refresh is part of `runFreshAnalysis`
- existing `economic_events` reads do not imply a production feed exists

### Assessment

**Partially capable / incomplete.**

For 1–5 day equity-options trades, scheduled macro events can materially affect validity and holding risk.

### Upgrade path

Add a reliable source for:
- CPI
- PPI
- jobs/NFP
- FOMC
- Fed speakers when material
- Treasury yields
- major economic releases

Treat scheduled macro events primarily as risk/context unless there is evidence supporting a directional interpretation.

---

## 9. Brokerage and TradeCycle behavior

### Current state

There is a provider-neutral brokerage schema for:
- connections
- accounts
- orders
- activities
- position snapshots
- trade episodes
- TradeCycle events

Webull sandbox can provide some account/position data.

SnapTrade is the intended production connection path.

### Assessment

**Not yet capable of production behavioral validation.**

This does not block market-thesis research, but it blocks the moat:

> evidence changed → trader did X afterward

That inference requires trustworthy timestamps.

### Production requirements

For each brokerage/provider establish:
- timestamp precision for orders and fills
- partial fills
- adds/reductions
- cancelled/replaced orders
- exercises/assignments
- fees
- option contract identifiers
- historical lookback
- freshness/webhooks vs polling

If a provider supplies only a trade date, URSORA must never infer response to an intraday thesis event.

---

## Recommended integration priority

### Priority 1 — Market-context reliability

This is the largest immediate hole visible in the current analysis.

Replace or supplement the best-effort Yahoo context dependency so Market/sector can reliably evaluate.

### Priority 2 — Production OHLCV + intraday participation

The current daily historical engine is structurally sound, but production data and intraday volume normalization are needed before treating live-session participation as robust.

### Priority 3 — Reliable news/catalyst feed

Alpha Vantage is useful as a prototype source but current rate limits/failures leave News unavailable too often.

### Priority 4 — Brokerage integration

SnapTrade or another production brokerage connection is required for real TradeCycle monitoring and behavioral inference.

### Priority 5 — Rich options flow

Useful but not required to make the core thesis engine work. Keep aggregate options evidence abstaining until richer semantics exist.

### Priority 6 — Macro calendar/rates

Important for risk context and event-aware monitoring, but should not delay validation of the core price/momentum/participation hierarchy.

---

## Validation gate before threshold tuning

Do **not** relax TradeCycle 5.2 simply because the current recommendation board is empty.

A fair validation run requires, for each tested symbol:

1. current production-quality quote
2. sufficient daily OHLCV history
3. valid volume/relative-volume observation
4. successfully refreshed broad-market context
5. successfully refreshed sector context
6. news provider either:
   - returns valid recent data, or
   - explicitly reports that no relevant recent news exists
7. options availability recorded separately; options may abstain
8. timestamps/freshness visible for every family

Then classify each family as:
- available + meaningful
- available + abstaining
- unavailable because provider failed
- unavailable because no event/evidence exists

That distinction is essential. **No evidence** and **failed integration** are not the same state.

## Key product requirement

The thesis UI should ultimately distinguish:

- **No meaningful evidence** — provider worked; evidence is neutral/weak
- **Data unavailable** — provider did not return the required field
- **Refresh failed** — source could not be refreshed
- **Stale** — evidence exists but is too old to trust

Without this distinction, users cannot tell whether URSORA is abstaining because the market is genuinely uninformative or because the data pipeline failed.
