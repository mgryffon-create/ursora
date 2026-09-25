begin;

create table if not exists public.symbol_analysis_memory (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null references public.tickers(symbol) on delete cascade,
  signal_id bigint not null references public.signals(id) on delete cascade,
  analyzed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create index if not exists symbol_analysis_memory_user_updated_idx
  on public.symbol_analysis_memory(user_id, updated_at desc);

alter table public.symbol_analysis_memory enable row level security;

drop policy if exists "users read own symbol analysis memory" on public.symbol_analysis_memory;
create policy "users read own symbol analysis memory"
on public.symbol_analysis_memory
for select
using (auth.uid() = user_id);

drop policy if exists "users manage own symbol analysis memory" on public.symbol_analysis_memory;
create policy "users manage own symbol analysis memory"
on public.symbol_analysis_memory
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;
