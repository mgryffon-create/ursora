create table if not exists public.news_provider_limits (
  provider_key text primary key,
  tier_name text not null default 'free',
  daily_cap integer not null check (daily_cap > 0),
  reserve_manual integer not null default 0 check (reserve_manual >= 0),
  reserve_watchlist integer not null default 0 check (reserve_watchlist >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_provider_usage (
  provider_key text not null references public.news_provider_limits(provider_key) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  calls_used integer not null default 0 check (calls_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider_key, usage_date)
);

create table if not exists public.news_symbol_refresh_state (
  symbol text primary key,
  last_refreshed_at timestamptz not null,
  provider_key text not null,
  priority text not null,
  articles_found integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.news_provider_limits enable row level security;
alter table public.news_provider_usage enable row level security;
alter table public.news_symbol_refresh_state enable row level security;

insert into public.news_provider_limits (
  provider_key, tier_name, daily_cap, reserve_manual, reserve_watchlist
) values (
  'marketaux_news', 'free', 100, 20, 30
)
on conflict (provider_key) do update
set tier_name = excluded.tier_name,
    daily_cap = excluded.daily_cap,
    reserve_manual = excluded.reserve_manual,
    reserve_watchlist = excluded.reserve_watchlist,
    updated_at = now();

create or replace function public.consume_news_provider_call(
  p_provider_key text,
  p_priority text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit public.news_provider_limits%rowtype;
  v_used integer;
  v_ceiling integer;
  v_today date := (now() at time zone 'utc')::date;
begin
  select * into v_limit
  from public.news_provider_limits
  where provider_key = p_provider_key;

  if not found then
    raise exception 'No news provider limit configured for %', p_provider_key;
  end if;

  insert into public.news_provider_usage(provider_key, usage_date, calls_used)
  values (p_provider_key, v_today, 0)
  on conflict (provider_key, usage_date) do nothing;

  select calls_used into v_used
  from public.news_provider_usage
  where provider_key = p_provider_key and usage_date = v_today
  for update;

  if p_priority = 'manual' then
    v_ceiling := v_limit.daily_cap;
  elsif p_priority = 'watchlist_login' then
    v_ceiling := greatest(0, v_limit.daily_cap - v_limit.reserve_manual);
  else
    v_ceiling := greatest(0, v_limit.daily_cap - v_limit.reserve_manual - v_limit.reserve_watchlist);
  end if;

  if v_used >= v_ceiling then
    return jsonb_build_object(
      'allowed', false,
      'calls_used', v_used,
      'daily_cap', v_limit.daily_cap,
      'ceiling', v_ceiling,
      'remaining_total', greatest(0, v_limit.daily_cap - v_used),
      'tier_name', v_limit.tier_name
    );
  end if;

  update public.news_provider_usage
  set calls_used = calls_used + 1,
      updated_at = now()
  where provider_key = p_provider_key and usage_date = v_today
  returning calls_used into v_used;

  return jsonb_build_object(
    'allowed', true,
    'calls_used', v_used,
    'daily_cap', v_limit.daily_cap,
    'ceiling', v_ceiling,
    'remaining_total', greatest(0, v_limit.daily_cap - v_used),
    'tier_name', v_limit.tier_name
  );
end;
$$;

revoke all on function public.consume_news_provider_call(text,text) from public, anon, authenticated;
grant execute on function public.consume_news_provider_call(text,text) to service_role;
