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

function massiveKey() {
  const key = Deno.env.get('MASSIVE_API_KEY')?.trim();
  if (!key) throw new Error('MASSIVE_API_KEY is not configured.');
  return key;
}

async function massiveAggs(symbol: string, from: string, to: string) {
  const url = new URL(`https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/5/minute/${from}/${to}`);
  url.searchParams.set('adjusted', 'true');
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('limit', '50000');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${massiveKey()}`, Accept: 'application/json' },
  });
  const raw = await response.text();
  let body: any = raw;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`Historical market data returned HTTP ${response.status}.`);
  return (Array.isArray(body?.results) ? body.results : []).map((bar: any) => ({
    bar_time: new Date(Number(bar.t)).toISOString(),
    open: Number(bar.o),
    high: Number(bar.h),
    low: Number(bar.l),
    close: Number(bar.c),
    volume: Number(bar.v ?? 0),
  }));
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function etParts(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    session: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function regular(bar: AnyRow) {
  const p = etParts(String(bar.bar_time));
  const mins = p.hour * 60 + p.minute;
  return mins >= 570 && mins < 960;
}

function aggregate30(bars5: AnyRow[]) {
  const groups = new Map<string, AnyRow[]>();
  for (const bar of bars5.filter(regular)) {
    const p = etParts(String(bar.bar_time));
    const mins = p.hour * 60 + p.minute;
    const slot = Math.floor((mins - 570) / 30);
    const key = `${p.session}|${slot}`;
    groups.set(key, [...(groups.get(key) ?? []), bar]);
  }
  return [...groups.values()].map((rows) => ({
    bar_time: rows[0].bar_time,
    session: etParts(String(rows[0].bar_time)).session,
    slot: Math.floor(((etParts(String(rows[0].bar_time)).hour * 60 + etParts(String(rows[0].bar_time)).minute) - 570) / 30),
    open: Number(rows[0].open),
    high: Math.max(...rows.map((r) => Number(r.high))),
    low: Math.min(...rows.map((r) => Number(r.low))),
    close: Number(rows.at(-1)!.close),
    volume: rows.reduce((sum, r) => sum + Number(r.volume ?? 0), 0),
  })).sort((a, b) => String(a.bar_time).localeCompare(String(b.bar_time)));
}

function nearestPrice(bars: AnyRow[], iso: string | null | undefined) {
  if (!iso || !bars.length) return null;
  const target = new Date(iso).getTime();
  let best = bars[0];
  let distance = Math.abs(new Date(best.bar_time).getTime() - target);
  for (const bar of bars.slice(1)) {
    const d = Math.abs(new Date(bar.bar_time).getTime() - target);
    if (d < distance) { best = bar; distance = d; }
  }
  return n(best.close);
}

function normalizedVolumeAt(bars: AnyRow[], index: number): number | null {
  const bar = bars[index];
  const volume = n(bar?.volume);
  if (volume === null || volume <= 0) return null;
  const comparable = bars
    .slice(0, index)
    .filter((candidate) => candidate.slot === bar.slot && candidate.session !== bar.session)
    .map((candidate) => n(candidate.volume))
    .filter((v): v is number => v !== null && v > 0);
  const base = median(comparable);
  return base && base > 0 ? volume / base : null;
}

function rangePosition(price: number, sessionBars: AnyRow[], count: number) {
  const sessions = [...new Set(sessionBars.map((b) => b.session))].slice(-count);
  const rows = sessionBars.filter((b) => sessions.includes(b.session));
  if (!rows.length) return null;
  const hi = Math.max(...rows.map((b) => Number(b.high)));
  const lo = Math.min(...rows.map((b) => Number(b.low)));
  return hi > lo ? Math.max(0, Math.min(1, (price - lo) / (hi - lo))) : null;
}

function decorate5(bars5: AnyRow[]) {
  return bars5.map((bar) => {
    const p = etParts(String(bar.bar_time));
    const mins = p.hour * 60 + p.minute;
    return {
      ...bar,
      session: p.session,
      slot: Math.max(0, Math.floor((mins - 570) / 5)),
    };
  });
}

function detectUnconfirmedSessionRetest(bars: AnyRow[], tradeDirection: string) {
  if (!['bullish', 'bearish'].includes(tradeDirection) || bars.length < 4) return null;
  const medianRange = median(bars.map((b) => Number(b.high) - Number(b.low)).filter((v) => v > 0)) ?? 0;
  if (!(medianRange > 0)) return null;
  const tolerance = medianRange * 0.28;

  for (let i = bars.length - 1; i >= 3; i--) {
    const bar = bars[i];
    const prior = bars.slice(Math.max(0, i - 6), i);
    if (tradeDirection === 'bullish') {
      const level = Math.min(...prior.map((b) => Number(b.low)));
      const touched = Number(bar.low) <= level + tolerance;
      const held = Number(bar.close) >= level + tolerance * 0.15;
      const rejected = Number(bar.close) - Number(bar.low) >= medianRange * 0.25;
      if (touched && held && rejected) return { at: String(bar.bar_time), price: Number(bar.close), level };
    } else {
      const level = Math.max(...prior.map((b) => Number(b.high)));
      const touched = Number(bar.high) >= level - tolerance;
      const held = Number(bar.close) <= level - tolerance * 0.15;
      const rejected = Number(bar.high) - Number(bar.close) >= medianRange * 0.25;
      if (touched && held && rejected) return { at: String(bar.bar_time), price: Number(bar.close), level };
    }
  }
  return null;
}

function deriveCycle(bars30: AnyRow[], minBars = 10, maxSessions = 5) {
  const empty = {
    confirmed: false, direction: 'neutral' as Direction, event: 'unconfirmed',
    origin: null as number | null, confirmation: null as number | null,
    confirmationAt: null as string | null, invalidation: null as number | null,
    volumeRatio: null as number | null, retest: 'not_observed',
    confidence: 0, reason: 'No substantiated directional cycle was confirmed before entry.',
  };
  if (bars30.length < minBars) return empty;

  const sessions = [...new Set(bars30.map((b) => b.session))].slice(-maxSessions);
  const bars = bars30.filter((b) => sessions.includes(b.session));
  const medianRange = median(bars.map((b) => Number(b.high) - Number(b.low)).filter((v) => v > 0)) ?? 0;
  if (!(medianRange > 0)) return empty;

  type Candidate = {
    direction: 'bullish' | 'bearish'; event: 'reversal' | 'breakout';
    origin: number; confirmation: number; confirmationAt: string; confirmationIndex: number;
    invalidation: number; volumeRatio: number | null; rejection: number; score: number; reason: string;
  };
  const candidates: Candidate[] = [];

  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1], bar = bars[i], next = bars[i + 1];
    const high = Number(bar.high), low = Number(bar.low), close = Number(bar.close);
    const range = Math.max(high - low, medianRange * 0.35);
    const localHigh = Math.max(...bars.slice(Math.max(0, i - 3), i + 1).map((x) => Number(x.high)));
    const localLow = Math.min(...bars.slice(Math.max(0, i - 3), i + 1).map((x) => Number(x.low)));

    if (low <= Number(prev.low) && low <= Number(next.low)) {
      const rejection = (close - low) / range;
      const j = bars.findIndex((x, idx) => idx > i && (Number(x.close) >= localHigh - medianRange * 0.10 || Number(x.close) >= close + medianRange * 0.45));
      if (j > i) {
        const volumeRatio = normalizedVolumeAt(bars, j);
        const later = bars.slice(j + 1);
        const held = later.length === 0 || Math.min(...later.map((x) => Number(x.low))) >= low - medianRange * 0.15;
        const follow = later.length === 0 || Math.max(...later.map((x) => Number(x.close))) >= Number(bars[j].close) + medianRange * 0.15;
        if (rejection >= 0.42 && held && follow && (volumeRatio === null || volumeRatio >= 0.85)) {
          candidates.push({
            direction: 'bullish', event: 'reversal', origin: low, confirmation: Number(bars[j].close),
            confirmationAt: String(bars[j].bar_time), confirmationIndex: j,
            invalidation: low - medianRange * 0.15, volumeRatio, rejection,
            score: j * 0.12 + rejection * 2 + Math.min(2, volumeRatio ?? 1),
            reason: `Buyers rejected ${low.toFixed(2)} and confirmed a move higher around ${Number(bars[j].close).toFixed(2)}.`,
          });
        }
      }
    }

    if (high >= Number(prev.high) && high >= Number(next.high)) {
      const rejection = (high - close) / range;
      const j = bars.findIndex((x, idx) => idx > i && (Number(x.close) <= localLow + medianRange * 0.10 || Number(x.close) <= close - medianRange * 0.45));
      if (j > i) {
        const volumeRatio = normalizedVolumeAt(bars, j);
        const later = bars.slice(j + 1);
        const held = later.length === 0 || Math.max(...later.map((x) => Number(x.high))) <= high + medianRange * 0.15;
        const follow = later.length === 0 || Math.min(...later.map((x) => Number(x.close))) <= Number(bars[j].close) - medianRange * 0.15;
        if (rejection >= 0.42 && held && follow && (volumeRatio === null || volumeRatio >= 0.85)) {
          candidates.push({
            direction: 'bearish', event: 'reversal', origin: high, confirmation: Number(bars[j].close),
            confirmationAt: String(bars[j].bar_time), confirmationIndex: j,
            invalidation: high + medianRange * 0.15, volumeRatio, rejection,
            score: j * 0.12 + rejection * 2 + Math.min(2, volumeRatio ?? 1),
            reason: `Sellers rejected ${high.toFixed(2)} and confirmed a move lower around ${Number(bars[j].close).toFixed(2)}.`,
          });
        }
      }
    }
  }

  const last = bars.at(-1)!;
  const prior = bars.slice(Math.max(0, bars.length - 14), -1);
  if (prior.length >= 6) {
    const priorHigh = Math.max(...prior.map((b) => Number(b.high)));
    const priorLow = Math.min(...prior.map((b) => Number(b.low)));
    const volumeRatio = normalizedVolumeAt(bars, bars.length - 1);
    if (Number(last.close) > priorHigh && (volumeRatio === null || volumeRatio >= 0.95)) {
      candidates.push({
        direction: 'bullish', event: 'breakout', origin: priorHigh, confirmation: Number(last.close),
        confirmationAt: String(last.bar_time), confirmationIndex: bars.length - 1,
        invalidation: priorHigh - medianRange * 0.2, volumeRatio, rejection: 1,
        score: bars.length + 4 + Math.min(2, volumeRatio ?? 1),
        reason: `Price confirmed a breakout above ${priorHigh.toFixed(2)} before entry.`,
      });
    }
    if (Number(last.close) < priorLow && (volumeRatio === null || volumeRatio >= 0.95)) {
      candidates.push({
        direction: 'bearish', event: 'breakout', origin: priorLow, confirmation: Number(last.close),
        confirmationAt: String(last.bar_time), confirmationIndex: bars.length - 1,
        invalidation: priorLow + medianRange * 0.2, volumeRatio, rejection: 1,
        score: bars.length + 4 + Math.min(2, volumeRatio ?? 1),
        reason: `Price confirmed a breakdown below ${priorLow.toFixed(2)} before entry.`,
      });
    }
  }

  candidates.sort((a, b) => b.confirmationIndex - a.confirmationIndex || b.score - a.score);
  const best = candidates[0];
  if (!best) return empty;

  const after = bars.slice(best.confirmationIndex + 1);
  const tolerance = medianRange * 0.28;
  const retest = after.find((b) => Number(b.low) <= best.confirmation + tolerance && Number(b.high) >= best.confirmation - tolerance);
  let retestStatus = 'not_observed';
  if (retest) {
    retestStatus = best.direction === 'bullish'
      ? (Number(retest.close) >= best.confirmation - tolerance * 0.35 ? 'held' : 'failed')
      : (Number(retest.close) <= best.confirmation + tolerance * 0.35 ? 'held' : 'failed');
  }
  const confidence = Math.round(Math.max(0, Math.min(100,
    40 + Math.min(24, best.rejection * 18) + Math.min(22, (best.volumeRatio ?? 1) * 12) + (retestStatus === 'held' ? 14 : 5)
  )));

  return {
    confirmed: retestStatus !== 'failed',
    direction: retestStatus === 'failed' ? 'neutral' as Direction : best.direction,
    event: best.event,
    origin: best.origin,
    confirmation: best.confirmation,
    confirmationAt: best.confirmationAt,
    invalidation: best.invalidation,
    volumeRatio: best.volumeRatio,
    retest: retestStatus,
    confidence,
    reason: best.reason,
  };
}

function structuralLevels(bars30: AnyRow[], price: number, direction: Direction) {
  const sessions = [...new Set(bars30.map((b) => b.session))].slice(-5);
  const bars = bars30.filter((b) => sessions.includes(b.session));
  const pivotsLow: number[] = [], pivotsHigh: number[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    if (Number(bars[i].low) <= Number(bars[i - 1].low) && Number(bars[i].low) <= Number(bars[i + 1].low)) pivotsLow.push(Number(bars[i].low));
    if (Number(bars[i].high) >= Number(bars[i - 1].high) && Number(bars[i].high) >= Number(bars[i + 1].high)) pivotsHigh.push(Number(bars[i].high));
  }
  const support = [...pivotsLow].filter((v) => v < price).sort((a, b) => b - a)[0]
    ?? Math.min(...bars.map((b) => Number(b.low)));
  const resistance = [...pivotsHigh].filter((v) => v > price).sort((a, b) => a - b)[0]
    ?? Math.max(...bars.map((b) => Number(b.high)));
  const move = median(bars.map((b) => Math.abs(Number(b.close) - Number(b.open))).filter((v) => v > 0))
    ?? median(bars.map((b) => Number(b.high) - Number(b.low)).filter((v) => v > 0))
    ?? price * 0.01;
  const target = direction === 'bullish'
    ? (resistance > price ? resistance : price + move * 1.2)
    : direction === 'bearish'
      ? (support < price ? support : price - move * 1.2)
      : null;
  return { support, resistance, move, target };
}

function nearestOriginTime(bars: AnyRow[], origin: number | null, direction: Direction, beforeIso: string | null) {
  if (origin === null || direction === 'neutral') return null;
  const cutoff = beforeIso ? new Date(beforeIso).getTime() : Number.POSITIVE_INFINITY;
  let best: AnyRow | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const bar of bars) {
    if (new Date(bar.bar_time).getTime() > cutoff) continue;
    const probe = direction === 'bullish' ? Number(bar.low) : Number(bar.high);
    const distance = Math.abs(probe - origin);
    if (distance < bestDistance) {
      best = bar;
      bestDistance = distance;
    }
  }
  return best ? String(best.bar_time) : null;
}

function directionalDelta(from: number, to: number, direction: Direction) {
  return direction === 'bullish' ? to - from : direction === 'bearish' ? from - to : 0;
}

function firstWeakening(bars: AnyRow[], direction: Direction, moveUnit: number, invalidation: number | null) {
  if (direction === 'neutral' || bars.length < 5 || !(moveUnit > 0)) return null;
  let favorableExtreme = direction === 'bullish' ? -Infinity : Infinity;

  for (let i = 3; i < bars.length; i++) {
    const bar = bars[i];
    const close = Number(bar.close);
    if (direction === 'bullish') {
      favorableExtreme = Math.max(favorableExtreme, ...bars.slice(0, i + 1).map((b) => Number(b.high)));
      const priorFloor = Math.min(...bars.slice(i - 3, i).map((b) => Number(b.low)));
      const drawdown = favorableExtreme - close;
      const brokeShortStructure = close < priorFloor;
      const stillAboveHardInvalidation = invalidation === null || Number(bar.low) > invalidation;
      if (drawdown >= moveUnit * 0.75 && brokeShortStructure && stillAboveHardInvalidation) {
        return { at: String(bar.bar_time), price: close };
      }
    } else {
      favorableExtreme = Math.min(favorableExtreme, ...bars.slice(0, i + 1).map((b) => Number(b.low)));
      const priorCeiling = Math.max(...bars.slice(i - 3, i).map((b) => Number(b.high)));
      const rebound = close - favorableExtreme;
      const brokeShortStructure = close > priorCeiling;
      const stillBelowHardInvalidation = invalidation === null || Number(bar.high) < invalidation;
      if (rebound >= moveUnit * 0.75 && brokeShortStructure && stillBelowHardInvalidation) {
        return { at: String(bar.bar_time), price: close };
      }
    }
  }
  return null;
}

function firstCross(bars: AnyRow[], level: number | null, direction: Direction, kind: 'target' | 'invalidation') {
  if (level === null || direction === 'neutral') return null;
  for (const bar of bars) {
    const hit = kind === 'target'
      ? direction === 'bullish' ? Number(bar.high) >= level : Number(bar.low) <= level
      : direction === 'bullish' ? Number(bar.low) <= level : Number(bar.high) >= level;
    if (hit) return String(bar.bar_time);
  }
  return null;
}

function reviewEpisode(episode: AnyRow, symbolBars: AnyRow[]) {
  const entryAt = String(episode.opened_at);
  const exitAt = episode.closed_at ? String(episode.closed_at) : null;
  const entryMs = new Date(entryAt).getTime();
  const exitMs = exitAt ? new Date(exitAt).getTime() : entryMs + 86400000;

  const regularBars = symbolBars.filter(regular);
  const beforeEntry5 = regularBars.filter((b) => new Date(b.bar_time).getTime() <= entryMs);
  const broadBars30 = aggregate30(beforeEntry5);
  const entryUnderlying = nearestPrice(regularBars, entryAt);
  const exitUnderlying = nearestPrice(regularBars, exitAt);
  if (entryUnderlying === null) throw new Error(`No underlying market price found near ${episode.symbol} entry.`);

  const entrySession = etParts(entryAt).session;
  const exitSession = exitAt ? etParts(exitAt).session : entrySession;
  const sameSessionTrade = entrySession === exitSession;
  const tradeDirection = String(episode.direction ?? '').toLowerCase();

  const heldSessionCount = Math.max(
    1,
    new Set(
      regularBars
        .filter((bar) => {
          const t = new Date(bar.bar_time).getTime();
          return t >= entryMs && t <= exitMs;
        })
        .map((bar) => etParts(String(bar.bar_time)).session),
    ).size,
  );

  let analysisBars: AnyRow[];
  let analysisSessions: string[];
  let cycleMinBars: number;
  let cycleMaxSessions: number;

  if (sameSessionTrade) {
    // Intraday reviews must stand on evidence from the actual trade session.
    // Do not borrow a confirmation from yesterday merely to satisfy the cycle detector.
    analysisBars = decorate5(
      beforeEntry5.filter((bar) => etParts(String(bar.bar_time)).session === entrySession),
    );
    analysisSessions = [entrySession];
    cycleMinBars = 3;
    cycleMaxSessions = 1;
  } else {
    // Multi-day reviews can use a wider pre-entry frame proportional to the actual
    // holding span, while remaining capped so old market regimes do not leak in.
    const lookbackSessions = Math.min(5, Math.max(2, heldSessionCount));
    const availableSessions = [...new Set(broadBars30.map((bar) => bar.session))];
    analysisSessions = availableSessions.slice(-lookbackSessions);
    analysisBars = broadBars30.filter((bar) => analysisSessions.includes(bar.session));
    cycleMinBars = 6;
    cycleMaxSessions = lookbackSessions;
  }

  const broadCycle = deriveCycle(broadBars30, 8, 5);
  const sessionCycle = deriveCycle(analysisBars, cycleMinBars, cycleMaxSessions);

  const broadDirection = broadCycle.confirmed ? broadCycle.direction : 'neutral';
  const sessionDirection = sessionCycle.confirmed ? sessionCycle.direction : 'neutral';

  // A fresh session confirmation takes precedence because it reflects evidence closest
  // to the actual trade. Otherwise carry the broader confirmed thesis forward as context.
  const cycle = sessionCycle.confirmed ? sessionCycle : broadCycle;
  const direction = sessionCycle.confirmed
    ? sessionDirection
    : broadCycle.confirmed
      ? broadDirection
      : 'neutral';

  let sessionState = 'unconfirmed';
  if (sessionCycle.confirmed) {
    sessionState = broadCycle.confirmed && broadDirection !== sessionDirection
      ? 'session_flip'
      : broadCycle.confirmed
        ? 'session_reconfirmed'
        : 'session_confirmed';
  } else if (broadCycle.confirmed) {
    sessionState = 'existing_thesis';
  }

  const levels = structuralLevels(
    analysisBars.length ? analysisBars : broadBars30,
    entryUnderlying,
    direction,
  );

  // Hard invalidation protects the prevailing thesis. Prefer the active session cycle
  // threshold when a fresh confirmation exists; otherwise use broader context structure.
  let invalidation = sessionCycle.confirmed ? sessionCycle.invalidation : broadCycle.invalidation;
  if (direction === 'bullish' && (invalidation === null || invalidation >= entryUnderlying)) invalidation = levels.support < entryUnderlying ? levels.support : entryUnderlying - levels.move * 0.8;
  if (direction === 'bearish' && (invalidation === null || invalidation <= entryUnderlying)) invalidation = levels.resistance > entryUnderlying ? levels.resistance : entryUnderlying + levels.move * 0.8;

  const target = direction === 'neutral' ? null : levels.target;
  const holdingBars = regularBars.filter((b) => {
    const t = new Date(b.bar_time).getTime();
    return t >= entryMs && t <= exitMs;
  });

  const targetHitAt = firstCross(holdingBars, target, direction, 'target');
  const invalidationAt = firstCross(holdingBars, invalidation, direction, 'invalidation');
  const weakening = firstWeakening(holdingBars, direction, levels.move, invalidation);
  const agreement = direction === 'neutral' ? 'no_confirmed_thesis'
    : tradeDirection === direction ? 'aligned'
      : 'opposed';

  const confirmationDistance = sessionConfirmationPrice !== null ? Math.abs(entryUnderlying - sessionConfirmationPrice) : null;
  const extensionUnits = confirmationDistance !== null && levels.move > 0 ? confirmationDistance / levels.move : null;

  let entryRelationship = 'no_confirmed_thesis';
  if (agreement === 'opposed') entryRelationship = 'against_confirmed_thesis';
  else if (agreement === 'aligned' && sessionConfirmationPrice !== null) {
    const betterRetest = direction === 'bullish'
      ? entryUnderlying < sessionConfirmationPrice && entryUnderlying > Number(invalidation)
      : entryUnderlying > sessionConfirmationPrice && entryUnderlying < Number(invalidation);
    entryRelationship = betterRetest ? 'confirmed_retest'
      : (extensionUnits ?? 0) > 1.5 ? 'chased_extension'
        : 'confirmed_direction';
  } else if (agreement === 'aligned' && sessionState === 'existing_thesis') {
    entryRelationship = unconfirmedRetest ? 'existing_thesis_retest' : 'existing_thesis_continuation';
  }

  let exitRelationship = 'thesis_unconfirmed';
  if (direction !== 'neutral' && exitAt) {
    if (invalidationAt && new Date(invalidationAt).getTime() <= exitMs) exitRelationship = 'exited_after_invalidation';
    else if (targetHitAt && new Date(targetHitAt).getTime() <= exitMs) exitRelationship = 'exited_after_target';
    else exitRelationship = 'exited_with_thesis_intact';
  }

  let mfe: number | null = null, mae: number | null = null;
  if (holdingBars.length && direction !== 'neutral') {
    if (direction === 'bullish') {
      mfe = ((Math.max(...holdingBars.map((b) => Number(b.high))) - entryUnderlying) / entryUnderlying) * 100;
      mae = ((Math.min(...holdingBars.map((b) => Number(b.low))) - entryUnderlying) / entryUnderlying) * 100;
    } else {
      mfe = ((entryUnderlying - Math.min(...holdingBars.map((b) => Number(b.low))) / 1) / entryUnderlying) * 100;
      mae = ((entryUnderlying - Math.max(...holdingBars.map((b) => Number(b.high))) / 1) / entryUnderlying) * 100;
    }
  }

  const invalidationMs = invalidationAt ? new Date(invalidationAt).getTime() : null;
  const postInvalidationMinutes = invalidationMs !== null && exitAt
    ? Math.max(0, Math.round((exitMs - invalidationMs) / 60000))
    : null;

  const range5 = rangePosition(entryUnderlying, broadBars30, 5);
  const range20 = rangePosition(entryUnderlying, broadBars30, 20);

  const sessionConfirmationAt = sessionCycle.confirmed ? sessionCycle.confirmationAt : null;
  const sessionConfirmationPrice = sessionCycle.confirmed ? sessionCycle.confirmation : null;
  const confirmationAtMs = sessionConfirmationAt ? new Date(sessionConfirmationAt).getTime() : null;
  const confirmationToEntryMinutes = confirmationAtMs !== null
    ? Math.max(0, Math.round((entryMs - confirmationAtMs) / 60000))
    : null;
  const confirmationToEntryPct = sessionConfirmationPrice !== null && sessionConfirmationPrice !== 0
    ? Math.abs((entryUnderlying - sessionConfirmationPrice) / sessionConfirmationPrice) * 100
    : null;

  const moveDenominator = direction !== 'neutral' && sessionConfirmationPrice !== null && target !== null
    ? directionalDelta(sessionConfirmationPrice, target, direction)
    : 0;
  const moveNumerator = direction !== 'neutral' && sessionConfirmationPrice !== null
    ? directionalDelta(sessionConfirmationPrice, entryUnderlying, direction)
    : 0;
  const moveConsumedPct = moveDenominator > 0 ? (moveNumerator / moveDenominator) * 100 : null;
  const remainingRoomPct = direction !== 'neutral' && target !== null && entryUnderlying > 0
    ? (directionalDelta(entryUnderlying, target, direction) / entryUnderlying) * 100
    : null;

  const postConfirmationBars = sessionConfirmationAt
    ? beforeEntry5.filter((bar) => {
        const t = new Date(bar.bar_time).getTime();
        return t >= new Date(sessionConfirmationAt).getTime() && t <= entryMs;
      })
    : [];

  const retestTolerance = Math.max(levels.move * 0.18, entryUnderlying * 0.0015);
  const confirmedRetestBar = sessionConfirmationPrice !== null
    ? postConfirmationBars.find((bar) => {
        const low = Number(bar.low), high = Number(bar.high), close = Number(bar.close);
        const touched = low <= sessionConfirmationPrice + retestTolerance && high >= sessionConfirmationPrice - retestTolerance;
        const held = direction === 'bullish'
          ? close >= sessionConfirmationPrice - retestTolerance * 0.35
          : direction === 'bearish'
            ? close <= sessionConfirmationPrice + retestTolerance * 0.35
            : false;
        return touched && held;
      }) ?? null
    : null;
  const unconfirmedRetest = !sessionCycle.confirmed && sameSessionTrade
    ? detectUnconfirmedSessionRetest(analysisBars, tradeDirection || broadDirection)
    : null;
  const retestBar = confirmedRetestBar ?? (unconfirmedRetest
    ? { bar_time: unconfirmedRetest.at, close: unconfirmedRetest.price }
    : null);

  let preEntryGivebackPct: number | null = null;
  if (postConfirmationBars.length && sessionConfirmationPrice !== null && direction !== 'neutral') {
    if (direction === 'bullish') {
      const peak = Math.max(...postConfirmationBars.map((bar) => Number(bar.high)));
      const advance = peak - sessionConfirmationPrice;
      preEntryGivebackPct = advance > 0 ? Math.max(0, ((peak - entryUnderlying) / advance) * 100) : 0;
    } else {
      const trough = Math.min(...postConfirmationBars.map((bar) => Number(bar.low)));
      const advance = sessionConfirmationPrice - trough;
      preEntryGivebackPct = advance > 0 ? Math.max(0, ((entryUnderlying - trough) / advance) * 100) : 0;
    }
  }

  const lastDirectionalProgress = postConfirmationBars.length >= 4
    ? directionalDelta(
        Number(postConfirmationBars[Math.max(0, postConfirmationBars.length - 4)].close),
        Number(postConfirmationBars.at(-1)!.close),
        direction,
      )
    : 0;

  let momentumStateAtEntry = sessionState === 'existing_thesis' && direction !== 'neutral' ? 'context_active' : 'unconfirmed';
  if (direction !== 'neutral' && sessionState !== 'existing_thesis') {
    if ((moveConsumedPct ?? 0) >= 65 || (extensionUnits ?? 0) >= 1.25) momentumStateAtEntry = 'extended';
    else if ((preEntryGivebackPct ?? 0) >= 25) momentumStateAtEntry = 'weakening';
    else if (lastDirectionalProgress > levels.move * 0.25) momentumStateAtEntry = 'strengthening';
    else momentumStateAtEntry = 'stable';
  }

  let entryQualityLabel = 'unconfirmed';
  if (agreement === 'opposed') entryQualityLabel = 'thesis_opposed';
  else if (direction !== 'neutral' && sessionState === 'existing_thesis' && unconfirmedRetest) entryQualityLabel = 'existing_thesis_retest';
  else if (direction !== 'neutral' && sessionState === 'existing_thesis') entryQualityLabel = 'existing_thesis_continuation';
  else if (direction !== 'neutral' && confirmedRetestBar) entryQualityLabel = 'confirmed_retest';
  else if (direction !== 'neutral' && momentumStateAtEntry === 'weakening') entryQualityLabel = 'late_weakening';
  else if (direction !== 'neutral' && ((moveConsumedPct ?? 0) >= 80 || (extensionUnits ?? 0) >= 1.5)) entryQualityLabel = 'late_extended';
  else if (direction !== 'neutral' && (moveConsumedPct ?? 0) >= 60) entryQualityLabel = 'late_confirmed_move';
  else if (direction !== 'neutral') entryQualityLabel = 'confirmed_location';

  let entryQualityScore: number | null = direction === 'neutral' ? null : 100;
  if (entryQualityScore !== null) {
    if (agreement === 'opposed') entryQualityScore = 10;
    else {
      entryQualityScore -= Math.min(45, Math.max(0, ((moveConsumedPct ?? 0) - 35) * 0.8));
      entryQualityScore -= Math.min(20, Math.max(0, (preEntryGivebackPct ?? 0) - 10) * 0.5);
      if (confirmedRetestBar) entryQualityScore += 8;
      if (remainingRoomPct !== null && remainingRoomPct <= 0) entryQualityScore -= 25;
      entryQualityScore = Math.max(0, Math.min(100, Math.round(entryQualityScore)));
    }
  }

  const reversalAt = nearestOriginTime(beforeEntry5, cycle.origin, direction, sessionConfirmationPriceAt);
  const decisionTimeline = [
    reversalAt && cycle.origin !== null ? { kind: 'reversal_origin', at: reversalAt, price: cycle.origin } : null,
    sessionConfirmationPriceAt && sessionConfirmationPrice !== null ? { kind: 'confirmation', at: sessionConfirmationPriceAt, price: sessionConfirmationPrice } : null,
    retestBar ? { kind: unconfirmedRetest ? 'retest_hold_unconfirmed' : 'retest_hold', at: String(retestBar.bar_time), price: Number(retestBar.close) } : null,
    { kind: 'entry', at: entryAt, price: entryUnderlying },
    targetHitAt && target !== null ? { kind: 'target_reached', at: targetHitAt, price: target } : null,
    weakening ? { kind: 'weakening', at: weakening.at, price: weakening.price } : null,
    invalidationAt && invalidation !== null ? { kind: 'invalidation', at: invalidationAt, price: invalidation } : null,
    exitAt && exitUnderlying !== null ? { kind: 'exit', at: exitAt, price: exitUnderlying } : null,
  ].filter(Boolean);

  const guidanceSummary = direction === 'neutral'
    ? (unconfirmedRetest
        ? 'A local session level was tested and held before entry, but neither the broader context nor this trade window produced a substantiated directional thesis. URSORA treats this as an unconfirmed retest.'
        : 'No substantiated directional thesis was available in the broader context or this trade window, so URSORA cannot grade entry timing against confirmation.')
    : agreement === 'opposed'
      ? `The position opposed the active ${direction} thesis at entry. Review whether the session produced a directional flip or whether the user was trading against an already-established broader regime.`
      : sessionState === 'existing_thesis'
        ? (unconfirmedRetest
            ? `The broader ${direction} thesis was already established before this trade window. The session produced a local retest/hold but no fresh confirmation, so entry should be judged against the quality of that retest and remaining room—not against an old confirmation timestamp.`
            : `The broader ${direction} thesis was already established before this trade window and remained active at entry. No fresh session confirmation occurred before entry.`)
        : entryQualityLabel === 'confirmed_retest'
          ? `The session produced fresh ${direction} confirmation and the position entered on a held retest. Entry quality depends on how much of the newly confirmed move had already been consumed.`
          : entryQualityLabel === 'late_weakening'
            ? `The position waited beyond fresh session confirmation and entered after the move had begun weakening. A location closer to confirmation or the first held retest would have preserved more of the validated move.`
            : entryQualityLabel === 'late_extended' || entryQualityLabel === 'late_confirmed_move'
              ? `The direction was supported, but entry came ${confirmationToEntryMinutes ?? 'later'} minute${confirmationToEntryMinutes === 1 ? '' : 's'} after fresh session confirmation after about ${Math.round(moveConsumedPct ?? 0)}% of the confirmation-to-target move had already been consumed.`
              : `The entry occurred after fresh session confirmation while the move still retained meaningful room to its tactical target.`;

  const setup = direction === 'neutral'
    ? 'unconfirmed'
    : !sessionCycle.confirmed
      ? (unconfirmedRetest ? 'existing_thesis_retest' : 'existing_thesis_continuation')
      : sessionCycle.event === 'breakout'
        ? 'momentum_breakout'
        : sessionCycle.retest === 'held'
          ? 'reversal_retest'
          : 'confirmed_reversal';

  const summary = direction === 'neutral'
    ? (unconfirmedRetest
        ? `No confirmed thesis was active at entry. A local level was retested and held during the trade session, but the move did not independently satisfy confirmation criteria.`
        : `No sufficiently substantiated TradeCycle direction was active at entry.`)
    : agreement === 'aligned'
      ? sessionState === 'existing_thesis'
        ? `The ${tradeDirection} position aligned with an already-established ${direction} thesis. ${unconfirmedRetest ? 'The session showed a held retest without a fresh confirmation.' : 'No fresh session confirmation occurred before entry.'}`
        : `The ${tradeDirection} position aligned with a fresh ${direction} ${sessionCycle.event} during the trade window. ${entryRelationship === 'chased_extension' ? 'Entry occurred after the newly confirmed move was already extended.' : entryRelationship === 'confirmed_retest' ? 'Entry followed a valid session retest.' : 'Entry occurred near the fresh directional confirmation.'}`
      : `The position was ${tradeDirection || 'directional'}, while the active market thesis at entry was ${direction}.`;

  return {
    user_id: episode.user_id,
    brokerage_episode_id: episode.id,
    symbol: String(episode.symbol).toUpperCase(),
    entry_at: entryAt,
    exit_at: exitAt,
    retro_direction: direction,
    thesis_state: direction === 'neutral' ? 'unconfirmed' : 'supported',
    setup_class: setup,
    cycle_event_type: cycle.event,
    reversal_origin: cycle.origin,
    confirmation_price: sessionConfirmationPrice,
    confirmation_at: sessionConfirmationPriceAt,
    entry_underlying_price: entryUnderlying,
    exit_underlying_price: exitUnderlying,
    target_price: target,
    invalidation_price: invalidation,
    target_hit_at: targetHitAt,
    invalidation_at: invalidationAt,
    weakening_at: weakening?.at ?? null,
    weakening_price: weakening?.price ?? null,
    directional_agreement: agreement,
    entry_relationship: entryRelationship,
    exit_relationship: exitRelationship,
    range_position_5d: range5,
    range_position_20d: range20,
    volume_confirmation_ratio: cycle.volumeRatio,
    move_extension_at_entry: extensionUnits,
    confirmation_to_entry_minutes: confirmationToEntryMinutes,
    confirmation_to_entry_pct: confirmationToEntryPct,
    move_consumed_to_target_pct: moveConsumedPct,
    remaining_room_to_target_pct: remainingRoomPct,
    retest_before_entry: Boolean(retestBar),
    retest_at: retestBar ? String(retestBar.bar_time) : null,
    momentum_state_at_entry: momentumStateAtEntry,
    pre_entry_giveback_pct: preEntryGivebackPct,
    entry_quality_label: entryQualityLabel,
    entry_quality_score: entryQualityScore,
    guidance_summary: guidanceSummary,
    decision_timeline: decisionTimeline,
    mfe_underlying_pct: mfe,
    mae_underlying_pct: mae,
    post_invalidation_minutes: postInvalidationMinutes,
    confidence_score: sessionCycle.confirmed ? sessionCycle.confidence : broadCycle.confidence,
    review_summary: summary,
    evidence: {
      no_lookahead: true,
      decision_cutoff: entryAt,
      source_timeframe: sameSessionTrade
        ? '5m regular-session bars from the trade entry session only'
        : '5m bars aggregated to 30m across a duration-scaled pre-entry window',
      thesis_window: {
        same_session_trade: sameSessionTrade,
        entry_session: entrySession,
        exit_session: exitSession,
        holding_sessions: heldSessionCount,
        analysis_sessions: analysisSessions,
      },
      session_retest_without_confirmation: Boolean(unconfirmedRetest),
      broader_context: {
        direction: broadDirection,
        confirmation_at: broadCycle.confirmationAt,
        confirmation_price: broadCycle.confirmation,
        reason: broadCycle.reason,
      },
      session_state: sessionState,
      session_cycle_reason: sessionCycle.reason,
      retest_status_at_entry: sessionCycle.confirmed ? sessionCycle.retest : (unconfirmedRetest ? 'held_unconfirmed' : 'not_observed'),
      support: levels.support,
      resistance: levels.resistance,
      local_move_unit: levels.move,
      trade_direction: tradeDirection,
      confirmation_to_entry_minutes: confirmationToEntryMinutes,
      move_consumed_to_target_pct: moveConsumedPct,
      remaining_room_to_target_pct: remainingRoomPct,
      retest_before_entry: Boolean(retestBar),
      momentum_state_at_entry: momentumStateAtEntry,
      pre_entry_giveback_pct: preEntryGivebackPct,
      option_entry_price: n(episode.average_entry_price),
      option_exit_price: n(episode.average_exit_price),
      realized_pl: n(episode.realized_pl),
      realized_return_pct: n(episode.realized_return_pct),
    },
    engine_version: 'historical-cycle-1.3',
    computed_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db, user } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const requestedIds = Array.isArray(body.episode_ids)
      ? [...new Set(body.episode_ids.map((x: unknown) => Math.abs(Number(x))).filter(Number.isFinite))]
      : [];

    let query = db.from('snaptrade_trade_episodes')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'closed')
      .not('closed_at', 'is', null)
      .order('opened_at', { ascending: true })
      .limit(200);
    if (requestedIds.length) query = query.in('id', requestedIds);

    const { data: episodes, error: episodeError } = await query;
    if (episodeError) throw episodeError;
    const rows = episodes ?? [];
    if (!rows.length) return json({ success: true, reviewed: 0, cached: 0, failures: [] });

    const { data: existing, error: existingError } = await db
      .from('historical_trade_reviews')
      .select('brokerage_episode_id,engine_version')
      .eq('user_id', user.id)
      .in('brokerage_episode_id', rows.map((r: AnyRow) => r.id));
    if (existingError) throw existingError;

    const current = new Set((existing ?? [])
      .filter((r: AnyRow) => r.engine_version === 'historical-cycle-1.3')
      .map((r: AnyRow) => Number(r.brokerage_episode_id)));
    const pending = rows.filter((r: AnyRow) => !current.has(Number(r.id)));
    if (!pending.length) return json({ success: true, reviewed: 0, cached: rows.length, failures: [] });

    const reviews: AnyRow[] = [];
    const failures: string[] = [];
    const pendingIds = pending.map((episode: AnyRow) => Number(episode.id));

    // Historical playback bars are immutable and may already have been filled for
    // the episode. Reuse that exact persisted evidence before considering Massive.
    const { data: playbackCaches, error: playbackCacheError } = await db
      .from('historical_trade_playback_cache')
      .select('brokerage_episode_id,bars')
      .eq('user_id', user.id)
      .in('brokerage_episode_id', pendingIds);
    if (playbackCacheError) throw playbackCacheError;

    const cachedBarsByEpisode = new Map<number, AnyRow[]>(
      (playbackCaches ?? [])
        .filter((row: AnyRow) => Array.isArray(row.bars) && row.bars.length)
        .map((row: AnyRow) => [Number(row.brokerage_episode_id), row.bars as AnyRow[]]),
    );

    const stillNeedsMarketData: AnyRow[] = [];
    for (const episode of pending) {
      const cachedBars = cachedBarsByEpisode.get(Number(episode.id));
      if (!cachedBars?.length) {
        stillNeedsMarketData.push(episode);
        continue;
      }
      try {
        reviews.push(reviewEpisode(episode, cachedBars));
      } catch (error) {
        failures.push(`${episode.symbol} episode ${episode.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const grouped = new Map<string, AnyRow[]>();
    for (const episode of stillNeedsMarketData) {
      const symbol = String(episode.symbol ?? '').toUpperCase();
      if (!symbol) continue;
      grouped.set(symbol, [...(grouped.get(symbol) ?? []), episode]);
    }

    // Only episodes that have never had a historical playback fill are allowed to
    // reach Massive. This is a one-time fallback, not the normal replay path.
    for (const [symbol, symbolEpisodes] of grouped.entries()) {
      try {
        const minEntry = Math.min(...symbolEpisodes.map((e) => new Date(e.opened_at).getTime()));
        const maxExit = Math.max(...symbolEpisodes.map((e) => new Date(e.closed_at ?? e.opened_at).getTime()));
        const from = new Date(minEntry - 8 * 86400000).toISOString().slice(0, 10);
        const to = new Date(maxExit + 86400000).toISOString().slice(0, 10);
        const bars = await massiveAggs(symbol, from, to);

        for (const episode of symbolEpisodes) {
          try {
            reviews.push(reviewEpisode(episode, bars));
          } catch (error) {
            failures.push(`${symbol} episode ${episode.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        failures.push(`${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (reviews.length) {
      const { error: upsertError } = await db
        .from('historical_trade_reviews')
        .upsert(reviews, { onConflict: 'user_id,brokerage_episode_id' });
      if (upsertError) throw upsertError;
    }

    return json({
      success: true,
      reviewed: reviews.length,
      cached: rows.length - pending.length,
      failures,
      engine_version: 'historical-cycle-1.3',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
