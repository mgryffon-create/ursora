# Dormant thesis-tracking foundation

Status: **offline research only; unvalidated**. This branch adds no product UI,
provider connection, HTTP handler, scheduler, alert delivery, order execution, or
production database change. Automatic Vercel deployments are disabled for
`infrastructure/thesis-tracking-dormant` in this branch's configuration. No existing
lifecycle job imports this module.
`capabilities` is permanently false for live operation, alerts, and orders. A future
release must explicitly implement activation; an environment variable cannot turn
this implementation into a live trader.

## What is implemented

- An immutable entry-thesis contract with owner, evidence cutoff, market symbol,
  intended horizon, supporting boundary, and touch/close invalidation semantics.
- A pure evaluator that keeps thesis state, data quality, news context and execution
  risk separate. States: supported, watch, weakening, invalidated. Invalidation is
  terminal for that entry snapshot. Ordinary assessment requires a compatible baseline.
- Magnitude normalized by an empirical pullback baseline, structural deterioration,
  consecutive completed observations, and separate recovery thresholds (hysteresis).
  All numeric parameters must be supplied explicitly. The test parameters are synthetic.
- Exact symbol/session-bucket/regime/horizon baseline fitting from prior available
  nonoverlapping samples. Too little data returns unavailable. Peer pooling and
  advanced robust estimators are future research, not silently invented fallbacks.
- Timestamped provider and news contracts. Event time and receipt time are separate;
  delayed messages and corrections remain visible in arrival-order replay. Future
  evidence, regime context, and baseline versions cannot influence an earlier decision.
- Deterministic offline replay with complete input records, policy, baseline versions,
  per-observation context, evaluation reasons and transitions retained for audit.
- An injected transactional Postgres repository. Immutable entry snapshots cannot be
  replaced by later experiments. Run retries are idempotent only for identical content;
  reusing a run ID with different content fails. Report and evaluation rows commit atomically.
- A proposed private SQL schema with RLS, no browser-role grants, composite owner keys,
  immutable records, and no realtime publication. It has been tested locally but is
  deliberately outside `supabase/migrations`, so deploying existing migrations cannot
  accidentally install it.

## Semantics and limitations

The initial state means the supplied entry thesis is being maintained; it is not an
independent finding that the entry was substantiated. Entry substantiation must be
validated upstream before capturing a live snapshot. A reconstructed historical
thesis must be labeled reconstructed and must preserve its actual evidence cutoff.

The candidate evaluator is a research harness, not a scientifically validated detector
of pullbacks or reversals. It does not infer order-flow imbalance from volume, diagnose
manipulation from candles, estimate option P/L, assign a probability of success, or
infer a causal news explanation from temporal proximity. Unknown spreads stay unknown.
A price jump and a permanent directional change are not interchangeable labels.

Partial bars cannot accumulate persistence. A bar spanning entry cannot establish
that its wick happened after entry; post-entry touch invalidation requires observations
whose interval starts after entry, or a directly observed post-entry close across the
boundary. Completed-close invalidation uses only complete bars. Data that are stale,
invalid or not yet available cannot manufacture a new thesis state. Invalidation still
overrides absent baselines and event gating when the market observation itself is valid.

Material verified news holds the ordinary persistence calculation until resolution is
explicitly known; scheduled events are flagged around an explicit research window.
This placeholder is conservative plumbing for later event-response research, not a
calibrated rule that every headline should pause a thesis. Corrections arriving for an
already processed market timestamp are rejected for state updates; retain them and run
an explicitly versioned corrected replay rather than silently rewriting history.

Session bucket, regime and horizon assignments must themselves be causal. The replay
records their supplied `contextKnownAt`. Future adapters must use exchange calendars,
DST, holidays, halts and regular/extended session distinctions. The current module does
not pretend to provide an exchange calendar or a regime classifier.

## Run checks

```sh
npm run check:thesis-tracking
npm run test:thesis-tracking
```

The storage integration test runs only when `THESIS_TEST_PGLITE` points to an installed
`@electric-sql/pglite` package; otherwise Node reports that test as skipped. To reproduce
all checks without changing application dependencies:

```sh
npm install --prefix /tmp/ursora-thesis-sql-qa --no-save --no-package-lock @electric-sql/pglite@0.3.14
THESIS_TEST_PGLITE=/tmp/ursora-thesis-sql-qa/node_modules/@electric-sql/pglite npm run test:thesis-tracking
```

The integration test creates synthetic users and roles in an ephemeral local Postgres
engine, applies only `schema.proposed.sql`, and checks permissions, constraints,
immutability, tenant scoping, retry behavior and transactional rollback. It never
connects to the hosted Supabase project.

## Research required before activation

See [research.md](research.md). Compare a small preregistered set of candidate policies
with simple baselines; use chronological evaluation and unseen instruments, prevent
leakage between overlapping samples, retain parameter trials, and report uncertainty.
Measure false deterioration alerts, detection delay, missed structural failures,
state churn, and behavior during event/illiquid periods. Labels and outcome horizons
must be specified independently of the detector to avoid circular validation. P/L alone
is not a ground-truth label of thesis quality.

Before any live integration: evaluate the research; design current-position ownership
and snapshot capture; add an authenticated ingestion service and continuous worker;
implement reconnect/backfill/correction reconciliation and coverage monitoring; define
retention/deletion and rate limits; add an explicit separately reviewed activation gate.
The future service must derive owner identity from verified authentication, never from
caller-supplied `ownerId`. This repository uses trusted server connections and is not an
HTTP authorization layer. Do not expose the private schema through PostgREST or grant
clients `service_role` access. Proposed DDL needs a real migration and staged validation
before deployment. No activation or database installation is included in this change.
