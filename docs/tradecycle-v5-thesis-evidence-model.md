# URSORA TradeCycle v5 — Thesis Evidence Model

## Purpose

TradeCycle v5 separates a **directional lean** from evidence strong enough to affect a thesis.

The engine classifies each directional evidence family as:

| Band | Meaning | Thesis vote |
| --- | --- | --- |
| Insufficient | Mixed, neutral, missing, or too incomplete to interpret | Abstain |
| Weak | A directional lean exists, but corroboration is inadequate | Abstain |
| Moderate | Meaningful evidence in one direction | Support or oppose |
| Strong | Multiple internally consistent signals and structural confirmation | Support or oppose |

Weak and Insufficient evidence can be displayed to the user for context but **must not mathematically support or invalidate a thesis**.

## Directional evidence families

The directional model-design priors normalize to:

- Price trend & structure — 30%
- Momentum — 20%
- Volume & participation — 15%
- Broader market / sector alignment — 15%
- Options market — 10%
- Verified news / catalysts — 10%

These are transparent engineering priors, not constants claimed by academic literature. Historical Evidence should be used to calibrate them by setup, market regime, and holding horizon.

Option liquidity and risk/reward remain trade-quality families and do not decide whether the directional thesis itself is true.

## Price trend & structure

The primary price family is intentionally rule-based rather than a smooth sum of indicator points.

Research and practitioner evidence supports several recurring ideas:
- moving averages are widely used to identify trend direction and moving-average crossovers are closely related to other trend filters;
- 20-session trading-range / Donchian-style breakouts provide an objective form of higher-high / lower-low structure;
- higher highs and higher lows are a standard definition of an uptrend, with the inverse for downtrends;
- ADX measures trend strength rather than direction, and readings around 20–25 are commonly used to distinguish weak/non-trending conditions from established trends;
- corroboration matters more than any single price-derived indicator.

Inputs:
- price relative to 20-day moving average
- 20-day vs 50-day moving average
- 50-day vs 200-day moving average when available
- 20-day moving-average slope over the prior five sessions
- recent higher-high / higher-low or lower-high / lower-low structure
- 20-session breakout or breakdown
- 14-period DMI direction and ADX trend strength

### Insufficient

Price observations are materially mixed, too incomplete, or lack enough directional structure to establish a lean.

### Weak

At least two directional clues lean the same way, but objective swing/breakout structure or trend-strength corroboration is inadequate.

Weak is informational only and abstains from the thesis.

### Moderate

Moderate requires **objective structure plus corroboration**, not merely price above a moving average.

A side can qualify through one of these patterns:

1. higher-high/higher-low (or inverse) structure plus at least two corroborators among:
   - short/intermediate moving-average stack
   - 20-day average slope
   - ADX >= 20 with DMI direction aligned
   - 50/200-day context

2. a 20-session breakout/breakdown plus ADX >= 20 and aligned DMI;

3. aligned short/intermediate moving averages + slope + ADX/DMI confirmation.

### Strong

Strong is deliberately rare. It requires:

- objective structure or a 20-session breakout/breakdown;
- price / 20-day / 50-day alignment in the same direction;
- 20-day average slope aligned with the move;
- ADX >= 25 with DMI direction aligned; and
- either 50/200-day context aligned **or** an actual 20-session breakout/breakdown.

Volume is **not** included inside the price band because it is evaluated separately as participation confirmation. This prevents the same confirmation from being counted twice.

These thresholds are grounded in established trend-analysis conventions, but they remain engineering priors. Historical Evidence should test whether the thresholds are well calibrated for URSORA's 1–5 day holding horizon.

## Momentum

Inputs:
- MACD line vs signal line
- MACD relative to zero
- RSI regime
- 5-session return persistence
- 20-session return persistence
- legacy normalized momentum score only as fallback when calculated measures are unavailable

RSI extremes are not treated as automatic reversal signals. Strong momentum requires corroboration, including MACD alignment and persistence over the 20-session window.

## Volume & participation

Volume is a confirmatory family, not a directional source by itself.

Current rules:
- below roughly average participation: Insufficient
- near-average participation with a directional move: Weak
- elevated relative volume with an established price direction: Moderate
- materially elevated relative volume with an established Moderate/Strong price trend: Strong

The exact relative-volume cutoffs are engineering priors to be calibrated in Historical Evidence.

## Broader market & sector alignment

Inputs:
- SPY direction / trend
- QQQ direction / trend
- the symbol's sector performance when available

One aligned context signal is Weak. Two aligned components are Moderate. Broad index and sector alignment together can produce Strong evidence.

## Options market

Aggregate put/call volume alone is capped at **Weak**.

Reason: aggregate put/call data do not reveal:
- whether a trade was buyer- or seller-initiated
- whether activity opened or closed a position
- whether contracts were part of a spread
- whether activity represented hedging

Therefore aggregate options flow cannot vote on a thesis until a richer provider supplies the information required to interpret flow direction reliably.

## Verified news & catalysts

News is weighted by:
- directional sentiment
- source confidence
- event impact
- recency

Strong news evidence requires multiple high-quality directional items. A single weak or low-impact article cannot create Strong evidence.

## Hierarchical corroboration

TradeCycle v5.1 does not treat all evidence families as interchangeable votes.

### Primary evidence

**Price trend & structure** establishes whether a directional thesis exists at all.

If price/structure is only Insufficient or Weak, the analysis remains **Neutral / Insufficient Evidence** even when momentum, news, or market context lean bullish or bearish. Context is not allowed to manufacture a thesis that the asset's own price structure has not established.

### Confirmation evidence

**Momentum** and **volume/participation** answer whether the price move is being confirmed.

Interaction states:
- **Confirmed** — both confirmation families provide Moderate/Strong evidence in the same direction as price.
- **Partially confirmed** — one confirmation family aligns at Moderate/Strong strength.
- **Unconfirmed** — neither confirmation family is strong enough to vote.
- **Divergent** — at least one confirmation family provides Moderate/Strong evidence against price.

A Supported thesis requires at least one meaningful confirmation family. Strongly Supported requires both confirmation families aligned.

### Context evidence

**Broader market / sector alignment** and **verified catalysts/news** contextualise the stock-level thesis.

Context may strengthen or weaken confidence, but it cannot establish direction without price. An opposing market environment is treated as a headwind rather than automatic invalidation; a stock can demonstrate relative strength or relative weakness against its environment.

### Auxiliary evidence

**Options positioning** remains auxiliary until the data are rich enough to infer buyer/seller initiation, opening/closing intent, spreads, and hedging. Aggregate put/call activity stays capped at Weak and therefore abstains.

### Interaction examples

- Moderate/Strong bullish price + bullish momentum + elevated aligned volume → confirmed bullish structure.
- Bullish price + bearish momentum → divergence; continuation confidence is reduced.
- Bullish breakout + weak participation → price thesis may exist, but it cannot become Strongly Supported from the breakout alone.
- Bullish price + bearish market/sector context → market headwind; the thesis may still survive if stock-level confirmation is strong.
- Bullish catalyst + no meaningful price structure → no directional thesis yet.
- Bullish catalyst + bullish established price structure → contextual confirmation.

## Thesis classification

Only Moderate and Strong families participate.

- **Insufficient Evidence** — fewer than 3 independent Moderate/Strong directional families
- **Mixed** — enough evidence exists, but material support and opposition coexist
- **Insufficient Evidence** — price/structure has not established a Moderate/Strong direction.
- **Mixed** — price establishes direction, but confirmation is incomplete or meaningful evidence materially conflicts.
- **Supported** — price establishes direction, at least one confirmation family aligns at Moderate/Strong strength, at least 3 meaningful supporting families are present, weighted support is at least 67%, and there is no Strong opposing confirmation family.
- **Strongly Supported** — price structure is Strong, momentum and participation both align at Moderate/Strong strength, at least one context family supports the direction, weighted support is at least 80%, and no Strong opposing family exists.
- **Opposed** — price still establishes the current direction, but confirmation evidence meaningfully opposes it and weighted opposition dominates.
- **Rejected** — Strong confirmation evidence contradicts price with dominant weighted opposition; this is a material failure state rather than ordinary mixed evidence.

Fresh opportunity direction is inferred only from Moderate/Strong evidence. Weak signals cannot accumulate into a directional thesis.

## Independence and redundancy

Indicators derived from the same price series are grouped into evidence families rather than counted as independent votes. Momentum and participation receive redundancy discounts when price evidence is present. This helps prevent SMA, MACD, recent returns, and related measures from masquerading as four independent confirmations.

## Research basis

The model is informed by, but not mechanically copied from, the following evidence and practitioner frameworks:

1. Brock, Lakonishok & LeBaron (1992), *Simple Technical Trading Rules and the Stochastic Properties of Stock Returns*, Journal of Finance. Moving-average and trading-range breakout rules showed statistically meaningful information in their historical sample.
2. Jegadeesh & Titman (1993), *Returns to Buying Winners and Selling Losers*, Journal of Finance. Documents intermediate-horizon momentum persistence.
3. Lo, Mamaysky & Wang (2000), *Foundations of Technical Analysis*. Several systematically defined chart patterns contained incremental information in their sample.
4. Levine & Pedersen / AQR, *Which Trend Is Your Friend?*. Trend filters including moving averages and time-series momentum capture related information; robustness and implementation matter more than selecting one magical filter.
5. CMT Association educational material on weight-of-the-evidence analysis, price action, relative strength, and volume as confirmation.
6. Fidelity technical indicator guides describing SMA as a trend tool, MACD as trend/momentum confirmation, and expanding volume as confirmation of price/support-resistance breaks.
7. Charles Schwab educational material describing ADX as a trend-strength measure and emphasizing indicator combinations rather than isolated signals.
8. Cboe material noting that put/call-ratio interpretation depends on assumptions about how puts and calls are being used.

## Design principle

The thesis tracker should explain **which evidence family changed, how strong the change is, whether it actually votes on the thesis, and why**.

A score changing from 68 to 64 is not itself a meaningful thesis event.

A change such as:

- Price trend: Moderate support → Weak lean
- Momentum: Strong support → Moderate support
- Market alignment: Moderate support → Moderate opposition
- Aggregate thesis: Supported → Mixed

is a meaningful thesis event and is suitable for TradeCycle monitoring and notification logic.
