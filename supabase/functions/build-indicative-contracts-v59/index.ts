import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AnyRow = Record<string, any>;

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

function daysTo(expiration: string): number {
  const end = new Date(`${expiration}T20:00:00Z`).getTime();
  return (end - Date.now()) / 86400000;
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase runtime credentials are missing.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireUser(req: Request) {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) throw new Error('Authentication required.');
  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(header.slice(7).trim());
  if (error || !user) throw new Error('Invalid or expired session.');
  return db;
}

function liquidityScore(row: AnyRow): number {
  const spread = n(row.spread_pct);
  const oi = n(row.open_interest) ?? 0;
  const volume = n(row.volume) ?? 0;

  // Missing quote spread is an execution limitation, not a reason to discard a
  // research candidate. It receives only a small liquidity contribution.
  const spreadPart = spread === null ? 15 : spread <= 5 ? 100 : spread <= 10 ? 75 : spread <= 20 ? 40 : 5;
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
    const db = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const runId = typeof body.run_id === 'string' ? body.run_id.trim() : '';
    if (!runId) return json({ error: 'run_id is required.' }, 400);

    const { data: signals, error: signalError } = await db
      .from('signals')
      .select('*')
      .eq('run_id', runId)
      .eq('engine_version', 'tradecycle-5.9.0');
    if (signalError) throw signalError;

    let candidateCount = 0;
    const results: AnyRow[] = [];

    for (const signal of signals ?? []) {
      const thesisState = String(signal.score_breakdown?.thesis_state ?? '');
      const supported = thesisState === 'Supported' || thesisState === 'Strongly Supported';
      if (!supported) continue;

      const symbol = String(signal.symbol).toUpperCase();
      const optionType = String(signal.direction).toLowerCase() === 'bearish' ? 'PUT' : 'CALL';

      const { data: latest, error: latestError } = await db
        .from('option_market_snapshots')
        .select('retrieved_at')
        .eq('underlying_symbol', symbol)
        .gte('retrieved_at', new Date(Date.now() - 36 * 3600000).toISOString())
        .order('retrieved_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (!latest?.retrieved_at) {
        results.push({ symbol, status: 'no_recent_chain' });
        continue;
      }

      const { data: rows, error: rowsError } = await db
        .from('option_market_snapshots')
        .select('*')
        .eq('underlying_symbol', symbol)
        .eq('retrieved_at', latest.retrieved_at)
        .eq('option_type', optionType)
        .order('expiration', { ascending: true })
        .order('strike', { ascending: true })
        .limit(1000);
      if (rowsError) throw rowsError;

      const pool = (rows ?? []).filter((row: AnyRow) => {
        const dte = daysTo(String(row.expiration));
        const bid = n(row.bid);
        const ask = n(row.ask);
        const quoteMid = bid !== null && ask !== null && ask >= bid && ask > 0 ? (bid + ask) / 2 : null;
        const referencePrice = quoteMid ?? n(row.price);
        return dte >= 7 && dte <= 60 && n(row.strike) !== null && referencePrice !== null && referencePrice > 0;
      });

      await db.from('contract_candidates').delete().eq('signal_id', signal.id);

      if (!pool.length) {
        results.push({ symbol, status: 'no_priceable_contracts' });
        continue;
      }

      const inserts: AnyRow[] = [];
      for (let rank = 0; rank < profiles.length; rank++) {
        const profile = profiles[rank];
        const chosen = [...pool]
          .map((row: AnyRow) => ({ row, score: scoreContract(row, profile.targetDelta, profile.targetDte) }))
          .sort((a, b) => b.score - a.score)[0];
        if (!chosen) continue;

        const row = chosen.row;
        const bid = n(row.bid);
        const ask = n(row.ask);
        const executableQuote = bid !== null && ask !== null && ask >= bid && ask > 0;
        const referencePrice = executableQuote ? (bid! + ask!) / 2 : n(row.price);
        const strike = n(row.strike);
        if (referencePrice === null || strike === null) continue;

        const breakEven = optionType === 'CALL' ? strike + referencePrice : strike - referencePrice;
        const premium = referencePrice * 100;
        const targetStock = n(signal.target_price);
        const targetValue = targetStock === null
          ? null
          : optionType === 'CALL'
            ? Math.max(0, targetStock - strike)
            : Math.max(0, strike - targetStock);
        const spread = n(row.spread_pct);
        const oi = n(row.open_interest) ?? 0;
        const volume = n(row.volume) ?? 0;
        const flags: string[] = [];

        if (!executableQuote) {
          flags.push('indicative delayed price');
          flags.push('bid/ask unavailable');
        }
        if (spread !== null && spread > 10) flags.push('wide spread');
        if (oi < 100) flags.push('limited open interest');
        if (volume < 20) flags.push('limited daily volume');

        inserts.push({
          signal_id: signal.id,
          profile: profile.name,
          rank: rank + 1,
          symbol: String(row.option_symbol),
          option_type: optionType.toLowerCase(),
          strike,
          expiration: row.expiration,
          bid,
          ask,
          // Existing schema names this field `mid`. When bid/ask is absent it is
          // an indicative reference price from the delayed snapshot aggregate,
          // explicitly identified by the flags below and never called executable.
          mid: referencePrice,
          volume: Math.round(volume),
          open_interest: Math.round(oi),
          implied_volatility: n(row.implied_volatility),
          delta: n(row.delta),
          gamma: n(row.gamma),
          theta: n(row.theta),
          vega: n(row.vega),
          spread_pct: spread,
          liquidity_score: liquidityScore(row),
          selection_score: chosen.score,
          break_even: breakEven,
          est_premium: premium,
          max_loss: premium,
          target_value: targetValue,
          prob_thesis_pct: n(signal.confidence_score),
          tradeoff: executableQuote
            ? `${profile.name} contract selected using current bid/ask, delta, DTE, open interest and volume.`
            : `${profile.name} research contract selected using delayed reference price, delta, DTE, open interest and volume. Bid/ask is unavailable on the connected options tier, so this is not an executable quote.`,
          flags,
        });
      }

      if (inserts.length) {
        const { error: insertError } = await db.from('contract_candidates').insert(inserts);
        if (insertError) throw insertError;
        candidateCount += inserts.length;
      }

      results.push({
        symbol,
        status: inserts.length ? 'research_candidates_available' : 'no_candidate_selected',
        candidates: inserts.length,
        executable_quotes: inserts.filter((row) => row.bid !== null && row.ask !== null).length,
      });
    }

    return json({ success: true, run_id: runId, candidates: candidateCount, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
