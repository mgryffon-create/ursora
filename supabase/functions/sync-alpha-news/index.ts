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

function alphaKey() {
  const key = Deno.env.get('ALPHA_VANTAGE_API_KEY')?.trim();
  if (!key) throw new Error('ALPHA_VANTAGE_API_KEY is not configured.');
  return key;
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAlphaTime(value: unknown): string | null {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

function alphaTimeFrom(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

function normalizeSentiment(score: number | null): 'bullish' | 'bearish' | 'neutral' {
  if (score === null) return 'neutral';
  if (score >= 0.15) return 'bullish';
  if (score <= -0.15) return 'bearish';
  return 'neutral';
}

function impactFrom(score: number | null, relevance: number | null): 'low' | 'medium' | 'high' {
  const magnitude = Math.abs(score ?? 0);
  const rel = relevance ?? 0.5;
  if (magnitude >= 0.35 && rel >= 0.65) return 'high';
  if (magnitude >= 0.15 && rel >= 0.35) return 'medium';
  return 'low';
}

function recencyWeight(publishedAt: string): number {
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3600000);
  return Math.max(0.05, Math.exp(-ageHours / 48));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    let symbols = Array.isArray(body.symbols)
      ? body.symbols.map((x: unknown) => String(x).toUpperCase()).filter(Boolean)
      : [];

    if (!symbols.length) {
      const { data, error } = await db.from('tickers').select('symbol').order('priority').limit(8);
      if (error) throw error;
      symbols = (data ?? []).map((x: any) => String(x.symbol).toUpperCase()).filter(Boolean);
    }

    symbols = [...new Set(symbols)].slice(0, 8);
    const key = alphaKey();
    const results: any[] = [];
    let inserted = 0;

    for (const symbol of symbols) {
      const url = new URL('https://www.alphavantage.co/query');
      url.searchParams.set('function', 'NEWS_SENTIMENT');
      url.searchParams.set('tickers', symbol);
      url.searchParams.set('time_from', alphaTimeFrom(7));
      url.searchParams.set('sort', 'LATEST');
      url.searchParams.set('limit', '50');
      url.searchParams.set('apikey', key);

      const response = await fetch(url);
      const text = await response.text();
      if (!response.ok) {
        results.push({ symbol, ok: false, error: `HTTP ${response.status}` });
        continue;
      }

      let payload: any;
      try { payload = JSON.parse(text); } catch {
        results.push({ symbol, ok: false, error: 'Invalid JSON response' });
        continue;
      }

      const providerMessage = payload?.Note ?? payload?.Information ?? payload?.['Error Message'];
      if (providerMessage) {
        results.push({ symbol, ok: false, error: String(providerMessage) });
        if (/rate|frequency|limit/i.test(String(providerMessage))) break;
        continue;
      }

      const feed = Array.isArray(payload?.feed) ? payload.feed : [];
      const rows = feed.map((item: any) => {
        const tickerSentiment = Array.isArray(item.ticker_sentiment)
          ? item.ticker_sentiment.find((x: any) => String(x.ticker).toUpperCase() === symbol)
          : null;
        const tickerScore = n(tickerSentiment?.ticker_sentiment_score);
        const overallScore = n(item.overall_sentiment_score);
        const score = tickerScore ?? overallScore;
        const relevance = n(tickerSentiment?.relevance_score);
        const publishedAt = parseAlphaTime(item.time_published);
        if (!publishedAt || !item.title) return null;

        return {
          symbol,
          headline: String(item.title),
          summary: item.summary ? String(item.summary) : null,
          category: Array.isArray(item.topics) && item.topics.length
            ? String(item.topics[0]?.topic ?? item.category_within_source ?? 'market news')
            : String(item.category_within_source ?? 'market news'),
          url: item.url ? String(item.url) : null,
          source_name: item.source ? String(item.source) : 'Alpha Vantage',
          source_type: 'verified_news',
          sentiment: normalizeSentiment(score),
          sentiment_score: score,
          impact: impactFrom(score, relevance),
          recency_weight: recencyWeight(publishedAt),
          confidence: relevance === null ? 0.65 : Math.max(0.35, Math.min(1, relevance)),
          published_at: publishedAt,
          retrieved_at: new Date().toISOString(),
          is_demo: false,
        };
      }).filter(Boolean);

      const cutoff = new Date(Date.now() - 8 * 86400000).toISOString();
      const { error: deleteError } = await db
        .from('news_items')
        .delete()
        .eq('symbol', symbol)
        .eq('source_type', 'verified_news')
        .gte('published_at', cutoff);
      if (deleteError) throw deleteError;

      if (rows.length) {
        const { error: insertError } = await db.from('news_items').insert(rows);
        if (insertError) throw insertError;
        inserted += rows.length;
      }

      results.push({ symbol, ok: true, articles: rows.length });
      await sleep(900);
    }

    await db.from('provider_configs').upsert({
      provider_key: 'alpha_intelligence',
      interface_name: 'MarketIntelligenceProvider',
      display_name: 'Alpha Vantage Intelligence',
      adapter: 'AlphaVantageIntelligenceAdapter',
      mode: 'connected',
      supplies: ['verified news', 'news sentiment', 'earnings calendar'],
      candidate_providers: ['Alpha Vantage'],
      secret_env_name: 'ALPHA_VANTAGE_API_KEY',
      docs_url: 'https://www.alphavantage.co/documentation/',
      notes: 'Server-side market-intelligence integration for TradeCycle.',
      last_sync: new Date().toISOString(),
      last_error: null,
    }, { onConflict: 'provider_key' });

    return json({ success: true, symbols: symbols.length, inserted, results });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
