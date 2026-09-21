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
      // Confidence is intentionally capped while the engine has only quote-derived inputs.
      const confidence = Math.max(0, Math.min(50, Math.round(25 + (agreement * 0.25))));

      const factors = [
        {
          factor: 'price_change',
          label: 'Price movement',
          raw_score: priceStrength,
          base_weight: .35,
          effective_weight: .35,
          weight_change: 0,
          contribution: priceEvidence * .35,
          effect: priceEvidence > 0 ? 'INCREASED' : priceEvidence < 0 ? 'DECREASED' : 'NEUTRAL',
          explanation: `The latest stored price move is ${change >= 0 ? '+' : ''}${change.toFixed(2)}%. This measures the magnitude of the move and whether it agrees with the proposed direction.`,
        },
        {
          factor: 'momentum',
          label: 'Momentum',
          raw_score: momentumStrength,
          base_weight: .35,
          effective_weight: .35,
          weight_change: 0,
          contribution: momentumEvidence * .35,
          effect: momentumEvidence > 0 ? 'INCREASED' : momentumEvidence < 0 ? 'DECREASED' : 'NEUTRAL',
          explanation: `The stored momentum reading is ${momentum.toFixed(1)}/100. Readings above 50 support bullish direction; readings below 50 support bearish direction.`,
        },
      ];
      created.push({
        run_id: runId, symbol, trading_day: new Date().toISOString().slice(0,10), direction,
        strategy: direction === 'neutral' || opportunity < 55 ? 'No Trade' : 'directional option', confidence_score: confidence,
        opportunity_score: opportunity, risk_level: Number(q.iv_rank ?? 0) > 70 ? 'High' : 'Moderate',
        holding_period: '1–5 days', catalyst_summary: null,
        no_trade_reason: direction === 'neutral' ? 'Price movement and momentum do not establish a consistent directional thesis.' : opportunity < 55 ? 'The available quote-derived evidence does not meet the minimum opportunity threshold. Additional options, catalyst, market-alignment, liquidity and risk data are required before a contract should be considered.' : null,
        stock_price_at_generation: q.price, suggested_expiration: null, suggested_strike: null,
        score_breakdown: { factors, raw: { change_pct: change, momentum_score: momentum } },
        weights: {
          effective: { price_change: .35, momentum: .35 },
          base: { price_change: .35, momentum: .35 },
          decisions: [
            `Price movement: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% in the latest stored quote; ${priceSupportsDirection ? 'aligned with' : 'opposed to'} the proposed ${direction} direction.`,
            `Momentum: ${momentum.toFixed(1)}/100; ${momentumSupportsDirection ? 'aligned with' : 'opposed to'} the proposed ${direction} direction.`,
            'This is a provisional quote-only score. Options activity, catalysts, news, broader market alignment, liquidity, risk/reward and cross-factor agreement are not yet represented in this run.',
            'Because those inputs are absent, confidence is capped at 50 and no option strike or expiration is inferred from the underlying price.',
          ],
        },
        regime: snapshot?.regime ?? 'Mixed', regime_explanation: 'Latest stored market snapshot.', engine_version: 'independent-1', is_demo: Boolean(q.is_demo ?? true), generated_at: started,
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
