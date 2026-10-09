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

function marketauxKey() {
  const key = Deno.env.get('MARKETAUX_API_TOKEN')?.trim();
  if (!key) throw new Error('MARKETAUX_API_TOKEN is not configured.');
  return key;
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

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600000).toISOString().replace(/\.\d{3}Z$/, '');
}

function normalizeSentiment(score: number | null): 'bullish' | 'bearish' | 'neutral' {
  if (score === null) return 'neutral';
  if (score >= 0.15) return 'bullish';
  if (score <= -0.15) return 'bearish';
  return 'neutral';
}

function impactFrom(score: number | null, matchScore: number | null): 'low' | 'medium' | 'high' {
  const magnitude = Math.abs(score ?? 0);
  const normalizedMatch = matchScore === null ? 0.5 : matchScore > 1 ? matchScore / 100 : matchScore;
  if (magnitude >= 0.35 && normalizedMatch >= 0.65) return 'high';
  if (magnitude >= 0.15 && normalizedMatch >= 0.35) return 'medium';
  return 'low';
}

function recencyWeight(publishedAt: string): number {
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3600000);
  return Math.max(0.05, Math.exp(-ageHours / 48));
}

function confidenceFromMatch(matchScore: number | null): number {
  if (matchScore === null) return 0.65;
  const normalized = matchScore > 1 ? matchScore / 100 : matchScore;
  return Math.max(0.35, Math.min(1, normalized));
}

function articleIdentity(item: any): string {
  return String(item?.uuid ?? item?.url ?? item?.title ?? '').trim().toLowerCase();
}

function normalizedSource(item: any): string {
  if (typeof item?.source === 'string' && item.source.trim()) return item.source.trim();
  if (typeof item?.source?.name === 'string' && item.source.name.trim()) return item.source.name.trim();
  if (typeof item?.source_domain === 'string' && item.source_domain.trim()) return item.source_domain.trim();
  return 'Marketaux';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchMarketaux(params: Record<string, string>, key: string) {
  const url = new URL('https://api.marketaux.com/v1/news/all');
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set('api_token', key);

  const response = await fetch(url);
  const raw = await response.text();
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Marketaux returned non-JSON content (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? `Marketaux returned HTTP ${response.status}`;
    throw new Error(String(message));
  }
  if (payload?.error) throw new Error(String(payload.error?.message ?? payload.error));
  return payload;
}

async function reserveCall(db: ReturnType<typeof adminClient>, priority: string) {
  const { data, error } = await db.rpc('consume_news_provider_call', {
    p_provider_key: 'marketaux_news',
    p_priority: priority,
  });
  if (error) throw error;
  return (data ?? {}) as {
    allowed?: boolean;
    calls_used?: number;
    daily_cap?: number;
    ceiling?: number;
    remaining_total?: number;
    tier_name?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const requested = Array.isArray(body.symbols)
      ? [...new Set(body.symbols.map((x: unknown) => String(x).trim().toUpperCase()).filter(Boolean))]
      : [];
    const priority = ['manual', 'watchlist_login', 'background'].includes(String(body.priority))
      ? String(body.priority)
      : 'manual';
    const force = body.force === true || priority === 'manual';
    const includeBroad = body.include_broad === true || priority === 'watchlist_login' || priority === 'background';
    const maxSymbols = Math.max(1, Math.min(10, Number(body.max_symbols) || (priority === 'background' ? 5 : 30)));

    const { data: watchRows, error: watchError } = await db
      .from('watchlists')
      .select('symbol')
      .eq('user_id', user.id)
      .order('added_at', { ascending: true });
    if (watchError) throw watchError;
    const watchlist = [...new Set((watchRows ?? []).map((row: any) => String(row.symbol ?? '').toUpperCase()).filter(Boolean))];

    let candidateSymbols: string[] = [];
    let staleMs = 0;

    if (priority === 'manual') {
      candidateSymbols = requested;
      staleMs = 0;
    } else if (priority === 'watchlist_login') {
      candidateSymbols = watchlist;
      staleMs = 30 * 60 * 1000;
    } else {
      const { data: tickerRows, error: tickerError } = await db
        .from('tickers')
        .select('symbol')
        .order('priority', { ascending: true })
        .limit(500);
      if (tickerError) throw tickerError;
      const watchSet = new Set(watchlist);
      candidateSymbols = [...new Set((tickerRows ?? [])
        .map((row: any) => String(row.symbol ?? '').toUpperCase())
        .filter((symbol: string) => symbol && !watchSet.has(symbol)))];
      staleMs = 24 * 60 * 60 * 1000;
    }

    if (!candidateSymbols.length && priority === 'manual') {
      return json({ success: true, priority, inserted: 0, calls_made: 0, symbols: [], reason: 'no symbols requested' });
    }

    const stateKeys = [...candidateSymbols, '__BROAD_US__'];
    const { data: stateRows, error: stateError } = await db
      .from('news_symbol_refresh_state')
      .select('symbol,last_refreshed_at')
      .in('symbol', stateKeys);
    if (stateError) throw stateError;
    const stateBySymbol = new Map<string, number>();
    for (const row of stateRows ?? []) {
      const ts = new Date((row as any).last_refreshed_at ?? 0).getTime();
      if (Number.isFinite(ts)) stateBySymbol.set(String((row as any).symbol), ts);
    }

    const now = Date.now();
    const dueSymbols = candidateSymbols
      .filter((symbol) => force || !stateBySymbol.has(symbol) || now - (stateBySymbol.get(symbol) ?? 0) >= staleMs)
      .slice(0, maxSymbols);

    const key = marketauxKey();
    const publishedAfter = isoHoursAgo(72);
    const retrievedAt = new Date().toISOString();

    const { data: existingRows, error: existingError } = await db
      .from('news_items')
      .select('symbol,url,headline')
      .gte('published_at', new Date(Date.now() - 8 * 86400000).toISOString())
      .limit(5000);
    if (existingError) throw existingError;

    const existing = new Set<string>();
    for (const row of existingRows ?? []) {
      const symbol = String((row as any).symbol ?? '__MARKET__').toUpperCase();
      const identity = String((row as any).url ?? (row as any).headline ?? '').trim().toLowerCase();
      if (identity) existing.add(`${symbol}|${identity}`);
    }

    const insertedRows: any[] = [];
    const diagnostics: any[] = [];
    let callsMade = 0;
    let quotaState: any = null;

    for (let index = 0; index < dueSymbols.length; index += 1) {
      const symbol = dueSymbols[index];
      quotaState = await reserveCall(db, priority);
      if (!quotaState.allowed) {
        diagnostics.push({ symbol, skipped: true, reason: 'quota_reserved_for_higher_priority', quota: quotaState });
        break;
      }

      callsMade += 1;
      let accepted = 0;
      let providerReturned = 0;
      let providerFound: number | null = null;

      try {
        const payload = await fetchMarketaux({
          symbols: symbol,
          filter_entities: 'true',
          language: 'en',
          published_after: publishedAfter,
          sort: 'published_at',
          limit: '3',
        }, key);

        const data = Array.isArray(payload?.data) ? payload.data : [];
        providerReturned = Number(payload?.meta?.returned ?? data.length);
        providerFound = n(payload?.meta?.found);

        for (const item of data) {
          const publishedAt = item?.published_at ? new Date(item.published_at).toISOString() : null;
          if (!publishedAt || !item?.title) continue;

          const entities = (Array.isArray(item.entities) ? item.entities : [])
            .map((entity: any) => ({
              entity,
              symbol: String(entity?.symbol ?? '').toUpperCase(),
              match: n(entity?.match_score),
            }))
            .filter((entry: any) => entry.symbol)
            .sort((a: any, b: any) => Number(b.match ?? 0) - Number(a.match ?? 0));

          const strongest = entities[0] ?? null;
          const own = entities.find((entry: any) => entry.symbol === symbol) ?? null;
          if (!own || strongest?.symbol !== symbol) continue;

          const identity = articleIdentity(item);
          const dedupe = `${symbol}|${identity}`;
          if (!identity || existing.has(dedupe)) continue;

          const score = n(own.entity?.sentiment_score);
          insertedRows.push({
            symbol,
            headline: String(item.title),
            summary: item.description ? String(item.description) : (item.snippet ? String(item.snippet) : null),
            category: 'company news',
            url: item.url ? String(item.url) : null,
            source_name: normalizedSource(item),
            source_type: 'verified_news',
            sentiment: normalizeSentiment(score),
            sentiment_score: score,
            impact: impactFrom(score, own.match),
            recency_weight: recencyWeight(publishedAt),
            confidence: confidenceFromMatch(own.match),
            published_at: publishedAt,
            retrieved_at: retrievedAt,
            is_demo: false,
          });
          existing.add(dedupe);
          accepted += 1;
        }

        await db.from('news_symbol_refresh_state').upsert({
          symbol,
          last_refreshed_at: retrievedAt,
          provider_key: 'marketaux_news',
          priority,
          articles_found: accepted,
          updated_at: retrievedAt,
        }, { onConflict: 'symbol' });

        diagnostics.push({
          symbol,
          ok: true,
          provider_found: providerFound,
          provider_returned: providerReturned,
          accepted,
        });
      } catch (error) {
        diagnostics.push({ symbol, ok: false, error: errorMessage(error) });
      }

      // Stagger ticker calls so a login refresh never bursts the provider.
      if (index < dueSymbols.length - 1) await sleep(1050);
    }

    const broadLast = stateBySymbol.get('__BROAD_US__') ?? 0;
    const broadDue = includeBroad && (force || now - broadLast >= 4 * 60 * 60 * 1000);

    if (broadDue) {
      const broadQuota = await reserveCall(db, 'background');
      quotaState = broadQuota;
      if (broadQuota.allowed) {
        callsMade += 1;
        try {
          const payload = await fetchMarketaux({
            countries: 'us',
            must_have_entities: 'true',
            language: 'en',
            published_after: publishedAfter,
            sort: 'published_at',
            limit: '3',
          }, key);
          const data = Array.isArray(payload?.data) ? payload.data : [];
          let accepted = 0;

          for (const item of data) {
            const publishedAt = item?.published_at ? new Date(item.published_at).toISOString() : null;
            if (!publishedAt || !item?.title) continue;

            const identity = articleIdentity(item);
            const dedupe = `__MARKET__|${identity}`;
            if (!identity || existing.has(dedupe)) continue;

            const entities = Array.isArray(item.entities) ? item.entities : [];
            const best = [...entities].sort((a: any, b: any) => Number(b?.match_score ?? 0) - Number(a?.match_score ?? 0))[0] ?? null;
            const score = n(best?.sentiment_score);
            const match = n(best?.match_score);

            insertedRows.push({
              symbol: null,
              headline: String(item.title),
              summary: item.description ? String(item.description) : (item.snippet ? String(item.snippet) : null),
              category: 'market news',
              url: item.url ? String(item.url) : null,
              source_name: normalizedSource(item),
              source_type: 'verified_news',
              sentiment: normalizeSentiment(score),
              sentiment_score: score,
              impact: impactFrom(score, match),
              recency_weight: recencyWeight(publishedAt),
              confidence: confidenceFromMatch(match),
              published_at: publishedAt,
              retrieved_at: retrievedAt,
              is_demo: false,
            });
            existing.add(dedupe);
            accepted += 1;
          }

          await db.from('news_symbol_refresh_state').upsert({
            symbol: '__BROAD_US__',
            last_refreshed_at: retrievedAt,
            provider_key: 'marketaux_news',
            priority: 'background',
            articles_found: accepted,
            updated_at: retrievedAt,
          }, { onConflict: 'symbol' });

          diagnostics.push({
            scope: 'broad_us',
            ok: true,
            provider_found: payload?.meta?.found ?? null,
            provider_returned: payload?.meta?.returned ?? data.length,
            accepted,
          });
        } catch (error) {
          diagnostics.push({ scope: 'broad_us', ok: false, error: errorMessage(error) });
        }
      } else {
        diagnostics.push({ scope: 'broad_us', skipped: true, reason: 'quota_reserved_for_higher_priority', quota: broadQuota });
      }
    }

    if (insertedRows.length) {
      const { error: insertError } = await db.from('news_items').insert(insertedRows);
      if (insertError) throw insertError;
    }

    await db.from('provider_configs').upsert({
      provider_key: 'marketaux_news',
      interface_name: 'MarketIntelligenceProvider',
      display_name: 'Marketaux News',
      adapter: 'MarketauxNewsAdapter',
      mode: 'connected',
      supplies: ['verified company news', 'broad US market news', 'entity sentiment'],
      candidate_providers: ['Marketaux'],
      secret_env_name: 'MARKETAUX_API_TOKEN',
      docs_url: 'https://www.marketaux.com/documentation',
      notes: `Priority scheduler active. Manual > login watchlist > 24h universe background. Broad US refresh every 4h. Diagnostics: ${JSON.stringify(diagnostics.slice(-12))}`,
      last_sync: retrievedAt,
      last_error: diagnostics.find((entry) => entry.ok === false)?.error ?? null,
    }, { onConflict: 'provider_key' });

    console.log('marketaux-news scheduler', JSON.stringify({
      priority,
      due_symbols: dueSymbols,
      calls_made: callsMade,
      inserted: insertedRows.length,
      quota: quotaState,
      diagnostics,
    }));

    return json({
      success: true,
      priority,
      due_symbols: dueSymbols,
      calls_made: callsMade,
      inserted: insertedRows.length,
      quota: quotaState,
      diagnostics,
    });
  } catch (error) {
    const message = errorMessage(error);
    try {
      const db = adminClient();
      await db.from('provider_configs').upsert({
        provider_key: 'marketaux_news',
        interface_name: 'MarketIntelligenceProvider',
        display_name: 'Marketaux News',
        adapter: 'MarketauxNewsAdapter',
        mode: 'connected',
        supplies: ['verified company news', 'broad US market news', 'entity sentiment'],
        candidate_providers: ['Marketaux'],
        secret_env_name: 'MARKETAUX_API_TOKEN',
        docs_url: 'https://www.marketaux.com/documentation',
        notes: 'Priority scheduler active. Manual > login watchlist > 24h universe background.',
        last_sync: new Date().toISOString(),
        last_error: message,
      }, { onConflict: 'provider_key' });
    } catch {}
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: message }, 500);
  }
});
