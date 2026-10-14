
alter table public.historical_trade_reviews
  add column if not exists confirmation_to_entry_minutes integer,
  add column if not exists confirmation_to_entry_pct numeric,
  add column if not exists move_consumed_to_target_pct numeric,
  add column if not exists remaining_room_to_target_pct numeric,
  add column if not exists retest_before_entry boolean,
  add column if not exists retest_at timestamptz,
  add column if not exists momentum_state_at_entry text,
  add column if not exists pre_entry_giveback_pct numeric,
  add column if not exists entry_quality_label text,
  add column if not exists entry_quality_score numeric,
  add column if not exists guidance_summary text,
  add column if not exists decision_timeline jsonb not null default '[]'::jsonb;
