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

function contractCode(strike: number | null, optionType: string | null): string | null {
  if (strike === null || !optionType) return null;
  const side = String(optionType).toUpperCase().startsWith('P') ? 'P' : 'C';
  return `${Number(strike).toFixed(Number.isInteger(strike) ? 0 : 2)}${side}`;
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

function dateDaysBefore(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() - days * 86400000).toISOString().slice(0, 10);
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

    let entryActivity: Record<string, any> | null = null;
    let exitActivity: Record<string, any> | null = null;
    if (brokerageEpisode) {
      const entryIds = Array.isArray(trade.entry_activity_ids) ? trade.entry_activity_ids.map(String) : [];
      const exitIds = Array.isArray(trade.exit_activity_ids) ? trade.exit_activity_ids.map(String) : [];
      const activityIds = [...new Set([...entryIds, ...exitIds])];
      if (activityIds.length) {
        const { data: activityRows, error: activityError } = await db
          .from('snaptrade_activities')
          .select('id,symbol,option_symbol,option_type,strike,expiration,price,trade_date,activity_type,option_action,units')
          .eq('user_id', user.id)
          .in('id', activityIds)
          .order('trade_date', { ascending: true });
        if (activityError) throw activityError;
        const rows = activityRows ?? [];
        entryActivity = rows.find((row: any) => entryIds.includes(String(row.id))) ?? null;
        exitActivity = [...rows].reverse().find((row: any) => exitIds.includes(String(row.id))) ?? null;
      }
    }

    const entryAt = trade.entry_at ?? trade.created_at;
    if (!entryAt) return json({ error: 'Trade has no entry timestamp.' }, 422);
    const sessionDate = etDate(entryAt);
    const symbol = String(trade.symbol ?? '').toUpperCase();
    if (!symbol) return json({ error: 'Trade has no symbol.' }, 422);

    let historicalReview: Record<string, any> | null = null;
    if (brokerageEpisode) {
      const { data: review, error: reviewError } = await db
        .from('historical_trade_reviews')
        .select('*')
        .eq('user_id', user.id)
        .eq('brokerage_episode_id', Math.abs(tradeId))
        .maybeSingle();
      if (reviewError) throw reviewError;
      historicalReview = review ?? null;
    }

    const exitAtForRange = trade.exit_at ?? trade.closed_at ?? entryAt;
    const exitSessionDate = etDate(exitAtForRange);

    // Closed brokerage replays are immutable. Fill the historical market window once
    // and persist it server-side; every later replay reads the stored bars and never
    // calls Massive again for that episode.
    const playbackStartDate = dateDaysBefore(entryAt, 8);
    let bars: Array<Record<string, any>> = [];
    let playbackDataSource = 'fresh_massive_fill';

    if (brokerageEpisode) {
      const { data: cachedPlayback, error: cacheError } = await db
        .from('historical_trade_playback_cache')
        .select('bars,context_start,entry_session,exit_session,fetched_at,source')
        .eq('user_id', user.id)
        .eq('brokerage_episode_id', Math.abs(tradeId))
        .maybeSingle();
      if (cacheError) throw cacheError;

      if (cachedPlayback && Array.isArray(cachedPlayback.bars) && cachedPlayback.bars.length) {
        bars = cachedPlayback.bars;
        playbackDataSource = 'persisted_historical_cache';
      }
    }

    if (!bars.length) {
      const payload = await massiveGet(
        `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/5/minute/${playbackStartDate}/${exitSessionDate}`,
        { adjusted: true, sort: 'asc', limit: 50000 },
      );

      bars = (Array.isArray(payload?.results) ? payload.results : [])
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

      if (brokerageEpisode && bars.length) {
        const { error: cacheWriteError } = await db
          .from('historical_trade_playback_cache')
          .upsert({
            user_id: user.id,
            brokerage_episode_id: Math.abs(tradeId),
            symbol,
            timeframe: '5m',
            context_start: playbackStartDate,
            entry_session: sessionDate,
            exit_session: exitSessionDate,
            bars,
            source: 'Massive',
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'user_id,brokerage_episode_id' });
        if (cacheWriteError) throw cacheWriteError;
      }
    }

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
    const isOption = String(trade.asset_type ?? '').toLowerCase() === 'option' || Boolean(trade.option_symbol);
    const entryUnderlying = historicalReview ? n(historicalReview.entry_underlying_price) : nearestPrice(entryAt);
    const exitUnderlying = historicalReview ? n(historicalReview.exit_underlying_price) : nearestPrice(exitAt);

    const markers = [
      historicalReview?.confirmation_at ? {
        kind: 'confirmation',
        label: 'Thesis confirmed',
        at: historicalReview.confirmation_at,
        price: n(historicalReview.confirmation_price),
        detail: `${String(historicalReview.retro_direction ?? 'direction')} ${String(historicalReview.cycle_event_type ?? 'cycle')} confirmation`,
      } : null,
      {
        kind: 'entry',
        label: isOption
          ? `ENTRY · ${contractCode(n(entryActivity?.strike ?? trade.strike), String(entryActivity?.option_type ?? trade.option_type ?? '')) ?? 'OPTION'} · ${n(entryActivity?.price ?? trade.entry_price)?.toFixed(2) ?? '—'}`
          : 'Your entry',
        at: entryAt,
        price: isOption ? entryUnderlying : (n(trade.entry_price) ?? entryUnderlying),
        detail: isOption
          ? `Underlying ${symbol} ${entryUnderlying?.toFixed(2) ?? '—'} · ${String(entryActivity?.option_action ?? 'entry')} · ${String(entryActivity?.expiration ?? trade.expiration ?? 'expiration unavailable')}`
          : 'Brokerage execution mapped to the underlying session',
      },
      weakening ? {
        kind: 'weakening',
        label: 'Thesis weakening',
        at: weakening.created_at,
        price: n(weakening.underlying_price) ?? nearestPrice(weakening.created_at),
        detail: String(weakening.thesis_state ?? weakening.event_type ?? 'Evidence weakened'),
      } : null,
      historicalReview?.invalidation_at ? {
        kind: 'invalidation',
        label: 'Thesis invalidated',
        at: historicalReview.invalidation_at,
        price: n(historicalReview.invalidation_price),
        detail: 'Price crossed the retroactive thesis invalidation while the position was open.',
      } : invalidation ? {
        kind: 'invalidation',
        label: 'Thesis invalidation',
        at: invalidation.created_at,
        price: n(invalidation.underlying_price) ?? nearestPrice(invalidation.created_at),
        detail: String(invalidation.thesis_state ?? invalidation.event_type ?? 'Thesis invalidated'),
      } : null,
      historicalReview?.target_hit_at ? {
        kind: 'target',
        label: 'Target reached',
        at: historicalReview.target_hit_at,
        price: n(historicalReview.target_price),
        detail: 'The reconstructed tactical target was reached while the position was open.',
      } : null,
      exitAt ? {
        kind: 'exit',
        label: isOption
          ? `EXIT · ${contractCode(n(exitActivity?.strike ?? entryActivity?.strike ?? trade.strike), String(exitActivity?.option_type ?? entryActivity?.option_type ?? trade.option_type ?? '')) ?? 'OPTION'} · ${n(exitActivity?.price ?? trade.exit_price)?.toFixed(2) ?? '—'}`
          : 'Your exit',
        at: exitAt,
        price: isOption ? exitUnderlying : (n(trade.exit_price) ?? exitUnderlying),
        detail: isOption
          ? `Underlying ${symbol} ${exitUnderlying?.toFixed(2) ?? '—'} · ${String(exitActivity?.option_action ?? 'exit')} · ${String(exitActivity?.expiration ?? entryActivity?.expiration ?? trade.expiration ?? 'expiration unavailable')}`
          : 'Brokerage exit mapped to the underlying session',
      } : null,
    ].filter(Boolean);

    const invalidationAt = historicalReview?.invalidation_at ?? invalidation?.created_at ?? null;
    const postInvalidationMinutes = invalidationAt && exitAt
      ? Math.max(0, Math.round((new Date(exitAt).getTime() - new Date(invalidationAt).getTime()) / 60000))
      : null;

    return json({
      success: true,
      trade_id: tradeId,
      symbol,
      session_date: sessionDate,
      playback_window: {
        context_start: playbackStartDate,
        entry_session: sessionDate,
        exit_session: exitSessionDate,
        context_rule: 'prior 5 trading sessions plus the complete holding period',
        data_source: playbackDataSource,
      },
      bars,
      markers,
      episode: {
        entry_at: entryAt,
        exit_at: exitAt,
        invalidation_at: invalidationAt,
        weakening_at: weakening?.created_at ?? null,
        post_invalidation_minutes: historicalReview?.post_invalidation_minutes ?? postInvalidationMinutes,
        realized_pl: n(trade.realized_pl),
        return_pct: n(trade.return_pct ?? trade.realized_return_pct),
        thesis_review_status: historicalReview?.thesis_state ?? trade.thesis_review_status ?? null,
      },
      review: historicalReview,
      instrument: brokerageEpisode ? {
        asset_type: trade.asset_type ?? (trade.option_symbol ? 'option' : 'equity'),
        symbol,
        option_symbol: entryActivity?.option_symbol ?? trade.option_symbol ?? null,
        option_type: String(entryActivity?.option_type ?? trade.option_type ?? '').toLowerCase() || null,
        strike: n(entryActivity?.strike ?? trade.strike),
        expiration: entryActivity?.expiration ?? trade.expiration ?? null,
        entry_option_price: n(entryActivity?.price ?? trade.entry_price),
        exit_option_price: n(exitActivity?.price ?? trade.exit_price),
        entry_activity_at: entryActivity?.trade_date ?? entryAt,
        exit_activity_at: exitActivity?.trade_date ?? exitAt,
        source: entryActivity ? 'timestamped_snaptrade_activity' : 'normalized_episode',
      } : null,
      levels: historicalReview ? [
        n(historicalReview.confirmation_price) !== null ? { kind: 'confirmation', label: 'Confirmation', value: n(historicalReview.confirmation_price), detail: 'Price level where the historical cycle became substantiated before entry.' } : null,
        n(historicalReview.target_price) !== null ? { kind: 'target', label: 'Target', value: n(historicalReview.target_price), detail: 'Nearest defensible tactical objective using only pre-entry structure.' } : null,
        n(historicalReview.invalidation_price) !== null ? { kind: 'invalidation', label: 'Invalidation', value: n(historicalReview.invalidation_price), detail: 'Level that would break the reconstructed directional premise.' } : null,
        n(historicalReview.evidence?.support) !== null ? { kind: 'support', label: 'Support', value: n(historicalReview.evidence?.support), detail: 'Nearest pre-entry support derived from recent historical structure.' } : null,
        n(historicalReview.evidence?.resistance) !== null ? { kind: 'resistance', label: 'Resistance', value: n(historicalReview.evidence?.resistance), detail: 'Nearest pre-entry resistance derived from recent historical structure.' } : null,
      ].filter(Boolean) : [],
      source: brokerageEpisode
        ? 'SnapTrade execution history + Massive 5-minute historical aggregates + cached TradeCycle reconstruction'
        : 'TradeCycle history + Massive 5-minute historical aggregates',
      thesis_event_source: brokerageEpisode
        ? (historicalReview ? 'No-lookahead historical TradeCycle reconstruction.' : 'Historical TradeCycle reconstruction is pending for this imported brokerage episode.')
        : 'Stored TradeCycle lifecycle events',
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
