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

function alphaKey() {
  const key = Deno.env.get('ALPHA_VANTAGE_API_KEY')?.trim();
  if (!key) throw new Error('ALPHA_VANTAGE_API_KEY is not configured.');
  return key;
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    // Temporary entitlement probe. Hard-coded to TSLA so the unauthenticated
    // endpoint cannot be used as a general-purpose Alpha Vantage proxy.
    const symbol = 'TSLA';

    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'REALTIME_OPTIONS');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('require_greeks', 'true');
    url.searchParams.set('apikey', alphaKey());

    const started = Date.now();
    const response = await fetch(url);
    const raw = await response.text();
    const elapsedMs = Date.now() - started;

    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}

    const providerMessage = payload?.Note ?? payload?.Information ?? payload?.['Error Message'] ?? null;
    if (!response.ok) {
      return json({
        success: false,
        symbol,
        http_status: response.status,
        elapsed_ms: elapsedMs,
        provider_message: providerMessage ?? raw.slice(0, 500),
        entitlement: 'unknown',
      }, response.status);
    }

    if (providerMessage) {
      const message = String(providerMessage);
      const blocked = /premium|subscription|entitle|upgrade|not available|not authorized|higher api tier/i.test(message);
      const limited = /rate|frequency|limit|call frequency/i.test(message);
      return json({
        success: false,
        symbol,
        http_status: response.status,
        elapsed_ms: elapsedMs,
        provider_message: message,
        entitlement: blocked ? 'not_entitled' : limited ? 'rate_limited' : 'unknown',
      });
    }

    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.options)
          ? payload.options
          : [];

    const sample = rows.slice(0, 5).map((row: any) => ({
      contract: stringValue(row.contractID ?? row.contract ?? row.symbol),
      type: stringValue(row.type),
      strike: n(row.strike),
      expiration: stringValue(row.expiration),
      last: n(row.last),
      bid: n(row.bid),
      ask: n(row.ask),
      volume: n(row.volume),
      open_interest: n(row.open_interest ?? row.openInterest),
      implied_volatility: n(row.implied_volatility ?? row.impliedVolatility),
      delta: n(row.delta),
      gamma: n(row.gamma),
      theta: n(row.theta),
      vega: n(row.vega),
      rho: n(row.rho),
    }));

    const fieldCoverage = {
      contracts: rows.length,
      with_bid: rows.filter((r: any) => n(r.bid) !== null).length,
      with_ask: rows.filter((r: any) => n(r.ask) !== null).length,
      with_open_interest: rows.filter((r: any) => n(r.open_interest ?? r.openInterest) !== null).length,
      with_iv: rows.filter((r: any) => n(r.implied_volatility ?? r.impliedVolatility) !== null).length,
      with_delta: rows.filter((r: any) => n(r.delta) !== null).length,
      with_gamma: rows.filter((r: any) => n(r.gamma) !== null).length,
      with_theta: rows.filter((r: any) => n(r.theta) !== null).length,
      with_vega: rows.filter((r: any) => n(r.vega) !== null).length,
      with_rho: rows.filter((r: any) => n(r.rho) !== null).length,
    };

    return json({
      success: rows.length > 0,
      symbol,
      http_status: response.status,
      elapsed_ms: elapsedMs,
      entitlement: rows.length > 0 ? 'available' : 'no_rows',
      endpoint: 'REALTIME_OPTIONS',
      require_greeks: true,
      provider_message: null,
      metadata: payload?.endpoint ?? payload?.message ?? payload?.metadata ?? null,
      coverage: fieldCoverage,
      sample,
      top_level_keys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
