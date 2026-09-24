create table if not exists public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null references public.tickers(symbol) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.user_favorites enable row level security;

drop policy if exists "own rows" on public.user_favorites;
create policy "own rows"
  on public.user_favorites
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists user_favorites_user_added_idx
  on public.user_favorites(user_id, added_at asc);
