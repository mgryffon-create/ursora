-- PROPOSAL ONLY: deliberately outside supabase/migrations. Never applied automatically.
-- No scheduler, publication, trigger on existing tables, public RPC, or data backfill.
begin;
create schema thesis_tracking;
revoke all on schema thesis_tracking from public, anon, authenticated;
grant usage on schema thesis_tracking to service_role;
alter default privileges in schema thesis_tracking revoke all on tables from public, anon, authenticated;
alter default privileges in schema thesis_tracking revoke all on functions from public, anon, authenticated;

create table thesis_tracking.entry_snapshots (
  owner_id uuid not null references auth.users(id),
  thesis_id text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  primary key (owner_id, thesis_id),
  check ((snapshot->>'ownerId' = owner_id::text and snapshot->>'id' = thesis_id) is true)
);
create table thesis_tracking.replay_runs (
  owner_id uuid not null,
  run_id text not null,
  thesis_id text not null,
  policy_version text not null,
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now(),
  primary key (owner_id, run_id),
  foreign key (owner_id, thesis_id) references thesis_tracking.entry_snapshots(owner_id, thesis_id),
  check ((report->>'liveEnabled' = 'false' and report->>'notificationsEnabled' = 'false'
    and report->'policy'->>'mode' = 'offline_replay'
    and report->'policy'->>'validation' = 'unvalidated'
    and report->>'runId' = run_id
    and report->'thesis'->>'ownerId' = owner_id::text
    and report->'thesis'->>'id' = thesis_id
    and report->'policy'->>'version' = policy_version) is true)
);
create index replay_runs_thesis_history on thesis_tracking.replay_runs(owner_id, thesis_id, created_at);
create table thesis_tracking.evaluations (
  owner_id uuid not null,
  run_id text not null,
  sequence integer not null check (sequence >= 0),
  observation_id text not null,
  evaluated_at timestamptz not null,
  thesis_state text not null check (thesis_state in ('supported', 'watch', 'weakening', 'invalidated')),
  data_state text not null check (data_state in ('ready', 'insufficient', 'stale', 'rejected')),
  evaluation jsonb not null check (jsonb_typeof(evaluation) = 'object'),
  primary key (owner_id, run_id, sequence),
  foreign key (owner_id, run_id) references thesis_tracking.replay_runs(owner_id, run_id)
);

-- Append-only research history. Administrative retention/deletion requires a separate reviewed design.
create function thesis_tracking.prevent_rewrite() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  raise exception 'Thesis research records are immutable';
end;
$$;
revoke all on function thesis_tracking.prevent_rewrite() from public, anon, authenticated;
create trigger entry_snapshots_immutable before update or delete on thesis_tracking.entry_snapshots
for each row execute function thesis_tracking.prevent_rewrite();
create trigger replay_runs_immutable before update or delete on thesis_tracking.replay_runs
for each row execute function thesis_tracking.prevent_rewrite();
create trigger evaluations_immutable before update or delete on thesis_tracking.evaluations
for each row execute function thesis_tracking.prevent_rewrite();

alter table thesis_tracking.entry_snapshots enable row level security;
alter table thesis_tracking.replay_runs enable row level security;
alter table thesis_tracking.evaluations enable row level security;
revoke all on all tables in schema thesis_tracking from public, anon, authenticated;
-- Supabase's service_role bypasses RLS; this is a server-only schema, never exposed via PostgREST.
grant select, insert on all tables in schema thesis_tracking to service_role;
commit;
