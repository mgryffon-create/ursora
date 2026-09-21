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

type AnyRow = Record<string, any>;

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, value));
}

function daysTo(expiration: string): number {
  const end = new Date(expiration + 'T20:00:00Z').getTime();
  return (end - Date.now()) / 86400000;
}

function liquidityScore(row: AnyRow): number {
  const spread = n(row.spread_pct);
  const oi = n(row.open_interest) ?? 0;
  const volume = n(row.volume) ?? 0;
  const spreadPart = spread === null ? 20 : spread <= 5 ? 100 : spread <= 10 ? 75 : spread <= 20 ? 40 : 5;
  const oiPart = oi >= 1000 ? 100 : oi >= 500 ? 85 : oi >= 100 ? 65 : oi >= 20 ? 35 : 10;
  const volumePart = volume >= 500 ? 100 : volume >= 100 ? 80 : volume >= 20 ? 55 : volume >= 5 ? 30 : 10;
  return Math.round(spreadPart * 0.45 + oiPart * 0.35 + volumePart * 0.20);
}

const profiles = [
  { name: 'Conservative', targetDelta: 0.62, targetDte: 35 },
  { name: 'Balanced', targetDelta: 0.50, targetDte: 28 },
  { name: 'Aggressive', targetDelta: 0.35, targetDte: 21 },
] as const;

function scoreContract(row: AnyRow, targetDelta: number, targetDte: number): number {
  const delta = Math.abs(n(row.delta) ?? 0);
  const dte = daysTo(String(row.expiration));
  const liq = liquidityScore(row);
  const deltaScore = clamp(100 - Math.abs(delta - targetDelta) * 260);
  const dteScore = clamp(100 - Math.abs(dte - targetDte) * 3.2);
  return Math.round(deltaScore * 0.45 + liq * 0.40 + dteScore * 0.15);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));

    let runId = typeof body.run_id === 'string' ? body.run_id : null;
    if (!runId) {
      const { data: run, error } = await db
        .from('analysis_runs')
        .select('run_id')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      runId = run?.run_id ?? null;
    }
    if (!runId) return json({ success: true, candidates: 0, risks: 0, note: 'No analysis run is available.' });

    const { data: signals, error: signalError } = await db
      .from('signals')
      .select('*')
      .eq('run_id', runId);
    if (signalError) throw signalError;

    const signalRows = signals ?? [];
    if (!signalRows.length) return json({ success: true, run_id: runId, candidates: 0, risks: 0 });

    const symbols = [...new Set(signalRows.map((s: AnyRow) => String(s.symbol).toUpperCase()))];
    const { data: options, error: optionError } = await db
      .from('option_market_snapshots')
      .select('*')
      .in('underlying_symbol', symbols)
      .gte('retrieved_at', new Date(Date.now() - 36 * 3600000).toISOString())
      .order('retrieved_at', { ascending: false });
    if (optionError) throw optionError;

    const optionRows = options ?? [];
    const candidates: AnyRow[] = [];
    const risks: AnyRow[] = [];

    for (const signal of signalRows as AnyRow[]) {
      const thesisState = String(signal.score_breakdown?.thesis_state ?? '');
      const supported = thesisState === 'Supported' || thesisState === 'Strongly Supported';
      const optionType = String(signal.direction).toLowerCase() === 'bearish' ? 'PUT' : 'CALL';
      const stockPrice = n(signal.stock_price_at_generation);

      const pool = optionRows.filter((row: AnyRow) => {
        if (String(row.underlying_symbol).toUpperCase() !== String(signal.symbol).toUpperCase()) return false;
        if (String(row.option_type).toUpperCase() !== optionType) return false;
        const dte = daysTo(String(row.expiration));
        const bid = n(row.bid);
        const ask = n(row.ask);
        return dte >= 7 && dte <= 60 && bid !== null && ask !== null && ask >= bid && ask > 0;
      });

      if (supported && pool.length) {
        for (let rank = 0; rank < profiles.length; rank++) {
          const profile = profiles[rank];
          const chosen = [...pool]
            .map((row: AnyRow) => ({ row, score: scoreContract(row, profile.targetDelta, profile.targetDte) }))
            .sort((a, b) => b.score - a.score)[0];

          if (!chosen) continue;
          const row = chosen.row;
          const bid = n(row.bid);
          const ask = n(row.ask);
          const mid = bid !== null && ask !== null ? (bid + ask) / 2 : n(row.price);
          const strike = n(row.strike);
          if (strike === null) continue;

          const breakEven = mid === null
            ? null
            : optionType === 'CALL'
              ? strike + mid
              : strike - mid;

          const maxLoss = mid === null ? null : mid * 100;
          const targetStock = n(signal.target_price);
          const targetValue = targetStock === null || mid === null
            ? null
            : optionType === 'CALL'
              ? Math.max(0, targetStock - strike)
              : Math.max(0, strike - targetStock);

          const liq = liquidityScore(row);
          const flags: string[] = [];
          const spread = n(row.spread_pct);
          const oi = n(row.open_interest) ?? 0;
          if (spread !== null && spread > 10) flags.push('wide spread');
          if (oi < 100) flags.push('limited open interest');
          if ((n(row.volume) ?? 0) < 20) flags.push('limited daily volume');

          candidates.push({
            signal_id: signal.id,
            profile: profile.name,
            rank: rank + 1,
            symbol: String(row.option_symbol),
            option_type: optionType.toLowerCase(),
            strike,
            expiration: row.expiration,
            bid,
            ask,
            mid,
            volume: Math.round(n(row.volume) ?? 0),
            open_interest: Math.round(n(row.open_interest) ?? 0),
            implied_volatility: n(row.implied_volatility),
            delta: n(row.delta),
            gamma: n(row.gamma),
            theta: n(row.theta),
            vega: n(row.vega),
            spread_pct: spread,
            liquidity_score: liq,
            selection_score: chosen.score,
            break_even: breakEven,
            est_premium: maxLoss,
            max_loss: maxLoss,
            target_value: targetValue,
            prob_thesis_pct: n(signal.confidence_score),
            tradeoff: profile.name === 'Conservative'
              ? 'Higher-delta contract with more intrinsic exposure and typically greater premium at risk.'
              : profile.name === 'Aggressive'
                ? 'Lower-delta contract with lower premium but greater sensitivity to timing and directional accuracy.'
                : 'Balances directional sensitivity, time to expiration, liquidity, and premium exposure.',
            flags,
          });
        }
      }

      const chosenForRisk = candidates.find((c) => c.signal_id === signal.id && c.profile === 'Balanced') ?? null;
      const premiumAtRisk = n(chosenForRisk?.max_loss);
      const theta = n(chosenForRisk?.theta);
      const iv = n(chosenForRisk?.implied_volatility);
      const liqScore = n(chosenForRisk?.liquidity_score);
      const blockers: string[] = Array.isArray(signal.score_breakdown?.blockers)
        ? signal.score_breakdown.blockers.map(String)
        : [];

      const whyItCouldFail = [
        ...blockers,
        signal.direction === 'bullish'
          ? 'Price could fail to hold support or broader market conditions could turn against the bullish thesis.'
          : signal.direction === 'bearish'
            ? 'Price could reclaim resistance or broader market conditions could turn against the bearish thesis.'
            : 'The directional evidence may remain too mixed to produce a durable move.',
        chosenForRisk
          ? 'Option value can decline from time decay or volatility contraction even when the underlying moves only modestly.'
          : 'No contract passed the current selection rules, so execution quality cannot yet be established.',
      ];

      risks.push({
        signal_id: signal.id,
        bull_case: signal.direction === 'bullish'
          ? `Price holds above the analysis support level and advances toward ${signal.target_price ?? 'the next resistance area'}.`
          : 'Bullish price expansion would invalidate or weaken the bearish trade structure.',
        base_case: supported
          ? `The ${signal.direction} thesis remains valid while price respects the invalidation level and the evidence categories remain aligned.`
          : 'The evidence remains incomplete or insufficient; no trade should be assumed until the thesis qualifies as supported.',
        bear_case: signal.direction === 'bearish'
          ? `Price remains below resistance and declines toward ${signal.target_price ?? 'the next support area'}.`
          : 'A break below support would weaken or invalidate the bullish trade structure.',
        premium_at_risk: premiumAtRisk,
        break_even: n(chosenForRisk?.break_even),
        theta_per_day: theta === null ? null : theta * 100,
        iv_risk: iv === null
          ? 'Implied-volatility risk is not available.'
          : iv >= 0.60
            ? 'Elevated implied volatility increases premium and volatility-contraction risk.'
            : 'Implied volatility is not currently flagged as elevated by the TradeCycle threshold.',
        liquidity_risk: liqScore === null
          ? 'Contract liquidity has not been established.'
          : liqScore >= 70
            ? 'Selected contract liquidity is acceptable under current rules.'
            : 'Selected contract liquidity is below the preferred threshold; fills and exits may be less efficient.',
        catalyst_risk: blockers.some((x) => x.toLowerCase().includes('earnings'))
          ? 'A scheduled earnings event falls inside the expected holding period.'
          : signal.catalyst_summary
            ? `Monitor the identified market event: ${signal.catalyst_summary}`
            : 'No specific near-term event risk is currently stored.',
        expected_move_pct: n(signal.expected_move_pct),
        time_remaining: chosenForRisk?.expiration
          ? `${Math.max(0, Math.round(daysTo(String(chosenForRisk.expiration))))} days to expiration`
          : signal.holding_period ?? null,
        invalidation_level: n(signal.invalidation_level),
        why_it_could_fail: whyItCouldFail,
      });
    }

    const signalIds = signalRows.map((s: AnyRow) => s.id);
    if (signalIds.length) {
      const { error: deleteCandidatesError } = await db.from('contract_candidates').delete().in('signal_id', signalIds);
      if (deleteCandidatesError) throw deleteCandidatesError;
      const { error: deleteRiskError } = await db.from('risk_assessments').delete().in('signal_id', signalIds);
      if (deleteRiskError) throw deleteRiskError;
    }

    if (candidates.length) {
      const { error } = await db.from('contract_candidates').insert(candidates);
      if (error) throw error;
    }

    if (risks.length) {
      const { error } = await db.from('risk_assessments').insert(risks);
      if (error) throw error;
    }

    return json({
      success: true,
      run_id: runId,
      candidates: candidates.length,
      risks: risks.length,
      supported_signals: signalRows.filter((s: AnyRow) => ['Supported', 'Strongly Supported'].includes(String(s.score_breakdown?.thesis_state ?? ''))).length,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
