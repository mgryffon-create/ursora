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

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function pageDescription(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 URSORA/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 300000);
    const patterns = [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeEntities(match[1]).replace(/\s+/g, ' ').trim().slice(0, 600);
    }
  } catch {
    // Headline/link are still useful when article metadata cannot be fetched.
  }
  return null;
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
      const { data, error } = await db
        .from('quotes')
        .select('symbol,as_of')
        .order('as_of', { ascending: false })
        .limit(120);
      if (error) throw error;

      const seen = new Set<string>();
      for (const row of data ?? []) {
        const symbol = String((row as any).symbol ?? '').toUpperCase();
        if (symbol && !seen.has(symbol)) {
          seen.add(symbol);
          symbols.push(symbol);
        }
      }
    }

    symbols = [...new Set(symbols)].slice(0, 30);
    const providerKey = 'yahoo_finance_news';
    const capability = 'news';
    const cacheHours = 6;
    const staleBefore = Date.now() - cacheHours * 3600000;

    const { data: states, error: stateError } = await db
      .from('provider_symbol_syncs')
      .select('symbol,last_attempt,item_count')
      .eq('provider_key', providerKey)
      .eq('capability', capability)
      .in('symbol', symbols);
    if (stateError) throw stateError;

    const stateBySymbol = new Map(
      (states ?? []).map((row: any) => [String(row.symbol).toUpperCase(), row]),
    );

    const refreshSymbols = symbols.filter((symbol) => {
      const state: any = stateBySymbol.get(symbol);
      const lastAttempt = state?.last_attempt ? new Date(state.last_attempt).getTime() : 0;
      return !Number.isFinite(lastAttempt) || lastAttempt < staleBefore;
    });

    let inserted = 0;
    const results: any[] = [];

    for (const symbol of refreshSymbols) {
      const attemptedAt = new Date().toISOString();
      try {
        const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
        url.searchParams.set('q', symbol);
        url.searchParams.set('quotesCount', '0');
        url.searchParams.set('newsCount', '10');
        url.searchParams.set('enableFuzzyQuery', 'false');
        url.searchParams.set('quotesQueryId', 'tss_match_phrase_query');
        url.searchParams.set('multiQuoteQueryId', 'multi_quote_single_token_query');

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 URSORA/1.0',
            'Accept': 'application/json',
          },
        });
        if (!response.ok) throw new Error(`Yahoo Finance returned HTTP ${response.status}`);
        const payload = await response.json();
        const news = Array.isArray(payload?.news) ? payload.news : [];

        const rows: any[] = [];
        for (const item of news.slice(0, 8)) {
          const headline = cleanText(item.title);
          const link = cleanText(item.link);
          const publishedSeconds = Number(item.providerPublishTime);
          if (!headline || !link || !Number.isFinite(publishedSeconds)) continue;

          const related = Array.isArray(item.relatedTickers)
            ? item.relatedTickers.map((x: unknown) => String(x).toUpperCase())
            : [];
          if (related.length && !related.includes(symbol)) continue;

          const publishedAt = new Date(publishedSeconds * 1000).toISOString();
          let summary = cleanText(item.summary);
          if (!summary) summary = await pageDescription(link);

          rows.push({
            symbol,
            headline,
            summary,
            category: 'market news',
            url: link,
            source_name: cleanText(item.publisher) ?? 'Yahoo Finance',
            source_type: 'verified_news',
            sentiment: null,
            sentiment_score: null,
            impact: 'low',
            recency_weight: recencyWeight(publishedAt),
            confidence: related.includes(symbol) ? 0.82 : 0.65,
            published_at: publishedAt,
            retrieved_at: attemptedAt,
            is_demo: false,
          });
        }

        const cutoff = new Date(Date.now() - 8 * 86400000).toISOString();
        const { error: deleteError } = await db
          .from('news_items')
          .delete()
          .eq('symbol', symbol)
          .eq('source_type', 'yahoo_finance_news')
          .gte('published_at', cutoff);
        if (deleteError) throw deleteError;

        // Use a distinct source_type so Yahoo rows can be refreshed independently.
        const yahooRows = rows.map((row) => ({ ...row, source_type: 'yahoo_finance_news' }));
        if (yahooRows.length) {
          const { error: insertError } = await db.from('news_items').insert(yahooRows);
          if (insertError) throw insertError;
          inserted += yahooRows.length;
        }

        await db.from('provider_symbol_syncs').upsert({
          provider_key: providerKey,
          capability,
          symbol,
          last_attempt: attemptedAt,
          last_success: attemptedAt,
          last_error: null,
          item_count: yahooRows.length,
          updated_at: attemptedAt,
        }, { onConflict: 'provider_key,capability,symbol' });

        results.push({ symbol, ok: true, articles: yahooRows.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db.from('provider_symbol_syncs').upsert({
          provider_key: providerKey,
          capability,
          symbol,
          last_attempt: attemptedAt,
          last_error: message,
          updated_at: attemptedAt,
        }, { onConflict: 'provider_key,capability,symbol' });
        results.push({ symbol, ok: false, error: message });
      }

      await sleep(250);
    }

    for (const symbol of symbols) {
      if (!refreshSymbols.includes(symbol)) {
        const state: any = stateBySymbol.get(symbol);
        results.push({ symbol, ok: true, cached: true, articles: Number(state?.item_count ?? 0) });
      }
    }

    await db.from('provider_configs').upsert({
      provider_key: providerKey,
      interface_name: 'MarketIntelligenceProvider',
      display_name: 'Yahoo Finance News',
      adapter: 'YahooFinanceNewsAdapter',
      mode: 'connected',
      supplies: ['ticker news headlines', 'article links', 'article summaries where available'],
      candidate_providers: ['Yahoo Finance'],
      secret_env_name: null,
      docs_url: 'https://finance.yahoo.com/',
      notes: 'Best-effort supplemental news feed using Yahoo Finance public web endpoints; availability and schema are not guaranteed.',
      last_sync: new Date().toISOString(),
      last_error: results.find((x) => x.ok === false)?.error ?? null,
    }, { onConflict: 'provider_key' });

    return json({
      success: true,
      symbols: symbols.length,
      refreshed: refreshSymbols.length,
      cached: symbols.length - refreshSymbols.length,
      inserted,
      results,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
