import { AuthError, requireUser } from '../_shared/auth.ts';
import { handleOptions, json } from '../_shared/http.ts';
import { summarizeWebullError, webullConfig, webullPost } from '../_shared/webull.ts';

type AnyRow = Record<string, any>;

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function atr(bars: AnyRow[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = n(bars[i].high);
    const l = n(bars[i].low);
    const pc = n(bars[i - 1].close);
    if (h === null || l === null || pc === null) continue;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < period) return null;
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function normalizePayload(payload: any): { symbol: string; result: AnyRow[] }[] {
  const groups = Array.isArray(payload?.result) ? payload.result
    : Array.isArray(payload?.data?.result) ? payload.data.result
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload) ? payload
    : [];
  return groups
    .map((g: any) => ({
      symbol: String(g.symbol ?? g.ticker ?? '').toUpperCase(),
      result: Array.isArray(g.result) ? g.result : Array.isArray(g.bars) ? g.bars : [],
    }))
    .filter((g: any) => g.symbol && g.result.length);
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

    const payload = await webullPost('/market-data/stocks/bars/list', {
      symbols,
      category: 'US_STOCK',
      timespan: 'D',
      count: 260,
      real_time_required: false,
    });

    const groups = normalizePayload(payload);
    const now = new Date().toISOString();
    let barsWritten = 0;
    const updated: string[] = [];

    for (const group of groups) {
      const ordered = [...group.result].sort((a, b) => String(a.time).localeCompare(String(b.time)));
      const rows = ordered.map((b) => ({
        symbol: group.symbol,
        timeframe: '1d',
        bar_time: b.time,
        open: n(b.open),
        high: n(b.high),
        low: n(b.low),
        close: n(b.close),
        volume: n(b.volume),
      })).filter((b) => b.bar_time && b.open !== null && b.high !== null && b.low !== null && b.close !== null);

      if (rows.length) {
        // Historical rows can safely replace the same symbol/timeframe/time key if a unique constraint exists.
        const { error: barError } = await db.from('ohlcv_bars').upsert(rows, {
          onConflict: 'symbol,timeframe,bar_time',
          ignoreDuplicates: false,
        });
        if (barError) throw barError;
        barsWritten += rows.length;
      }

      const closes = ordered.map((b) => n(b.close)).filter((v): v is number => v !== null);
      const volumes = ordered.map((b) => n(b.volume)).filter((v): v is number => v !== null);
      const latest = ordered[ordered.length - 1];
      const latestClose = n(latest?.close);
      const recent20 = ordered.slice(-20);
      const support = recent20.length ? Math.min(...recent20.map((b) => n(b.low)).filter((v): v is number => v !== null)) : null;
      const resistance = recent20.length ? Math.max(...recent20.map((b) => n(b.high)).filter((v): v is number => v !== null)) : null;
      const avgVolume = sma(volumes, 20);
      const latestVolume = n(latest?.volume);
      const s20 = sma(closes, 20);
      const s50 = sma(closes, 50);
      const s200 = sma(closes, 200);
      const a14 = atr(ordered, 14);

      let trend = 'insufficient data';
      if (latestClose !== null && s20 !== null && s50 !== null) {
        trend = latestClose > s20 && s20 > s50 ? 'uptrend'
          : latestClose < s20 && s20 < s50 ? 'downtrend'
          : 'mixed';
      }

      const { data: latestQuote } = await db
        .from('quotes')
        .select('id')
        .eq('symbol', group.symbol)
        .order('as_of', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestQuote?.id) {
        const { error: quoteError } = await db.from('quotes').update({
          avg_volume: avgVolume,
          rel_volume: avgVolume && latestVolume ? latestVolume / avgVolume : null,
          sma20: s20,
          sma50: s50,
          sma200: s200,
          support,
          resistance,
          atr: a14,
          trend,
          retrieved_at: now,
        }).eq('id', latestQuote.id);
        if (quoteError) throw quoteError;
        updated.push(group.symbol);
      }
    }

    await db.from('provider_configs').update({
      adapter: 'WebullPaperTradeAdapter',
      mode: 'sandbox',
      last_sync: now,
      last_error: null,
      notes: 'Webull sandbox quotes and historical bars connected. Derived trend, moving averages, ATR, support/resistance and relative volume are available where sufficient history exists.',
    }).eq('provider_key', 'market');

    return json({
      success: true,
      provider: 'Webull',
      environment: config.environment,
      symbols_requested: symbols,
      symbols_returned: groups.map((g) => g.symbol),
      bars_written: barsWritten,
      quotes_enriched: updated,
      is_demo: true,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    const detail = summarizeWebullError(error);
    return json({ error: detail.message, detail }, 500);
  }
});
