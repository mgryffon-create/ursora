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
  if (!key) throw new Error('MASSIVE_API_KEY is not configured.');
  return key;
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function easternDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

type Horizon = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';

const HORIZONS: Record<Horizon, {
  multiplier: number;
  timespan: 'minute' | 'day';
  timeframe: string;
  lookbackDays: number;
  latestSessionOnly?: boolean;
}> = {
  '1D': { multiplier: 5, timespan: 'minute', timeframe: '5m', lookbackDays: 5, latestSessionOnly: true },
  '1W': { multiplier: 30, timespan: 'minute', timeframe: '30m', lookbackDays: 12 },
  '1M': { multiplier: 1, timespan: 'day', timeframe: '1d', lookbackDays: 45 },
  '3M': { multiplier: 1, timespan: 'day', timeframe: '1d', lookbackDays: 125 },
  '6M': { multiplier: 1, timespan: 'day', timeframe: '1d', lookbackDays: 230 },
  '1Y': { multiplier: 1, timespan: 'day', timeframe: '1d', lookbackDays: 390 },
};

async function massiveGet(path: string, params: Record<string, string | number | boolean>) {
  const url = new URL(`https://api.massive.com${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol ?? '').trim().toUpperCase();
    const horizon = String(body.horizon ?? '1M').toUpperCase() as Horizon;

    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return json({ error: 'A valid ticker symbol is required.' }, 400);
    if (!(horizon in HORIZONS)) return json({ error: 'Unsupported chart horizon.' }, 400);

    const config = HORIZONS[horizon];
    const to = new Date();
    const from = new Date(to.getTime() - config.lookbackDays * 86400000);

    const payload = await massiveGet(
      `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${config.multiplier}/${config.timespan}/${isoDate(from)}/${isoDate(to)}`,
      { adjusted: true, sort: 'asc', limit: 5000 },
    );

    let results = Array.isArray(payload?.results) ? payload.results : [];

    // 1D means the latest actual trading session, not an arbitrary 24-hour slice.
    if (config.latestSessionOnly && results.length) {
      const latestSession = easternDateKey(new Date(Number(results.at(-1)?.t)));
      results = results.filter((bar: any) => easternDateKey(new Date(Number(bar.t))) === latestSession);
    }

    const retrievedAt = new Date().toISOString();
    const rows = results
      .map((bar: any) => ({
        symbol,
        timeframe: config.timeframe,
        bar_time: new Date(Number(bar.t)).toISOString(),
        open: n(bar.o),
        high: n(bar.h),
        low: n(bar.l),
        close: n(bar.c),
        volume: Math.round(n(bar.v) ?? 0),
        source_name: `Massive ${config.multiplier} ${config.timespan} aggregates`,
        retrieved_at: retrievedAt,
      }))
      .filter((bar: any) =>
        bar.bar_time &&
        bar.open !== null &&
        bar.high !== null &&
        bar.low !== null &&
        bar.close !== null
      );

    if (rows.length) {
      const { error } = await db.from('ohlcv_bars').upsert(rows, {
        onConflict: 'symbol,timeframe,bar_time',
        ignoreDuplicates: false,
      });
      if (error) throw error;
    }

    return json({
      success: true,
      symbol,
      horizon,
      timeframe: config.timeframe,
      source: 'Massive custom aggregate bars',
      bars: rows.map(({ bar_time, open, high, low, close, volume }) => ({
        bar_time, open, high, low, close, volume,
      })),
      retrieved_at: retrievedAt,
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, status);
  }
});
