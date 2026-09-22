-- Per-symbol provider refresh state so expensive external feeds can be cached
-- without inserting fake "no data" rows into research tables.

create table if not exists public.provider_symbol_syncs (
  provider_key text not null,
  capability text not null,
  symbol text not null,
  last_attempt timestamptz,
  last_success timestamptz,
  last_error text,
  item_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider_key, capability, symbol)
);

alter table public.provider_symbol_syncs enable row level security;

drop policy if exists "public read" on public.provider_symbol_syncs;
create policy "public read"
  on public.provider_symbol_syncs
  for select
  using (true);

create index if not exists provider_symbol_syncs_capability_idx
  on public.provider_symbol_syncs(provider_key, capability, updated_at desc);
