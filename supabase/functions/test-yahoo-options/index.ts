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

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cookiePairs(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [response.headers.get('set-cookie') ?? ''].filter(Boolean);
  return values
    .map((value) => value.split(';')[0]?.trim())
    .filter((value): value is string => Boolean(value && value.includes('=')));
}

function mergeCookies(...groups: string[][]): string {
  const map = new Map<string, string>();
  for (const pair of groups.flat()) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    map.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const symbol = 'TSLA';
  const started = Date.now();

  try {
    // Yahoo's v7 options endpoint is crumb-protected. Bootstrap a Yahoo session,
    // obtain the crumb using the same cookie, then retry the options request.
    const bootstrap = await fetch('https://fc.yahoo.com', {
      headers: browserHeaders,
      redirect: 'follow',
    });
    const bootstrapCookies = cookiePairs(bootstrap);
    const cookieHeader = mergeCookies(bootstrapCookies);

    const crumbResponse = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        ...browserHeaders,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: 'follow',
    });
    const crumbCookies = cookiePairs(crumbResponse);
    const mergedCookieHeader = mergeCookies(bootstrapCookies, crumbCookies);
    const crumb = (await crumbResponse.text()).trim();

    const crumbLooksValid = crumbResponse.ok &&
      Boolean(crumb) &&
      !/<html|too many requests|unauthorized/i.test(crumb);

    if (!crumbLooksValid) {
      return json({
        success: false,
        stage: 'crumb',
        symbol,
        elapsed_ms: Date.now() - started,
        bootstrap_status: bootstrap.status,
        bootstrap_cookie_count: bootstrapCookies.length,
        crumb_status: crumbResponse.status,
        crumb_received: false,
        crumb_preview: crumb.slice(0, 120),
        note: 'Yahoo session bootstrap did not yield a usable crumb in the Supabase Edge runtime.',
      });
    }

    const url = new URL(`https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`);
    url.searchParams.set('crumb', crumb);

    const response = await fetch(url, {
      headers: {
        ...browserHeaders,
        ...(mergedCookieHeader ? { Cookie: mergedCookieHeader } : {}),
      },
      redirect: 'follow',
    });
    const raw = await response.text();

    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}

    if (!response.ok) {
      return json({
        success: false,
        stage: 'options',
        symbol,
        http_status: response.status,
        elapsed_ms: Date.now() - started,
        bootstrap_status: bootstrap.status,
        bootstrap_cookie_count: bootstrapCookies.length,
        crumb_status: crumbResponse.status,
        crumb_received: true,
        error: payload?.finance?.error ?? raw.slice(0, 500),
        note: 'The crumb handshake completed, but Yahoo still rejected the options request. This can indicate cookie/TLS-fingerprint enforcement in the serverless runtime.',
      }, response.status);
    }

    const result = payload?.optionChain?.result?.[0] ?? null;
    const quote = result?.quote ?? null;
    const expirations = Array.isArray(result?.expirationDates) ? result.expirationDates : [];
    const firstChain = Array.isArray(result?.options) ? result.options[0] : null;
    const calls = Array.isArray(firstChain?.calls) ? firstChain.calls : [];
    const puts = Array.isArray(firstChain?.puts) ? firstChain.puts : [];
    const contracts = [
      ...calls.map((row: any) => ({ ...row, __type: 'call' })),
      ...puts.map((row: any) => ({ ...row, __type: 'put' })),
    ];

    const sample = contracts.slice(0, 8).map((row: any) => ({
      contract: row.contractSymbol ?? null,
      type: row.__type,
      strike: n(row.strike),
      last: n(row.lastPrice),
      bid: n(row.bid),
      ask: n(row.ask),
      volume: n(row.volume),
      open_interest: n(row.openInterest),
      implied_volatility: n(row.impliedVolatility),
      last_trade_epoch: n(row.lastTradeDate),
      in_the_money: row.inTheMoney === true,
    }));

    return json({
      success: Boolean(result && contracts.length),
      stage: 'complete',
      provider: 'Yahoo Finance research endpoint',
      symbol,
      http_status: response.status,
      elapsed_ms: Date.now() - started,
      bootstrap_status: bootstrap.status,
      bootstrap_cookie_count: bootstrapCookies.length,
      crumb_status: crumbResponse.status,
      crumb_received: true,
      underlying_price: n(quote?.regularMarketPrice),
      expiration_count: expirations.length,
      first_expiration_epoch: expirations[0] ?? null,
      contracts_in_first_expiration: contracts.length,
      coverage: {
        with_bid: contracts.filter((r: any) => n(r.bid) !== null).length,
        with_ask: contracts.filter((r: any) => n(r.ask) !== null).length,
        with_volume: contracts.filter((r: any) => n(r.volume) !== null).length,
        with_open_interest: contracts.filter((r: any) => n(r.openInterest) !== null).length,
        with_iv: contracts.filter((r: any) => n(r.impliedVolatility) !== null).length,
      },
      sample,
      note: 'Diagnostic only. Yahoo Finance is an undocumented research source, not execution-grade market data.',
    });
  } catch (error) {
    return json({
      success: false,
      stage: 'exception',
      symbol,
      elapsed_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
