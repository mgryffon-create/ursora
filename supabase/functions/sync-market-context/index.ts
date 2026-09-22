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

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type QuotePoint = {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  asOf: string;
};

async function yahooChart(symbol: string): Promise<QuotePoint> {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 URSORA/1.0',
      'Accept': 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Yahoo Finance returned HTTP ${response.status} for ${symbol}`);

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo Finance returned no chart result for ${symbol}`);

  const meta = result.meta ?? {};
  const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
  const valid = closes
    .map((value, index) => ({ value: n(value), ts: timestamps[index] }))
    .filter((x) => x.value !== null);

  const latest = n(meta.regularMarketPrice) ?? valid.at(-1)?.value ?? null;
  const previous = n(meta.chartPreviousClose)
    ?? n(meta.previousClose)
    ?? (valid.length >= 2 ? valid[valid.length - 2].value : null);

  const changePct = latest !== null && previous !== null && previous !== 0
    ? ((latest - previous) / previous) * 100
    : null;

  const ts = n(meta.regularMarketTime) ?? valid.at(-1)?.ts ?? Date.now() / 1000;

  return {
    symbol,
    price: latest,
    previousClose: previous,
    changePct,
    asOf: new Date(Number(ts) * 1000).toISOString(),
  };
}

function deriveRegime(spyChange: number | null, qqqChange: number | null, vix: number | null, vixChange: number | null) {
  const directional = [spyChange, qqqChange].filter((v): v is number => v !== null);
  const avg = directional.length ? directional.reduce((a, b) => a + b, 0) / directional.length : 0;

  if (avg > 0.35 && (vix === null || vix < 22) && (vixChange === null || vixChange < 4)) {
    return {
      regime: 'Risk-On',
      note: 'Broad equity indexes are advancing while volatility is not materially elevated.',
    };
  }
  if (avg < -0.35 || (vix !== null && vix >= 25) || (vixChange !== null && vixChange >= 8)) {
    return {
      regime: 'Risk-Off',
      note: 'Broad equity pressure and/or elevated volatility indicate a defensive market environment.',
    };
  }
  return {
    regime: 'Mixed',
    note: 'Index direction and volatility are not aligned strongly enough to classify the environment as clearly risk-on or risk-off.',
  };
}

const sectorSymbols: Record<string, string> = {
  XLK: 'Technology',
  XLF: 'Financials',
  XLE: 'Energy',
  XLV: 'Health Care',
  XLY: 'Consumer Discretionary',
  XLP: 'Consumer Staples',
  XLI: 'Industrials',
  XLU: 'Utilities',
  XLB: 'Materials',
  XLRE: 'Real Estate',
  XLC: 'Communication Services',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const force = Boolean(body.force);

    const { data: latestSnapshot } = await db
      .from('market_snapshots')
      .select('*')
      .order('retrieved_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!force && latestSnapshot?.retrieved_at) {
      const ageMs = Date.now() - new Date(latestSnapshot.retrieved_at).getTime();
      if (ageMs >= 0 && ageMs < 15 * 60 * 1000) {
        return json({ success: true, cached: true, snapshot_id: latestSnapshot.id });
      }
    }

    const { data: quoteRows, error: quoteError } = await db
      .from('quotes')
      .select('symbol,price,change_pct,trend,as_of')
      .in('symbol', ['SPY', 'QQQ', 'IWM'])
      .order('as_of', { ascending: false });
    if (quoteError) throw quoteError;

    const bySymbol = new Map<string, any>();
    for (const row of quoteRows ?? []) {
      const symbol = String(row.symbol ?? '').toUpperCase();
      if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, row);
    }

    const contextSymbols = ['^VIX', 'DX-Y.NYB', 'CL=F', 'GC=F', ...Object.keys(sectorSymbols)];
    const results = await Promise.allSettled(contextSymbols.map((symbol) => yahooChart(symbol)));
    const context = new Map<string, QuotePoint>();

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') context.set(contextSymbols[index], result.value);
    });

    const spy = bySymbol.get('SPY');
    const qqq = bySymbol.get('QQQ');
    const iwm = bySymbol.get('IWM');
    const vix = context.get('^VIX');
    const dxy = context.get('DX-Y.NYB');
    const wti = context.get('CL=F');
    const gold = context.get('GC=F');

    const sectorPerformance = Object.entries(sectorSymbols)
      .map(([symbol, sector]) => ({
        sector,
        change_pct: context.get(symbol)?.changePct ?? null,
      }))
      .filter((x): x is { sector: string; change_pct: number } => x.change_pct !== null)
      .sort((a, b) => b.change_pct - a.change_pct);

    const { data: latestTrackedQuotes } = await db
      .from('quotes')
      .select('symbol,change_pct,as_of')
      .order('as_of', { ascending: false })
      .limit(200);

    const latestPerSymbol = new Map<string, any>();
    for (const row of latestTrackedQuotes ?? []) {
      const symbol = String(row.symbol ?? '').toUpperCase();
      if (symbol && !latestPerSymbol.has(symbol)) latestPerSymbol.set(symbol, row);
    }

    const tracked = [...latestPerSymbol.values()].filter((row) => n(row.change_pct) !== null);
    const advancers = tracked.filter((row) => Number(row.change_pct) > 0).length;
    const decliners = tracked.filter((row) => Number(row.change_pct) < 0).length;

    const regimeInfo = deriveRegime(
      n(spy?.change_pct),
      n(qqq?.change_pct),
      vix?.price ?? null,
      vix?.changePct ?? null,
    );

    const macroBits = [
      vix?.price !== null && vix?.price !== undefined ? `VIX ${vix.price.toFixed(2)}` : null,
      dxy?.price !== null && dxy?.price !== undefined ? `DXY ${dxy.price.toFixed(2)}` : null,
      wti?.price !== null && wti?.price !== undefined ? `WTI ${wti.price.toFixed(2)}` : null,
      gold?.price !== null && gold?.price !== undefined ? `Gold ${gold.price.toFixed(2)}` : null,
    ].filter(Boolean);

    const now = new Date().toISOString();
    const row = {
      as_of: now,
      regime: regimeInfo.regime,
      regime_note: regimeInfo.note,
      spy_price: n(spy?.price),
      spy_change_pct: n(spy?.change_pct),
      spy_trend: spy?.trend ?? null,
      qqq_price: n(qqq?.price),
      qqq_change_pct: n(qqq?.change_pct),
      qqq_trend: qqq?.trend ?? null,
      iwm_price: n(iwm?.price),
      iwm_change_pct: n(iwm?.change_pct),
      vix: vix?.price ?? null,
      vix_change_pct: vix?.changePct ?? null,
      dxy: dxy?.price ?? null,
      us10y: null,
      us02y: null,
      wti: wti?.price ?? null,
      gold: gold?.price ?? null,
      breadth_advancers: advancers,
      breadth_decliners: decliners,
      breadth_note: tracked.length
        ? `${advancers} of ${tracked.length} tracked symbols are higher and ${decliners} are lower in the latest quote set.`
        : null,
      sector_performance: sectorPerformance,
      macro_note: macroBits.length
        ? `Connected market context: ${macroBits.join(' · ')}.`
        : 'Yahoo Finance market-context data were unavailable for this refresh.',
      market_status: 'tracked universe',
      retrieved_at: now,
      is_demo: true,
    };

    const { data: inserted, error: insertError } = await db
      .from('market_snapshots')
      .insert(row)
      .select('id')
      .single();
    if (insertError) throw insertError;

    await db.from('provider_configs').upsert({
      provider_key: 'market_context',
      interface_name: 'MarketContextProvider',
      display_name: 'Yahoo Finance Market Context',
      adapter: 'YahooFinanceMarketContextAdapter',
      mode: 'connected',
      supplies: ['volatility', 'dollar index', 'commodities', 'sector ETFs', 'market regime context'],
      candidate_providers: ['Yahoo Finance'],
      secret_env_name: null,
      docs_url: 'https://finance.yahoo.com/',
      notes: 'Best-effort market context using Yahoo Finance chart endpoints. Treasury yields remain unfilled until a dedicated rates source is connected.',
      last_sync: now,
      last_error: null,
    }, { onConflict: 'provider_key' });

    return json({
      success: true,
      cached: false,
      snapshot_id: inserted.id,
      sectors: sectorPerformance.length,
      context_symbols_returned: [...context.keys()],
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
