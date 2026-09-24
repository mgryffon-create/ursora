create table if not exists public.active_analyses (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null references public.tickers(symbol) on delete cascade,
  signal_id bigint not null references public.signals(id) on delete cascade,
  status text not null default 'active',
  direction text not null,
  holding_period text,
  analyzed_at timestamptz not null default now(),
  valid_until timestamptz,
  suggested_expiration date,
  target_price numeric,
  invalidation_level numeric,
  opportunity_score numeric,
  confidence_score numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create index if not exists active_analyses_user_valid_idx
  on public.active_analyses(user_id, valid_until desc);

alter table public.active_analyses enable row level security;

drop policy if exists "own rows" on public.active_analyses;
create policy "own rows"
  on public.active_analyses
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
