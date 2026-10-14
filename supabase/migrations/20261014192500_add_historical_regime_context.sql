
alter table public.historical_trade_reviews
  add column if not exists regime_label text,
  add column if not exists regime_direction text,
  add column if not exists regime_summary text,
  add column if not exists session_range_ratio numeric,
  add column if not exists directional_efficiency numeric,
  add column if not exists vwap_at_entry numeric,
  add column if not exists vwap_distance_pct numeric,
  add column if not exists relative_volume_at_entry numeric,
  add column if not exists momentum_30m_pct numeric,
  add column if not exists vwap_cross_count integer;
