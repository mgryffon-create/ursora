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

function dedupeKey(item: any): string {
  return String(item?.uuid ?? item?.url ?? item?.title ?? '').trim().toLowerCase();
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const requestedSymbols = Array.isArray(body.symbols)
      ? body.symbols.map((x: unknown) => String(x).trim().toUpperCase()).filter(Boolean)
      : [];

    const [{ data: defaultRows, error: defaultError }, { data: favoriteRows, error: favoriteError }] = await Promise.all([
      db.from('tickers').select('symbol').eq('is_default', true).order('priority', { ascending: true }).limit(30),
      db.from('user_favorites').select('symbol').eq('user_id', user.id).order('added_at', { ascending: true }).limit(30),
    ]);
    if (defaultError) throw defaultError;
    if (favoriteError) throw favoriteError;

    const symbols = [...new Set([
      ...requestedSymbols,
      ...(favoriteRows ?? []).map((row: any) => String(row.symbol ?? '').toUpperCase()).filter(Boolean),
      ...(defaultRows ?? []).map((row: any) => String(row.symbol ?? '').toUpperCase()).filter(Boolean),
    ])].slice(0, 30);

    const providerKey = 'marketaux_news';
    const cacheMinutes = 30;
    const { data: providerRow } = await db
      .from('provider_configs')
      .select('last_sync,last_error')
      .eq('provider_key', providerKey)
      .maybeSingle();

    const lastSyncMs = providerRow?.last_sync ? new Date(providerRow.last_sync).getTime() : 0;
    const cacheFresh = !force && providerRow?.last_error == null && lastSyncMs > Date.now() - cacheMinutes * 60000;
    if (cacheFresh) {
      return json({
        success: true,
        cached: true,
        symbols: symbols.length,
        last_sync: providerRow.last_sync,
      });
    }

    const key = marketauxKey();
    const publishedAfter = isoHoursAgo(72);
    const retrievedAt = new Date().toISOString();

    const existing = new Set<string>();
    const { data: existingRows, error: existingError } = await db
      .from('news_items')
      .select('url,headline')
      .gte('published_at', new Date(Date.now() - 8 * 86400000).toISOString())
      .limit(2000);
    if (existingError) throw existingError;
    for (const row of existingRows ?? []) {
      const id = String((row as any).url ?? (row as any).headline ?? '').trim().toLowerCase();
      if (id) existing.add(id);
    }

    const acceptedKeys = new Set<string>();
    const rows: any[] = [];
    const diagnostics: any[] = [];

    // First fetch tracked/watchlist news so symbol-specific associations win dedupe.
    if (symbols.length) {
      const payload = await fetchMarketaux({
        symbols: symbols.join(','),
        filter_entities: 'true',
        language: 'en',
        published_after: publishedAfter,
        sort: 'published_at',
        limit: '3',
      }, key);

      const data = Array.isArray(payload?.data) ? payload.data : [];
      let accepted = 0;
      let rejectedNoTrackedEntity = 0;

      for (const item of data) {
        const keyId = dedupeKey(item);
        if (!keyId || existing.has(keyId) || acceptedKeys.has(keyId)) continue;

        const entities = (Array.isArray(item.entities) ? item.entities : [])
          .filter((entity: any) => symbols.includes(String(entity?.symbol ?? '').toUpperCase()))
          .sort((a: any, b: any) => Number(b?.match_score ?? 0) - Number(a?.match_score ?? 0));
        const primary = entities[0] ?? null;
        if (!primary) {
          rejectedNoTrackedEntity += 1;
          continue;
        }

        const publishedAt = item?.published_at ? new Date(item.published_at).toISOString() : null;
        if (!publishedAt || !item?.title) continue;

        const score = n(primary.sentiment_score);
        const match = n(primary.match_score);
        const symbol = String(primary.symbol).toUpperCase();

        rows.push({
          symbol,
          headline: String(item.title),
          summary: item.description ? String(item.description) : (item.snippet ? String(item.snippet) : null),
          category: 'company news',
          url: item.url ? String(item.url) : null,
          source_name: item.source ? String(item.source) : 'Marketaux',
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
        acceptedKeys.add(keyId);
        accepted += 1;
      }

      diagnostics.push({
        scope: 'tracked',
        provider_found: payload?.meta?.found ?? null,
        provider_returned: payload?.meta?.returned ?? data.length,
        accepted,
        rejected_no_tracked_entity: rejectedNoTrackedEntity,
      });
    }

    // Then fetch broad US market news. These rows remain unassigned to a ticker so
    // Market Overview can show market-wide events without mislabeling a company.
    const broadPayload = await fetchMarketaux({
      countries: 'us',
      must_have_entities: 'true',
      language: 'en',
      published_after: publishedAfter,
      sort: 'published_at',
      limit: '3',
    }, key);

    const broadData = Array.isArray(broadPayload?.data) ? broadPayload.data : [];
    let broadAccepted = 0;

    for (const item of broadData) {
      const keyId = dedupeKey(item);
      if (!keyId || existing.has(keyId) || acceptedKeys.has(keyId)) continue;

      const publishedAt = item?.published_at ? new Date(item.published_at).toISOString() : null;
      if (!publishedAt || !item?.title) continue;

      const entities = Array.isArray(item.entities) ? item.entities : [];
      const best = [...entities].sort((a: any, b: any) => Number(b?.match_score ?? 0) - Number(a?.match_score ?? 0))[0] ?? null;
      const score = n(best?.sentiment_score);
      const match = n(best?.match_score);

      rows.push({
        symbol: null,
        headline: String(item.title),
        summary: item.description ? String(item.description) : (item.snippet ? String(item.snippet) : null),
        category: 'market news',
        url: item.url ? String(item.url) : null,
        source_name: item.source ? String(item.source) : 'Marketaux',
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
      acceptedKeys.add(keyId);
      broadAccepted += 1;
    }

    diagnostics.push({
      scope: 'broad_us',
      provider_found: broadPayload?.meta?.found ?? null,
      provider_returned: broadPayload?.meta?.returned ?? broadData.length,
      accepted: broadAccepted,
    });

    if (rows.length) {
      const { error: insertError } = await db.from('news_items').insert(rows);
      if (insertError) throw insertError;
    }

    await db.from('provider_configs').upsert({
      provider_key: providerKey,
      interface_name: 'MarketIntelligenceProvider',
      display_name: 'Marketaux News',
      adapter: 'MarketauxNewsAdapter',
      mode: 'connected',
      supplies: ['verified company news', 'broad US market news', 'entity sentiment'],
      candidate_providers: ['Marketaux'],
      secret_env_name: 'MARKETAUX_API_TOKEN',
      docs_url: 'https://www.marketaux.com/documentation',
      notes: `Two-request cached sweep: tracked/watchlist symbols first, then broad US market news. ${cacheMinutes}-minute cache. Diagnostics: ${JSON.stringify(diagnostics)}`,
      last_sync: retrievedAt,
      last_error: null,
    }, { onConflict: 'provider_key' });

    console.log('marketaux-news diagnostics', JSON.stringify({ rows: rows.length, diagnostics }));

    return json({
      success: true,
      cached: false,
      symbols: symbols.length,
      inserted: rows.length,
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
        notes: 'Two-request cached sweep: tracked/watchlist symbols first, then broad US market news.',
        last_sync: new Date().toISOString(),
        last_error: message,
      }, { onConflict: 'provider_key' });
    } catch {}
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: message }, 500);
  }
});
