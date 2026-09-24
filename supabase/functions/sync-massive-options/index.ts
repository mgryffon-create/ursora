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
  return { user, db };
}

function massiveKey() {
  const key = Deno.env.get('MASSIVE_API_KEY')?.trim();
  if (!key) throw new Error('MASSIVE_API_KEY is not configured as a Supabase Edge Function secret.');
  return key;
}

type AnyRow = Record<string, any>;

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function massiveGet(path: string, params: Record<string, string | number | boolean> = {}) {
  const url = new URL(`https://api.massive.com${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${massiveKey()}`,
          Accept: 'application/json',
        },
      });
      const raw = await response.text();
      let body: any = raw;
      try { body = raw ? JSON.parse(raw) : null; } catch {}

      if (!response.ok) {
        throw new Error(`Massive returned HTTP ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
      }
      return body;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/429|rate|limit|5\d\d|temporar/i.test(message) || attempt === 3) throw error;
      await sleep(15000);
    }
  }
  throw lastError;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  let stage = 'startup';
  try {
    const { db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));

    let symbols: string[] = Array.isArray(body.symbols)
      ? body.symbols.map((value: unknown) => String(value).trim().toUpperCase()).filter(Boolean)
      : [];

    if (!symbols.length) {
      const { data, error } = await db
        .from('tickers')
        .select('symbol')
        .eq('is_default', true)
        .order('priority')
        .limit(5);
      if (error) throw error;
      symbols = (data ?? []).map((row: any) => String(row.symbol).toUpperCase()).filter(Boolean);
    }

    symbols = [...new Set(symbols)].slice(0, 5);
    if (!symbols.length) return json({ error: 'No symbols configured.' }, 400);

    const now = new Date().toISOString();
    const expirationMin = dateOnly(new Date(Date.now() + 5 * 86400000));
    const expirationMax = dateOnly(new Date(Date.now() + 65 * 86400000));
    const results: AnyRow[] = [];
    let totalRows = 0;
    let entitlementErrors = 0;

    for (let index = 0; index < symbols.length; index++) {
      const underlying = symbols[index];

      const { data: quote, error: quoteError } = await db
        .from('quotes')
        .select('id,price')
        .eq('symbol', underlying)
        .order('as_of', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (quoteError) throw quoteError;

      const underlyingPrice = n(quote?.price);
      if (underlyingPrice === null || underlyingPrice <= 0) {
        results.push({ symbol: underlying, ok: false, status: 'no_underlying_price' });
        continue;
      }

      stage = `request Massive option chain for ${underlying}`;

      let payload: any;
      try {
        payload = await massiveGet(
          `/v3/snapshot/options/${encodeURIComponent(underlying)}`,
          {
            'expiration_date.gte': expirationMin,
            'expiration_date.lte': expirationMax,
            'strike_price.gte': Math.max(0.5, underlyingPrice * 0.80).toFixed(2),
            'strike_price.lte': (underlyingPrice * 1.20).toFixed(2),
            order: 'asc',
            sort: 'expiration_date',
            limit: 250,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const entitlement = /401|403|subscription|entitle|plan|not.?authorized/i.test(message);
        if (entitlement) entitlementErrors += 1;
        results.push({
          symbol: underlying,
          ok: false,
          status: entitlement ? 'not_entitled' : 'provider_error',
          error: message,
        });
        if (index < symbols.length - 1) await sleep(12500);
        continue;
      }

      const chain = Array.isArray(payload?.results) ? payload.results : [];
      const rows = chain.map((item: any) => {
        const details = item?.details ?? {};
        const quoteData = item?.last_quote ?? {};
        const trade = item?.last_trade ?? {};
        const day = item?.day ?? {};
        const greeks = item?.greeks ?? {};
        const bid = n(quoteData.bid);
        const ask = n(quoteData.ask);
        const midpoint = n(quoteData.midpoint) ?? (bid !== null && ask !== null ? (bid + ask) / 2 : null);
        const spreadPct = midpoint && midpoint > 0 && bid !== null && ask !== null
          ? ((ask - bid) / midpoint) * 100
          : null;
        const optionType = String(details.contract_type ?? '').toLowerCase() === 'put' ? 'PUT'
          : String(details.contract_type ?? '').toLowerCase() === 'call' ? 'CALL'
          : null;

        return {
          underlying_symbol: underlying,
          option_symbol: String(details.ticker ?? ''),
          instrument_id: String(details.ticker ?? '') || null,
          option_type: optionType,
          strike: n(details.strike_price),
          expiration: String(details.expiration_date ?? ''),
          price: n(trade.price) ?? midpoint ?? n(day.close),
          bid,
          ask,
          volume: n(day.volume),
          open_interest: n(item?.open_interest),
          implied_volatility: n(item?.implied_volatility),
          delta: n(greeks.delta),
          gamma: n(greeks.gamma),
          theta: n(greeks.theta),
          vega: n(greeks.vega),
          spread_pct: spreadPct,
          retrieved_at: now,
          source_name: 'Massive Option Chain Snapshot',
          is_demo: true,
        };
      }).filter((row: AnyRow) =>
        row.option_symbol &&
        ['CALL', 'PUT'].includes(String(row.option_type)) &&
        row.strike !== null &&
        row.expiration
      );

      if (rows.length) {
        stage = `store Massive option chain for ${underlying}`;
        const { error: insertError } = await db.from('option_market_snapshots').insert(rows);
        if (insertError) throw insertError;
        totalRows += rows.length;
      }

      const callRows = rows.filter((row: AnyRow) => row.option_type === 'CALL');
      const putRows = rows.filter((row: AnyRow) => row.option_type === 'PUT');
      const callVolume = callRows.reduce((sum: number, row: AnyRow) => sum + Number(row.volume ?? 0), 0);
      const putVolume = putRows.reduce((sum: number, row: AnyRow) => sum + Number(row.volume ?? 0), 0);
      const totalOI = rows.reduce((sum: number, row: AnyRow) => sum + Number(row.open_interest ?? 0), 0);
      const atmRows = [...rows]
        .sort((a: AnyRow, b: AnyRow) =>
          Math.abs(Number(a.strike) - underlyingPrice) - Math.abs(Number(b.strike) - underlyingPrice)
        )
        .slice(0, 8);
      const atmIvs = atmRows
        .map((row: AnyRow) => n(row.implied_volatility))
        .filter((value: number | null): value is number => value !== null);
      const atmIv = atmIvs.length ? atmIvs.reduce((a: number, b: number) => a + b, 0) / atmIvs.length : null;
      const unusual = rows.some((row: AnyRow) =>
        Number(row.volume ?? 0) >= 100 &&
        Number(row.volume ?? 0) > Number(row.open_interest ?? 0)
      );

      if (quote?.id) {
        const { error: updateError } = await db.from('quotes').update({
          call_volume: callVolume || null,
          put_volume: putVolume || null,
          put_call_ratio: callVolume > 0 ? putVolume / callVolume : null,
          total_oi: totalOI || null,
          iv: atmIv,
          unusual_options_volume: unusual,
          retrieved_at: now,
        }).eq('id', quote.id);
        if (updateError) throw updateError;
      }

      results.push({
        symbol: underlying,
        ok: true,
        status: rows.length ? 'available' : 'no_data',
        contracts: rows.length,
        call_volume: callVolume,
        put_volume: putVolume,
        put_call_ratio: callVolume > 0 ? putVolume / callVolume : null,
        total_open_interest: totalOI,
        atm_iv: atmIv,
        unusual_options_volume: unusual,
      });

      if (index < symbols.length - 1) await sleep(12500);
    }

    const allEntitlementBlocked = entitlementErrors === symbols.length;
    stage = 'update provider status';
    await db.from('provider_configs').upsert({
      provider_key: 'options',
      interface_name: 'OptionsDataProvider',
      display_name: 'Massive Options',
      adapter: 'MassiveOptionChainSnapshotAdapter',
      mode: allEntitlementBlocked ? 'error' : 'demo',
      supplies: ['option chain snapshots', 'bid/ask', 'volume', 'open interest', 'implied volatility', 'Greeks'],
      candidate_providers: ['Massive'],
      secret_env_name: 'MASSIVE_API_KEY',
      docs_url: 'https://massive.com/docs/rest/options/snapshots/option-chain-snapshot',
      notes: allEntitlementBlocked
        ? 'The current Massive API entitlement did not allow option-chain snapshots on the latest refresh.'
        : 'Massive option-chain snapshots are connected for the test universe. Contract rows remain demo-labelled while URSORA validates the data pipeline.',
      last_sync: now,
      last_error: allEntitlementBlocked ? 'Massive option-chain snapshot entitlement is unavailable for this API key/plan.' : null,
    }, { onConflict: 'provider_key' });

    return json({
      success: true,
      provider: 'Massive',
      mode: 'test',
      entitlement_status: allEntitlementBlocked ? 'not_entitled' : 'available_or_partial',
      contracts_written: totalRows,
      results,
      is_demo: true,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({
      error: error instanceof Error ? error.message : String(error),
      stage,
    }, 500);
  }
});
