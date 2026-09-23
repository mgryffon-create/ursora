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

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function atr(bars: AnyRow[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = n(bars[i].h);
    const l = n(bars[i].l);
    const pc = n(bars[i - 1].c);
    if (h === null || l === null || pc === null) continue;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (tr.length < period) return null;
  const recent = tr.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function massiveGet(path: string, params: Record<string, string | number | boolean> = {}) {
  const url = new URL(`https://api.massive.com${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (!/429|rate|limit|5\d\d|temporar/i.test(message) || attempt === 2) throw error;
      await sleep(14000);
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
      stage = 'load ticker list';
      const { data, error } = await db
        .from('tickers')
        .select('symbol')
        .eq('is_default', true)
        .order('priority')
        .limit(5);
      if (error) throw error;
      symbols = (data ?? []).map((row: any) => String(row.symbol).toUpperCase()).filter(Boolean);
    }

    // Massive Basic currently documents a 5-request/minute limit. Test mode therefore
    // deliberately caps one analysis refresh to five symbols so we do not tune the
    // thesis engine around provider throttling.
    symbols = [...new Set(symbols)].slice(0, 5);
    if (!symbols.length) return json({ error: 'No symbols configured.' }, 400);

    const to = new Date();
    const from = new Date(Date.now() - 420 * 86400000);
    const now = new Date().toISOString();
    const results: AnyRow[] = [];
    let barsWritten = 0;

    for (let index = 0; index < symbols.length; index++) {
      const symbol = symbols[index];
      stage = `request Massive daily aggregates for ${symbol}`;

      const payload = await massiveGet(
        `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${isoDate(from)}/${isoDate(to)}`,
        { adjusted: true, sort: 'asc', limit: 500 },
      );

      const bars = Array.isArray(payload?.results) ? payload.results : [];
      if (!bars.length) {
        results.push({ symbol, ok: false, error: 'Massive returned no daily aggregate bars.' });
        continue;
      }

      const rows = bars
        .map((bar: any) => ({
          symbol,
          timeframe: '1d',
          bar_time: new Date(Number(bar.t)).toISOString(),
          open: n(bar.o),
          high: n(bar.h),
          low: n(bar.l),
          close: n(bar.c),
          volume: n(bar.v),
        }))
        .filter((bar: any) =>
          bar.bar_time &&
          bar.open !== null &&
          bar.high !== null &&
          bar.low !== null &&
          bar.close !== null
        );

      stage = `store Massive bars for ${symbol}`;
      const { error: barsError } = await db.from('ohlcv_bars').upsert(rows, {
        onConflict: 'symbol,timeframe,bar_time',
        ignoreDuplicates: false,
      });
      if (barsError) throw barsError;
      barsWritten += rows.length;

      const closes = bars.map((bar: any) => n(bar.c)).filter((value: number | null): value is number => value !== null);
      const volumes = bars.map((bar: any) => n(bar.v)).filter((value: number | null): value is number => value !== null);
      const latest = bars.at(-1);
      const previous = bars.at(-2);
      const latestClose = n(latest?.c);
      const previousClose = n(previous?.c);
      const latestVolume = n(latest?.v);
      const averageVolume = sma(volumes, 20);
      const s20 = sma(closes, 20);
      const s50 = sma(closes, 50);
      const s200 = sma(closes, 200);
      const a14 = atr(bars, 14);
      const rsi14 = rsi(closes, 14);
      const recent20 = bars.slice(-20);
      const lows = recent20.map((bar: any) => n(bar.l)).filter((value: number | null): value is number => value !== null);
      const highs = recent20.map((bar: any) => n(bar.h)).filter((value: number | null): value is number => value !== null);
      const support = lows.length ? Math.min(...lows) : null;
      const resistance = highs.length ? Math.max(...highs) : null;
      const changeAbs = latestClose !== null && previousClose !== null ? latestClose - previousClose : null;
      const changePct = changeAbs !== null && previousClose ? (changeAbs / previousClose) * 100 : null;

      let trend = 'insufficient data';
      if (latestClose !== null && s20 !== null && s50 !== null) {
        trend = latestClose > s20 && s20 > s50 && (s200 === null || s50 > s200)
          ? 'uptrend'
          : latestClose < s20 && s20 < s50 && (s200 === null || s50 < s200)
            ? 'downtrend'
            : 'mixed';
      }

      const quoteRow = {
        symbol,
        price: latestClose,
        change_abs: changeAbs,
        change_pct: changePct,
        day_open: n(latest?.o),
        day_high: n(latest?.h),
        day_low: n(latest?.l),
        prev_close: previousClose,
        prev_day_high: n(previous?.h),
        prev_day_low: n(previous?.l),
        volume: latestVolume,
        avg_volume: averageVolume === null ? null : Math.round(averageVolume),
        rel_volume: averageVolume && latestVolume ? latestVolume / averageVolume : null,
        vwap: n(latest?.vw),
        sma20: s20,
        sma50: s50,
        sma200: s200,
        support,
        resistance,
        gap_pct: n(latest?.o) !== null && previousClose
          ? ((Number(latest.o) - previousClose) / previousClose) * 100
          : null,
        atr: a14,
        momentum_score: rsi14,
        trend,
        source_name: 'Massive Test Data',
        source_type: 'market_data_test',
        published_at: latest?.t ? new Date(Number(latest.t)).toISOString() : now,
        retrieved_at: now,
        confidence: 0.90,
        is_demo: true,
        as_of: latest?.t ? new Date(Number(latest.t)).toISOString() : now,
      };

      stage = `store Massive quote for ${symbol}`;
      const { error: quoteError } = await db.from('quotes').insert(quoteRow);
      if (quoteError) throw quoteError;

      results.push({
        symbol,
        ok: true,
        bars: rows.length,
        latest_bar: quoteRow.as_of,
        price: latestClose,
        rel_volume: quoteRow.rel_volume,
        trend,
      });

      // Respect the documented free-tier limit when several symbols are refreshed.
      if (index < symbols.length - 1) await sleep(12500);
    }

    stage = 'update provider status';
    await db.from('provider_configs').upsert({
      provider_key: 'market',
      interface_name: 'MarketDataProvider',
      display_name: 'Massive Test Market Data',
      adapter: 'MassiveRestTestAdapter',
      mode: 'demo',
      supplies: ['daily OHLCV history', 'price trend inputs', 'volume participation inputs', 'derived technical context'],
      candidate_providers: ['Massive'],
      secret_env_name: 'MASSIVE_API_KEY',
      docs_url: 'https://massive.com/docs/rest/stocks/overview',
      notes: 'Massive REST test integration. Uses end-of-day daily aggregates and is capped at five symbols per refresh while testing against the Basic API allowance.',
      last_sync: now,
      last_error: results.find((row) => row.ok === false)?.error ?? null,
    }, { onConflict: 'provider_key' });

    return json({
      success: true,
      provider: 'Massive',
      mode: 'test',
      symbols_requested: symbols,
      bars_written: barsWritten,
      results,
      is_demo: true,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message, stage }, 500);
  }
});
