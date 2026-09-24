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
  if (!key) throw new Error('MASSIVE_API_KEY is not configured.');
  return key;
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function etDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function etMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

async function massiveGet(path: string, params: Record<string, string | number | boolean> = {}) {
  const url = new URL(`https://api.massive.com${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
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
}

function eventKind(event: Record<string, any>): 'weakening' | 'invalidation' | null {
  const state = String(event.thesis_state ?? '').toLowerCase();
  const type = String(event.event_type ?? '').toLowerCase();
  if (state === 'rejected' || state === 'unsupported' || state.includes('invalidat') || type.includes('invalidat')) return 'invalidation';
  if (state.includes('mixed') || state.includes('weak') || state.includes('degrad') || type.includes('weak') || type.includes('deviation')) return 'weakening';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const tradeId = Number(body.trade_id);
    if (!Number.isFinite(tradeId)) return json({ error: 'trade_id is required.' }, 400);

    const brokerageEpisode = tradeId < 0;
    let trade: Record<string, any> | null = null;
    let events: Record<string, any>[] = [];

    if (brokerageEpisode) {
      const episodeId = Math.abs(tradeId);
      const { data: episode, error: episodeError } = await db
        .from('snaptrade_trade_episodes')
        .select('*')
        .eq('id', episodeId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (episodeError) throw episodeError;
      if (!episode) return json({ error: 'Brokerage trade episode not found for this account.' }, 404);

      trade = {
        ...episode,
        entry_at: episode.opened_at,
        entry_price: episode.average_entry_price,
        exit_at: episode.closed_at,
        exit_price: episode.average_exit_price,
        closed_at: episode.closed_at,
        created_at: episode.opened_at,
        return_pct: episode.realized_return_pct,
        thesis_review_status: null,
      };
    } else {
      const { data: paperTrade, error: tradeError } = await db
        .from('paper_trades')
        .select('*')
        .eq('id', tradeId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (tradeError) throw tradeError;
      if (!paperTrade) return json({ error: 'Trade not found for this account.' }, 404);
      trade = paperTrade;

      const { data: storedEvents, error: eventError } = await db
        .from('tradecycle_thesis_events')
        .select('*')
        .eq('user_id', user.id)
        .eq('trade_id', tradeId)
        .order('created_at', { ascending: true });
      if (eventError) throw eventError;
      events = storedEvents ?? [];
    }

    const entryAt = trade.entry_at ?? trade.created_at;
    if (!entryAt) return json({ error: 'Trade has no entry timestamp.' }, 422);
    const sessionDate = etDate(entryAt);
    const symbol = String(trade.symbol ?? '').toUpperCase();
    if (!symbol) return json({ error: 'Trade has no symbol.' }, 422);

    const payload = await massiveGet(
      `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/minute/${sessionDate}/${sessionDate}`,
      { adjusted: true, sort: 'asc', limit: 50000 },
    );

    const bars = (Array.isArray(payload?.results) ? payload.results : [])
      .map((bar: any) => ({
        bar_time: new Date(Number(bar.t)).toISOString(),
        open: n(bar.o),
        high: n(bar.h),
        low: n(bar.l),
        close: n(bar.c),
        volume: n(bar.v),
      }))
      .filter((bar: any) =>
        bar.open !== null && bar.high !== null && bar.low !== null && bar.close !== null
        && etMinutes(bar.bar_time) >= 570 && etMinutes(bar.bar_time) <= 960
      );

    const nearestPrice = (iso: string | null | undefined): number | null => {
      if (!iso || !bars.length) return null;
      const target = new Date(iso).getTime();
      let best = bars[0];
      let distance = Math.abs(new Date(best.bar_time).getTime() - target);
      for (const bar of bars.slice(1)) {
        const next = Math.abs(new Date(bar.bar_time).getTime() - target);
        if (next < distance) {
          best = bar;
          distance = next;
        }
      }
      return n(best.close);
    };

    const typedEvents = (events ?? [])
      .map((event: any) => ({ event, kind: eventKind(event) }))
      .filter((row: any) => row.kind);

    const weakening = typedEvents.find((row: any) => row.kind === 'weakening')?.event ?? null;
    const invalidation = typedEvents.find((row: any) => row.kind === 'invalidation')?.event ?? null;
    const exitAt = trade.exit_at ?? trade.closed_at ?? null;

    const markers = [
      {
        kind: 'entry',
        label: 'Entry',
        at: entryAt,
        price: n(trade.entry_price) ?? nearestPrice(entryAt),
        detail: trade.entry_price !== null ? 'Brokerage / trade entry' : 'Entry time mapped to underlying market price',
      },
      weakening ? {
        kind: 'weakening',
        label: 'Thesis weakening',
        at: weakening.created_at,
        price: n(weakening.underlying_price) ?? nearestPrice(weakening.created_at),
        detail: String(weakening.thesis_state ?? weakening.event_type ?? 'Evidence weakened'),
      } : null,
      invalidation ? {
        kind: 'invalidation',
        label: 'Thesis invalidation',
        at: invalidation.created_at,
        price: n(invalidation.underlying_price) ?? nearestPrice(invalidation.created_at),
        detail: String(invalidation.thesis_state ?? invalidation.event_type ?? 'Thesis invalidated'),
      } : null,
      exitAt ? {
        kind: 'exit',
        label: 'Exit',
        at: exitAt,
        price: n(trade.exit_price) ?? nearestPrice(exitAt),
        detail: trade.exit_price !== null ? 'Brokerage / trade exit' : 'Exit time mapped to underlying market price',
      } : null,
    ].filter(Boolean);

    const invalidationAt = invalidation?.created_at ?? null;
    const postInvalidationMinutes = invalidationAt && exitAt
      ? Math.max(0, Math.round((new Date(exitAt).getTime() - new Date(invalidationAt).getTime()) / 60000))
      : null;

    return json({
      success: true,
      trade_id: tradeId,
      symbol,
      session_date: sessionDate,
      bars,
      markers,
      episode: {
        entry_at: entryAt,
        exit_at: exitAt,
        invalidation_at: invalidationAt,
        weakening_at: weakening?.created_at ?? null,
        post_invalidation_minutes: postInvalidationMinutes,
        realized_pl: n(trade.realized_pl),
        return_pct: n(trade.return_pct),
        thesis_review_status: trade.thesis_review_status ?? null,
      },
      source: brokerageEpisode
        ? 'SnapTrade execution history + Massive 1-minute aggregates'
        : 'TradeCycle history + Massive 1-minute aggregates',
      thesis_event_source: brokerageEpisode
        ? 'Historical TradeCycle reconstruction not yet materialized for this imported brokerage episode.'
        : 'Stored TradeCycle lifecycle events',
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
