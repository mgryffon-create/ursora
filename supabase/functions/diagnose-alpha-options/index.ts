import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase runtime credentials are missing.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireUser(req: Request) {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) throw new AuthError('Authentication required.', 401);
  const token = header.slice(7).trim();
  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new AuthError('Invalid or expired session.', 401);
  return user;
}

function alphaKey() {
  const key = Deno.env.get('ALPHA_VANTAGE_API_KEY')?.trim();
  if (!key) throw new Error('ALPHA_VANTAGE_API_KEY is not configured.');
  return key;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function entitlementClassification(message: string) {
  const m = message.toLowerCase();
  if (/premium|subscribe|membership|entitle|realtime options|alpha x terminal/.test(m)) {
    return 'premium_or_entitlement_required';
  }
  if (/frequency|rate limit|requests per minute|requests per day|thank you for using alpha vantage/.test(m)) {
    return 'rate_limited';
  }
  return 'provider_message';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol ?? 'TSLA').trim().toUpperCase();
    const requireGreeks = body.require_greeks !== false;

    if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
      return json({ error: 'Invalid symbol.' }, 400);
    }

    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'REALTIME_OPTIONS');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('require_greeks', requireGreeks ? 'true' : 'false');
    url.searchParams.set('apikey', alphaKey());

    const startedAt = Date.now();
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const raw = await response.text();
    const latencyMs = Date.now() - startedAt;

    let payload: any = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      return json({
        success: false,
        symbol,
        endpoint: 'REALTIME_OPTIONS',
        require_greeks: requireGreeks,
        http_status: response.status,
        latency_ms: latencyMs,
        classification: 'invalid_json',
        preview: raw.slice(0, 500),
      }, response.ok ? 502 : response.status);
    }

    const providerMessage =
      payload?.Note ??
      payload?.Information ??
      payload?.['Error Message'] ??
      payload?.message ??
      null;

    if (!response.ok || providerMessage) {
      const message = String(providerMessage ?? `Alpha Vantage returned HTTP ${response.status}`);
      return json({
        success: false,
        symbol,
        endpoint: 'REALTIME_OPTIONS',
        require_greeks: requireGreeks,
        http_status: response.status,
        latency_ms: latencyMs,
        classification: entitlementClassification(message),
        provider_message: message,
      }, response.ok ? 200 : response.status);
    }

    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.options)
          ? payload.options
          : [];

    const first = rows[0] ?? null;
    const fieldNames = first && typeof first === 'object' ? Object.keys(first).sort() : [];
    const greekFields = ['delta', 'gamma', 'theta', 'vega', 'rho', 'implied_volatility']
      .filter((key) => fieldNames.includes(key));
    const quoteFields = ['bid', 'ask', 'last', 'mark', 'volume', 'open_interest']
      .filter((key) => fieldNames.includes(key));

    return json({
      success: true,
      symbol,
      endpoint: 'REALTIME_OPTIONS',
      require_greeks: requireGreeks,
      http_status: response.status,
      latency_ms: latencyMs,
      contracts_returned: rows.length,
      entitlement_result: rows.length ? 'realtime_options_available' : 'response_received_no_contract_rows',
      quote_fields_present: quoteFields,
      greek_fields_present: greekFields,
      field_names: fieldNames,
      sample: rows.slice(0, 3),
      metadata: payload?.['endpoint'] ?? payload?.['name'] ?? payload?.['Information'] ?? null,
      note: 'Diagnostic only. No provider data was written to URSORA tables.',
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: errorMessage(error) }, 500);
  }
});
