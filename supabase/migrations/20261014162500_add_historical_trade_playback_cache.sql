create table if not exists public.historical_trade_playback_cache (
  user_id uuid not null,
  brokerage_episode_id bigint not null references public.snaptrade_trade_episodes(id) on delete cascade,
  symbol text not null,
  timeframe text not null default '5m',
  context_start date not null,
  entry_session date not null,
  exit_session date not null,
  bars jsonb not null,
  source text not null default 'Massive',
  fetched_at timestamptz not null default now(),
  primary key (user_id, brokerage_episode_id)
);

create index if not exists historical_trade_playback_cache_symbol_idx
  on public.historical_trade_playback_cache(user_id, symbol, entry_session);

alter table public.historical_trade_playback_cache enable row level security;

drop policy if exists "own historical playback cache" on public.historical_trade_playback_cache;
create policy "own historical playback cache"
  on public.historical_trade_playback_cache
  for select
  using (user_id = auth.uid());
