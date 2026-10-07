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

  // Reclassification must preserve the stored evidence frame whenever it exists.
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

function factorByKey(score: AnyRow, key: string): AnyRow | null {
  const factors = Array.isArray(score?.factors) ? score.factors : [];
  return factors.find((factor: AnyRow) => factor.factor === key) ?? null;
}

function setupClass(raw: AnyRow, direction: 'bullish' | 'bearish'): string {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db, user, auth } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const requestedRunId = typeof body.run_id === 'string' && body.run_id.trim() ? body.run_id.trim() : null;
    const reclassifyOnly = requestedRunId !== null || body.mode === 'reclassify';

    let runId = requestedRunId;
    let upstreamResult: AnyRow = {};

    if (!runId) {
      const baseUrl = Deno.env.get('SUPABASE_URL');
      const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      if (!baseUrl) throw new Error('SUPABASE_URL is unavailable.');

      // Fresh mode: ask the established 5.8 evidence engine to produce a new evidence
      // snapshot, then apply only the 5.9 swing-decision layer below.
      const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/functions/v1/run-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth, apikey },
        body: JSON.stringify(body),
      });
      const upstreamText = await upstream.text();
      try { upstreamResult = upstreamText ? JSON.parse(upstreamText) : {}; } catch { upstreamResult = {}; }
      if (!upstream.ok) return json({ error: upstreamResult.error ?? upstreamText }, upstream.status);
      runId = String(upstreamResult.run_id ?? '');
    } else {
      // Reclassify mode: no provider calls and no new analysis run. The stored signal
      // evidence is reused exactly as-is and only the 5.9 decision fields are updated.
      upstreamResult = { run_id: runId, signals: 0, updates: 0 };
    }

    if (!runId) return json({ ...upstreamResult, engine_version: ENGINE_VERSION });

    const { data: signals, error: signalError } = await db
      .from('signals')
      .select('*')
      .eq('run_id', runId);
    if (signalError) throw signalError;
    if (!signals?.length) return json({ error: `No stored signals were found for run ${runId}.` }, 404);

    let updatedCount = 0;

    for (const signal of signals) {
      const score: AnyRow = signal.score_breakdown && typeof signal.score_breakdown === 'object'
        ? structuredClone(signal.score_breakdown)
        : {};
      const raw: AnyRow = score.raw && typeof score.raw === 'object' ? score.raw : {};

      const priceOrientation = derivePriceOrientation(raw);
      const momentumOrientation = deriveMomentumOrientation(raw);
      const priceBand = band(priceOrientation);
      const momentumBand = band(momentumOrientation);
      const direction = priceOrientation > 0 ? 'bullish' : priceOrientation < 0 ? 'bearish' : 'neutral';
      const priceDirectional = priceBand !== 'Insufficient';
      const momentumAgrees = direction !== 'neutral' &&
        (momentumBand === 'Moderate' || momentumBand === 'Strong') &&
        Math.sign(momentumOrientation) === Math.sign(priceOrientation);
      const momentumOpposes = direction !== 'neutral' &&
        (momentumBand === 'Moderate' || momentumBand === 'Strong') &&
        Math.sign(momentumOrientation) === -Math.sign(priceOrientation);

      if (direction === 'neutral') {
        score.thesis_state = 'Insufficient Evidence';
        score.trade_eligible = false;
        score.suggestion_eligible = false;
        score.contract_selection_ready = false;
        score.contract_selection_state = 'not_applicable';
        score.swing_setup = 'unclassified';
        score.historical_evidence_policy = {
          holding_period: '1–5 days',
          setup_class: 'unclassified',
          core_evidence: ['short_term_price_direction', 'momentum_alignment', 'tactical_target_invalidation'],
          calibration_status: 'setup_tagged; brokerage-history replay classification pending',
        };
        const { error } = await db.from('signals').update({
          strategy: 'No Trade',
          no_trade_reason: 'Short-horizon price action has not established a usable directional swing lean.',
          score_breakdown: score,
          engine_version: ENGINE_VERSION,
        }).eq('id', signal.id);
        if (error) throw error;
        updatedCount++;
        continue;
      }

      const frame = swingFrame(signal, raw, direction);
      const setup = setupClass(raw, direction);
      const participation = factorByKey(score, 'participation');
      const participationStrongOppose = participation?.strength_band === 'Strong' && participation?.thesis_vote === 'OPPOSE';

      const existingTradeBlockers = Array.isArray(score.trade_blockers) ? score.trade_blockers.map(String) : [];
      const tradeBlockers = existingTradeBlockers.filter((message: string) => !/liquidity|spread/i.test(message));
      if (frame.ratio !== null && frame.ratio < 0.72 && !tradeBlockers.some((x: string) => /reward/i.test(x))) {
        tradeBlockers.push('The current tactical reward does not adequately compensate for the estimated risk.');
      }

      const supported = priceDirectional && momentumAgrees && frame.valid && !participationStrongOppose && tradeBlockers.length === 0;
      const contextSupportCount = [
        factorByKey(score, 'participation'),
        factorByKey(score, 'market_alignment'),
        factorByKey(score, 'catalysts_news'),
      ].filter((factor) => factor && factor.thesis_vote === 'SUPPORT' && (factor.strength_band === 'Moderate' || factor.strength_band === 'Strong')).length;
      const strong = supported && priceBand === 'Strong' && momentumBand === 'Strong' && contextSupportCount >= 1;
      const thesisState = strong ? 'Strongly Supported' : supported ? 'Supported' : momentumOpposes ? (momentumBand === 'Strong' ? 'Rejected' : 'Opposed') : 'Insufficient Evidence';

      const executable = supported
        ? await executableContractCount(db, String(signal.symbol).toUpperCase(), direction === 'bearish' ? 'PUT' : 'CALL')
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
      const contextAdjustment = Math.min(6, contextSupportCount * 2);
      const swingConfidence = supported
        ? Math.round(clamp(priceScore * 0.35 + momentumScore * 0.45 + rrScore * 0.20 + contextAdjustment, 50, 92))
        : Number(signal.confidence_score ?? 0);

      const noTradeReason = supported
        ? null
        : !priceDirectional
          ? 'Short-horizon price action has not established a usable directional swing lean.'
          : momentumOpposes
            ? `Momentum is ${momentumBand.toLowerCase()} and opposes the ${direction} price direction.`
            : !momentumAgrees
              ? `Price action leans ${direction}, but momentum is not yet Moderate-or-Strong in the same direction.`
              : !frame.valid
                ? 'Direction and momentum agree, but the 1–5 day target/invalidation frame is not currently usable.'
                : participationStrongOppose
                  ? 'Strong participation evidence contradicts the proposed short-horizon direction.'
                  : tradeBlockers.join(' ') || 'The swing setup does not currently satisfy the suggestion gate.';

      const factors = Array.isArray(score.factors) ? score.factors : [];
      for (const factor of factors) {
        if (factor.factor === 'price_trend') {
          factor.signed_score = Math.abs(priceOrientation);
          factor.raw_score = Math.abs(priceOrientation);
          factor.strength_band = priceBand;
          factor.thesis_vote = priceBand === 'Moderate' || priceBand === 'Strong' ? 'SUPPORT' : 'ABSTAIN';
        }
        if (factor.factor === 'momentum') {
          const relative = Math.sign(momentumOrientation) === Math.sign(priceOrientation)
            ? Math.abs(momentumOrientation)
            : -Math.abs(momentumOrientation);
          factor.signed_score = relative;
          factor.raw_score = Math.abs(relative);
          factor.strength_band = momentumBand;
          factor.thesis_vote = momentumBand === 'Moderate' || momentumBand === 'Strong'
            ? relative > 0 ? 'SUPPORT' : 'OPPOSE'
            : 'ABSTAIN';
        }
      }

      score.factors = factors;
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
        swing_reward_risk_ratio: frame.ratio,
      };
      score.historical_evidence_policy = {
        holding_period: '1–5 days',
        setup_class: setup,
        core_evidence: ['short_term_price_direction', 'momentum_alignment', 'tactical_target_invalidation'],
        calibration_status: 'setup_tagged; brokerage-history replay classification pending',
      };
      score.v59_decision = {
        mode: reclassifyOnly ? 'reclassify_stored_evidence' : 'fresh_evidence_then_classify',
        price_direction: direction,
        price_band: priceBand,
        momentum_band: momentumBand,
        momentum_agrees: momentumAgrees,
        tactical_frame_valid: frame.valid,
        context_confirmation_count: contextSupportCount,
        executable_contracts: executable,
        note: 'Participation, market, options and news are context/confirmation families for the 1–5 day lane. Missing context does not veto a valid price+momentum swing.',
      };

      const { error: updateError } = await db.from('signals').update({
        direction,
        strategy: supported ? 'directional option' : 'No Trade',
        confidence_score: swingConfidence,
        target_price: frame.target,
        invalidation_level: frame.invalidation,
        no_trade_reason: noTradeReason,
        score_breakdown: score,
        engine_version: ENGINE_VERSION,
      }).eq('id', signal.id);
      if (updateError) throw updateError;
      updatedCount++;

      if (supported) {
        const { error: activeError } = await db.from('active_analyses').upsert({
          user_id: user.id,
          symbol: String(signal.symbol).toUpperCase(),
          signal_id: signal.id,
          status: 'active',
          direction,
          holding_period: '1–5 days',
          analyzed_at: signal.generated_at ?? new Date().toISOString(),
          valid_until: new Date(Date.now() + 5 * 86400000).toISOString(),
          suggested_expiration: signal.suggested_expiration ?? null,
          target_price: frame.target,
          invalidation_level: frame.invalidation,
          opportunity_score: signal.opportunity_score,
          confidence_score: swingConfidence,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,symbol' });
        if (activeError) throw activeError;
      } else {
        await db.from('active_analyses')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('symbol', String(signal.symbol).toUpperCase())
          .eq('signal_id', signal.id);
      }
    }

    return json({
      ...upstreamResult,
      run_id: runId,
      signals: upstreamResult.signals ?? signals.length,
      updates: updatedCount,
      engine_version: ENGINE_VERSION,
      mode: reclassifyOnly ? 'reclassify' : 'fresh',
      note: reclassifyOnly
        ? 'Stored evidence was reclassified with TradeCycle 5.9. No market, news, or options provider refresh was run.'
        : 'Fresh evidence was produced by the established evidence engine and classified with the TradeCycle 5.9 swing gate.',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
