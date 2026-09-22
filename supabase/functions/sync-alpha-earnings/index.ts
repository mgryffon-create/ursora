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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((x) => x.length)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((x) => x.length)) rows.push(row);
  return rows;
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
      const { data, error } = await db.from('tickers').select('symbol').order('priority').limit(20);
      if (error) throw error;
      symbols = (data ?? []).map((x: any) => String(x.symbol).toUpperCase()).filter(Boolean);
    }

    symbols = [...new Set(symbols)];
    const wanted = new Set(symbols);
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'EARNINGS_CALENDAR');
    url.searchParams.set('horizon', '3month');
    url.searchParams.set('apikey', alphaKey());

    const response = await fetch(url);
    const text = await response.text();
    if (!response.ok) throw new Error(`Alpha Vantage returned HTTP ${response.status}`);

    if (/^\s*[{[]/.test(text)) {
      try {
        const payload = JSON.parse(text);
        const providerMessage = payload?.Note ?? payload?.Information ?? payload?.['Error Message'];
        if (providerMessage) throw new Error(String(providerMessage));
      } catch (error) {
        if (error instanceof Error) throw error;
      }
    }

    const parsed = parseCsv(text);
    const headers = parsed.shift()?.map((x) => x.trim()) ?? [];
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

    const rows = parsed.map((r) => {
      const symbol = String(r[idx.symbol] ?? '').toUpperCase();
      const reportDate = String(r[idx.reportDate] ?? '').trim();
      if (!wanted.has(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return null;
      return {
        symbol,
        report_time: `${reportDate}T16:00:00Z`,
        session: 'unknown',
        confirmed: false,
        eps_estimate: n(r[idx.estimate]),
        revenue_estimate: null,
        expected_move_pct: null,
        source_name: 'Alpha Vantage Earnings Calendar',
        source_url: 'https://www.alphavantage.co/documentation/',
      };
    }).filter(Boolean);

    if (symbols.length) {
      const { error: deleteError } = await db
        .from('earnings_events')
        .delete()
        .in('symbol', symbols)
        .eq('source_name', 'Alpha Vantage Earnings Calendar')
        .gte('report_time', new Date().toISOString());
      if (deleteError) throw deleteError;
    }

    if (rows.length) {
      const { error: insertError } = await db.from('earnings_events').insert(rows);
      if (insertError) throw insertError;
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

    return json({ success: true, tracked_symbols: symbols.length, earnings_events: rows.length });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
