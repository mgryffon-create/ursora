import { AuthError, requireUser } from '../_shared/auth.ts';
import { handleOptions, json } from '../_shared/http.ts';

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const question = String(body.question ?? '').trim();
    const symbol = body.symbol ? String(body.symbol).toUpperCase() : null;
    const signalId = body.signalId ? Number(body.signalId) : null;
    let signal:any = null;
    if (signalId) ({ data: signal } = await db.from('signals').select('*').eq('id', signalId).maybeSingle());
    if (!signal && symbol) ({ data: signal } = await db.from('signals').select('*').eq('symbol', symbol).order('generated_at', { ascending: false }).limit(1).maybeSingle());
    if (!signal) ({ data: signal } = await db.from('signals').select('*').order('generated_at', { ascending: false }).limit(1).maybeSingle());

    const sym = symbol ?? signal?.symbol ?? null;
    const [{ data: news }, { data: quote }, { data: risk }] = await Promise.all([
      sym ? db.from('news_items').select('headline,source_name,published_at,sentiment,impact').eq('symbol', sym).order('published_at', { ascending: false }).limit(5) : Promise.resolve({ data: [] as any[] }),
      sym ? db.from('quotes').select('*').eq('symbol', sym).order('as_of', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null as any }),
      signal?.id ? db.from('risk_assessments').select('*').eq('signal_id', signal.id).maybeSingle() : Promise.resolve({ data: null as any }),
    ]);

    const tables:string[] = [];
    if (signal) tables.push('signals'); if (quote) tables.push('quotes'); if (news?.length) tables.push('news_items'); if (risk) tables.push('risk_assessments');
    if (!tables.length) return json({ answer: 'DATA UNAVAILABLE — there is not enough stored URSORA data to answer this without guessing.', contextUsed: { tables: [] } });

    const parts:string[] = [];
    if (sym) parts.push(`${sym}:`);
    if (signal) parts.push(`latest stored thesis is ${signal.direction} with opportunity ${n(signal.opportunity_score) ?? 'unavailable'}/100 and confidence ${n(signal.confidence_score) ?? 'unavailable'}/100. Risk is ${signal.risk_level ?? 'unavailable'}.`);
    if (quote) parts.push(`Latest stored price is ${quote.price ?? 'unavailable'} with change ${quote.change_pct ?? 'unavailable'}%.`);
    if (risk?.why_it_could_fail) parts.push(`Stored risk case: ${risk.bear_case ?? risk.base_case ?? 'see risk record'}.`);
    if (news?.length) parts.push(`Most recent stored catalyst: “${news[0].headline}” (${news[0].source_name}).`);
    parts.push(`Question received: “${question}”`);
    parts.push('This independent baseline analyst summarizes stored evidence only; it does not fill missing evidence with model guesses.');
    return json({ success: true, answer: parts.join(' '), contextUsed: { tables, symbol: sym, signalId: signal?.id ?? null }, user_id: user.id });
  } catch (e) { if (e instanceof AuthError) return json({ error: e.message }, e.status); return json({ error: e instanceof Error ? e.message : String(e) }, 500); }
});
