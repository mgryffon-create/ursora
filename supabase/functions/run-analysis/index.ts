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
      const opportunity = Math.max(0, Math.min(100, Math.round((Math.abs(change) * 8) + (Math.abs(momentum - 50) * 1.2) + 45)));
      const confidence = Math.max(0, Math.min(100, Math.round(40 + Math.abs(momentum - 50) + Math.min(25, Math.abs(change) * 5))));
      const factors = [
        { factor: 'price_change', label: 'Price change', raw_score: Math.min(100, Math.abs(change) * 12), base_weight: .35, effective_weight: .35, weight_change: 0, contribution: Math.min(35, Math.abs(change) * 4.2), effect: 'INCREASED', explanation: 'Uses the latest stored percentage move.' },
        { factor: 'momentum', label: 'Momentum', raw_score: momentum, base_weight: .35, effective_weight: .35, weight_change: 0, contribution: momentum * .35, effect: momentum >= 50 ? 'INCREASED' : 'DECREASED', explanation: 'Uses the latest stored momentum score.' },
      ];
      created.push({
        run_id: runId, symbol, trading_day: new Date().toISOString().slice(0,10), direction,
        strategy: direction === 'neutral' ? 'watch' : 'directional option', confidence_score: confidence,
        opportunity_score: opportunity, risk_level: Number(q.iv_rank ?? 0) > 70 ? 'High' : 'Moderate',
        holding_period: '1–5 days', catalyst_summary: null,
        no_trade_reason: direction === 'neutral' ? 'Stored inputs did not establish a directional edge.' : null,
        stock_price_at_generation: q.price, suggested_expiration: null, suggested_strike: q.price,
        score_breakdown: { factors, raw: { change_pct: change, momentum_score: momentum } },
        weights: { effective: { price_change: .35, momentum: .35 }, base: { price_change: .35, momentum: .35 }, decisions: ['Independent baseline scoring uses only stored market rows.'] },
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
