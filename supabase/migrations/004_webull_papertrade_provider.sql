-- URSORA Webull PaperTrade provider registration.
-- This does not store credentials; WEBULL_APP_KEY / WEBULL_APP_SECRET remain
-- Supabase Edge Function secrets only.
update public.provider_configs
set adapter = 'WebullPaperTradeAdapter',
    mode = 'sandbox',
    supplies = '["stock snapshots","paper account/trading connectivity"]'::jsonb,
    candidate_providers = '["Webull","Tradier"]'::jsonb,
    secret_env_name = 'WEBULL_APP_KEY + WEBULL_APP_SECRET',
    docs_url = 'https://developer.webull.com/apis/docs/',
    notes = 'PaperTrade sandbox configured. Market rows written from sandbox remain clearly marked is_demo=true.'
where provider_key = 'market';
