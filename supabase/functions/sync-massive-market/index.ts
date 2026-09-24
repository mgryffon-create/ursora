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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

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

function massiveTimestamp(value: unknown): string | null {
  const parsed = n(value);
  if (parsed === null) return null;
  const ms = parsed > 1e15 ? parsed / 1e6 : parsed > 1e12 ? parsed : parsed > 1e9 ? parsed * 1000 : null;
  if (ms === null || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function easternParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function marketPhase(value = new Date()) {
  const et = easternParts(value);
  const mins = et.hour * 60 + et.minute;
  const weekend = et.weekday === 'Sat' || et.weekday === 'Sun';
  const sessionKey = `${et.year}-${String(et.month).padStart(2, '0')}-${String(et.day).padStart(2, '0')}`;

  if (weekend) return { phase: 'weekend' as const, sessionKey, regularOpen: false };
  if (mins >= 570 && mins < 960) return { phase: 'regular' as const, sessionKey, regularOpen: true };
  if (mins >= 960) return { phase: 'after_hours' as const, sessionKey, regularOpen: false };
  if (mins >= 240) return { phase: 'premarket' as const, sessionKey, regularOpen: false };
  return { phase: 'closed' as const, sessionKey, regularOpen: false };
}

function etSessionKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const et = easternParts(date);
  return `${et.year}-${String(et.month).padStart(2, '0')}-${String(et.day).padStart(2, '0')}`;
}

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
      const message = errorMessage(error);
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
        .limit(14);
      if (error) throw error;
      symbols = (data ?? []).map((row: any) => String(row.symbol).toUpperCase()).filter(Boolean);
    }

    // Keep the full default universe in one refresh. Current quotes come from one
    // multi-ticker snapshot call; historical bars are reused from the database and
    // only fetched from Massive when a symbol has insufficient local history.
    symbols = [...new Set(symbols)].slice(0, 20);
    if (!symbols.length) return json({ error: 'No symbols configured.' }, 400);

    const to = new Date();
    const from = new Date(Date.now() - 420 * 86400000);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const session = marketPhase(nowDate);
    const results: AnyRow[] = [];
    let barsWritten = 0;

    stage = 'load existing frozen closing quotes';
    const { data: frozenRows, error: frozenRowsError } = await db
      .from('quotes')
      .select('*')
      .in('symbol', symbols)
      .eq('source_type', 'market_data_eod_test')
      .order('retrieved_at', { ascending: true })
      .limit(500);
    if (frozenRowsError) throw frozenRowsError;

    const frozenBySymbol = new Map<string, AnyRow>();
    const latestFrozenBySymbol = new Map<string, AnyRow>();
    for (const row of frozenRows ?? []) {
      const symbol = String((row as any).symbol ?? '').toUpperCase();
      if (!symbol) continue;
      latestFrozenBySymbol.set(symbol, row as AnyRow);
      const key = etSessionKey((row as any).as_of ?? (row as any).published_at);
      if (key === session.sessionKey) {
        frozenBySymbol.set(symbol, row as AnyRow);
      }
    }

    stage = 'load cached daily history';
    const { data: cachedBarRows, error: cachedBarsError } = await db
      .from('ohlcv_bars')
      .select('symbol,bar_time,open,high,low,close,volume')
      .in('symbol', symbols)
      .eq('timeframe', '1d')
      .order('bar_time', { ascending: true })
      .limit(12000);
    if (cachedBarsError) throw cachedBarsError;

    const cachedBarsBySymbol = new Map<string, AnyRow[]>();
    for (const row of cachedBarRows ?? []) {
      const symbol = String((row as any).symbol ?? '').toUpperCase();
      if (!symbol) continue;
      const list = cachedBarsBySymbol.get(symbol) ?? [];
      list.push({
        t: new Date((row as any).bar_time).getTime(),
        o: n((row as any).open),
        h: n((row as any).high),
        l: n((row as any).low),
        c: n((row as any).close),
        v: n((row as any).volume),
      });
      cachedBarsBySymbol.set(symbol, list);
    }

    let historyRequestsUsed = 0;

    // One snapshot request can cover the whole test universe and gives URSORA the
    // most current price Massive exposes to this plan. If snapshot access is not
    // included, history still refreshes and the response reports the entitlement gap.
    stage = 'request Massive stock snapshots';
    let snapshotStatus: 'available' | 'not_entitled_or_unavailable' = 'available';
    const snapshots = new Map<string, AnyRow>();
    try {
      const snapshotPayload = await massiveGet(
        '/v2/snapshot/locale/us/markets/stocks/tickers',
        { tickers: symbols.join(','), include_otc: false },
      );
      for (const row of Array.isArray(snapshotPayload?.tickers) ? snapshotPayload.tickers : []) {
        const ticker = String(row?.ticker ?? '').toUpperCase();
        if (ticker) snapshots.set(ticker, row);
      }
    } catch (error) {
      const message = errorMessage(error);
      if (/401|403|not.?authorized|subscription|entitle|plan|snapshot/i.test(message)) {
        snapshotStatus = 'not_entitled_or_unavailable';
      } else {
        throw error;
      }
    }

    for (let index = 0; index < symbols.length; index++) {
      const symbol = symbols[index];
      let bars = cachedBarsBySymbol.get(symbol) ?? [];
      let historySource = 'cached';

      if (bars.length < 50 && historyRequestsUsed < 4) {
        stage = `request Massive daily aggregates for ${symbol}`;
        const payload = await massiveGet(
          `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${isoDate(from)}/${isoDate(to)}`,
          { adjusted: true, sort: 'asc', limit: 500 },
        );
        const fetchedBars = Array.isArray(payload?.results) ? payload.results : [];
        if (fetchedBars.length) {
          bars = fetchedBars;
          historySource = 'massive';
          historyRequestsUsed += 1;

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
        }
      }

      if (!bars.length) {
        results.push({ symbol, ok: false, error: 'No usable daily history is available yet.' });
        continue;
      }

      const closes = bars.map((bar: any) => n(bar.c)).filter((value: number | null): value is number => value !== null);
      const volumes = bars.map((bar: any) => n(bar.v)).filter((value: number | null): value is number => value !== null);
      const latest = bars.at(-1);
      const previous = bars.at(-2);
      const latestClose = n(latest?.c);
      const snapshot = snapshots.get(symbol);
      const snapshotTrade = n(snapshot?.lastTrade?.p);
      const snapshotMinute = n(snapshot?.min?.c);
      const snapshotDayClose = n(snapshot?.day?.c);
      const frozenQuote = session.phase === 'after_hours'
        ? frozenBySymbol.get(symbol)
        : latestFrozenBySymbol.get(symbol);

      // The current URSORA engine is a 1–5 day swing/tactical engine. Only the
      // regular session is allowed to move its stock-price evidence. Premarket,
      // after-hours, overnight and weekends reuse the last completed session close.
      // A future 0DTE/intraday engine will use its own live clock and data path.
      const freezeForSession = !session.regularOpen;
      const currentPrice = freezeForSession
        ? (n(frozenQuote?.price) ?? snapshotDayClose ?? latestClose ?? snapshotMinute ?? snapshotTrade)
        : (snapshotTrade ?? snapshotMinute ?? snapshotDayClose ?? latestClose);
      const previousClose = freezeForSession
        ? (n(frozenQuote?.prev_close) ?? n(snapshot?.prevDay?.c) ?? n(previous?.c))
        : (n(snapshot?.prevDay?.c) ?? n(previous?.c));
      const latestVolume = freezeForSession
        ? (n(frozenQuote?.volume) ?? n(snapshot?.day?.v) ?? n(latest?.v))
        : (n(snapshot?.day?.v) ?? n(latest?.v));
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
      const changeAbs = n(snapshot?.todaysChange)
        ?? (currentPrice !== null && previousClose !== null ? currentPrice - previousClose : null);
      const changePct = n(snapshot?.todaysChangePerc)
        ?? (changeAbs !== null && previousClose ? (changeAbs / previousClose) * 100 : null);

      let trend = 'insufficient data';
      if (currentPrice !== null && s20 !== null && s50 !== null) {
        trend = currentPrice > s20 && s20 > s50 && (s200 === null || s50 > s200)
          ? 'uptrend'
          : currentPrice < s20 && s20 < s50 && (s200 === null || s50 < s200)
            ? 'downtrend'
            : 'mixed';
      }

      const providerAsOf = massiveTimestamp(snapshot?.updated)
        ?? (latest?.t ? new Date(Number(latest.t)).toISOString() : now);
      const frozenAsOf = freezeForSession
        ? (frozenQuote?.as_of ?? providerAsOf)
        : providerAsOf;

      const quoteRow = {
        symbol,
        price: currentPrice,
        change_abs: freezeForSession ? (n(frozenQuote?.change_abs) ?? changeAbs) : changeAbs,
        change_pct: freezeForSession ? (n(frozenQuote?.change_pct) ?? changePct) : changePct,
        day_open: freezeForSession ? (n(frozenQuote?.day_open) ?? n(snapshot?.day?.o) ?? n(latest?.o)) : (n(snapshot?.day?.o) ?? n(latest?.o)),
        day_high: freezeForSession ? (n(frozenQuote?.day_high) ?? n(snapshot?.day?.h) ?? n(latest?.h)) : (n(snapshot?.day?.h) ?? n(latest?.h)),
        day_low: freezeForSession ? (n(frozenQuote?.day_low) ?? n(snapshot?.day?.l) ?? n(latest?.l)) : (n(snapshot?.day?.l) ?? n(latest?.l)),
        prev_close: previousClose,
        prev_day_high: freezeForSession ? (n(frozenQuote?.prev_day_high) ?? n(snapshot?.prevDay?.h) ?? n(previous?.h)) : (n(snapshot?.prevDay?.h) ?? n(previous?.h)),
        prev_day_low: freezeForSession ? (n(frozenQuote?.prev_day_low) ?? n(snapshot?.prevDay?.l) ?? n(previous?.l)) : (n(snapshot?.prevDay?.l) ?? n(previous?.l)),
        volume: latestVolume,
        avg_volume: freezeForSession ? (n(frozenQuote?.avg_volume) ?? (averageVolume === null ? null : Math.round(averageVolume))) : (averageVolume === null ? null : Math.round(averageVolume)),
        rel_volume: freezeForSession ? (n(frozenQuote?.rel_volume) ?? (averageVolume && latestVolume ? latestVolume / averageVolume : null)) : (averageVolume && latestVolume ? latestVolume / averageVolume : null),
        vwap: freezeForSession ? (n(frozenQuote?.vwap) ?? n(snapshot?.day?.vw) ?? n(latest?.vw)) : (n(snapshot?.day?.vw) ?? n(latest?.vw)),
        sma20: s20,
        sma50: s50,
        sma200: s200,
        support,
        resistance,
        gap_pct: freezeForSession
          ? (n(frozenQuote?.gap_pct) ?? ((n(snapshot?.day?.o) ?? n(latest?.o)) !== null && previousClose
              ? (((n(snapshot?.day?.o) ?? n(latest?.o)) as number) - previousClose) / previousClose * 100
              : null))
          : ((n(snapshot?.day?.o) ?? n(latest?.o)) !== null && previousClose
              ? (((n(snapshot?.day?.o) ?? n(latest?.o)) as number) - previousClose) / previousClose * 100
              : null),
        atr: a14,
        momentum_score: rsi14,
        trend,
        source_name: freezeForSession
          ? 'Massive Frozen Session Close'
          : (snapshots.has(symbol) ? 'Massive Stock Snapshot + Aggregates' : 'Massive Daily Aggregates'),
        source_type: freezeForSession
          ? 'market_data_eod_test'
          : (snapshots.has(symbol) ? 'market_data_snapshot_test' : 'market_data_test'),
        published_at: frozenAsOf,
        retrieved_at: now,
        confidence: snapshots.has(symbol) ? 0.95 : 0.90,
        is_demo: true,
        as_of: frozenAsOf,
      };

      stage = `store Massive quote for ${symbol}`;
      if (!(freezeForSession && frozenQuote)) {
        const { error: quoteError } = await db.from('quotes').insert(quoteRow);
        if (quoteError) throw quoteError;
        if (freezeForSession) {
          frozenBySymbol.set(symbol, quoteRow);
          latestFrozenBySymbol.set(symbol, quoteRow);
        }
      }

      results.push({
        symbol,
        ok: true,
        bars: bars.length,
        history_source: historySource,
        latest_bar: quoteRow.as_of,
        price: currentPrice,
        quote_source: freezeForSession ? 'frozen_session_close' : (snapshots.has(symbol) ? 'snapshot' : 'daily_aggregate_fallback'),
        market_phase: session.phase,
        frozen_for_session: Boolean(freezeForSession),
        last_trade: snapshotTrade,
        last_quote_bid: n(snapshot?.lastQuote?.p),
        last_quote_ask: n(snapshot?.lastQuote?.P),
        rel_volume: quoteRow.rel_volume,
        trend,
      });

      // Historical requests are rare after the local cache is seeded. Pace only
      // those requests so the Basic API allowance is not consumed by routine runs.
      if (historySource === 'massive' && historyRequestsUsed < 4 && index < symbols.length - 1) {
        await sleep(12500);
      }
    }

    stage = 'update provider status';
    await db.from('provider_configs').upsert({
      provider_key: 'market',
      interface_name: 'MarketDataProvider',
      display_name: 'Massive Market Data',
      adapter: 'MassiveSnapshotAndAggregatesAdapter',
      mode: 'demo',
      supplies: ['stock snapshots when entitled', 'daily OHLCV history', 'price trend inputs', 'volume participation inputs', 'derived technical context'],
      candidate_providers: ['Massive'],
      secret_env_name: 'MASSIVE_API_KEY',
      docs_url: 'https://massive.com/docs/rest/stocks/overview',
      notes: snapshotStatus === 'available'
        ? 'Massive snapshot integration is active. Routine analysis reuses locally cached daily history so the Basic request allowance is reserved for current quotes and missing-history backfill.'
        : 'Massive daily history can be reused locally, but stock snapshot access was not available to this API key/plan during the latest refresh.',
      last_sync: now,
      last_error: results.find((row) => row.ok === false)?.error ?? null,
    }, { onConflict: 'provider_key' });

    return json({
      success: true,
      provider: 'Massive',
      mode: 'test',
      symbols_requested: symbols,
      bars_written: barsWritten,
      snapshot_status: snapshotStatus,
      snapshot_symbols: [...snapshots.keys()],
      market_phase: session.phase,
      session_key: session.sessionKey,
      frozen_symbols: [...frozenBySymbol.keys()],
      results,
      is_demo: true,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    const message = errorMessage(error);
    return json({ error: message, stage }, 500);
  }
});
