with ranked as (
  select id,
         row_number() over (
           partition by coalesce(symbol, '__MARKET__'), coalesce(url, lower(headline))
           order by retrieved_at desc, id desc
         ) as rn
  from public.news_items
)
delete from public.news_items n
using ranked r
where n.id = r.id and r.rn > 1;

alter table public.news_items
  add column if not exists dedupe_key text
  generated always as (
    coalesce(symbol, '__MARKET__') || '|' || coalesce(url, lower(headline))
  ) stored;

create unique index if not exists news_items_dedupe_key_uidx
  on public.news_items(dedupe_key);
