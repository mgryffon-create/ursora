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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const symbol = 'TSLA';
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const started = Date.now();
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json,text/plain,*/*',
      },
    });
    const raw = await response.text();
    const elapsedMs = Date.now() - started;

    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}

    if (!response.ok) {
      return json({
        success: false,
        symbol,
        http_status: response.status,
        elapsed_ms: elapsedMs,
        error: payload?.finance?.error ?? raw.slice(0, 500),
      }, response.status);
    }

    const result = payload?.optionChain?.result?.[0] ?? null;
    const quote = result?.quote ?? null;
    const expirations = Array.isArray(result?.expirationDates) ? result.expirationDates : [];
    const firstChain = Array.isArray(result?.options) ? result.options[0] : null;
    const calls = Array.isArray(firstChain?.calls) ? firstChain.calls : [];
    const puts = Array.isArray(firstChain?.puts) ? firstChain.puts : [];
    const contracts = [...calls, ...puts];

    const sample = contracts.slice(0, 8).map((row: any) => ({
      contract: row.contractSymbol ?? null,
      type: calls.includes(row) ? 'call' : 'put',
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
      provider: 'Yahoo Finance research endpoint',
      symbol,
      http_status: response.status,
      elapsed_ms: elapsedMs,
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
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
