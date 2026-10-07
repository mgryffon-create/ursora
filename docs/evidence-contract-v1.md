# URSORA Evidence Contract v1.0

## Purpose

The Evidence Contract is the single semantic interface between provider ingestion, TradeCycle analysis, and every thesis UI surface.

A component may format evidence, but it must not independently reinterpret whether evidence is available, stale, meaningful, directional, or allowed to vote.

## Evidence family roles

- **primary** — Price/structure. Establishes whether a directional thesis exists.
- **confirmation** — Momentum and participation. Confirm or oppose established price direction.
- **context** — Broader market/sector and verified news/catalysts. Adjust conviction; cannot manufacture direction.
- **auxiliary** — Options positioning. Informational until richer flow semantics support reliable voting.
- **trade_quality** — Liquidity and risk/reward. Affect execution/trade quality rather than thesis truth.

## Evidence status

Every family and important point must expose one of:

- `observed` — source data is usable for its intended semantic purpose.
- `no_meaningful_evidence` — provider worked and data exists, but it does not meet the model's voting/meaning threshold.
- `unavailable` — required source value is absent.
- `stale` — evidence exists but is too old or price-regime-disconnected to trust.
- `refresh_failed` — provider refresh failed. This must not be represented as neutral market evidence.

These states are not interchangeable.

## Strength versus thesis vote

Absolute evidence strength and thesis-relative vote are separate fields.

Example:

- Momentum may be `Strong` in absolute terms.
- If price has not established a direction, momentum must still be `ABSTAIN`.
- The UI should say **Strong standalone evidence · no thesis vote**, never **Strong · 0/100** without explanation.

Only Moderate/Strong evidence that is permitted by the hierarchy may SUPPORT or OPPOSE.

## Canonical family fields

Each evidence family contains:

- `key`
- `label`
- `role`
- `status`
- `provenance`
- `absolute_score`
- `relative_score`
- `strength_band`
- `thesis_vote`
- `can_vote`
- `vote_reason`
- `confidence`
- `freshness`
- `source_quality`
- `explanation`

## Canonical datapoints

Important source measurements are stored in `evidence_contract.points` with:

- `key`
- `family`
- `value`
- `unit`
- `status`
- `source_name`
- `source_timestamp`
- `retrieved_at`

The thesis UI should prefer these run-bound values over current mutable quote/provider rows when explaining the completed analysis.

Examples include:

- analysis price
- relative volume
- option call volume
- option put volume
- put/call ratio
- total option open interest
- option IV
- news item count
- tactical target
- tactical invalidation

## Validation rules

A generated contract includes a validation result. At minimum, the system must flag contradictions such as:

1. neutral price direction marked suggestion-eligible;
2. tactical target/invalidation present while the tactical frame is invalid;
3. a metric exists while its family is marked unavailable;
4. stale/failed evidence being represented as observed;
5. a UI display claiming a different run-bound value from the contract.

Validation issues should be visible in diagnostics and must never silently become supporting evidence.

## UI rule

For completed analyses:

1. render analysis facts from the Evidence Contract;
2. use current provider rows only for clearly-labelled **current/live context**;
3. never replace the evidence used by a completed analysis with a newer value without labeling it as newer/current;
4. glossary text comes from `src/lib/glossary/terms.ts`;
5. explanation wording may change by presentation level, but calculations, status, vote, and values may not.

## Model documents

This contract implements the semantics defined in:

- `docs/tradecycle-v5-thesis-evidence-model.md`
- `docs/tradecycle-evidence-integration-audit.md`

The Evidence Contract is the machine-facing enforcement layer for those rules.
