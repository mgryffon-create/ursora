
alter table public.historical_trade_reviews
  add column if not exists context_direction text,
  add column if not exists context_confirmation_at timestamptz,
  add column if not exists context_confirmation_price numeric,
  add column if not exists session_state text,
  add column if not exists weakening_at timestamptz,
  add column if not exists weakening_price numeric;
