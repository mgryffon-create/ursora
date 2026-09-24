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

function handleOptions(req: Request): Response | null {
  return req.method === 'OPTIONS'
    ? new Response('ok', { headers: corsHeaders })
    : null;
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
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new AuthError('Authentication required.', 401);
  const token = authHeader.slice(7).trim();
  if (!token) throw new AuthError('Authentication required.', 401);

  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new AuthError('Invalid or expired session.', 401);
  return { user, db };
}

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;
const money = (v: unknown) => {
  const x = n(v);
  return x === null ? 'unavailable' : `$${x.toFixed(2)}`;
};

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function factorSummary(signal: any) {
  const factors = asArray(signal?.score_breakdown?.factors);
  return factors
    .map((f: any) => ({
      label: String(f?.label ?? f?.factor ?? 'factor'),
      factor: String(f?.factor ?? ''),
      contribution: n(f?.contribution) ?? 0,
      weight: (n(f?.effective_weight) ?? 0) * 100,
      band: String(f?.strength_band ?? ''),
      vote: String(f?.thesis_vote ?? ''),
      explanation: String(f?.explanation ?? ''),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const question = String(body.question ?? '').trim();
    const ql = question.toLowerCase();
    const symbol = body.symbol ? String(body.symbol).toUpperCase() : null;
    const signalId = body.signalId ? Number(body.signalId) : null;

    let signal: any = null;
    if (signalId) ({ data: signal } = await db.from('signals').select('*').eq('id', signalId).maybeSingle());
    if (!signal && symbol) {
      ({ data: signal } = await db.from('signals').select('*').eq('symbol', symbol).order('generated_at', { ascending: false }).limit(1).maybeSingle());
    }
    if (!signal) {
      ({ data: signal } = await db.from('signals').select('*').order('generated_at', { ascending: false }).limit(1).maybeSingle());
    }

    const sym = symbol ?? signal?.symbol ?? null;
    const [{ data: news }, { data: quote }, { data: risk }, { data: contracts }] = await Promise.all([
      sym ? db.from('news_items').select('headline,source_name,published_at,sentiment,impact').eq('symbol', sym).order('published_at', { ascending: false }).limit(5) : Promise.resolve({ data: [] as any[] }),
      sym ? db.from('quotes').select('*').eq('symbol', sym).order('retrieved_at', { ascending: false }).order('as_of', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null as any }),
      signal?.id ? db.from('risk_assessments').select('*').eq('signal_id', signal.id).maybeSingle() : Promise.resolve({ data: null as any }),
      signal?.id ? db.from('contract_candidates').select('*').eq('signal_id', signal.id).order('rank', { ascending: true }).limit(10) : Promise.resolve({ data: [] as any[] }),
    ]);

    const tables: string[] = [];
    if (signal) tables.push('signals');
    if (quote) tables.push('quotes');
    if (news?.length) tables.push('news_items');
    if (risk) tables.push('risk_assessments');
    if (contracts?.length) tables.push('contract_candidates');
    if (!tables.length) {
      return json({ answer: 'DATA UNAVAILABLE — there is not enough stored URSORA data to answer this without guessing.', contextUsed: { tables: [] } });
    }

    const thesisState = String(signal?.score_breakdown?.thesis_state ?? 'unavailable');
    const factors = factorSummary(signal);
    const topFactor = factors[0] ?? null;
    const blockers = [
      ...asArray(signal?.score_breakdown?.thesis_blockers).map(String),
      ...asArray(signal?.score_breakdown?.trade_blockers).map(String),
    ];
    const balanced = (contracts ?? []).find((c: any) => String(c.profile).toLowerCase() === 'balanced') ?? contracts?.[0] ?? null;
    const aggressive = (contracts ?? []).find((c: any) => String(c.profile).toLowerCase() === 'aggressive') ?? null;

    let answer = '';

    if (/greatest effect|biggest effect|largest effect|most effect|drove.*score|factor.*score/.test(ql)) {
      if (!topFactor) {
        answer = `${sym ?? 'This setup'} does not have factor-level score data stored for this run.`;
      } else {
        const direction = topFactor.contribution > 0 ? 'increased' : topFactor.contribution < 0 ? 'reduced' : 'did not materially change';
        answer = `${topFactor.label} had the largest absolute contribution to this run's score. It ${direction} the score by about ${Math.abs(topFactor.contribution).toFixed(1)} weighted points, with ${topFactor.band || 'unclassified'} evidence and a ${topFactor.weight.toFixed(1)}% effective weight. ${topFactor.explanation || ''}`.trim();
      }
    } else if (/strongest reasons not to take|reasons not to take|why.*not.*trade|avoid.*trade/.test(ql)) {
      const opposingFactors = factors
        .filter((factor) => factor.vote === 'OPPOSE')
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

      const reasons: string[] = [];
      for (const factor of opposingFactors.slice(0, 2)) {
        const weightText = factor.weight > 0 ? ` at ${factor.weight.toFixed(1)}% effective weight` : '';
        reasons.push(`${factor.label} is ${factor.band || 'meaningful'} opposing evidence${weightText}. ${factor.explanation}`.trim());
      }

      if (!contracts?.length && risk?.liquidity_risk) {
        reasons.push(String(risk.liquidity_risk));
      }

      if (!reasons.length && blockers.length) {
        reasons.push(...blockers.slice(0, 3));
      }

      if (!reasons.length && signal?.no_trade_reason) {
        reasons.push(String(signal.no_trade_reason));
      }

      // A headline is not automatically a reason against the trade. Only include
      // catalyst risk when the stored risk assessment explicitly characterizes it
      // as a risk rather than merely noting that an event exists.
      const catalystRisk = String(risk?.catalyst_risk ?? '').trim();
      if (
        catalystRisk &&
        !/monitor the identified market event/i.test(catalystRisk) &&
        reasons.length < 3
      ) {
        reasons.push(catalystRisk);
      }

      if (reasons.length) {
        answer = `The strongest reasons not to take ${sym ?? 'this setup'} are: ${reasons.slice(0, 3).join(' ')}`;
      } else {
        answer = `URSORA does not currently have a stored opposing evidence family or hard blocker for ${sym ?? 'this setup'}. The thesis state is ${thesisState}, but contract-specific execution quality still has to be satisfied before entry.`;
      }
    } else if (/no longer valid|invalidate|invalidation|what evidence would make/.test(ql)) {
      const level = n(signal?.invalidation_level);
      const direction = String(signal?.direction ?? '').toLowerCase();
      const priceCondition = level === null
        ? 'A price invalidation level is not stored for this run.'
        : direction === 'bullish'
          ? `A move below ${money(level)} would violate the stored bullish tactical invalidation level.`
          : direction === 'bearish'
            ? `A move above ${money(level)} would violate the stored bearish tactical invalidation level.`
            : `The stored tactical invalidation level is ${money(level)}.`;
      answer = `${priceCondition} The thesis would also weaken materially if currently supporting Moderate/Strong evidence families reverse or enough opposing evidence appears to break the present alignment. Current thesis state: ${thesisState}.`;
    } else if (/flat.*three hours|flat for three hours|remains flat|time decay|theta/.test(ql)) {
      if (!balanced) {
        answer = `URSORA cannot estimate the option's three-hour decay from this run because no contract is selected and option-chain data are unavailable. It would need the actual expiration, premium, theta, implied volatility, and spread before giving a contract-specific answer.`;
      } else {
        const theta = n(balanced.theta);
        const expiration = balanced.expiration ? String(balanced.expiration) : 'unknown';
        const mid = n(balanced.mid);
        answer = theta === null
          ? `The selected contract expires ${expiration} and is priced around ${money(mid)}, but theta is not stored, so URSORA cannot quantify three hours of time decay without guessing.`
          : `The selected contract's theta is approximately ${theta.toFixed(4)} per share per day. A flat stock would generally pressure the option through time decay; over three hours the realized effect will depend on time of day, IV movement, and gamma, so URSORA should treat the simple theta fraction as only a rough baseline rather than an exact forecast.`;
      }
    } else if (/preferred over|higher-risk alternative|why.*contract|contract preferred/.test(ql)) {
      if (!balanced) {
        answer = 'No contract is currently selected, so URSORA cannot compare a preferred contract with a higher-risk alternative.';
      } else if (!aggressive) {
        answer = `The stored preferred contract is ${balanced.symbol}. URSORA does not have a second higher-risk candidate stored for this run, so a direct comparison is unavailable.`;
      } else {
        answer = `The Balanced candidate (${balanced.symbol}) is preferred because its selection score is ${n(balanced.selection_score) ?? 'unavailable'} versus ${n(aggressive.selection_score) ?? 'unavailable'} for the Aggressive candidate. Balanced targets more directional sensitivity and time cushion, while Aggressive accepts lower delta and greater timing sensitivity. Liquidity scores are ${n(balanced.liquidity_score) ?? 'unavailable'} and ${n(aggressive.liquidity_score) ?? 'unavailable'}, respectively.`;
      }
    } else if (/news|catalyst|headline|event/.test(ql)) {
      if (!news?.length) {
        answer = `No recent verified news is stored for ${sym ?? 'this symbol'}.`;
      } else {
        const item = news[0];
        answer = `The most recent verified catalyst stored for ${sym} is “${item.headline}” from ${item.source_name}. URSORA classifies its sentiment as ${item.sentiment ?? 'unavailable'} with ${item.impact ?? 'unavailable'} impact.`;
      }
    } else {
      const parts: string[] = [];
      if (sym) parts.push(`${sym}:`);
      if (signal) parts.push(`thesis ${signal.direction}, state ${thesisState}, opportunity ${n(signal.opportunity_score) ?? 'unavailable'}/100, confidence ${n(signal.confidence_score) ?? 'unavailable'}/100.`);
      if (topFactor) parts.push(`Largest stored score contribution: ${topFactor.label} (${topFactor.contribution.toFixed(1)}).`);
      if (signal?.no_trade_reason) parts.push(`Current trade status: ${signal.no_trade_reason}`);
      if (news?.length) parts.push(`Latest catalyst: “${news[0].headline}”.`);
      answer = parts.join(' ') || 'URSORA has stored data, but not enough structured context to answer that specific question without guessing.';
    }

    return json({
      success: true,
      answer,
      contextUsed: { tables, symbol: sym, signalId: signal?.id ?? null },
      user_id: user.id,
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
