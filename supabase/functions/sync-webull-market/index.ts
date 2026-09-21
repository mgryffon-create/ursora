import { AuthError, requireUser } from '../_shared/auth.ts';
import { handleOptions, json } from '../_shared/http.ts';
import { summarizeWebullError, webullConfig, webullGet } from '../_shared/webull.ts';

type AnyRow = Record<string, any>;

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRows(payload: any): AnyRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return payload && typeof payload === 'object' ? [payload] : [];
}

function quoteRow(raw: AnyRow, fallbackSymbol?: string) {
  const symbol = String(raw.symbol ?? raw.ticker ?? raw.instrument?.symbol ?? fallbackSymbol ?? '').toUpperCase();
  if (!symbol) return null;

  const price = n(raw.price ?? raw.latest_price ?? raw.last_price ?? raw.close);
  const prevClose = n(raw.pre_close ?? raw.prev_close ?? raw.previous_close);
  const changeAbs = n(raw.change ?? raw.change_abs);
  let changePct = n(raw.change_ratio ?? raw.change_pct ?? raw.change_percent);
  // Webull's change_ratio is generally decimal ratio (0.01 == 1%). Normalize
  // only when the field name indicates ratio rather than percentage.
  if (raw.change_ratio !== undefined && changePct !== null) changePct *= 100;

  const momentum = changePct === null ? 50 : Math.max(0, Math.min(100, 50 + changePct * 7));
  const trend = changePct === null ? 'unknown' : changePct > 0.15 ? 'up' : changePct < -0.15 ? 'down' : 'flat';
  const now = new Date().toISOString();

  return {
    symbol,
    price,
    change_abs: changeAbs,
    change_pct: changePct,
    day_open: n(raw.open),
    day_high: n(raw.high),
    day_low: n(raw.low),
    prev_close: prevClose,
    premarket_price: n(raw.pre_market_price ?? raw.premarket_price ?? raw.pre_market?.price),
    volume: n(raw.volume),
    momentum_score: momentum,
    trend,
    source_name: 'Webull PaperTrade Sandbox',
    source_type: 'broker_market_data_sandbox',
    published_at: raw.last_trade_time ? new Date(Number(raw.last_trade_time)).toISOString() : null,
    retrieved_at: now,
    confidence: 0.65,
    is_demo: true,
    as_of: now,
  };
}

async function fetchSnapshots(symbols: string[]) {
  const query = {
    symbols: symbols.join(','),
    category: 'US_STOCK',
    extend_hour_required: false,
    overnight_required: false,
  };
  try {
    return await webullGet('/openapi/market-data/stock/snapshot', query);
  } catch (legacyError) {
    try {
      return await webullGet('/market-data/stocks/snapshots/list', query);
    } catch (v3Error) {
      throw new Error(JSON.stringify({ legacy: summarizeWebullError(legacyError), v3: summarizeWebullError(v3Error) }));
    }
  }
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
      const { data, error } = await db.from('tickers').select('symbol').eq('is_default', true).order('priority').limit(25);
      if (error) throw error;
      symbols = (data ?? []).map((r: any) => r.symbol).filter(Boolean);
    }
    symbols = [...new Set(symbols)].slice(0, 25);
    if (!symbols.length) return json({ success: false, error: 'No symbols configured.' }, 400);

    const payload = await fetchSnapshots(symbols);
    const normalized = normalizeRows(payload)
      .map((raw) => quoteRow(raw))
      .filter(Boolean) as AnyRow[];

    if (!normalized.length) {
      return json({ success: false, error: 'Webull returned no recognizable quote rows.', raw_shape: typeof payload }, 502);
    }

    const { error: insertError } = await db.from('quotes').insert(normalized);
    if (insertError) throw insertError;

    await db.from('provider_configs').update({
      adapter: 'WebullPaperTradeAdapter',
      mode: 'sandbox',
      last_sync: new Date().toISOString(),
      last_error: null,
      notes: 'Webull PaperTrade sandbox connected. Rows remain is_demo=true until production market-data entitlements are enabled.',
    }).eq('provider_key', 'market');

    return json({
      success: true,
      provider: 'Webull',
      environment: config.environment,
      symbols_requested: symbols,
      quotes_written: normalized.length,
      symbols_written: normalized.map((r) => r.symbol),
      is_demo: true,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : String(error);
    try {
      const { db } = await requireUser(req);
      await db.from('provider_configs').update({ last_error: message }).eq('provider_key', 'market');
    } catch { /* do not mask the provider error */ }
    return json({ error: message }, 500);
  }
});
