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

function inferDirection(trade: AnyRow): { direction: 'bullish' | 'bearish' | 'neutral'; basis: string } {
  const explicit = String(trade.direction ?? '').toLowerCase();
  if (explicit === 'bullish' || explicit === 'bearish') {
    return { direction: explicit, basis: 'Stored trade direction' };
  }

  const optionType = String(trade.option_type ?? '').toUpperCase();
  const side = String(trade.side ?? trade.position_side ?? '').toLowerCase();

  if (optionType === 'CALL') {
    return { direction: side === 'short' ? 'bearish' : 'bullish', basis: 'Option position structure' };
  }
  if (optionType === 'PUT') {
    return { direction: side === 'short' ? 'bullish' : 'bearish', basis: 'Option position structure' };
  }
  if (side === 'long' || side === 'buy') return { direction: 'bullish', basis: 'Long underlying exposure' };
  if (side === 'short' || side === 'sell') return { direction: 'bearish', basis: 'Short underlying exposure' };

  return { direction: 'neutral', basis: 'Position structure does not reveal a directional thesis' };
}

function isOpen(trade: AnyRow): boolean {
  return String(trade.result ?? 'open').toLowerCase() === 'open' && !trade.closed_at && !trade.exit_at;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const tradeId = n(body.trade_id);

    let query = db.from('paper_trades').select('*').eq('user_id', user.id);
    if (tradeId !== null) query = query.eq('id', tradeId);
    const { data: trades, error: tradeError } = await query.order('created_at', { ascending: false }).limit(500);
    if (tradeError) throw tradeError;

    let monitored = 0;
    let reviewed = 0;
    let inferred = 0;

    for (const trade of (trades ?? []) as AnyRow[]) {
      const inferredThesis = inferDirection(trade);
      const externalOrigin = !trade.signal_id || String(trade.origin ?? '') !== 'MATADOR_SUPPORTED';
      const mode = isOpen(trade) ? 'monitoring' : 'review';

      if (externalOrigin && !trade.inferred_thesis_direction) inferred++;

      const { data: latestSignals, error: signalError } = await db
        .from('signals')
        .select('*')
        .eq('symbol', String(trade.symbol).toUpperCase())
        .order('generated_at', { ascending: false })
        .limit(1);
      if (signalError) throw signalError;

      const latest = (latestSignals ?? [])[0] as AnyRow | undefined;
      const latestDirection = String(latest?.direction ?? 'neutral').toLowerCase();
      const latestSupport = n(latest?.score_breakdown?.thesis_support);
      const latestAgreement = n(latest?.score_breakdown?.agreement_score);
      const latestState = String(latest?.score_breakdown?.thesis_state ?? 'Preliminary');

      let relativeSupport = latestSupport;
      let relativeState = latestState;

      if (inferredThesis.direction !== 'neutral' && latest) {
        if (latestDirection !== inferredThesis.direction && latestDirection !== 'neutral') {
          relativeSupport = latestSupport === null ? null : Math.max(0, 100 - latestSupport);
          relativeState = relativeSupport !== null && relativeSupport < 35 ? 'Rejected' : 'Unsupported';
        } else if (latestDirection === 'neutral') {
          relativeState = 'Unsupported';
        }
      }

      if (mode === 'monitoring') {
        monitored++;
        await db.from('paper_trades').update({
          thesis_mode: 'monitoring',
          inferred_thesis_direction: inferredThesis.direction,
          thesis_inference_basis: inferredThesis.basis,
          thesis_status: relativeState,
          thesis_support: relativeSupport,
          thesis_agreement: latestAgreement,
          thesis_last_checked_at: new Date().toISOString(),
        }).eq('id', trade.id).eq('user_id', user.id);

        await db.from('tradecycle_thesis_events').insert({
          user_id: user.id,
          trade_id: trade.id,
          signal_id: latest?.id ?? null,
          event_type: externalOrigin ? 'external_position_monitor' : 'ursora_position_monitor',
          thesis_direction: inferredThesis.direction,
          thesis_state: relativeState,
          thesis_support: relativeSupport,
          directional_agreement: latestAgreement,
          underlying_price: n(latest?.stock_price_at_generation),
          evidence: {
            inference_basis: inferredThesis.basis,
            latest_tradecycle_direction: latestDirection,
            origin: trade.origin ?? null,
          },
        });
      } else {
        reviewed++;
        const tradeResult = String(trade.result ?? 'closed');
        const validationStatus =
          relativeState === 'Supported' || relativeState === 'Strongly Supported'
            ? 'directionally_validated'
            : relativeState === 'Rejected'
              ? 'directionally_invalidated'
              : 'directionally_ambiguous';

        const summary =
          `Closed trade review: inferred ${inferredThesis.direction} thesis was ${validationStatus.replaceAll('_', ' ')} by the latest available TradeCycle evidence. Execution outcome: ${tradeResult}. Directional thesis validation and profit/loss are recorded separately.`;

        await db.from('paper_trades').update({
          thesis_mode: 'review',
          inferred_thesis_direction: inferredThesis.direction,
          thesis_inference_basis: inferredThesis.basis,
          thesis_status: relativeState,
          thesis_support: relativeSupport,
          thesis_agreement: latestAgreement,
          thesis_last_checked_at: new Date().toISOString(),
          thesis_review_status: validationStatus,
          thesis_review_summary: summary,
        }).eq('id', trade.id).eq('user_id', user.id);

        await db.from('tradecycle_thesis_events').insert({
          user_id: user.id,
          trade_id: trade.id,
          signal_id: latest?.id ?? null,
          event_type: 'closed_trade_review',
          thesis_direction: inferredThesis.direction,
          thesis_state: relativeState,
          thesis_support: relativeSupport,
          directional_agreement: latestAgreement,
          underlying_price: n(latest?.stock_price_at_generation),
          evidence: {
            inference_basis: inferredThesis.basis,
            execution_result: tradeResult,
            realized_pl: n(trade.realized_pl),
            return_pct: n(trade.return_pct),
            validation_status: validationStatus,
          },
        });

        const existingObs = await db
          .from('behavioral_observations')
          .select('id')
          .eq('trade_id', trade.id)
          .eq('observation_type', 'thesis_review')
          .limit(1);

        if (!existingObs.error && !(existingObs.data ?? []).length) {
          await db.from('behavioral_observations').insert({
            user_id: user.id,
            observation_type: 'thesis_review',
            category: 'thesis_validation',
            statement: summary,
            baseline_value: null,
            current_value: relativeSupport,
            deviation_pct: null,
            unit: 'thesis_support_pct',
            sample_size: 1,
            observation_period: 'single closed trade',
            confidence_label: 'INSUFFICIENT DATA',
            construct_key: 'thesis_validation',
            evidence_trade_ids: [trade.id],
            severity: 'LOW',
            model_version: 'tradecycle-4',
            trade_id: trade.id,
            formula: 'Closed-trade thesis review compares the inferred entry direction with the latest available TradeCycle directional evidence; execution P/L is stored separately and does not define thesis validity.',
          });
        }
      }
    }

    return json({ success: true, trades: trades?.length ?? 0, inferred, monitored, reviewed });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
