import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ENGINE_VERSION = 'tradecycle-5.9.0';
type AnyRow = Record<string, any>;
type Band = 'Insufficient' | 'Weak' | 'Moderate' | 'Strong';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, value));
}

function band(value: number | null): Band {
  if (value === null || Math.abs(value) < 20) return 'Insufficient';
  if (Math.abs(value) < 45) return 'Weak';
  if (Math.abs(value) < 70) return 'Moderate';
  return 'Strong';
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
  return { db, user, auth };
}

function derivePriceOrientation(raw: AnyRow): number {
  const higher = raw.price_structure_higher === true;
  const lower = raw.price_structure_lower === true;
  const breakoutUp = raw.breakout_up === true;
  const breakoutDown = raw.breakout_down === true;
  const shortBull = raw.short_bull_stack === true;
  const shortBear = raw.short_bear_stack === true;
  const smaUp = raw.sma20_rising === true;
  const smaDown = raw.sma20_falling === true;
  const longBull = raw.long_bull_context === true;
  const longBear = raw.long_bear_context === true;
  const adx = n(raw.adx_14);
  const plusDi = n(raw.plus_di_14);
  const minusDi = n(raw.minus_di_14);
  const dmiBull = adx !== null && plusDi !== null && minusDi !== null && plusDi > minusDi && adx >= 20;
  const dmiBear = adx !== null && plusDi !== null && minusDi !== null && minusDi > plusDi && adx >= 20;
  const bullStructure = higher || breakoutUp;
  const bearStructure = lower || breakoutDown;

  const bullStrong = bullStructure && shortBull && smaUp && dmiBull && (adx ?? 0) >= 25 && (longBull || breakoutUp);
  const bearStrong = bearStructure && shortBear && smaDown && dmiBear && (adx ?? 0) >= 25 && (longBear || breakoutDown);
  if (bullStrong && !bearStrong) return 80;
  if (bearStrong && !bullStrong) return -80;

  const bullModerate =
    (bullStructure && [shortBull, smaUp, dmiBull, longBull].filter(Boolean).length >= 2) ||
    (breakoutUp && dmiBull) ||
    (shortBull && smaUp && dmiBull);
  const bearModerate =
    (bearStructure && [shortBear, smaDown, dmiBear, longBear].filter(Boolean).length >= 2) ||
    (breakoutDown && dmiBear) ||
    (shortBear && smaDown && dmiBear);
  if (bullModerate && !bearModerate) return 56;
  if (bearModerate && !bullModerate) return -56;

  const bullClues = [shortBull, smaUp, higher, breakoutUp, plusDi !== null && minusDi !== null && plusDi > minusDi, longBull].filter(Boolean).length;
  const bearClues = [shortBear, smaDown, lower, breakoutDown, plusDi !== null && minusDi !== null && minusDi > plusDi, longBear].filter(Boolean).length;
  if (bullClues >= bearClues + 2 && bullClues >= 2) return 32;
  if (bearClues >= bullClues + 2 && bearClues >= 2) return -32;
  return 0;
}

function deriveMomentumOrientation(raw: AnyRow): number {
  const macdLine = n(raw.macd_line);
  const macdSignal = n(raw.macd_signal);
  const rsi = n(raw.rsi_14);
  const return5 = n(raw.return_5d_pct);
  const return20 = n(raw.return_20d_pct);
  let net = 0;
  if (macdLine !== null && macdSignal !== null) {
    net += macdLine > macdSignal ? 1.5 : macdLine < macdSignal ? -1.5 : 0;
    net += macdLine > 0 ? 1 : macdLine < 0 ? -1 : 0;
  }
  if (rsi !== null) net += rsi >= 55 ? 1 : rsi <= 45 ? -1 : 0;
  if (return5 !== null) net += return5 >= 1 ? 1 : return5 <= -1 ? -1 : 0;
  if (return20 !== null) net += return20 >= 3 ? 1.5 : return20 <= -3 ? -1.5 : 0;

  const strongAllowed = macdLine !== null && macdSignal !== null && return20 !== null &&
    ((net > 0 && macdLine > macdSignal && return20 > 0) || (net < 0 && macdLine < macdSignal && return20 < 0));
  const sign = Math.sign(net);
  const magnitude = Math.abs(net);
  if (!sign || magnitude < 1.25) return 0;
  if (magnitude >= 4.5 && strongAllowed) return sign * 80;
  if (magnitude >= 2.75) return sign * 56;
  return sign * 32;
}

function swingFrame(signal: AnyRow, raw: AnyRow, direction: 'bullish' | 'bearish') {
  const price = n(signal.stock_price_at_generation);
  if (price === null) return { target: null, invalidation: null, ratio: null, valid: false };

  const storedTarget = n(signal.target_price) ?? n(raw.tactical_target);
  const storedInvalidation = n(signal.invalidation_level) ?? n(raw.tactical_invalidation);
  if (storedTarget !== null && storedInvalidation !== null) {
    const reward = Math.abs(storedTarget - price);
    const risk = Math.abs(price - storedInvalidation);
    const ratio = risk > 0 ? reward / risk : null;
    const valid = ratio !== null && ratio > 0 &&
      (direction === 'bullish'
        ? storedTarget > price && storedInvalidation < price
        : storedTarget < price && storedInvalidation > price);
    return { target: storedTarget, invalidation: storedInvalidation, ratio, valid };
  }

  const localUnit = n(raw.local_move_unit);
  if (localUnit === null || localUnit <= 0) return { target: null, invalidation: null, ratio: null, valid: false };
  const target = direction === 'bullish' ? price + localUnit * 1.15 : price - localUnit * 1.15;
  const invalidation = direction === 'bullish' ? price - localUnit * 0.72 : price + localUnit * 0.72;
  const reward = Math.abs(target - price);
  const risk = Math.abs(price - invalidation);
  const ratio = risk > 0 ? reward / risk : null;
  return { target, invalidation, ratio, valid: ratio !== null && ratio > 0 };
}

function swingFrameFromCycle(
  signal: AnyRow,
  raw: AnyRow,
  direction: 'bullish' | 'bearish',
  cycle: AnyRow | null,
) {
  const legacy = swingFrame(signal, raw, direction);
  if (legacy.valid) return { ...legacy, basis: 'stored_tactical_frame' };

  const price = n(signal.stock_price_at_generation);
  if (price === null || !cycle) return { ...legacy, basis: 'unavailable' };

  const cycleInvalidation = n(cycle.cycle_invalidation);
  const confirmation = n(cycle.confirmation_price);
  const contextSupport = n(raw.context_support);
  const contextResistance = n(raw.context_resistance);
  const tacticalSupport = n(raw.tactical_support);
  const tacticalResistance = n(raw.tactical_resistance);
  const localUnit = n(raw.local_move_unit);

  let invalidation = cycleInvalidation;
  if (invalidation === null || (direction === 'bullish' ? invalidation >= price : invalidation <= price)) {
    invalidation = direction === 'bullish'
      ? (tacticalSupport !== null && tacticalSupport < price ? tacticalSupport : contextSupport !== null && contextSupport < price ? contextSupport : null)
      : (tacticalResistance !== null && tacticalResistance > price ? tacticalResistance : contextResistance !== null && contextResistance > price ? contextResistance : null);
  }

  let target = direction === 'bullish'
    ? (tacticalResistance !== null && tacticalResistance > price ? tacticalResistance : contextResistance !== null && contextResistance > price ? contextResistance : null)
    : (tacticalSupport !== null && tacticalSupport < price ? tacticalSupport : contextSupport !== null && contextSupport < price ? contextSupport : null);

  if (target === null && localUnit !== null && localUnit > 0) {
    target = direction === 'bullish' ? price + localUnit * 1.15 : price - localUnit * 1.15;
  }

  // If nearby stored structure is already behind current price, use recent realized
  // movement to construct a forward tactical objective rather than inheriting a null
  // frame from an older neutral classification.
  if (target !== null && (direction === 'bullish' ? target <= price : target >= price) && localUnit !== null && localUnit > 0) {
    target = direction === 'bullish' ? price + localUnit * 1.15 : price - localUnit * 1.15;
  }

  if (invalidation === null && confirmation !== null && localUnit !== null && localUnit > 0) {
    invalidation = direction === 'bullish'
      ? Math.min(confirmation - localUnit * 0.55, price - localUnit * 0.45)
      : Math.max(confirmation + localUnit * 0.55, price + localUnit * 0.45);
  }

  if (target === null || invalidation === null) {
    return { target, invalidation, ratio: null, valid: false, basis: 'cycle_structure_incomplete' };
  }

  const reward = Math.abs(target - price);
  const risk = Math.abs(price - invalidation);
  const ratio = risk > 0 ? reward / risk : null;
  const valid = ratio !== null && ratio > 0 &&
    (direction === 'bullish'
      ? target > price && invalidation < price
      : target < price && invalidation > price);

  return {
    target,
    invalidation,
    ratio,
    valid,
    basis: valid ? 'persisted_cycle_plus_stored_structure' : 'cycle_structure_invalid',
  };
}

function factorByKey(score: AnyRow, key: string): AnyRow | null {
  const factors = Array.isArray(score?.factors) ? score.factors : [];
  return factors.find((factor: AnyRow) => factor.factor === key) ?? null;
}


function evidenceRole(key: string): 'primary' | 'confirmation' | 'context' | 'auxiliary' | 'trade_quality' {
  if (key === 'price_trend') return 'primary';
  if (key === 'momentum' || key === 'participation') return 'confirmation';
  if (key === 'market_alignment' || key === 'catalysts_news') return 'context';
  if (key === 'options_market') return 'auxiliary';
  return 'trade_quality';
}

function evidenceStatus(factor: AnyRow): 'observed' | 'no_meaningful_evidence' | 'unavailable' | 'stale' | 'refresh_failed' {
  if (!factor || factor.provenance === 'unavailable') return 'unavailable';
  const freshness = n(factor.freshness);
  if (freshness !== null && freshness < 0.20) return 'stale';
  const strength = String(factor.strength_band ?? 'Insufficient');
  if (strength === 'Insufficient' || strength === 'Weak') return 'no_meaningful_evidence';
  return 'observed';
}

function contractPoint(
  key: string,
  family: string,
  value: unknown,
  unit: string | null,
  status: 'observed' | 'no_meaningful_evidence' | 'unavailable' | 'stale' | 'refresh_failed',
  sourceName: unknown,
  sourceTimestamp: unknown,
  retrievedAt: unknown,
) {
  return {
    key,
    family,
    value: value ?? null,
    unit,
    status,
    source_name: sourceName ? String(sourceName) : null,
    source_timestamp: sourceTimestamp ? String(sourceTimestamp) : null,
    retrieved_at: retrievedAt ? String(retrievedAt) : null,
  };
}

function setupClass(raw: AnyRow, direction: 'bullish' | 'bearish'): string {
  const cycleDirection = String(raw.cycle_direction ?? '');
  const cycleEvent = String(raw.cycle_event_type ?? '');
  if (raw.cycle_confirmed === true && cycleDirection === direction) {
    if (cycleEvent === 'breakout') return 'momentum_breakout';
    if (cycleEvent === 'reversal') return 'reversal_continuation';
    if (cycleEvent === 'continuation') return 'trend_continuation';
  }
  if (direction === 'bullish' ? raw.breakout_up === true : raw.breakout_down === true) return 'momentum_breakout';
  if (direction === 'bullish' ? raw.price_structure_higher === true : raw.price_structure_lower === true) return 'trend_continuation';
  return 'momentum_continuation';
}

async function executableContractCount(db: any, symbol: string, optionType: string): Promise<number> {
  const { data: latest } = await db
    .from('option_market_snapshots')
    .select('retrieved_at')
    .eq('underlying_symbol', symbol)
    .gte('retrieved_at', new Date(Date.now() - 36 * 3600000).toISOString())
    .order('retrieved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest?.retrieved_at) return 0;

  const { data, error } = await db
    .from('option_market_snapshots')
    .select('expiration,strike,bid,ask,option_type')
    .eq('underlying_symbol', symbol)
    .eq('retrieved_at', latest.retrieved_at)
    .eq('option_type', optionType)
    .limit(1000);
  if (error) return 0;

  return (data ?? []).filter((row: AnyRow) => {
    const bid = n(row.bid);
    const ask = n(row.ask);
    const strike = n(row.strike);
    const exp = row.expiration ? new Date(row.expiration).getTime() : NaN;
    const dte = Number.isFinite(exp) ? (exp - Date.now()) / 86400000 : -1;
    return bid !== null && ask !== null && ask >= bid && ask > 0 && strike !== null && dte >= 7 && dte <= 60;
  }).length;
}

function cloneSignalRow(source: AnyRow, runId: string, overrides: AnyRow): AnyRow {
  return {
    run_id: runId,
    symbol: source.symbol,
    trading_day: source.trading_day,
    direction: source.direction,
    strategy: source.strategy,
    confidence_score: source.confidence_score,
    opportunity_score: source.opportunity_score,
    risk_level: source.risk_level,
    holding_period: source.holding_period,
    catalyst_summary: source.catalyst_summary,
    no_trade_reason: source.no_trade_reason,
    stock_price_at_generation: source.stock_price_at_generation,
    suggested_expiration: source.suggested_expiration,
    suggested_strike: source.suggested_strike,
    break_even: source.break_even,
    est_premium: source.est_premium,
    max_defined_loss: source.max_defined_loss,
    target_price: source.target_price,
    invalidation_level: source.invalidation_level,
    expected_move_pct: source.expected_move_pct,
    score_breakdown: source.score_breakdown,
    weights: source.weights,
    regime: source.regime,
    regime_explanation: source.regime_explanation,
    engine_version: ENGINE_VERSION,
    is_demo: source.is_demo,
    generated_at: source.generated_at,
    ...overrides,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db, user, auth } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const requestedRunId = typeof body.run_id === 'string' && body.run_id.trim() ? body.run_id.trim() : null;
    const reclassifyOnly = requestedRunId !== null || body.mode === 'reclassify';

    let sourceRunId = requestedRunId;
    let upstreamResult: AnyRow = {};

    if (!sourceRunId) {
      const baseUrl = Deno.env.get('SUPABASE_URL');
      const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      if (!baseUrl) throw new Error('SUPABASE_URL is unavailable.');
      const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/functions/v1/run-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth, apikey },
        body: JSON.stringify(body),
      });
      const upstreamText = await upstream.text();
      try { upstreamResult = upstreamText ? JSON.parse(upstreamText) : {}; } catch { upstreamResult = {}; }
      if (!upstream.ok) return json({ error: upstreamResult.error ?? upstreamText }, upstream.status);
      sourceRunId = String(upstreamResult.run_id ?? '');
    }

    if (!sourceRunId) return json({ error: 'No source analysis run was available.' }, 404);

    const { data: sourceSignals, error: signalError } = await db
      .from('signals')
      .select('*')
      .eq('run_id', sourceRunId);
    if (signalError) throw signalError;
    if (!sourceSignals?.length) return json({ error: `No stored signals were found for run ${sourceRunId}.` }, 404);

    const cycleBySymbol = new Map<string, AnyRow>();
    {
      const symbols = [...new Set(sourceSignals.map((row: AnyRow) => String(row.symbol ?? '').toUpperCase()).filter(Boolean))];
      if (symbols.length) {
        const { data: cycleRows, error: cycleError } = await db
          .from('market_cycle_states')
          .select('*')
          .in('symbol', symbols);
        if (cycleError) throw cycleError;
        for (const row of cycleRows ?? []) {
          const computedAt = row.computed_at ? new Date(row.computed_at).getTime() : 0;
          const sourceBarAt = row.source_bar_time ? new Date(row.source_bar_time).getTime() : 0;
          const computedFresh = Number.isFinite(computedAt) && Date.now() - computedAt <= 24 * 3600000;
          // Outside market hours, an older completed-session bar can still be the
          // freshest legitimate market evidence. Do not require a same-hour provider pull.
          const barUsable = Number.isFinite(sourceBarAt) && Date.now() - sourceBarAt <= 7 * 86400000;
          if (computedFresh && barUsable) cycleBySymbol.set(String(row.symbol).toUpperCase(), row);
        }
      }
    }

    const derivedRunId = crypto.randomUUID();
    const signalMap: Array<{ source_id: number; derived_id: number; symbol: string }> = [];
    let supportedCount = 0;

    for (const source of sourceSignals) {
      const score: AnyRow = source.score_breakdown && typeof source.score_breakdown === 'object'
        ? structuredClone(source.score_breakdown)
        : {};
      const raw: AnyRow = score.raw && typeof score.raw === 'object' ? score.raw : {};

      const trendOrientation = derivePriceOrientation(raw);
      const trendBand = band(trendOrientation);
      const momentumOrientation = deriveMomentumOrientation(raw);
      const momentumBand = band(momentumOrientation);
      const trendDirectional = trendBand === 'Moderate' || trendBand === 'Strong';
      const trendDirection = trendDirectional
        ? trendOrientation > 0 ? 'bullish' : trendOrientation < 0 ? 'bearish' : 'neutral'
        : 'neutral';

      const persistedCycle = cycleBySymbol.get(String(source.symbol ?? '').toUpperCase()) ?? null;
      const cycleConfirmed = persistedCycle
        ? ['reversal_confirmed', 'breakout_confirmed', 'continuation_confirmed'].includes(String(persistedCycle.cycle_state)) &&
          (persistedCycle.direction === 'bullish' || persistedCycle.direction === 'bearish') &&
          persistedCycle.retest_status !== 'failed'
        : raw.cycle_confirmed === true &&
          (raw.cycle_direction === 'bullish' || raw.cycle_direction === 'bearish');
      const cycleDirection = cycleConfirmed
        ? String(persistedCycle?.direction ?? raw.cycle_direction)
        : 'neutral';
      const cycleEventType = String(persistedCycle?.event_type ?? raw.cycle_event_type ?? 'unconfirmed');
      const cycleReason = persistedCycle?.reason ? String(persistedCycle.reason) : raw.cycle_reason ?? null;
      const persistedCycleConfidence = n(persistedCycle?.confidence_score);
      const historicalCycleConfidence = n(raw.cycle_confidence_score) ?? n(raw.swing_cycle_confidence_score);
      const cycleConfidence = persistedCycleConfidence ?? historicalCycleConfidence;

      // The confirmed market-cycle event is the primary short-horizon price signal.
      // The slower trend model is context: it can strengthen or weaken conviction,
      // but it does not have to flip before a fresh reversal becomes tradeable.
      const cycleStrength = cycleConfirmed
        ? (cycleConfidence !== null && cycleConfidence >= 80 ? 80 : 56)
        : 0;
      const priceOrientation = cycleConfirmed
        ? (cycleDirection === 'bullish' ? cycleStrength : -cycleStrength)
        : reclassifyOnly
          ? trendOrientation
          : 0;
      const priceBand = band(priceOrientation);
      const priceDirectional = cycleConfirmed && (priceBand === 'Moderate' || priceBand === 'Strong');
      const direction = priceDirectional ? cycleDirection : 'neutral';
      const trendAlignsCycle = priceDirectional && trendDirectional && trendDirection === direction;
      const trendOpposesCycle = priceDirectional && trendDirectional && trendDirection !== direction;
      const momentumAgrees = direction !== 'neutral' &&
        (momentumBand === 'Moderate' || momentumBand === 'Strong') &&
        Math.sign(momentumOrientation) === Math.sign(priceOrientation);
      const momentumOpposes = direction !== 'neutral' &&
        (momentumBand === 'Moderate' || momentumBand === 'Strong') &&
        Math.sign(momentumOrientation) === -Math.sign(priceOrientation);

      const frame = direction === 'neutral'
        ? { target: null, invalidation: null, ratio: null, valid: false, basis: 'no_direction' }
        : swingFrameFromCycle(source, raw, direction, persistedCycle);
      const setupRaw = persistedCycle
        ? {
            ...raw,
            cycle_confirmed: cycleConfirmed,
            cycle_direction: cycleDirection,
            cycle_event_type: cycleEventType,
          }
        : raw;
      const setup = direction === 'neutral' ? 'unclassified' : setupClass(setupRaw, direction);
      const participation = factorByKey(score, 'participation');
      const participationStrongOppose = participation?.strength_band === 'Strong' && participation?.thesis_vote === 'OPPOSE';
      const existingTradeBlockers = Array.isArray(score.trade_blockers) ? score.trade_blockers.map(String) : [];
      const tradeBlockers = existingTradeBlockers.filter((message: string) => !/liquidity|spread/i.test(message));
      if (!cycleConfirmed && !reclassifyOnly && !tradeBlockers.some((x: string) => /substantiated|cycle|reversal|confirmation/i.test(x))) {
        tradeBlockers.push('No recent reversal, continuation, or breakout has been sufficiently substantiated for a fresh swing thesis.');
      }
      if (frame.ratio !== null && frame.ratio < 0.72 && !tradeBlockers.some((x: string) => /reward/i.test(x))) {
        tradeBlockers.push('The current tactical reward does not adequately compensate for the estimated risk.');
      }

      const cycleRetestHeld = persistedCycle?.retest_status === 'held';
      const cycleVolumeRatio = n(persistedCycle?.volume_confirmation_ratio);
      const cycleSubstantiated = cycleConfirmed &&
        (
          cycleRetestHeld ||
          (cycleConfidence !== null && cycleConfidence >= 80 && (cycleVolumeRatio === null || cycleVolumeRatio >= 0.90)) ||
          (cycleEventType === 'breakout' && cycleConfidence !== null && cycleConfidence >= 80)
        );
      const confirmationSatisfied = cycleSubstantiated && !momentumOpposes;
      const supported = direction !== 'neutral' &&
        priceDirectional &&
        confirmationSatisfied &&
        frame.valid &&
        !participationStrongOppose &&
        tradeBlockers.length === 0;
      if (supported) supportedCount++;

      const contextSupportCount = [
        factorByKey(score, 'participation'),
        factorByKey(score, 'market_alignment'),
        factorByKey(score, 'catalysts_news'),
      ].filter((factor) => factor && factor.thesis_vote === 'SUPPORT' && (factor.strength_band === 'Moderate' || factor.strength_band === 'Strong')).length;
      const strong = supported && priceBand === 'Strong' && momentumBand === 'Strong' && contextSupportCount >= 1 && !trendOpposesCycle;
      const thesisState = strong ? 'Strongly Supported' : supported ? 'Supported' : momentumOpposes ? (momentumBand === 'Strong' ? 'Rejected' : 'Opposed') : 'Insufficient Evidence';

      const executable = supported
        ? await executableContractCount(db, String(source.symbol).toUpperCase(), direction === 'bearish' ? 'PUT' : 'CALL')
        : 0;
      const liquidity = factorByKey(score, 'liquidity');
      const executionBlockers: string[] = [];
      if (liquidity && n(liquidity.signed_score) !== null && Number(liquidity.signed_score) < -25) {
        executionBlockers.push('Available option contracts have poor liquidity or unusually wide spreads.');
      }
      const contractReady = supported && executable > 0 && executionBlockers.length === 0;

      const priceScore = priceBand === 'Strong' ? 86 : priceBand === 'Moderate' ? 72 : 56;
      const momentumScore = momentumBand === 'Strong' ? 88 : momentumBand === 'Moderate' ? 74 : 40;
      const rrScore = frame.ratio === null ? 45 : clamp(50 + (frame.ratio - 1) * 28, 35, 88);
      const trendAdjustment = trendAlignsCycle ? 4 : trendOpposesCycle ? -5 : 0;
      const contextAdjustment = Math.min(6, contextSupportCount * 2) + trendAdjustment;
      const swingConfidence = supported
        ? Math.round(clamp(priceScore * 0.35 + momentumScore * 0.45 + rrScore * 0.20 + contextAdjustment, 50, 92))
        : Number(source.confidence_score ?? 0);

      const noTradeReason = supported
        ? null
        : direction === 'neutral' || !priceDirectional
          ? 'No recent substantiated market-cycle event has established a usable directional swing setup.'
          : momentumOpposes
            ? `Momentum is ${momentumBand.toLowerCase()} and materially opposes the confirmed ${direction} cycle.`
            : !cycleSubstantiated
              ? 'A directional cycle is visible, but reversal/breakout confirmation is not yet strong enough to structure as a trade.'
              : !frame.valid
                ? 'The cycle is substantiated, but recent cached structure cannot yet produce a usable 1–5 day target/invalidation frame.'
                : participationStrongOppose
                  ? 'Strong participation evidence contradicts the proposed short-horizon direction.'
                  : tradeBlockers.join(' ') || 'The swing setup does not currently satisfy the suggestion gate.';

      const factors = Array.isArray(score.factors) ? score.factors : [];
      for (const factor of factors) {
        if (factor.factor === 'price_trend') {
          factor.signed_score = direction === 'neutral' ? 0 : Math.abs(priceOrientation);
          factor.raw_score = Math.abs(priceOrientation);
          factor.strength_band = priceBand;
          factor.thesis_vote = direction !== 'neutral' ? 'SUPPORT' : 'ABSTAIN';
        }
        if (factor.factor === 'momentum') {
          const relative = direction === 'neutral' ? 0 : Math.sign(momentumOrientation) === Math.sign(priceOrientation)
            ? Math.abs(momentumOrientation)
            : -Math.abs(momentumOrientation);
          factor.signed_score = relative;
          factor.raw_score = Math.abs(momentumOrientation);
          factor.strength_band = momentumBand;
          factor.thesis_vote = momentumBand === 'Moderate' || momentumBand === 'Strong'
            ? relative > 0 ? 'SUPPORT' : relative < 0 ? 'OPPOSE' : 'ABSTAIN'
            : 'ABSTAIN';
        }
        if (
          direction === 'neutral' &&
          ['participation', 'market_alignment', 'options_market', 'catalysts_news'].includes(String(factor.factor))
        ) {
          factor.signed_score = 0;
          factor.thesis_vote = 'ABSTAIN';
        }
      }

      score.factors = factors;

      const contractFamilies: Record<string, AnyRow> = {};
      for (const factor of factors) {
        const key = String(factor.factor ?? '');
        if (!key) continue;
        const absoluteScore =
          key === 'price_trend' ? priceOrientation :
          key === 'momentum' ? momentumOrientation :
          n(factor.signed_score);
        const vote = String(factor.thesis_vote ?? 'ABSTAIN');
        const role = evidenceRole(key);
        let voteReason = 'Evidence is below the Moderate/Strong voting threshold.';
        if (vote === 'SUPPORT') voteReason = 'Moderate/Strong evidence supports the established thesis direction.';
        else if (vote === 'OPPOSE') voteReason = 'Moderate/Strong evidence opposes the established thesis direction.';
        else if (key === 'momentum' && direction === 'neutral' && (momentumBand === 'Moderate' || momentumBand === 'Strong')) {
          voteReason = 'Standalone momentum is meaningful, but price has not established a directional thesis, so momentum cannot vote.';
        } else if (key === 'options_market') {
          voteReason = 'Aggregate options activity lacks trade-side/opening-closing context and remains auxiliary.';
        }

        contractFamilies[key] = {
          key,
          label: String(factor.label ?? key),
          role,
          status: evidenceStatus(factor),
          provenance: String(factor.provenance ?? 'unavailable'),
          absolute_score: absoluteScore,
          relative_score: n(factor.signed_score),
          strength_band: key === 'price_trend' ? priceBand : key === 'momentum' ? momentumBand : String(factor.strength_band ?? 'Insufficient'),
          thesis_vote: vote,
          can_vote: vote === 'SUPPORT' || vote === 'OPPOSE',
          vote_reason: voteReason,
          confidence: n(factor.confidence),
          freshness: n(factor.freshness),
          source_quality: n(factor.source_quality),
          explanation: factor.explanation ? String(factor.explanation) : null,
        };
      }

      // Normalize source-state semantics before computing coverage. A successful
      // source that produced no meaningful directional evidence is still available;
      // it is not the same thing as an unavailable integration.
      if (contractFamilies.catalysts_news) {
        const newsCount = n(raw.news_item_count);
        if (newsCount !== null) {
          contractFamilies.catalysts_news.status = newsCount > 0 ? 'observed' : 'no_meaningful_evidence';
        }
      }
      if (contractFamilies.options_market && raw.option_snapshot_retrieved_at) {
        contractFamilies.options_market.status = 'observed';
      }

      const familyEntries = factors
        .map((factor) => ({
          factor,
          contract: contractFamilies[String(factor.factor ?? '')],
        }))
        .filter((entry) => entry.contract);

      const familyIsAvailable = (status: string) =>
        status === 'observed' || status === 'no_meaningful_evidence';

      const availableFamilies = familyEntries.filter((entry) => familyIsAvailable(String(entry.contract.status))).length;
      const totalFamilies = familyEntries.length;
      const totalBaseWeight = familyEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.factor.base_weight ?? 0)), 0);
      const availableBaseWeight = familyEntries.reduce(
        (sum, entry) => sum + (familyIsAvailable(String(entry.contract.status)) ? Math.max(0, Number(entry.factor.base_weight ?? 0)) : 0),
        0,
      );
      const directionalEntries = familyEntries.filter((entry) => entry.contract.role !== 'trade_quality');
      const directionalTotalBaseWeight = directionalEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.factor.base_weight ?? 0)), 0);
      const directionalAvailableBaseWeight = directionalEntries.reduce(
        (sum, entry) => sum + (familyIsAvailable(String(entry.contract.status)) ? Math.max(0, Number(entry.factor.base_weight ?? 0)) : 0),
        0,
      );
      const reliabilityAdjustedWeight = familyEntries.reduce((sum, entry) => {
        if (!familyIsAvailable(String(entry.contract.status))) return sum;
        const baseWeight = Math.max(0, Number(entry.factor.base_weight ?? 0));
        const reliability = Math.max(0, Math.min(1, Number(entry.factor.reliability ?? 0)));
        return sum + baseWeight * reliability;
      }, 0);

      const contractCoverage = {
        available_families: availableFamilies,
        total_families: totalFamilies,
        weighted_completeness_pct: Math.round(totalBaseWeight > 0 ? (availableBaseWeight / totalBaseWeight) * 100 : 0),
        directional_weighted_completeness_pct: Math.round(
          directionalTotalBaseWeight > 0 ? (directionalAvailableBaseWeight / directionalTotalBaseWeight) * 100 : 0,
        ),
        reliability_adjusted_coverage_pct: Math.round(
          totalBaseWeight > 0 ? (reliabilityAdjustedWeight / totalBaseWeight) * 100 : 0,
        ),
        uncertainty_pct: Math.round(
          totalBaseWeight > 0 ? (1 - reliabilityAdjustedWeight / totalBaseWeight) * 100 : 100,
        ),
      };

      const optionSnapshotStatus =
        raw.option_snapshot_retrieved_at
          ? 'observed'
          : raw.put_call_ratio !== null && raw.put_call_ratio !== undefined
            ? 'no_meaningful_evidence'
            : 'unavailable';
      const marketPointStatus = raw.history_usable === false ? 'stale' : 'observed';
      const validationIssues: string[] = [];
      if (direction === 'neutral' && supported) validationIssues.push('Neutral price direction cannot be suggestion-eligible.');
      if (supported && !priceDirectional) validationIssues.push('A supported thesis requires Moderate/Strong primary price evidence.');
      if (!priceDirectional && direction !== 'neutral') validationIssues.push('Weak/Insufficient price evidence cannot establish thesis direction.');
      if (!frame.valid && (frame.target !== null || frame.invalidation !== null)) {
        validationIssues.push('Tactical target/invalidation exists while the tactical frame is invalid.');
      }
      if (raw.put_call_ratio !== null && raw.put_call_ratio !== undefined && contractFamilies.options_market?.status === 'unavailable') {
        validationIssues.push('Options metric exists while the options evidence family is marked unavailable.');
      }

      score.evidence_contract = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        thesis_direction: direction,
        families: contractFamilies,
        points: {
          analysis_price: contractPoint('analysis_price', 'price_trend', source.stock_price_at_generation, 'USD', marketPointStatus, raw.market_source_name, raw.market_source_timestamp, raw.market_retrieved_at),
          relative_volume: contractPoint('relative_volume', 'participation', raw.relative_volume, 'x', raw.relative_volume === null || raw.relative_volume === undefined ? 'unavailable' : 'observed', raw.market_source_name, raw.market_source_timestamp, raw.market_retrieved_at),
          options_put_call_ratio: contractPoint('options_put_call_ratio', 'options_market', raw.put_call_ratio, 'ratio', optionSnapshotStatus, raw.option_source_name, raw.option_snapshot_retrieved_at, raw.option_snapshot_retrieved_at),
          options_call_volume: contractPoint('options_call_volume', 'options_market', raw.call_volume, 'contracts', raw.call_volume === null || raw.call_volume === undefined ? 'unavailable' : optionSnapshotStatus, raw.option_source_name, raw.option_snapshot_retrieved_at, raw.option_snapshot_retrieved_at),
          options_put_volume: contractPoint('options_put_volume', 'options_market', raw.put_volume, 'contracts', raw.put_volume === null || raw.put_volume === undefined ? 'unavailable' : optionSnapshotStatus, raw.option_source_name, raw.option_snapshot_retrieved_at, raw.option_snapshot_retrieved_at),
          options_total_open_interest: contractPoint('options_total_open_interest', 'options_market', raw.total_open_interest, 'contracts', raw.total_open_interest === null || raw.total_open_interest === undefined ? 'unavailable' : optionSnapshotStatus, raw.option_source_name, raw.option_snapshot_retrieved_at, raw.option_snapshot_retrieved_at),
          options_iv_median: contractPoint('options_iv_median', 'options_market', raw.option_iv_median, 'decimal', raw.option_iv_median === null || raw.option_iv_median === undefined ? 'unavailable' : optionSnapshotStatus, raw.option_source_name, raw.option_snapshot_retrieved_at, raw.option_snapshot_retrieved_at),
          news_item_count: contractPoint('news_item_count', 'catalysts_news', raw.news_item_count, 'items', raw.news_item_count ? 'observed' : 'no_meaningful_evidence', raw.news_source_name, raw.news_latest_published_at, raw.news_latest_published_at),
          tactical_target: contractPoint('tactical_target', 'risk_reward', frame.target, 'USD', frame.valid ? 'observed' : 'unavailable', raw.market_source_name, raw.market_source_timestamp, raw.market_retrieved_at),
          tactical_invalidation: contractPoint('tactical_invalidation', 'risk_reward', frame.invalidation, 'USD', frame.valid ? 'observed' : 'unavailable', raw.market_source_name, raw.market_source_timestamp, raw.market_retrieved_at),
        },
        coverage: contractCoverage,
        validation: {
          valid: validationIssues.length === 0,
          issues: validationIssues,
        },
      };

      score.thesis_state = thesisState;
      score.trade_eligible = supported;
      score.suggestion_eligible = supported;
      score.trade_blockers = tradeBlockers;
      score.execution_blockers = executionBlockers;
      score.contract_selection_ready = contractReady;
      score.contract_selection_state = contractReady ? 'available' : supported ? 'pending_live_execution_data' : 'not_applicable';
      score.swing_setup = setup;
      score.raw = {
        ...raw,
        swing_setup: setup,
        swing_price_orientation: priceOrientation,
        swing_price_band: priceBand,
        swing_momentum_orientation: momentumOrientation,
        swing_momentum_band: momentumBand,
        swing_momentum_confirmed: momentumAgrees,
        swing_tactical_frame_valid: frame.valid,
        swing_tactical_frame_basis: frame.basis,
        swing_reward_risk_ratio: frame.ratio,
        swing_cycle_confirmed: cycleConfirmed,
        swing_cycle_direction: cycleDirection,
        swing_cycle_event_type: cycleEventType,
        swing_cycle_reason: cycleReason,
        swing_cycle_confidence_score: cycleConfidence,
        market_cycle_state: persistedCycle ? {
          cycle_state: persistedCycle.cycle_state,
          direction: persistedCycle.direction,
          event_type: persistedCycle.event_type,
          reversal_origin: persistedCycle.reversal_origin,
          confirmation_price: persistedCycle.confirmation_price,
          confirmation_at: persistedCycle.confirmation_at,
          retest_price: persistedCycle.retest_price,
          retest_at: persistedCycle.retest_at,
          retest_status: persistedCycle.retest_status,
          cycle_invalidation: persistedCycle.cycle_invalidation,
          volume_confirmation_ratio: persistedCycle.volume_confirmation_ratio,
          range_position_5d: persistedCycle.range_position_5d,
          range_position_20d: persistedCycle.range_position_20d,
          move_extension: persistedCycle.move_extension,
          bars_since_confirmation: persistedCycle.bars_since_confirmation,
          confidence_score: persistedCycle.confidence_score,
          reason: persistedCycle.reason,
          computed_at: persistedCycle.computed_at,
        } : null,
      };
      score.historical_evidence_policy = {
        holding_period: '1–5 days',
        setup_class: setup,
        core_evidence: ['short_term_price_direction', 'momentum_alignment', 'tactical_target_invalidation'],
        calibration_status: 'setup_tagged; brokerage-history replay classification pending',
      };
      score.v59_decision = {
        mode: reclassifyOnly ? 'reclassify_stored_evidence' : 'fresh_evidence_then_classify',
        source_run_id: sourceRunId,
        source_signal_id: source.id,
        classified_at: new Date().toISOString(),
        price_direction: direction,
        trend_direction: trendDirection,
        price_band: priceBand,
        cycle_confirmed: cycleConfirmed,
        cycle_direction: cycleDirection,
        cycle_event_type: cycleEventType,
        cycle_state: persistedCycle?.cycle_state ?? (cycleConfirmed ? 'historical_confirmed' : 'unconfirmed'),
        cycle_confidence_score: persistedCycle?.confidence_score ?? null,
        cycle_retest_status: persistedCycle?.retest_status ?? null,
        trend_band: trendBand,
        trend_aligns_cycle: trendAlignsCycle,
        trend_opposes_cycle: trendOpposesCycle,
        momentum_band: momentumBand,
        momentum_agrees: momentumAgrees,
        tactical_frame_valid: frame.valid,
        tactical_frame_basis: frame.basis,
        cycle_substantiated: cycleSubstantiated,
        confirmation_satisfied: confirmationSatisfied,
        context_confirmation_count: contextSupportCount,
        executable_contracts: executable,
        note: '5.9 is append-only: source evidence remains immutable and this row is a derived swing classification.',
      };

      const sourceWeights = source.weights && typeof source.weights === 'object'
        ? structuredClone(source.weights)
        : {};
      const decisionNotes = [
        `TradeCycle 5.9 swing classification: ${thesisState}.`,
        direction === 'neutral'
          ? 'No recent substantiated market-cycle event has established a tradeable short-horizon direction.'
          : `Short-horizon price direction: ${priceBand} ${direction}, established by a recent ${cycleEventType} event. Slower trend context is ${trendBand.toLowerCase()} ${trendDirection}${trendAlignsCycle ? ' and aligned' : trendOpposesCycle ? ' and currently opposing the new cycle' : ''}.`,
        momentumAgrees
          ? `Momentum confirmation: ${momentumBand} and aligned with price.`
          : momentumOpposes
            ? `Momentum confirmation: ${momentumBand} and opposing price.`
            : `Momentum confirmation: ${momentumBand}; Moderate-or-Strong alignment is required.`,
        frame.valid
          ? `1–5 day tactical frame: usable${frame.ratio !== null ? ` at ${frame.ratio.toFixed(2)} R:R` : ''}.`
          : '1–5 day tactical frame: not currently usable.',
        `Secondary context confirmations: ${contextSupportCount}. Participation, broader market and verified catalysts adjust conviction but do not create the thesis.`,
        supported
          ? contractReady
            ? `Execution data: ${executable} executable ${direction === 'bearish' ? 'put' : 'call'} contracts currently meet the pricing window.`
            : 'Execution data: the underlying swing is supported, but a specific executable option position is not yet available.'
          : 'Contract selection is not applicable until the underlying swing setup is supported.',
        'Underlying factor weights are preserved as evidence metadata; TradeCycle 5.9 does not use the legacy aggregate score alone as the swing gate.',
      ];
      const v59Weights = { ...sourceWeights, decisions: decisionNotes };

      const row = cloneSignalRow(source, derivedRunId, {
        direction,
        strategy: supported ? 'Supported Swing' : 'No Trade',
        confidence_score: swingConfidence,
        target_price: frame.target,
        invalidation_level: frame.invalidation,
        no_trade_reason: noTradeReason,
        score_breakdown: score,
        weights: v59Weights,
      });

      const { data: inserted, error: insertError } = await db
        .from('signals')
        .insert(row)
        .select('id,symbol,generated_at')
        .single();
      if (insertError) throw insertError;

      signalMap.push({ source_id: Number(source.id), derived_id: Number(inserted.id), symbol: String(source.symbol) });

      const { error: memoryError } = await db.from('symbol_analysis_memory').upsert({
        user_id: user.id,
        symbol: String(source.symbol).toUpperCase(),
        signal_id: inserted.id,
        analyzed_at: source.generated_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,symbol' });
      if (memoryError) throw memoryError;

      if (supported) {
        const { error: activeError } = await db.from('active_analyses').upsert({
          user_id: user.id,
          symbol: String(source.symbol).toUpperCase(),
          signal_id: inserted.id,
          status: 'active',
          direction,
          holding_period: '1–5 days',
          analyzed_at: source.generated_at ?? new Date().toISOString(),
          valid_until: new Date(Date.now() + 5 * 86400000).toISOString(),
          suggested_expiration: source.suggested_expiration ?? null,
          target_price: frame.target,
          invalidation_level: frame.invalidation,
          opportunity_score: source.opportunity_score,
          confidence_score: swingConfidence,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,symbol' });
        if (activeError) throw activeError;
      } else {
        const { error: expireError } = await db.from('active_analyses')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('symbol', String(source.symbol).toUpperCase());
        if (expireError) throw expireError;
      }
    }

    const now = new Date().toISOString();
    const { error: runError } = await db.from('analysis_runs').insert({
      run_id: derivedRunId,
      kind: reclassifyOnly ? 'v5.9-reclassify' : String(body.kind ?? 'v5.9-fresh'),
      trading_day: now.slice(0, 10),
      signals_generated: signalMap.length,
      updates_emitted: 0,
      feed_events: 0,
      regime: sourceSignals[0]?.regime ?? null,
      notes: `TradeCycle 5.9 derived ${signalMap.length} immutable signal classifications from source run ${sourceRunId}; ${supportedCount} supported swing setups.`,
      started_at: now,
      finished_at: now,
    });
    if (runError) throw runError;

    return json({
      success: true,
      source_run_id: sourceRunId,
      run_id: derivedRunId,
      signals: signalMap.length,
      updates: signalMap.length,
      supported: supportedCount,
      signal_map: signalMap,
      engine_version: ENGINE_VERSION,
      mode: reclassifyOnly ? 'reclassify' : 'fresh',
      note: reclassifyOnly
        ? 'Stored immutable evidence was reclassified into new TradeCycle 5.9 signal rows. No provider refresh was run.'
        : 'Fresh 5.8 evidence was preserved, then new immutable TradeCycle 5.9 signal rows were derived from it.',
    });
  } catch (error) {
    return json({ error: errorDetail(error) }, 500);
  }
});
