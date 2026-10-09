import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AnyRow = Record<string, any>;
type Direction = 'bullish' | 'bearish' | 'neutral';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase runtime credentials are missing.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireUser(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new Error('Authentication required.');
  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(auth.slice(7).trim());
  if (error || !user) throw new Error('Invalid or expired session.');
  return { db, user };
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function etParts(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    session: `${get('year')}-${get('month')}-${get('day')}`,
    slot: `${get('hour')}:${get('minute')}`,
  };
}

function rangePosition(price: number | null, bars: AnyRow[]): number | null {
  if (price === null || !bars.length) return null;
  const highs = bars.map((b) => n(b.high)).filter((v): v is number => v !== null);
  const lows = bars.map((b) => n(b.low)).filter((v): v is number => v !== null);
  if (!highs.length || !lows.length) return null;
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  if (!(high > low)) return null;
  return Math.max(0, Math.min(1, (price - low) / (high - low)));
}

function normalizedVolumeAt(
  bars: AnyRow[],
  index: number,
): number | null {
  const bar = bars[index];
  const volume = n(bar?.volume);
  if (volume === null || volume <= 0) return null;
  const { session, slot } = etParts(String(bar.bar_time));
  const comparable = bars
    .slice(0, index)
    .filter((candidate) => {
      const parts = etParts(String(candidate.bar_time));
      return parts.slot === slot && parts.session !== session;
    })
    .map((candidate) => n(candidate.volume))
    .filter((v): v is number => v !== null && v > 0);
  const baseline = median(comparable);
  return baseline && baseline > 0 ? volume / baseline : null;
}

function deriveCycle(
  symbol: string,
  bars30: AnyRow[],
  bars5: AnyRow[],
  daily: AnyRow[],
) {
  const ordered = [...bars30]
    .filter((bar) =>
      n(bar.open) !== null &&
      n(bar.high) !== null &&
      n(bar.low) !== null &&
      n(bar.close) !== null
    )
    .sort((a, b) => String(a.bar_time).localeCompare(String(b.bar_time)));

  const sessionKeys = [...new Set(ordered.map((bar) => etParts(String(bar.bar_time)).session))].slice(-5);
  const bars = ordered.filter((bar) => sessionKeys.includes(etParts(String(bar.bar_time)).session));
  const latest = bars.at(-1);
  const price = latest ? n(latest.close) : null;

  const dailyOrdered = [...daily].sort((a, b) => String(a.bar_time).localeCompare(String(b.bar_time)));
  const range5 = rangePosition(price, dailyOrdered.slice(-5));
  const range20 = rangePosition(price, dailyOrdered.slice(-20));

  const ranges = bars
    .map((bar) => {
      const high = n(bar.high); const low = n(bar.low);
      return high !== null && low !== null ? high - low : null;
    })
    .filter((v): v is number => v !== null && v > 0);
  const medianRange = median(ranges) ?? 0;

  const empty = {
    symbol,
    timeframe: '30m',
    cycle_state: 'unconfirmed',
    direction: 'neutral' as Direction,
    event_type: 'unconfirmed',
    reversal_origin: null,
    confirmation_price: null,
    confirmation_at: null,
    retest_price: null,
    retest_at: null,
    retest_status: 'not_observed',
    cycle_invalidation: null,
    volume_confirmation_ratio: null,
    range_position_5d: range5,
    range_position_20d: range20,
    move_extension: null,
    bars_since_confirmation: null,
    confidence_score: 0,
    reason: 'Recent intraday price action has not produced a sufficiently substantiated reversal or breakout.',
    source_bar_time: latest?.bar_time ?? null,
    source_retrieved_at: latest?.retrieved_at ?? null,
    computed_at: new Date().toISOString(),
    details: {
      sessions_considered: sessionKeys.length,
      bars_30m: bars.length,
      bars_5m: bars5.length,
      median_30m_range: medianRange || null,
    },
  };

  if (bars.length < 12 || !(medianRange > 0) || price === null) return empty;

  type Candidate = {
    direction: Exclude<Direction, 'neutral'>;
    event: 'reversal' | 'breakout';
    origin: number;
    confirmation: number;
    confirmationAt: string;
    confirmationIndex: number;
    invalidation: number;
    volumeRatio: number | null;
    rejectionStrength: number;
    score: number;
    reason: string;
  };
  const candidates: Candidate[] = [];

  for (let i = 1; i < bars.length - 2; i += 1) {
    const prev = bars[i - 1];
    const bar = bars[i];
    const next = bars[i + 1];
    const high = Number(bar.high);
    const low = Number(bar.low);
    const close = Number(bar.close);
    const range = Math.max(high - low, medianRange * 0.35);

    const localHigh = Math.max(...bars.slice(Math.max(0, i - 3), i + 1).map((x) => Number(x.high)));
    const localLow = Math.min(...bars.slice(Math.max(0, i - 3), i + 1).map((x) => Number(x.low)));

    const bullishPivot = low <= Number(prev.low) && low <= Number(next.low);
    if (bullishPivot) {
      const rejection = (close - low) / range;
      const confirmIndex = bars.findIndex((candidate, j) =>
        j > i &&
        (Number(candidate.close) >= localHigh - medianRange * 0.10 ||
         Number(candidate.close) >= close + medianRange * 0.45)
      );
      if (confirmIndex > i) {
        const confirmation = Number(bars[confirmIndex].close);
        const volumeRatio = normalizedVolumeAt(bars, confirmIndex);
        const later = bars.slice(confirmIndex + 1);
        const held = later.length === 0 || Math.min(...later.map((x) => Number(x.low))) >= low - medianRange * 0.15;
        const followThrough = later.length === 0 || Math.max(...later.map((x) => Number(x.close))) >= confirmation + medianRange * 0.15;
        if (rejection >= 0.42 && held && followThrough && (volumeRatio === null || volumeRatio >= 0.85)) {
          candidates.push({
            direction: 'bullish',
            event: 'reversal',
            origin: low,
            confirmation,
            confirmationAt: String(bars[confirmIndex].bar_time),
            confirmationIndex: confirmIndex,
            invalidation: low - medianRange * 0.15,
            volumeRatio,
            rejectionStrength: rejection,
            score: confirmIndex * 0.10 + rejection * 2.2 + Math.min(2, volumeRatio ?? 1),
            reason: `Buyers rejected ${low.toFixed(2)}, price confirmed higher around ${confirmation.toFixed(2)}, and the move held after confirmation.`,
          });
        }
      }
    }

    const bearishPivot = high >= Number(prev.high) && high >= Number(next.high);
    if (bearishPivot) {
      const rejection = (high - close) / range;
      const confirmIndex = bars.findIndex((candidate, j) =>
        j > i &&
        (Number(candidate.close) <= localLow + medianRange * 0.10 ||
         Number(candidate.close) <= close - medianRange * 0.45)
      );
      if (confirmIndex > i) {
        const confirmation = Number(bars[confirmIndex].close);
        const volumeRatio = normalizedVolumeAt(bars, confirmIndex);
        const later = bars.slice(confirmIndex + 1);
        const held = later.length === 0 || Math.max(...later.map((x) => Number(x.high))) <= high + medianRange * 0.15;
        const followThrough = later.length === 0 || Math.min(...later.map((x) => Number(x.close))) <= confirmation - medianRange * 0.15;
        if (rejection >= 0.42 && held && followThrough && (volumeRatio === null || volumeRatio >= 0.85)) {
          candidates.push({
            direction: 'bearish',
            event: 'reversal',
            origin: high,
            confirmation,
            confirmationAt: String(bars[confirmIndex].bar_time),
            confirmationIndex: confirmIndex,
            invalidation: high + medianRange * 0.15,
            volumeRatio,
            rejectionStrength: rejection,
            score: confirmIndex * 0.10 + rejection * 2.2 + Math.min(2, volumeRatio ?? 1),
            reason: `Sellers rejected ${high.toFixed(2)}, price confirmed lower around ${confirmation.toFixed(2)}, and the move held after confirmation.`,
          });
        }
      }
    }
  }

  const recentBreakoutWindow = bars.slice(-14);
  if (recentBreakoutWindow.length >= 8) {
    const lastIndex = bars.length - 1;
    const prior = recentBreakoutWindow.slice(0, -1);
    const priorHigh = Math.max(...prior.map((bar) => Number(bar.high)));
    const priorLow = Math.min(...prior.map((bar) => Number(bar.low)));
    const latestClose = Number(latest.close);
    const volumeRatio = normalizedVolumeAt(bars, lastIndex);

    if (latestClose > priorHigh && (volumeRatio === null || volumeRatio >= 0.95)) {
      candidates.push({
        direction: 'bullish',
        event: 'breakout',
        origin: priorHigh,
        confirmation: latestClose,
        confirmationAt: String(latest.bar_time),
        confirmationIndex: lastIndex,
        invalidation: priorHigh - medianRange * 0.20,
        volumeRatio,
        rejectionStrength: 1,
        score: lastIndex * 0.10 + 4 + Math.min(2, volumeRatio ?? 1),
        reason: `Price cleared the recent ${priorHigh.toFixed(2)} barrier and held a close above it.`,
      });
    }
    if (latestClose < priorLow && (volumeRatio === null || volumeRatio >= 0.95)) {
      candidates.push({
        direction: 'bearish',
        event: 'breakout',
        origin: priorLow,
        confirmation: latestClose,
        confirmationAt: String(latest.bar_time),
        confirmationIndex: lastIndex,
        invalidation: priorLow + medianRange * 0.20,
        volumeRatio,
        rejectionStrength: 1,
        score: lastIndex * 0.10 + 4 + Math.min(2, volumeRatio ?? 1),
        reason: `Price broke the recent ${priorLow.toFixed(2)} floor and held a close below it.`,
      });
    }
  }

  candidates.sort((a, b) => b.confirmationIndex - a.confirmationIndex || b.score - a.score);
  const best = candidates[0];
  if (!best) return empty;

  const afterConfirmation = bars.slice(best.confirmationIndex + 1);
  const tolerance = medianRange * 0.28;
  const retestIndex = afterConfirmation.findIndex((bar) => {
    const low = Number(bar.low);
    const high = Number(bar.high);
    return low <= best.confirmation + tolerance && high >= best.confirmation - tolerance;
  });

  let retestStatus: 'held' | 'failed' | 'pending' | 'not_observed' = 'pending';
  let retestPrice: number | null = null;
  let retestAt: string | null = null;
  if (retestIndex >= 0) {
    const absoluteIndex = best.confirmationIndex + 1 + retestIndex;
    const retestBar = bars[absoluteIndex];
    retestPrice = n(retestBar.close);
    retestAt = String(retestBar.bar_time);
    const later = bars.slice(absoluteIndex + 1);
    if (best.direction === 'bullish') {
      const failed = Number(retestBar.close) < best.confirmation - tolerance ||
        later.some((bar) => Number(bar.low) < best.invalidation);
      const recovered = Number(retestBar.close) >= best.confirmation - tolerance * 0.35 &&
        (later.length === 0 || Math.max(...later.map((bar) => Number(bar.close))) > best.confirmation + medianRange * 0.10);
      retestStatus = failed ? 'failed' : recovered ? 'held' : 'pending';
    } else {
      const failed = Number(retestBar.close) > best.confirmation + tolerance ||
        later.some((bar) => Number(bar.high) > best.invalidation);
      const recovered = Number(retestBar.close) <= best.confirmation + tolerance * 0.35 &&
        (later.length === 0 || Math.min(...later.map((bar) => Number(bar.close))) < best.confirmation - medianRange * 0.10);
      retestStatus = failed ? 'failed' : recovered ? 'held' : 'pending';
    }
  }

  const barsSinceConfirmation = bars.length - 1 - best.confirmationIndex;
  const extension = best.direction === 'bullish'
    ? (price - best.confirmation) / medianRange
    : (best.confirmation - price) / medianRange;

  const cycleState = retestStatus === 'failed'
    ? 'retest_failed'
    : retestStatus === 'held'
      ? 'continuation_confirmed'
      : best.event === 'breakout'
        ? 'breakout_confirmed'
        : 'reversal_confirmed';

  const recencyScore = Math.max(0, 1 - barsSinceConfirmation / Math.max(8, bars.length));
  const volumeScore = best.volumeRatio === null ? 0.55 : Math.max(0, Math.min(1, best.volumeRatio / 1.5));
  const retestScore = retestStatus === 'held' ? 1 : retestStatus === 'failed' ? 0 : 0.55;
  const confidence = Math.round(Math.max(0, Math.min(100,
    35 +
    Math.min(25, best.rejectionStrength * 20) +
    volumeScore * 18 +
    retestScore * 14 +
    recencyScore * 8
  )));

  const reason =
    `${best.reason} ` +
    (best.volumeRatio !== null
      ? `Confirmation volume was ${best.volumeRatio.toFixed(2)}x normal for that time of day. `
      : 'Time-of-day volume normalization was unavailable for this confirmation bar. ') +
    (retestStatus === 'held'
      ? 'The confirmation area was retested and held.'
      : retestStatus === 'failed'
        ? 'The confirmation area was retested and failed.'
        : 'A decisive retest has not completed yet.');

  return {
    symbol,
    timeframe: '30m',
    cycle_state: cycleState,
    direction: best.direction,
    event_type: best.event,
    reversal_origin: best.origin,
    confirmation_price: best.confirmation,
    confirmation_at: best.confirmationAt,
    retest_price: retestPrice,
    retest_at: retestAt,
    retest_status: retestStatus,
    cycle_invalidation: best.invalidation,
    volume_confirmation_ratio: best.volumeRatio,
    range_position_5d: range5,
    range_position_20d: range20,
    move_extension: extension,
    bars_since_confirmation: barsSinceConfirmation,
    confidence_score: confidence,
    reason,
    source_bar_time: latest?.bar_time ?? null,
    source_retrieved_at: latest?.retrieved_at ?? null,
    computed_at: new Date().toISOString(),
    details: {
      sessions_considered: sessionKeys.length,
      bars_30m: bars.length,
      bars_5m: bars5.length,
      median_30m_range: medianRange,
      confirmation_rejection_strength: best.rejectionStrength,
      normalized_volume_method: 'same 30-minute ET slot across prior sessions',
      entry_semantics: best.direction === 'bullish'
        ? 'lowest confirmed bullish participation area'
        : 'highest confirmed bearish participation area',
    },
  };
}

function fingerprint(row: AnyRow | null | undefined) {
  if (!row) return '';
  return [
    row.cycle_state,
    row.direction,
    row.event_type,
    row.reversal_origin,
    row.confirmation_price,
    row.retest_status,
    row.retest_price,
    row.cycle_invalidation,
  ].join('|');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    let symbols = Array.isArray(body.symbols)
      ? [...new Set(body.symbols.map((value: unknown) => String(value).trim().toUpperCase()).filter(Boolean))]
      : [];

    if (!symbols.length) {
      const { data, error } = await db.from('tickers').select('symbol').order('priority', { ascending: true }).limit(30);
      if (error) throw error;
      symbols = (data ?? []).map((row: AnyRow) => String(row.symbol).toUpperCase()).filter(Boolean);
    }

    const results: AnyRow[] = [];
    for (const symbol of symbols) {
      const [{ data: bars30, error: e30 }, { data: bars5, error: e5 }, { data: daily, error: ed }, { data: prior }] = await Promise.all([
        db.from('ohlcv_bars')
          .select('bar_time,open,high,low,close,volume,retrieved_at')
          .eq('symbol', symbol).eq('timeframe', '30m')
          .order('bar_time', { ascending: false }).limit(500),
        db.from('ohlcv_bars')
          .select('bar_time,open,high,low,close,volume,retrieved_at')
          .eq('symbol', symbol).eq('timeframe', '5m')
          .order('bar_time', { ascending: false }).limit(600),
        db.from('ohlcv_bars')
          .select('bar_time,open,high,low,close,volume,retrieved_at')
          .eq('symbol', symbol).eq('timeframe', '1d')
          .order('bar_time', { ascending: false }).limit(30),
        db.from('market_cycle_states').select('*').eq('symbol', symbol).maybeSingle(),
      ]);
      if (e30) throw e30;
      if (e5) throw e5;
      if (ed) throw ed;

      const state = deriveCycle(
        symbol,
        [...(bars30 ?? [])].reverse(),
        [...(bars5 ?? [])].reverse(),
        [...(daily ?? [])].reverse(),
      );

      const changed = fingerprint(prior) !== fingerprint(state);

      const { error: upsertError } = await db
        .from('market_cycle_states')
        .upsert(state, { onConflict: 'symbol' });
      if (upsertError) throw upsertError;

      if (changed) {
        const { error: historyError } = await db
          .from('market_cycle_state_history')
          .insert(state);
        if (historyError) throw historyError;
      }

      results.push({
        symbol,
        changed,
        cycle_state: state.cycle_state,
        direction: state.direction,
        event_type: state.event_type,
        confirmation_price: state.confirmation_price,
        retest_status: state.retest_status,
        confidence_score: state.confidence_score,
      });
    }

    return json({
      success: true,
      symbols: results.length,
      changed: results.filter((row) => row.changed).length,
      states: results,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
