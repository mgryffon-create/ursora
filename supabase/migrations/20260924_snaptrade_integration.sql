begin;

create table if not exists public.snaptrade_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snaptrade_user_id text not null unique,
  user_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.snaptrade_credentials enable row level security;
-- Intentionally no client policies. Only service-role Edge Functions may read user_secret.

create table if not exists public.snaptrade_accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id text,
  institution_name text,
  name text,
  masked_number text,
  account_category text,
  raw_type text,
  status text,
  is_paper boolean not null default false,
  total_value numeric,
  total_value_currency text,
  transactions_initial_sync_completed boolean,
  transactions_last_successful_sync date,
  holdings_initial_sync_completed boolean,
  holdings_last_successful_sync timestamptz,
  holdings_unavailable boolean,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists snaptrade_accounts_user_id_idx on public.snaptrade_accounts(user_id);

alter table public.snaptrade_accounts enable row level security;

drop policy if exists "users read own snaptrade accounts" on public.snaptrade_accounts;
create policy "users read own snaptrade accounts"
on public.snaptrade_accounts for select
using (auth.uid() = user_id);

create table if not exists public.snaptrade_balances (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.snaptrade_accounts(id) on delete cascade,
  currency_code text not null,
  cash numeric,
  buying_power numeric,
  synced_at timestamptz not null default now(),
  primary key (account_id, currency_code)
);

alter table public.snaptrade_balances enable row level security;
drop policy if exists "users read own snaptrade balances" on public.snaptrade_balances;
create policy "users read own snaptrade balances"
on public.snaptrade_balances for select
using (auth.uid() = user_id);

create table if not exists public.snaptrade_positions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.snaptrade_accounts(id) on delete cascade,
  instrument_id text,
  instrument_kind text,
  symbol text,
  raw_symbol text,
  option_symbol text,
  option_type text,
  strike numeric,
  expiration date,
  units numeric,
  price numeric,
  cost_basis numeric,
  currency text,
  cash_equivalent boolean,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists snaptrade_positions_account_idx on public.snaptrade_positions(account_id);
create index if not exists snaptrade_positions_user_symbol_idx on public.snaptrade_positions(user_id, symbol);

alter table public.snaptrade_positions enable row level security;
drop policy if exists "users read own snaptrade positions" on public.snaptrade_positions;
create policy "users read own snaptrade positions"
on public.snaptrade_positions for select
using (auth.uid() = user_id);

create table if not exists public.snaptrade_activities (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.snaptrade_accounts(id) on delete cascade,
  symbol text,
  raw_symbol text,
  option_symbol text,
  option_type text,
  strike numeric,
  expiration date,
  activity_type text,
  option_action text,
  units numeric,
  price numeric,
  amount numeric,
  fee numeric,
  currency text,
  trade_date timestamptz,
  settlement_date timestamptz,
  institution text,
  external_reference_id text,
  description text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists snaptrade_activities_user_trade_date_idx
  on public.snaptrade_activities(user_id, trade_date desc);
create index if not exists snaptrade_activities_account_idx
  on public.snaptrade_activities(account_id);

alter table public.snaptrade_activities enable row level security;
drop policy if exists "users read own snaptrade activities" on public.snaptrade_activities;
create policy "users read own snaptrade activities"
on public.snaptrade_activities for select
using (auth.uid() = user_id);

commit;
