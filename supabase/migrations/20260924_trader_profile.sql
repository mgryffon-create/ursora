create table if not exists public.trader_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  brokerages text[] not null default '{}',
  trading_styles text[] not null default '{}',
  trade_types text[] not null default '{}',
  primary_goals text[] not null default '{}',
  profit_target_type text not null default 'none',
  profit_target_value numeric,
  risk_comfort text not null default 'moderate',
  max_loss_type text not null default 'none',
  max_loss_value numeric,
  ursora_goals text[] not null default '{}',
  self_reported_habits text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trader_profiles enable row level security;

drop policy if exists "own trader profile" on public.trader_profiles;
create policy "own trader profile"
  on public.trader_profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists trader_profiles_updated_idx
  on public.trader_profiles(updated_at desc);
