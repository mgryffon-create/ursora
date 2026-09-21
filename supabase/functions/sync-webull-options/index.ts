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

function handleOptions(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
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
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new AuthError('Authentication required.', 401);
  const token = authHeader.slice(7).trim();
  if (!token) throw new AuthError('Authentication required.', 401);

  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new AuthError('Invalid or expired session.', 401);
  return { user, db };
}

function webullConfig() {
  const appKey = Deno.env.get('WEBULL_APP_KEY');
  const appSecret = Deno.env.get('WEBULL_APP_SECRET');
  const environment = (Deno.env.get('WEBULL_ENVIRONMENT') || 'sandbox').toLowerCase();
  if (!appKey || !appSecret) throw new Error('Webull credentials are missing.');
  const baseUrl = environment === 'sandbox'
    ? 'https://api.sandbox.webull.com'
    : 'https://api.webull.com';
  return { appKey, appSecret, environment, baseUrl };
}

function summarizeWebullError(error: unknown) {
  return { message: error instanceof Error ? error.message : String(error) };
}

async function signWebullRequest(method: string, path: string, query: URLSearchParams, bodyText: string) {
  const { appKey, appSecret } = webullConfig();
  const timestamp = new Date().toISOString();
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const canonical = [method.toUpperCase(), path, canonicalQuery, appKey, timestamp, bodyText].join('\n');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));
  const signature = Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { 'X-App-Key': appKey, 'X-Timestamp': timestamp, 'X-Signature': signature };
}

async function webullGet<T = unknown>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const config = webullConfig();
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) query.set(k, String(v));
  const headers = await signWebullRequest('GET', path, query, '');
  const url = `${config.baseUrl}${path}${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`Webull returned HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) as T : {} as T;
}

async function webullPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const config = webullConfig();
  const query = new URLSearchParams();
  const bodyText = JSON.stringify(body);
  const headers = await signWebullRequest('POST', path, query, bodyText);
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: bodyText,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Webull returned HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) as T : {} as T;
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

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withWebullRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const detail = summarizeWebullError(error);
      const retryable = /429|rate|thrott|temporar|timeout|5\d\d/i.test(detail.message);
      if (!retryable || attempt === 3) throw error;
      await sleep(900 * (2 ** attempt));
    }
  }
  throw lastError;
}

async function fetchContracts(
  underlying: string,
  underlyingPrice: number,
): Promise<AnyRow[]> {
  const start = new Date();
  const end = new Date(Date.now() + 60 * 86400000);
  const all: AnyRow[] = [];
  let paginationKey = '';

  for (let page = 0; page < 2; page++) {
    const payload = await withWebullRetry(() => webullGet<any>('/trading/instruments/options/contracts/list', {
      category: 'US_OPTION',
      underlying_symbols: underlying,
      status: 'LISTING',
      start_date: dateOnly(start),
      end_date: dateOnly(end),
      strike_price_gte: Math.max(0.5, underlyingPrice * 0.80).toFixed(2),
      strike_price_lte: (underlyingPrice * 1.20).toFixed(2),
      ...(paginationKey ? { pagination_key: paginationKey } : {}),
    }));

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    all.push(...rows);
    paginationKey = String(payload?.pagination_key ?? '');
    if (!paginationKey || !rows.length) break;
  }

  return all;
}

async function fetchOptionSnapshots(symbols: string[]): Promise<AnyRow[]> {
  const all: AnyRow[] = [];
  for (const batch of chunks(symbols, 20)) {
    const payload = await withWebullRetry(() => webullGet<any>('/market-data/options/snapshots/list', {
      symbols: batch.join(','),
      category: 'US_OPTION',
    }));
    const rows = Array.isArray(payload) ? payload
      : Array.isArray(payload?.data) ? payload.data
      : Array.isArray(payload?.result) ? payload.result
      : [];
    all.push(...rows);
  }
  return all;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db } = await requireUser(req);
    const config = webullConfig();
    const body = await req.json().catch(() => ({}));

    let symbols: string[] = Array.isArray(body?.symbols)
      ? body.symbols.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean)
      : [];

    if (!symbols.length) {
      const { data, error } = await db.from('tickers').select('symbol').eq('is_default', true).order('priority').limit(8);
      if (error) throw error;
      symbols = (data ?? []).map((r: any) => String(r.symbol).toUpperCase()).filter(Boolean);
    }
    symbols = [...new Set(symbols)].slice(0, 8);

    const now = new Date().toISOString();
    const results: AnyRow[] = [];

    for (const underlying of symbols) {
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
        results.push({ symbol: underlying, ok: false, error: 'No underlying price is available.' });
        continue;
      }

      const contracts = await fetchContracts(underlying, underlyingPrice);
      const eligible = contracts
        .filter((c) => ['CALL', 'PUT'].includes(String(c.option_type ?? '').toUpperCase()))
        .map((c) => ({ ...c, _strike: n(c.strike_price) }))
        .filter((c) => c._strike !== null)
        .sort((a, b) => {
          const expiryA = String(a.expiration_date ?? '');
          const expiryB = String(b.expiration_date ?? '');
          if (expiryA !== expiryB) return expiryA.localeCompare(expiryB);
          return Math.abs(Number(a._strike) - underlyingPrice) - Math.abs(Number(b._strike) - underlyingPrice);
        });

      // Keep a focused chain around the money across the nearest expirations.
      const byExpiry = new Map<string, AnyRow[]>();
      for (const c of eligible) {
        const expiry = String(c.expiration_date ?? '');
        if (!expiry) continue;
        const set = byExpiry.get(expiry) ?? [];
        set.push(c);
        byExpiry.set(expiry, set);
      }

      const selected: AnyRow[] = [];
      for (const expiry of [...byExpiry.keys()].sort().slice(0, 3)) {
        const set = byExpiry.get(expiry) ?? [];
        const calls = set.filter((c) => String(c.option_type).toUpperCase() === 'CALL').slice(0, 8);
        const puts = set.filter((c) => String(c.option_type).toUpperCase() === 'PUT').slice(0, 8);
        selected.push(...calls, ...puts);
      }

      const symbolsToQuote = selected.map((c) => String(c.symbol ?? '')).filter(Boolean);
      const snapshots = await fetchOptionSnapshots(symbolsToQuote);
      const snapshotMap = new Map(snapshots.map((s) => [String(s.symbol ?? ''), s]));

      const rows = selected.map((c) => {
        const s = snapshotMap.get(String(c.symbol ?? '')) ?? {};
        const bid = n(s.bid);
        const ask = n(s.ask);
        const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
        const spreadPct = mid && mid > 0 && bid !== null && ask !== null ? ((ask - bid) / mid) * 100 : null;

        return {
          underlying_symbol: underlying,
          option_symbol: String(c.symbol),
          instrument_id: String(c.instrument_id ?? s.instrument_id ?? '') || null,
          option_type: String(c.option_type).toUpperCase(),
          strike: n(c.strike_price),
          expiration: String(c.expiration_date),
          price: n(s.price),
          bid,
          ask,
          volume: n(s.volume),
          open_interest: n(s.open_interest),
          implied_volatility: n(s.imp_vol),
          delta: n(s.delta),
          gamma: n(s.gamma),
          theta: n(s.theta),
          vega: n(s.vega),
          spread_pct: spreadPct,
          retrieved_at: now,
          source_name: 'Webull PaperTrade Sandbox',
          is_demo: true,
        };
      }).filter((r) => r.option_symbol && r.strike !== null && r.expiration);

      if (rows.length) {
        const { error: insertError } = await db.from('option_market_snapshots').insert(rows);
        if (insertError) throw insertError;
      }

      const callRows = rows.filter((r) => r.option_type === 'CALL');
      const putRows = rows.filter((r) => r.option_type === 'PUT');
      const callVolume = callRows.reduce((a, r) => a + Number(r.volume ?? 0), 0);
      const putVolume = putRows.reduce((a, r) => a + Number(r.volume ?? 0), 0);
      const totalOI = rows.reduce((a, r) => a + Number(r.open_interest ?? 0), 0);
      const atm = [...rows]
        .sort((a, b) => Math.abs(Number(a.strike) - underlyingPrice) - Math.abs(Number(b.strike) - underlyingPrice))
        .slice(0, 6);
      const ivs = atm.map((r) => n(r.implied_volatility)).filter((v): v is number => v !== null);
      const atmIv = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
      const unusual = rows.some((r) => Number(r.volume ?? 0) >= 100 && Number(r.volume ?? 0) > Number(r.open_interest ?? 0));

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
        contracts_discovered: contracts.length,
        contracts_sampled: rows.length,
        call_volume: callVolume,
        put_volume: putVolume,
        put_call_ratio: callVolume > 0 ? putVolume / callVolume : null,
        total_open_interest: totalOI,
        atm_iv: atmIv,
        unusual_options_volume: unusual,
      });

      // Pace requests between underlyings so one analysis run does not burst the sandbox API.
      await sleep(450);
    }

    await db.from('provider_configs').update({
      adapter: 'WebullPaperTradeOptionsAdapter',
      mode: 'sandbox',
      last_sync: now,
      last_error: null,
      notes: 'Webull sandbox option contracts and option snapshots connected. Bid/ask, volume, open interest, implied volatility and Greeks are stored for TradeCycle analysis.',
    }).eq('provider_key', 'options');

    return json({
      success: true,
      provider: 'Webull',
      environment: config.environment,
      results,
      is_demo: true,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    const detail = summarizeWebullError(error);
    return json({ error: detail.message, detail }, 500);
  }
});
