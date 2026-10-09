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

function alphaKeyOptional(): string | null {
  return Deno.env.get('ALPHA_VANTAGE_API_KEY')?.trim() || null;
}

function massiveKeyOptional(): string | null {
  return Deno.env.get('MASSIVE_API_KEY')?.trim() || null;
}

type MacroPoint = {
  value: number;
  asOf: string;
  source: string;
  seriesId: string;
};

async function fredLatest(seriesId: string): Promise<MacroPoint> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  const response = await fetch(url, { headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new Error(`FRED returned HTTP ${response.status} for ${seriesId}`);
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/).slice(1).reverse();
  for (const line of lines) {
    const [date, raw] = line.split(',');
    const value = n(raw);
    if (date && value !== null) {
      return {
        value,
        asOf: `${date}T00:00:00Z`,
        source: 'FRED',
        seriesId,
      };
    }
  }
  throw new Error(`FRED returned no numeric observations for ${seriesId}`);
}

async function alphaGoldSpot(): Promise<MacroPoint | null> {
  const key = alphaKeyOptional();
  if (!key) return null;
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'GOLD_SILVER_SPOT');
  url.searchParams.set('symbol', 'GOLD');
  url.searchParams.set('apikey', key);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Alpha Vantage returned HTTP ${response.status} for gold`);
  const payload = await response.json();
  const providerMessage = payload?.Note ?? payload?.Information ?? payload?.['Error Message'];
  if (providerMessage) throw new Error(String(providerMessage));
  const value = n(payload?.price);
  if (value === null) throw new Error('Alpha Vantage gold response did not include a numeric price.');
  const stamp = String(payload?.timestamp ?? payload?.date ?? new Date().toISOString());
  return {
    value,
    asOf: /^\d{4}-\d{2}-\d{2}$/.test(stamp) ? `${stamp}T00:00:00Z` : stamp,
    source: 'Alpha Vantage',
    seriesId: 'GOLD_SILVER_SPOT:GOLD',
  };
}

async function massiveSectorPerformance(): Promise<Array<{ sector: string; change_pct: number }>> {
  const key = massiveKeyOptional();
  if (!key) return [];
  const symbols = Object.keys(sectorSymbols);
  const url = new URL('https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers');
  url.searchParams.set('tickers', symbols.join(','));
  url.searchParams.set('include_otc', 'false');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const raw = await response.text();
  let payload: any = raw;
  try { payload = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`Massive returned HTTP ${response.status} for sector ETFs: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }
  return (Array.isArray(payload?.tickers) ? payload.tickers : [])
    .map((row: any) => {
      const symbol = String(row?.ticker ?? '').toUpperCase();
      const change = n(row?.todaysChangePerc)
        ?? (() => {
          const close = n(row?.day?.c);
          const prev = n(row?.prevDay?.c);
          return close !== null && prev !== null && prev !== 0 ? ((close - prev) / prev) * 100 : null;
        })();
      const sector = sectorSymbols[symbol];
      return sector && change !== null ? { sector, change_pct: change } : null;
    })
    .filter((row: any): row is { sector: string; change_pct: number } => Boolean(row))
    .sort((a: any, b: any) => b.change_pct - a.change_pct);
}

function syncFresh(lastSync: string | null | undefined, maxAgeMs: number): boolean {
  if (!lastSync) return false;
  const age = Date.now() - new Date(lastSync).getTime();
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
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

async function yahooSectorPerformance(): Promise<Array<{ sector: string; change_pct: number }>> {
  const results = await Promise.allSettled(Object.keys(sectorSymbols).map((symbol) => yahooChart(symbol)));
  const rows: Array<{ sector: string; change_pct: number }> = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const symbol = Object.keys(sectorSymbols)[i];
    if (result.status !== 'fulfilled' || result.value.changePct === null) continue;
    rows.push({ sector: sectorSymbols[symbol], change_pct: result.value.changePct });
  }
  return rows.sort((a, b) => b.change_pct - a.change_pct);
}

function deriveRegime(
  spyChange: number | null,
  qqqChange: number | null,
  vix: number | null,
  vixChange: number | null,
  crossAssetObserved: boolean,
) {
  const directional = [spyChange, qqqChange].filter((v): v is number => v !== null);
  const avg = directional.length ? directional.reduce((a, b) => a + b, 0) / directional.length : 0;

  const volatilityObserved = vix !== null || vixChange !== null;
  if (avg > 0.35 && (vix === null || vix < 22) && (vixChange === null || vixChange < 4)) {
    return {
      regime: 'Risk-On',
      note: volatilityObserved
        ? 'Broad equity indexes are advancing while observed volatility is not materially elevated.'
        : crossAssetObserved
          ? 'Broad equity indexes are advancing. Rates, dollar and commodity context are connected, while VIX remains unavailable.'
          : 'Broad equity indexes are advancing. This is an equity-only risk-on classification because volatility and cross-asset macro feeds are not connected.',
    };
  }
  if (avg < -0.35 || (vix !== null && vix >= 25) || (vixChange !== null && vixChange >= 8)) {
    return {
      regime: 'Risk-Off',
      note: volatilityObserved
        ? 'Broad equity pressure and/or elevated observed volatility indicate a defensive market environment.'
        : crossAssetObserved
          ? 'Broad equity indexes are under pressure. Rates, dollar and commodity context are connected, while VIX remains unavailable.'
          : 'Broad equity indexes are under pressure. This is an equity-only risk-off classification because volatility and cross-asset macro feeds are not connected.',
    };
  }
  return {
    regime: 'Mixed',
    note: volatilityObserved
      ? 'Index direction and observed volatility are not aligned strongly enough to classify the environment as clearly risk-on or risk-off.'
      : crossAssetObserved
        ? 'Broad equity direction is mixed. Rates, dollar and commodity context are connected, while VIX remains unavailable.'
        : 'Broad equity direction is mixed. This is an equity-only classification because volatility and cross-asset macro feeds are not connected.',
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
      .select('symbol,price,change_pct,trend,as_of,retrieved_at,is_demo')
      .eq('is_demo', false)
      .in('symbol', ['SPY', 'QQQ', 'IWM', ...Object.keys(sectorSymbols)])
      .order('retrieved_at', { ascending: false })
      .order('as_of', { ascending: false });
    if (quoteError) throw quoteError;

    const bySymbol = new Map<string, any>();
    for (const row of quoteRows ?? []) {
      const symbol = String(row.symbol ?? '').toUpperCase();
      if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, row);
    }

    const spy = bySymbol.get('SPY');
    const qqq = bySymbol.get('QQQ');
    const iwm = bySymbol.get('IWM');

    const { data: providerRows } = await db
      .from('provider_configs')
      .select('provider_key,last_sync,last_error')
      .in('provider_key', ['fred_macro', 'alpha_gold', 'massive_sectors']);
    const providerByKey = new Map((providerRows ?? []).map((row: any) => [String(row.provider_key), row]));
    const macroCacheFresh = syncFresh(providerByKey.get('fred_macro')?.last_sync, 6 * 3600000);
    const goldCacheFresh = syncFresh(providerByKey.get('alpha_gold')?.last_sync, 6 * 3600000);
    const sectorCacheFresh = syncFresh(providerByKey.get('massive_sectors')?.last_sync, 6 * 3600000);

    let us10y = macroCacheFresh ? n(latestSnapshot?.us10y) : null;
    let us02y = macroCacheFresh ? n(latestSnapshot?.us02y) : null;
    let broadUsd = macroCacheFresh ? n(latestSnapshot?.dxy) : null;
    let wti = macroCacheFresh ? n(latestSnapshot?.wti) : null;
    let gold = goldCacheFresh ? n(latestSnapshot?.gold) : null;
    let sectorPerformance: Array<{ sector: string; change_pct: number }> =
      sectorCacheFresh && Array.isArray(latestSnapshot?.sector_performance)
        ? latestSnapshot.sector_performance
        : [];

    const macroErrors: string[] = [];
    const macroSources: string[] = [];

    if (!macroCacheFresh) {
      const fredSeries = [
        ['DGS10', 'us10y'],
        ['DGS2', 'us02y'],
        ['DTWEXBGS', 'broadUsd'],
        ['DCOILWTICO', 'wti'],
      ] as const;
      const results = await Promise.allSettled(fredSeries.map(([series]) => fredLatest(series)));
      for (let i = 0; i < fredSeries.length; i++) {
        const [series, field] = fredSeries[i];
        const result = results[i];
        if (result.status === 'fulfilled') {
          if (field === 'us10y') us10y = result.value.value;
          if (field === 'us02y') us02y = result.value.value;
          if (field === 'broadUsd') broadUsd = result.value.value;
          if (field === 'wti') wti = result.value.value;
          macroSources.push(`FRED ${series}`);
        } else {
          macroErrors.push(`${series}: ${errorMessage(result.reason)}`);
        }
      }
      await db.from('provider_configs').upsert({
        provider_key: 'fred_macro',
        interface_name: 'MacroDataProvider',
        display_name: 'Federal Reserve Economic Data',
        adapter: 'FredPublicCsvAdapter',
        mode: macroSources.length ? 'connected' : 'error',
        supplies: ['US 10Y Treasury yield', 'US 2Y Treasury yield', 'broad trade-weighted US dollar index', 'WTI crude oil'],
        candidate_providers: ['FRED'],
        secret_env_name: null,
        docs_url: 'https://fred.stlouisfed.org/',
        notes: 'Public FRED daily macro series. Internal dxy field stores DTWEXBGS broad trade-weighted USD, not ICE DXY.',
        last_sync: macroSources.length ? new Date().toISOString() : providerByKey.get('fred_macro')?.last_sync ?? null,
        last_error: macroErrors.length ? macroErrors.join(' | ') : null,
      }, { onConflict: 'provider_key' });
    } else {
      macroSources.push('FRED cached');
    }

    if (!goldCacheFresh) {
      try {
        const goldPoint = await alphaGoldSpot();
        if (goldPoint) {
          gold = goldPoint.value;
          macroSources.push('Alpha Vantage gold spot');
          await db.from('provider_configs').upsert({
            provider_key: 'alpha_gold',
            interface_name: 'MacroDataProvider',
            display_name: 'Alpha Vantage Gold Spot',
            adapter: 'AlphaVantageGoldSpotAdapter',
            mode: 'connected',
            supplies: ['gold spot price'],
            candidate_providers: ['Alpha Vantage'],
            secret_env_name: 'ALPHA_VANTAGE_API_KEY',
            docs_url: 'https://www.alphavantage.co/documentation/',
            notes: 'Gold spot is refreshed independently from per-symbol market intelligence.',
            last_sync: new Date().toISOString(),
            last_error: null,
          }, { onConflict: 'provider_key' });
        }
      } catch (error) {
        macroErrors.push(`gold: ${errorMessage(error)}`);
        gold = gold ?? n(latestSnapshot?.gold);
      }
    } else if (gold !== null) {
      macroSources.push('Alpha Vantage gold cached');
    }

    if (!sectorCacheFresh) {
      let sectorSource = '';
      let sectorError: string | null = null;
      try {
        const sectors = await massiveSectorPerformance();
        if (sectors.length) {
          sectorPerformance = sectors;
          sectorSource = 'Massive batch snapshot';
        }
      } catch (error) {
        sectorError = errorMessage(error);
      }

      if (!sectorPerformance.length) {
        try {
          const sectors = await yahooSectorPerformance();
          if (sectors.length) {
            sectorPerformance = sectors;
            sectorSource = 'Yahoo daily chart fallback';
          }
        } catch (error) {
          sectorError = [sectorError, errorMessage(error)].filter(Boolean).join(' | ');
        }
      }

      if (sectorPerformance.length) {
        await db.from('provider_configs').upsert({
          provider_key: 'massive_sectors',
          interface_name: 'MarketContextProvider',
          display_name: 'Sector ETF Context',
          adapter: sectorSource === 'Massive batch snapshot' ? 'MassiveSectorSnapshotAdapter' : 'YahooSectorChartFallbackAdapter',
          mode: 'connected',
          supplies: Object.values(sectorSymbols),
          candidate_providers: ['Massive', 'Yahoo daily chart fallback'],
          secret_env_name: sectorSource === 'Massive batch snapshot' ? 'MASSIVE_API_KEY' : null,
          docs_url: null,
          notes: `Sector leadership currently sourced from ${sectorSource}. Massive snapshot entitlement failure automatically falls back to public daily ETF chart data.`,
          last_sync: new Date().toISOString(),
          last_error: sectorError,
        }, { onConflict: 'provider_key' });
      } else if (sectorError) {
        macroErrors.push('Sector movement unavailable from both primary and fallback feeds.');
      }
    }

    if (!sectorPerformance.length) {
      sectorPerformance = Object.entries(sectorSymbols)
        .map(([symbol, sector]) => {
          const row = bySymbol.get(symbol);
          const change = n(row?.change_pct);
          return change === null ? null : { sector, change_pct: change };
        })
        .filter((row): row is { sector: string; change_pct: number } => Boolean(row))
        .sort((a, b) => b.change_pct - a.change_pct);
    }

    // VIX remains intentionally unavailable until URSORA has a source whose
    // licensing permits use inside the product. Do not substitute realized
    // volatility and label it VIX.
    const vix: QuotePoint | undefined = undefined;

    const { data: latestTrackedQuotes } = await db
      .from('quotes')
      .select('symbol,change_pct,as_of,retrieved_at,is_demo')
      .eq('is_demo', false)
      .order('retrieved_at', { ascending: false })
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

    const crossAssetObserved = [us10y, us02y, broadUsd, wti, gold].filter((value) => value !== null).length >= 3;
    const regimeInfo = deriveRegime(
      n(spy?.change_pct),
      n(qqq?.change_pct),
      null,
      null,
      crossAssetObserved,
    );

    const macroBits = [
      us10y !== null ? `US10Y ${us10y.toFixed(2)}%` : null,
      us02y !== null ? `US2Y ${us02y.toFixed(2)}%` : null,
      broadUsd !== null ? `Broad USD ${broadUsd.toFixed(2)}` : null,
      wti !== null ? `WTI ${wti.toFixed(2)}` : null,
      gold !== null ? `Gold ${gold.toFixed(2)}` : null,
      sectorPerformance.length ? `${sectorPerformance.length} sectors` : null,
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
      vix: null,
      vix_change_pct: null,
      dxy: broadUsd,
      us10y,
      us02y,
      wti,
      gold,
      breadth_advancers: advancers,
      breadth_decliners: decliners,
      breadth_note: tracked.length
        ? `${advancers} of ${tracked.length} tracked symbols are higher and ${decliners} are lower in the latest quote set.`
        : null,
      sector_performance: sectorPerformance,
      macro_note: macroBits.length
        ? `Connected macro context: ${macroBits.join(' · ')}. Broad USD uses FRED DTWEXBGS rather than ICE DXY. VIX remains unavailable pending a product-usable licensed source.${macroErrors.length ? ' Some optional context feeds were unavailable on this refresh.' : ''}`
        : 'Core index and breadth context are available; macro providers did not return usable values on this refresh.',
      market_status: macroBits.length >= 4 ? 'cross-asset context' : 'equity-only context',
      retrieved_at: now,
      is_demo: Boolean(spy?.is_demo || qqq?.is_demo || iwm?.is_demo),
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
      display_name: 'URSORA Core Market Context',
      adapter: 'StoredMarketContextAdapter',
      mode: 'connected',
      supplies: ['SPY context', 'QQQ context', 'IWM context', 'tracked-universe breadth', 'Treasury yields', 'broad USD', 'WTI', 'gold', 'sector leadership', 'market regime context'],
      candidate_providers: ['Massive', 'FRED', 'Alpha Vantage'],
      secret_env_name: null,
      docs_url: null,
      notes: 'Core equities use stored Massive rows; FRED supplies Treasury yields, broad trade-weighted USD and WTI; Alpha Vantage supplies gold; Massive supplies batched sector ETF context. VIX remains intentionally unavailable pending a product-usable licensed source.',
      last_sync: now,
      last_error: null,
    }, { onConflict: 'provider_key' });

    return json({
      success: true,
      cached: false,
      snapshot_id: inserted.id,
      sectors: sectorPerformance.length,
      macro_values: {
        us10y,
        us02y,
        broad_usd: broadUsd,
        wti,
        gold,
        vix: null,
      },
      macro_errors: macroErrors,
      core_context_only: false,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: errorMessage(error) }, 500);
  }
});
