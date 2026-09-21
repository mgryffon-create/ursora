import { AuthError, requireUser } from '../_shared/auth.ts';
import { handleOptions, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const kind = typeof body.kind === 'string' ? body.kind : 'manual';
    const runId = crypto.randomUUID();
    const started = new Date().toISOString();

    const { data: snapshot } = await db.from('market_snapshots').select('regime').order('as_of', { ascending: false }).limit(1).maybeSingle();
    const { data: latestQuotes, error: quoteError } = await db.from('quotes').select('*').order('as_of', { ascending: false }).limit(500);
    if (quoteError) throw quoteError;

    const bySymbol = new Map<string, Record<string, any>>();
    for (const q of latestQuotes ?? []) if (!bySymbol.has(q.symbol)) bySymbol.set(q.symbol, q);

    const created: Record<string, any>[] = [];
    for (const [symbol, q] of bySymbol) {
      const momentum = Number(q.momentum_score ?? 50);
      const change = Number(q.change_pct ?? 0);
      const trend = String(q.trend ?? '').toLowerCase();
      const bullish = change > 0 || trend.includes('up') || momentum >= 55;
      const bearish = change < 0 || trend.includes('down') || momentum <= 45;
      const direction = bullish && !bearish ? 'bullish' : bearish && !bullish ? 'bearish' : 'neutral';
      // Quote-only provisional scoring. The score is derived directly from the factors shown in the UI.
      // No fixed floor is added: weak evidence must remain weak evidence.
      const priceStrength = Math.max(0, Math.min(100, Math.abs(change) * 25));
      const momentumStrength = Math.max(0, Math.min(100, Math.abs(momentum - 50) * 4));

      const priceSupportsDirection =
        direction === 'bullish' ? change > 0 :
        direction === 'bearish' ? change < 0 : false;
      const momentumSupportsDirection =
        direction === 'bullish' ? momentum > 50 :
        direction === 'bearish' ? momentum < 50 : false;

      const priceEvidence = direction === 'neutral' ? 0 : (priceSupportsDirection ? priceStrength : -priceStrength);
      const momentumEvidence = direction === 'neutral' ? 0 : (momentumSupportsDirection ? momentumStrength : -momentumStrength);

      // With only two quote-derived factors available, normalize their displayed 35% + 35% weights
      // so the resulting opportunity score is mathematically reconstructable from the factor table.
      const displayedWeightTotal = 0.70;
      const weightedContribution = (priceEvidence * 0.35) + (momentumEvidence * 0.35);
      const opportunity = Math.max(0, Math.min(100, Math.round(weightedContribution / displayedWeightTotal)));

      const agreement = direction === 'neutral'
        ? 0
        : (priceSupportsDirection === momentumSupportsDirection ? 100 : 0);

      // Thesis classification is separate from the numeric score.
      // Quote-only analysis covers 2 of the 8 primary evidence families URSORA expects.
      const evidenceFamilies = {
        price_trend: true,
        momentum: true,
        market_alignment: false,
        options_market: false,
        catalysts_news: false,
        liquidity: false,
        risk_reward: false,
        cross_factor_agreement: false,
      };
      const availableFamilies = Object.values(evidenceFamilies).filter(Boolean).length;
      const totalFamilies = Object.keys(evidenceFamilies).length;
      const evidenceCompleteness = Math.round((availableFamilies / totalFamilies) * 100);

      // A thesis cannot be classified as supported from only two evidence families,
      // regardless of the numeric score produced by those available inputs.
      let thesisState: 'Rejected' | 'Unsupported' | 'Preliminary' | 'Supported' | 'Strongly Supported';
      if (direction === 'neutral' || agreement === 0) thesisState = 'Unsupported';
      else if (availableFamilies < 4) thesisState = 'Preliminary';
      else if (opportunity >= 75) thesisState = 'Strongly Supported';
      else if (opportunity >= 60) thesisState = 'Supported';
      else if (opportunity < 35) thesisState = 'Rejected';
      else thesisState = 'Unsupported';

      // Confidence combines agreement and data completeness. It is deliberately
      // constrained while major evidence families are unavailable.
      const confidence = Math.max(
        0,
        Math.min(100, Math.round((agreement * 0.55) + (evidenceCompleteness * 0.45))),
      );

      const factors = [
        {
          factor: 'price_change',
          label: 'Price movement',
          raw_score: priceStrength,
          base_weight: .35,
          effective_weight: .35,
          weight_change: 0,
          contribution: priceEvidence * .35,
          effect: Math.abs(priceEvidence) < 25 ? 'NEUTRAL' : priceEvidence > 0 ? 'INCREASED' : priceEvidence < 0 ? 'DECREASED' : 'NEUTRAL',
          explanation: Math.abs(priceEvidence) < 25
            ? `The latest stored price move is ${change >= 0 ? '+' : ''}${change.toFixed(2)}%. It is directionally aligned with the proposed trade, but the move is too small to count as meaningful confirmation.`
            : `The latest stored price move is ${change >= 0 ? '+' : ''}${change.toFixed(2)}%. Its magnitude provides meaningful evidence ${priceSupportsDirection ? 'in favor of' : 'against'} the proposed direction.`,
        },
        {
          factor: 'momentum',
          label: 'Momentum',
          raw_score: momentumStrength,
          base_weight: .35,
          effective_weight: .35,
          weight_change: 0,
          contribution: momentumEvidence * .35,
          effect: Math.abs(momentumEvidence) < 25 ? 'NEUTRAL' : momentumEvidence > 0 ? 'INCREASED' : momentumEvidence < 0 ? 'DECREASED' : 'NEUTRAL',
          explanation: Math.abs(momentumEvidence) < 25
            ? `The stored momentum reading is ${momentum.toFixed(1)}/100. It leans toward the proposed direction, but not strongly enough to count as meaningful confirmation.`
            : `The stored momentum reading is ${momentum.toFixed(1)}/100 and provides ${momentumSupportsDirection ? 'supporting' : 'opposing'} evidence for the proposed direction.`,
        },
      ];
      created.push({
        run_id: runId, symbol, trading_day: new Date().toISOString().slice(0,10), direction,
        strategy: thesisState === 'Supported' || thesisState === 'Strongly Supported' ? 'directional option' : 'No Trade', confidence_score: confidence,
        opportunity_score: opportunity, risk_level: Number(q.iv_rank ?? 0) > 70 ? 'High' : 'Moderate',
        holding_period: '1–5 days', catalyst_summary: null,
        no_trade_reason: thesisState === 'Preliminary' ? 'The available evidence is directionally aligned but incomplete. URSORA requires confirmation from additional independent evidence categories before classifying the thesis as supported.' : thesisState === 'Unsupported' ? 'The available evidence does not establish a sufficiently consistent directional thesis.' : thesisState === 'Rejected' ? 'The available evidence materially contradicts the proposed thesis.' : null,
        stock_price_at_generation: q.price, suggested_expiration: null, suggested_strike: null,
        score_breakdown: {
          factors,
          raw: { change_pct: change, momentum_score: momentum },
          thesis_state: thesisState,
          evidence_completeness: evidenceCompleteness,
          evidence_families: evidenceFamilies,
          available_families: availableFamilies,
          total_families: totalFamilies,
          agreement_score: agreement,
        },
        weights: {
          effective: { price_change: .35, momentum: .35 },
          base: { price_change: .35, momentum: .35 },
          decisions: [
            `Price movement: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% in the latest stored quote; ${priceSupportsDirection ? 'aligned with' : 'opposed to'} the proposed ${direction} direction.`,
            `Momentum: ${momentum.toFixed(1)}/100; ${momentumSupportsDirection ? 'aligned with' : 'opposed to'} the proposed ${direction} direction.`,
            `Thesis classification: ${thesisState}. Evidence completeness is ${evidenceCompleteness}% (${availableFamilies} of ${totalFamilies} primary evidence categories available).`,
            'Options activity, catalysts/news, broader market alignment, liquidity, risk/reward and cross-factor agreement are not yet represented in this run.',
            'A thesis is not classified as Supported until multiple independent evidence categories are available and materially agree. No option strike or expiration is inferred from the underlying stock price.'
          ],
        },
        regime: snapshot?.regime ?? 'Mixed', regime_explanation: 'Latest stored market snapshot.', engine_version: 'tradecycle-2', is_demo: Boolean(q.is_demo ?? true), generated_at: started,
      });
    }

    let signalCount = 0;
    if (created.length) {
      const { error } = await db.from('signals').insert(created); if (error) throw error;
      signalCount = created.length;
    }
    const { error: runError } = await db.from('analysis_runs').insert({
      run_id: runId, kind, trading_day: new Date().toISOString().slice(0,10), signals_generated: signalCount,
      updates_emitted: 0, feed_events: 0, regime: snapshot?.regime ?? null,
      notes: signalCount ? `Independent baseline analysis completed for authenticated user ${user.id}.` : 'No stored quotes were available; no signals were invented.',
      started_at: started, finished_at: new Date().toISOString(),
    });
    if (runError) throw runError;
    return json({ success: true, signals: signalCount, updates: 0, run_id: runId, note: signalCount ? undefined : 'No stored quote data available.' });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
