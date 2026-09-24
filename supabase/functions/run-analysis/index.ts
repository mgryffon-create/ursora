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

  if (!url || !key) {
    throw new Error('Supabase runtime credentials are missing.');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Authentication required.', 401);
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    throw new AuthError('Authentication required.', 401);
  }

  const db = adminClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  if (error || !user) {
    throw new AuthError('Invalid or expired session.', 401);
  }

  return { user, db };
}


type AnyRow = Record<string, any>;
type ThesisState = 'Insufficient Evidence' | 'Mixed' | 'Opposed' | 'Rejected' | 'Supported' | 'Strongly Supported';
type EvidenceBand = 'Insufficient' | 'Weak' | 'Moderate' | 'Strong';

type EvidenceProvenance = 'observed' | 'derived' | 'imputed' | 'unavailable';

type FactorSpec = {
  factor: string;
  label: string;
  baseWeight: number;
  signedScore: number | null; // -100 opposing, +100 supporting the proposed direction
  explanation: string;
  directional: boolean;
  provenance: EvidenceProvenance;
  confidence: number;            // 0-1
  freshness: number;             // 0-1
  sourceQuality: number;         // 0-1
  imputationConfidence: number;  // 0-1
  independence: number;          // 0-1
};

const clamp = (v: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v));

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function avg(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function median(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function pctStrength(changePct: number | null): number | null {
  if (changePct === null) return null;
  return clamp(Math.abs(changePct) * 22, 0, 100);
}

function directionName(v: number): 'bullish' | 'bearish' | 'neutral' {
  if (v >= 15) return 'bullish';
  if (v <= -15) return 'bearish';
  return 'neutral';
}

function relativeToDirection(absoluteOrientation: number | null, direction: string): number | null {
  if (absoluteOrientation === null || direction === 'neutral') return absoluteOrientation === null ? null : 0;
  return direction === 'bullish' ? absoluteOrientation : -absoluteOrientation;
}

function evidenceBand(score: number | null): EvidenceBand {
  if (score === null || Math.abs(score) < 20) return 'Insufficient';
  if (Math.abs(score) < 45) return 'Weak';
  if (Math.abs(score) < 70) return 'Moderate';
  return 'Strong';
}

function factorRow(spec: FactorSpec) {
  const signed = spec.signedScore ?? 0;
  const strength = spec.signedScore === null ? 0 : Math.abs(signed);
  const band = evidenceBand(spec.signedScore);
  const meaningful = band === 'Moderate' || band === 'Strong';
  const reliability = spec.signedScore === null
    ? 0
    : clamp(
        spec.confidence *
        spec.freshness *
        spec.sourceQuality *
        spec.imputationConfidence *
        spec.independence,
        0,
        1,
      );
  const effectiveWeight = spec.baseWeight * reliability;

  return {
    factor: spec.factor,
    label: spec.label,
    raw_score: Math.round(strength * 10) / 10,
    signed_score: spec.signedScore,
    provenance: spec.provenance,
    confidence: Math.round(spec.confidence * 1000) / 1000,
    freshness: Math.round(spec.freshness * 1000) / 1000,
    source_quality: Math.round(spec.sourceQuality * 1000) / 1000,
    imputation_confidence: Math.round(spec.imputationConfidence * 1000) / 1000,
    independence: Math.round(spec.independence * 1000) / 1000,
    reliability: Math.round(reliability * 1000) / 1000,
    base_weight: spec.baseWeight,
    effective_weight: Math.round(effectiveWeight * 10000) / 10000,
    weight_change: Math.round((effectiveWeight - spec.baseWeight) * 10000) / 10000,
    contribution: spec.signedScore === null || !meaningful ? 0 : signed * effectiveWeight,
    strength_band: band,
    thesis_vote: !meaningful ? 'ABSTAIN' : signed > 0 ? 'SUPPORT' : signed < 0 ? 'OPPOSE' : 'ABSTAIN',
    effect: !meaningful ? 'NEUTRAL' : signed > 0 ? 'INCREASED' : signed < 0 ? 'DECREASED' : 'NEUTRAL',
    explanation: spec.explanation,
  };
}

function impactMultiplier(impact: string | null | undefined): number {
  switch (String(impact ?? '').toLowerCase()) {
    case 'critical': return 1;
    case 'high': return 0.8;
    case 'medium': return 0.5;
    case 'low': return 0.25;
    default: return 0.35;
  }
}


function easternMarketPhase(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = get('weekday');
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const mins = hour * 60 + minute;
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  const regularOpen = !weekend && mins >= 570 && mins < 960;
  return { regularOpen, phase: weekend ? 'weekend' : regularOpen ? 'regular' : mins < 570 ? 'premarket' : 'after_hours' };
}

function freshnessFrom(timestamp: unknown, halfLifeHours: number, nowMs: number): number {
  if (!timestamp) return 0.55;
  const ts = new Date(String(timestamp)).getTime();
  if (!Number.isFinite(ts)) return 0.55;
  const ageHours = Math.max(0, (nowMs - ts) / 3600000);
  return clamp(Math.exp(-Math.log(2) * ageHours / halfLifeHours), 0.15, 1);
}

const AHP_FACTOR_ORDER = [
  'price_trend',
  'momentum',
  'participation',
  'market_alignment',
  'options_market',
  'catalysts_news',
  'liquidity',
  'risk_reward',
] as const;

// v5 model-design priors. Directional families sum to 0.80 and normalize to:
// price 30%, momentum 20%, participation 15%, market 15%, options 10%, news 10%.
// Liquidity and risk/reward are trade-quality families, not directional thesis votes.
// These are transparent engineering priors informed by the literature and should be
// calibrated against URSORA Historical Evidence rather than treated as universal constants.
const AHP_PRIORITY = {
  price_trend: 0.24,
  momentum: 0.16,
  participation: 0.12,
  market_alignment: 0.12,
  options_market: 0.08,
  catalysts_news: 0.08,
  liquidity: 0.11,
  risk_reward: 0.09,
} as const;

function deriveAhpWeights() {
  const raw = AHP_FACTOR_ORDER.map((rowKey) =>
    AHP_FACTOR_ORDER.map((colKey) => AHP_PRIORITY[rowKey] / AHP_PRIORITY[colKey])
  );

  const geometricMeans = raw.map((row) =>
    Math.pow(row.reduce((product, value) => product * value, 1), 1 / row.length)
  );
  const gmTotal = geometricMeans.reduce((a, b) => a + b, 0);
  const weights = geometricMeans.map((value) => value / gmTotal);

  const weightedSums = raw.map((row) =>
    row.reduce((sum, value, index) => sum + value * weights[index], 0)
  );
  const lambdaMax = weightedSums.reduce(
    (sum, value, index) => sum + value / weights[index],
    0,
  ) / weights.length;
  const consistencyIndex = (lambdaMax - weights.length) / (weights.length - 1);
  const randomIndex = 1.41; // Saaty RI for n=8
  const consistencyRatio = randomIndex > 0 ? consistencyIndex / randomIndex : 0;

  return {
    matrix: raw,
    weights: Object.fromEntries(
      AHP_FACTOR_ORDER.map((key, index) => [key, weights[index]])
    ) as Record<(typeof AHP_FACTOR_ORDER)[number], number>,
    consistency_ratio: Math.max(0, consistencyRatio),
  };
}

function logistic(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds));
}

function uncertaintyLabel(value: number): 'Low' | 'Moderate' | 'High' {
  if (value <= 30) return 'Low';
  if (value <= 50) return 'Moderate';
  return 'High';
}


function meanNumber(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function smaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return meanNumber(values.slice(-period));
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function rsi14(values: number[]): number | null {
  if (values.length < 15) return null;
  const changes = values.slice(1).map((v, i) => v - values[i]);
  const recent = changes.slice(-14);
  const gains = recent.map((v) => Math.max(v, 0));
  const losses = recent.map((v) => Math.max(-v, 0));
  const avgGain = meanNumber(gains) ?? 0;
  const avgLoss = meanNumber(losses) ?? 0;
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macdSnapshot(values: number[]): { line: number; signal: number; histogram: number } | null {
  if (values.length < 35) return null;
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const offset = ema12.length - ema26.length;
  const macd = ema26.map((v, i) => ema12[i + offset] - v);
  const signalSeries = emaSeries(macd, 9);
  if (!macd.length || !signalSeries.length) return null;
  const line = macd.at(-1)!;
  const signal = signalSeries.at(-1)!;
  return { line, signal, histogram: line - signal };
}

function pctReturn(values: number[], sessions: number): number | null {
  if (values.length <= sessions) return null;
  const start = values[values.length - 1 - sessions];
  const end = values.at(-1)!;
  if (!Number.isFinite(start) || start === 0) return null;
  return ((end - start) / start) * 100;
}


function dmiAdx14(bars: AnyRow[]): { adx: number; plusDi: number; minusDi: number } | null {
  const ordered = [...bars].sort((a, b) => String(a.bar_time).localeCompare(String(b.bar_time)));
  if (ordered.length < 30) return null;

  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];

  for (let i = 1; i < ordered.length; i++) {
    const high = n(ordered[i].high);
    const low = n(ordered[i].low);
    const prevHigh = n(ordered[i - 1].high);
    const prevLow = n(ordered[i - 1].low);
    const prevClose = n(ordered[i - 1].close);
    if (high === null || low === null || prevHigh === null || prevLow === null || prevClose === null) continue;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  const period = 14;
  if (tr.length < period * 2) return null;

  let smTr = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlus = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinus = minusDm.slice(0, period).reduce((a, b) => a + b, 0);
  const dx: number[] = [];

  for (let i = period; i < tr.length; i++) {
    smTr = smTr - smTr / period + tr[i];
    smPlus = smPlus - smPlus / period + plusDm[i];
    smMinus = smMinus - smMinus / period + minusDm[i];
    if (smTr <= 0) continue;
    const plusDi = 100 * (smPlus / smTr);
    const minusDi = 100 * (smMinus / smTr);
    const denom = plusDi + minusDi;
    if (denom > 0) dx.push(100 * Math.abs(plusDi - minusDi) / denom);
  }

  if (dx.length < period) return null;
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adx = ((adx * (period - 1)) + dx[i]) / period;

  const plusDi = smTr > 0 ? 100 * (smPlus / smTr) : 0;
  const minusDi = smTr > 0 ? 100 * (smMinus / smTr) : 0;
  return { adx, plusDi, minusDi };
}

function maxOf(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function minOf(values: number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

function orientationFromNet(
  net: number,
  { strongAt, moderateAt, weakAt, strongAllowed = true }: { strongAt: number; moderateAt: number; weakAt: number; strongAllowed?: boolean },
): number {
  const sign = Math.sign(net);
  const magnitude = Math.abs(net);
  if (!sign || magnitude < weakAt) return 0;
  if (strongAllowed && magnitude >= strongAt) return sign * 80;
  if (magnitude >= moderateAt) return sign * 56;
  return sign * 32;
}


function deriveStructureFromBars(bars: AnyRow[]): { support: number | null; resistance: number | null; atr: number | null } {
  if (!bars.length) return { support: null, resistance: null, atr: null };

  const ordered = [...bars].sort((a, b) => String(a.bar_time).localeCompare(String(b.bar_time)));
  const recent20 = ordered.slice(-20);
  const lows = recent20.map((b) => n(b.low)).filter((v): v is number => v !== null);
  const highs = recent20.map((b) => n(b.high)).filter((v): v is number => v !== null);

  const trueRanges: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const high = n(ordered[i].high);
    const low = n(ordered[i].low);
    const prevClose = n(ordered[i - 1].close);
    if (high === null || low === null || prevClose === null) continue;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const atrSlice = trueRanges.slice(-14);

  return {
    support: lows.length ? Math.min(...lows) : null,
    resistance: highs.length ? Math.max(...highs) : null,
    atr: atrSlice.length >= 10 ? atrSlice.reduce((a, b) => a + b, 0) / atrSlice.length : null,
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const kind = typeof body.kind === 'string' ? body.kind : 'manual';
    const runId = crypto.randomUUID();
    const started = new Date().toISOString();
    const nowMs = Date.now();
    const marketPhase = easternMarketPhase(new Date(nowMs));
    const ahp = deriveAhpWeights();

    const { data: snapshot } = await db
      .from('market_snapshots')
      .select('*')
      .order('as_of', { ascending: false })
      .limit(1)
      .maybeSingle();

    let tickerRows: AnyRow[] = [];
    try {
      const { data } = await db.from('tickers').select('symbol,sector').limit(1000);
      tickerRows = data ?? [];
    } catch {
      tickerRows = [];
    }
    const tickerSector = new Map<string, string | null>(
      tickerRows.map((row) => [String(row.symbol ?? '').toUpperCase(), row.sector ? String(row.sector) : null]),
    );

    const { data: latestQuotes, error: quoteError } = await db
      .from('quotes')
      .select('*')
      .eq('is_demo', false)
      .in('source_name', [
        'Massive Stock Snapshot + Aggregates',
        'Massive Daily Aggregates',
        'Massive Frozen Session Close',
      ])
      .order('retrieved_at', { ascending: false })
      .order('as_of', { ascending: false })
      .limit(1000);
    if (quoteError) throw quoteError;

    const quotesBySymbol = new Map<string, AnyRow[]>();
    for (const q of latestQuotes ?? []) {
      const symbol = String(q.symbol ?? '').toUpperCase();
      if (!symbol) continue;
      const list = quotesBySymbol.get(symbol) ?? [];
      list.push(q);
      quotesBySymbol.set(symbol, list);
    }

    const bySymbol = new Map<string, AnyRow>();
    for (const [symbol, rows] of quotesBySymbol) {
      // The current engine is a 1–5 day swing/tactical engine. Outside regular
      // market hours, always anchor it to the most recent frozen session close.
      // Premarket/after-hours test prints must not make a swing thesis oscillate
      // minute-to-minute. During the regular session, use the freshest live/test row.
      const chosen = marketPhase.regularOpen
        ? rows.find((row) => String(row.source_name) === 'Massive Stock Snapshot + Aggregates')
          ?? rows.find((row) => String(row.source_name) === 'Massive Daily Aggregates')
          ?? rows[0]
        : rows
            .filter((row) => String(row.source_name) === 'Massive Frozen Session Close')
            .sort((a, b) => String(b.as_of ?? '').localeCompare(String(a.as_of ?? '')))[0]
          ?? rows.find((row) => String(row.source_name) === 'Massive Daily Aggregates')
          ?? rows[0];
      if (chosen) bySymbol.set(symbol, chosen);
    }


    let barRows: AnyRow[] = [];
    try {
      const { data } = await db
        .from('ohlcv_bars')
        .select('symbol,bar_time,high,low,close,volume')
        .eq('timeframe', '1d')
        .order('bar_time', { ascending: false })
        .limit(6500);
      barRows = data ?? [];
    } catch {
      barRows = [];
    }

    const barsBySymbol = new Map<string, AnyRow[]>();
    for (const row of barRows) {
      const symbol = String(row.symbol ?? '').toUpperCase();
      if (!symbol) continue;
      const list = barsBySymbol.get(symbol) ?? [];
      list.push(row);
      barsBySymbol.set(symbol, list);
    }

    // Optional evidence tables. Missing integrations reduce completeness rather than failing the run.
    // Fetch each symbol's latest chain batch directly. A single broad query can be
    // truncated by PostgREST row caps once the universe contains thousands of contracts,
    // which made some tickers appear to have aggregate option activity but no chain/liquidity data.
    let optionRows: AnyRow[] = [];
    try {
      const targetSymbols = [...bySymbol.keys()];
      for (const underlying of targetSymbols) {
        const { data: latestBatch } = await db
          .from('option_market_snapshots')
          .select('retrieved_at')
          .eq('underlying_symbol', underlying)
          .neq('source_name', 'Webull PaperTrade Sandbox')
          .gte('retrieved_at', new Date(nowMs - 36 * 3600000).toISOString())
          .order('retrieved_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestBatch?.retrieved_at) continue;

        const { data: batchRows, error: batchError } = await db
          .from('option_market_snapshots')
          .select('*')
          .eq('underlying_symbol', underlying)
          .eq('retrieved_at', latestBatch.retrieved_at)
          .neq('source_name', 'Webull PaperTrade Sandbox')
          .order('expiration', { ascending: true })
          .order('strike', { ascending: true })
          .limit(1000);
        if (batchError) throw batchError;
        optionRows.push(...(batchRows ?? []));
      }
    } catch { optionRows = []; }

    let recentNews: AnyRow[] = [];
    try {
      const { data } = await db
        .from('news_items')
        .select('symbol,headline,sentiment,sentiment_score,impact,published_at,confidence,source_name,source_type,is_demo')
        .neq('source_type', 'yahoo_finance_news')
        .gte('published_at', new Date(nowMs - 72 * 3600000).toISOString())
        .order('published_at', { ascending: false })
        .limit(500);
      recentNews = data ?? [];
    } catch { recentNews = []; }

    let earnings: AnyRow[] = [];
    try {
      const { data } = await db
        .from('earnings_events')
        .select('symbol,report_time,session,confirmed,expected_move_pct')
        .gte('report_time', new Date(nowMs - 12 * 3600000).toISOString())
        .lte('report_time', new Date(nowMs + 14 * 86400000).toISOString())
        .order('report_time', { ascending: true })
        .limit(300);
      earnings = data ?? [];
    } catch { earnings = []; }

    const spy = bySymbol.get('SPY');
    const qqq = bySymbol.get('QQQ');

    const indexOrientationParts: number[] = [];
    for (const indexQuote of [spy, qqq]) {
      if (!indexQuote) continue;
      const ch = n(indexQuote.change_pct);
      if (ch !== null) indexOrientationParts.push(Math.sign(ch) * Math.min(100, Math.abs(ch) * 30));
      const tr = String(indexQuote.trend ?? '').toLowerCase();
      if (tr.includes('up')) indexOrientationParts.push(55);
      if (tr.includes('down')) indexOrientationParts.push(-55);
    }
    const broadMarketOrientation = avg(indexOrientationParts);

    const optionByUnderlying = new Map<string, AnyRow[]>();
    const latestOptionBatchByUnderlying = new Map<string, string>();
    for (const row of optionRows) {
      const s = String(row.underlying_symbol ?? '').toUpperCase();
      if (!s) continue;
      const retrieved = String(row.retrieved_at ?? '');
      if (!latestOptionBatchByUnderlying.has(s)) latestOptionBatchByUnderlying.set(s, retrieved);
      if (retrieved !== latestOptionBatchByUnderlying.get(s)) continue;
      const list = optionByUnderlying.get(s) ?? [];
      list.push(row);
      optionByUnderlying.set(s, list);
    }

    const newsBySymbol = new Map<string, AnyRow[]>();
    for (const row of recentNews) {
      const s = String(row.symbol ?? '').toUpperCase();
      if (!s) continue;
      const list = newsBySymbol.get(s) ?? [];
      list.push(row);
      newsBySymbol.set(s, list);
    }

    const earningsBySymbol = new Map<string, AnyRow[]>();
    for (const row of earnings) {
      const s = String(row.symbol ?? '').toUpperCase();
      if (!s) continue;
      const list = earningsBySymbol.get(s) ?? [];
      list.push(row);
      earningsBySymbol.set(s, list);
    }

    const created: AnyRow[] = [];

    for (const [symbol, q] of bySymbol) {
      // Skip broad-market context instruments as trade candidates only when explicitly requested.
      if (body?.symbols && Array.isArray(body.symbols) && !body.symbols.map((x: unknown) => String(x).toUpperCase()).includes(symbol)) {
        continue;
      }

      const price = n(q.price);
      const change = n(q.change_pct);
      const momentum = n(q.momentum_score);
      const trend = String(q.trend ?? '').toLowerCase();
      const sma20 = n(q.sma20);
      const sma50 = n(q.sma50);
      const sma200 = n(q.sma200);
      const quoteSupport = n(q.support);
      const quoteResistance = n(q.resistance);
      const quoteAtr = n(q.atr);
      const relVolume = n(q.rel_volume);

      const derivedStructure = deriveStructureFromBars(barsBySymbol.get(symbol) ?? []);
      const support = quoteSupport ?? derivedStructure.support;
      const resistance = quoteResistance ?? derivedStructure.resistance;
      const atr = quoteAtr ?? derivedStructure.atr;

      // ----- v5 directional evidence families (-100 bearish, +100 bullish) -----
      // Weak evidence describes a lean but does not vote on the thesis. Moderate and
      // Strong evidence are the only bands allowed to support or oppose a thesis.
      const symbolBars = [...(barsBySymbol.get(symbol) ?? [])]
        .sort((a, b) => String(a.bar_time).localeCompare(String(b.bar_time)));
      const closes = symbolBars.map((bar) => n(bar.close)).filter((v): v is number => v !== null);
      const highs = symbolBars.map((bar) => n(bar.high)).filter((v): v is number => v !== null);
      const lows = symbolBars.map((bar) => n(bar.low)).filter((v): v is number => v !== null);
      const volumes = symbolBars.map((bar) => n(bar.volume)).filter((v): v is number => v !== null);
      const lastClose = price ?? closes.at(-1) ?? null;

      const calcSma20 = sma20 ?? smaLast(closes, 20);
      const calcSma50 = sma50 ?? smaLast(closes, 50);
      const calcSma200 = sma200 ?? smaLast(closes, 200);
      const priorSma20 = closes.length >= 25 ? smaLast(closes.slice(0, -5), 20) : null;

      const recentHigh = maxOf(highs.slice(-5));
      const priorHigh5 = maxOf(highs.slice(-10, -5));
      const recentLow = minOf(lows.slice(-5));
      const priorLow5 = minOf(lows.slice(-10, -5));
      const higherStructure = recentHigh !== null && priorHigh5 !== null && recentLow !== null && priorLow5 !== null
        ? recentHigh > priorHigh5 && recentLow > priorLow5
        : false;
      const lowerStructure = recentHigh !== null && priorHigh5 !== null && recentLow !== null && priorLow5 !== null
        ? recentHigh < priorHigh5 && recentLow < priorLow5
        : false;
      const prior20High = maxOf(highs.slice(-21, -1));
      const prior20Low = minOf(lows.slice(-21, -1));
      const breakoutUp = lastClose !== null && prior20High !== null ? lastClose > prior20High : false;
      const breakoutDown = lastClose !== null && prior20Low !== null ? lastClose < prior20Low : false;

      const dmi = dmiAdx14(symbolBars);
      const sma20Rising = calcSma20 !== null && priorSma20 !== null && calcSma20 > priorSma20;
      const sma20Falling = calcSma20 !== null && priorSma20 !== null && calcSma20 < priorSma20;
      const shortBullStack = lastClose !== null && calcSma20 !== null && calcSma50 !== null
        ? lastClose > calcSma20 && calcSma20 > calcSma50
        : false;
      const shortBearStack = lastClose !== null && calcSma20 !== null && calcSma50 !== null
        ? lastClose < calcSma20 && calcSma20 < calcSma50
        : false;
      const longBullContext = calcSma50 !== null && calcSma200 !== null ? calcSma50 > calcSma200 : false;
      const longBearContext = calcSma50 !== null && calcSma200 !== null ? calcSma50 < calcSma200 : false;
      const dmiBullTrend = dmi ? dmi.plusDi > dmi.minusDi && dmi.adx >= 20 : false;
      const dmiBearTrend = dmi ? dmi.minusDi > dmi.plusDi && dmi.adx >= 20 : false;
      const dmiBullStrong = dmi ? dmi.plusDi > dmi.minusDi && dmi.adx >= 25 : false;
      const dmiBearStrong = dmi ? dmi.minusDi > dmi.plusDi && dmi.adx >= 25 : false;

      // Price/structure bands are rule-based rather than a smooth tally.
      // The rules intentionally combine different views of the same price series:
      // trend location/slope, objective swing or Donchian-style structure, and
      // Wilder directional trend strength. Strong is deliberately difficult.
      const bullStructure = higherStructure || breakoutUp;
      const bearStructure = lowerStructure || breakoutDown;

      const bullStrong =
        bullStructure &&
        shortBullStack &&
        sma20Rising &&
        dmiBullStrong &&
        (longBullContext || breakoutUp);
      const bearStrong =
        bearStructure &&
        shortBearStack &&
        sma20Falling &&
        dmiBearStrong &&
        (longBearContext || breakoutDown);

      const bullModerate =
        !bullStrong && (
          (bullStructure && [shortBullStack, sma20Rising, dmiBullTrend, longBullContext].filter(Boolean).length >= 2) ||
          (breakoutUp && dmiBullTrend) ||
          (shortBullStack && sma20Rising && dmiBullTrend)
        );
      const bearModerate =
        !bearStrong && (
          (bearStructure && [shortBearStack, sma20Falling, dmiBearTrend, longBearContext].filter(Boolean).length >= 2) ||
          (breakoutDown && dmiBearTrend) ||
          (shortBearStack && sma20Falling && dmiBearTrend)
        );

      const bullClues = [
        lastClose !== null && calcSma20 !== null && lastClose > calcSma20,
        calcSma20 !== null && calcSma50 !== null && calcSma20 > calcSma50,
        sma20Rising,
        higherStructure,
        breakoutUp,
        dmi ? dmi.plusDi > dmi.minusDi : false,
        longBullContext,
      ].filter(Boolean).length;
      const bearClues = [
        lastClose !== null && calcSma20 !== null && lastClose < calcSma20,
        calcSma20 !== null && calcSma50 !== null && calcSma20 < calcSma50,
        sma20Falling,
        lowerStructure,
        breakoutDown,
        dmi ? dmi.minusDi > dmi.plusDi : false,
        longBearContext,
      ].filter(Boolean).length;

      let priceOrientation = 0;
      let priceStructureReason = 'Price structure is mixed or incomplete.';
      if (bullStrong && !bearStrong) {
        priceOrientation = 80;
        priceStructureReason = 'Strong bullish structure: objective trend structure or breakout, short/intermediate moving-average alignment, rising trend slope, and ADX/DMI trend strength are corroborating.';
      } else if (bearStrong && !bullStrong) {
        priceOrientation = -80;
        priceStructureReason = 'Strong bearish structure: objective trend structure or breakdown, short/intermediate moving-average alignment, falling trend slope, and ADX/DMI trend strength are corroborating.';
      } else if (bullModerate && !bearModerate) {
        priceOrientation = 56;
        priceStructureReason = 'Moderate bullish structure: price structure and multiple trend filters align, but the full Strong-evidence confirmation set is not present.';
      } else if (bearModerate && !bullModerate) {
        priceOrientation = -56;
        priceStructureReason = 'Moderate bearish structure: price structure and multiple trend filters align, but the full Strong-evidence confirmation set is not present.';
      } else if (bullClues >= bearClues + 2 && bullClues >= 2) {
        priceOrientation = 32;
        priceStructureReason = 'Weak bullish lean: some trend observations align upward, but objective structure/trend-strength confirmation is inadequate.';
      } else if (bearClues >= bullClues + 2 && bearClues >= 2) {
        priceOrientation = -32;
        priceStructureReason = 'Weak bearish lean: some trend observations align downward, but objective structure/trend-strength confirmation is inadequate.';
      }


      const rsi = rsi14(closes);
      const macd = macdSnapshot(closes);
      const return5 = pctReturn(closes, 5);
      const return20 = pctReturn(closes, 20);
      let momentumNet = 0;
      if (macd) {
        momentumNet += macd.line > macd.signal ? 1.5 : macd.line < macd.signal ? -1.5 : 0;
        momentumNet += macd.line > 0 ? 1 : macd.line < 0 ? -1 : 0;
      }
      if (rsi !== null) momentumNet += rsi >= 55 ? 1 : rsi <= 45 ? -1 : 0;
      if (return5 !== null) momentumNet += return5 >= 1 ? 1 : return5 <= -1 ? -1 : 0;
      if (return20 !== null) momentumNet += return20 >= 3 ? 1.5 : return20 <= -3 ? -1.5 : 0;
      // Preserve the legacy normalized momentum measure only as a low-weight fallback.
      if (!macd && rsi === null && momentum !== null) momentumNet += momentum >= 60 ? 1 : momentum <= 40 ? -1 : 0;
      const strongMomentum =
        Boolean(macd) &&
        return20 !== null &&
        ((momentumNet > 0 && macd!.line > macd!.signal && return20 > 0) ||
          (momentumNet < 0 && macd!.line < macd!.signal && return20 < 0));
      const momentumOrientation = orientationFromNet(momentumNet, {
        weakAt: 1.25,
        moderateAt: 2.75,
        strongAt: 4.5,
        strongAllowed: strongMomentum,
      });

      const computedRelVolume = relVolume ??
        (volumes.length >= 21 && volumes.at(-1) !== undefined
          ? Number(volumes.at(-1)) / Math.max(meanNumber(volumes.slice(-21, -1)) ?? 0, 1)
          : null);
      const moveDirection = change !== null && Math.abs(change) >= 0.35
        ? Math.sign(change)
        : Math.sign(priceOrientation);
      let participationOrientation = 0;
      if (computedRelVolume !== null && moveDirection !== 0) {
        if (computedRelVolume >= 1.5 && Math.abs(priceOrientation) >= 45) participationOrientation = moveDirection * 78;
        else if (computedRelVolume >= 1.2 && Math.abs(priceOrientation) >= 45) participationOrientation = moveDirection * 56;
        else if (computedRelVolume >= 1.0) participationOrientation = moveDirection * 32;
      }

      const indexOrientations: number[] = [];
      const snapshotIndexes = [
        { change_pct: snapshot?.spy_change_pct, trend: snapshot?.spy_trend },
        { change_pct: snapshot?.qqq_change_pct, trend: snapshot?.qqq_trend },
      ];
      for (const indexQuote of snapshotIndexes) {
        let net = 0;
        const ch = n(indexQuote.change_pct);
        if (ch !== null && Math.abs(ch) >= 0.15) net += Math.sign(ch);
        const tr = String(indexQuote.trend ?? '').toLowerCase();
        if (tr.includes('up')) net += 1.5;
        if (tr.includes('down')) net -= 1.5;
        if (ch !== null || tr) {
          indexOrientations.push(orientationFromNet(net, { weakAt: 0.75, moderateAt: 2, strongAt: 3 }));
        }
      }

      let sectorOrientation: number | null = null;
      const sectorName = tickerSector.get(symbol);
      const sectorRows = Array.isArray(snapshot?.sector_performance) ? snapshot.sector_performance : [];
      const sectorRow = sectorName
        ? sectorRows.find((row: AnyRow) => String(row.sector ?? '').toLowerCase() === String(sectorName).toLowerCase())
        : null;
      const sectorChange = n(sectorRow?.change_pct);
      if (sectorChange !== null) {
        sectorOrientation = Math.abs(sectorChange) >= 0.75
          ? Math.sign(sectorChange) * 56
          : Math.abs(sectorChange) >= 0.20
            ? Math.sign(sectorChange) * 32
            : 0;
      }

      const marketVotes = [...indexOrientations, sectorOrientation]
        .filter((v): v is number => v !== null && Math.abs(v) >= 20);
      const marketBull = marketVotes.filter((v) => v > 0).length;
      const marketBear = marketVotes.filter((v) => v < 0).length;
      let marketOrientation = 0;
      if (marketVotes.length) {
        const marketSign = marketBull === marketBear ? 0 : marketBull > marketBear ? 1 : -1;
        const aligned = Math.max(marketBull, marketBear);
        if (marketSign !== 0) {
          marketOrientation = aligned >= 3 ? marketSign * 80 : aligned >= 2 ? marketSign * 56 : marketSign * 32;
        }
      }

      const symbolOptions = optionByUnderlying.get(symbol) ?? [];
      const callVolume = symbolOptions.filter((row) => String(row.option_type).toUpperCase() === 'CALL')
        .reduce((sum, row) => sum + Number(row.volume ?? 0), 0);
      const putVolume = symbolOptions.filter((row) => String(row.option_type).toUpperCase() === 'PUT')
        .reduce((sum, row) => sum + Number(row.volume ?? 0), 0);
      const putCallRatio = callVolume > 0 ? putVolume / callVolume : n(q.put_call_ratio);

      // Aggregate put/call volume is ambiguous because it does not reveal trade side,
      // opening/closing intent, multi-leg structure, or hedging. Until richer flow is
      // available, this family is deliberately capped at Weak and therefore abstains.
      let optionOrientation: number | null = null;
      if (putCallRatio !== null) {
        if (putCallRatio <= 0.70) optionOrientation = 32;
        else if (putCallRatio >= 1.30) optionOrientation = -32;
        else optionOrientation = 0;
      }

      const symbolNews = newsBySymbol.get(symbol) ?? [];
      let newsWeighted = 0;
      let newsWeight = 0;
      let highQualityDirectionalItems = 0;
      for (const item of symbolNews.slice(0, 12)) {
        let signed = n(item.sentiment_score);
        if (signed === null) {
          const label = String(item.sentiment ?? '').toLowerCase();
          signed = label === 'bullish' ? 60 : label === 'bearish' ? -60 : 0;
        } else if (Math.abs(signed) <= 1) {
          signed *= 100;
        }
        const ageHours = Math.max(0, (nowMs - new Date(item.published_at).getTime()) / 3600000);
        const recency = Math.exp(-ageHours / 36);
        const quality = clamp(n(item.confidence) ?? 0.55, 0.20, 1);
        const impact = impactMultiplier(item.impact);
        const weight = recency * quality * impact;
        newsWeighted += clamp(signed) * weight;
        newsWeight += weight;
        if (Math.abs(clamp(signed)) >= 45 && quality >= 0.65 && impact >= 0.5) highQualityDirectionalItems++;
      }
      const newsMean = newsWeight > 0 ? newsWeighted / newsWeight : null;
      let newsOrientation: number | null = null;
      if (newsMean !== null) {
        const sign = Math.sign(newsMean);
        const magnitude = Math.abs(newsMean);
        newsOrientation =
          magnitude >= 55 && highQualityDirectionalItems >= 2 ? sign * 80 :
          magnitude >= 30 && highQualityDirectionalItems >= 1 ? sign * 56 :
          magnitude >= 15 ? sign * 32 : 0;
      }

      // Hierarchical thesis direction:
      // Price/structure is the primary evidence family. Context cannot manufacture a
      // bullish/bearish thesis when the asset itself has not established a Moderate
      // or Strong directional structure. Momentum/participation confirm the structure;
      // market/news contextualise it.
      const priceBandAbsolute = evidenceBand(priceOrientation);
      const structuralDirection =
        (priceBandAbsolute === 'Moderate' || priceBandAbsolute === 'Strong')
          ? Math.sign(priceOrientation)
          : 0;
      const compositeOrientation = structuralDirection === 0 ? 0 : structuralDirection * Math.abs(priceOrientation);
      const direction = structuralDirection > 0 ? 'bullish' : structuralDirection < 0 ? 'bearish' : 'neutral';

      // Relative evidence scores: positive supports the proposed direction.
      const priceEvidence = relativeToDirection(priceOrientation, direction);
      const momentumEvidence = relativeToDirection(momentumOrientation, direction);
      const participationEvidence = relativeToDirection(participationOrientation, direction);
      const marketEvidence = relativeToDirection(marketOrientation, direction);
      const optionsEvidence = relativeToDirection(optionOrientation, direction);
      const newsEvidence = relativeToDirection(newsOrientation, direction);

      // Liquidity/execution quality from option contracts in the proposed direction.
      const desiredOptionType = direction === 'bearish' ? 'PUT' : 'CALL';
      const relevantOptions = direction === 'neutral'
        ? []
        : symbolOptions.filter((r) => String(r.option_type).toUpperCase() === desiredOptionType);

      const spreadMedian = median(relevantOptions.map((r) => n(r.spread_pct)));
      const oiMedian = median(relevantOptions.map((r) => n(r.open_interest)));
      const volumeMedian = median(relevantOptions.map((r) => n(r.volume)));

      let liquidityEvidence: number | null = null;
      if (relevantOptions.length) {
        let score = 0;
        let pieces = 0;
        if (spreadMedian !== null) {
          score += spreadMedian <= 5 ? 85 : spreadMedian <= 10 ? 55 : spreadMedian <= 20 ? 10 : -70;
          pieces++;
        }
        if (oiMedian !== null) {
          score += oiMedian >= 500 ? 75 : oiMedian >= 100 ? 45 : oiMedian >= 20 ? 10 : -40;
          pieces++;
        }
        if (volumeMedian !== null) {
          score += volumeMedian >= 100 ? 70 : volumeMedian >= 20 ? 40 : volumeMedian >= 5 ? 10 : -30;
          pieces++;
        }
        liquidityEvidence = pieces ? clamp(score / pieces) : null;
      }

      // Tactical 1–5 day structure. Long-window support/resistance are context,
      // but invalidation is bounded by one ATR so a distant 20-day extreme cannot
      // create an unrealistic stop for a short holding period.
      let riskRewardEvidence: number | null = null;
      let estimatedRatio: number | null = null;
      let tacticalTarget: number | null = null;
      let tacticalInvalidation: number | null = null;

      if (price !== null && atr !== null && atr > 0 && direction !== 'neutral') {
        if (direction === 'bullish') {
          const atrInvalidation = price - atr;
          tacticalInvalidation =
            support !== null && support < price
              ? Math.max(support, atrInvalidation)
              : atrInvalidation;

          const atrTarget = price + atr * 1.5;
          tacticalTarget =
            resistance !== null && resistance > price
              ? Math.min(resistance, atrTarget)
              : atrTarget;
        } else {
          const atrInvalidation = price + atr;
          tacticalInvalidation =
            resistance !== null && resistance > price
              ? Math.min(resistance, atrInvalidation)
              : atrInvalidation;

          const atrTarget = price - atr * 1.5;
          tacticalTarget =
            support !== null && support < price
              ? Math.max(support, atrTarget)
              : atrTarget;
        }

        const targetDistance = tacticalTarget === null ? null : Math.abs(tacticalTarget - price);
        const riskDistance = tacticalInvalidation === null ? null : Math.abs(price - tacticalInvalidation);

        if (targetDistance !== null && riskDistance !== null && riskDistance > 0) {
          estimatedRatio = targetDistance / riskDistance;
          riskRewardEvidence = clamp((estimatedRatio - 1) * 70);
        }
      }

      // Cross-factor agreement only considers independent directional factors with meaningful strength.
      const directionalEvidence = [priceEvidence, momentumEvidence, participationEvidence, marketEvidence, optionsEvidence, newsEvidence]
        .filter((v): v is number => v !== null && Math.abs(v) >= 45);
      const supportingCount = directionalEvidence.filter((v) => v > 0).length;
      const opposingCount = directionalEvidence.filter((v) => v < 0).length;
      const agreement = directionalEvidence.length >= 3
        ? Math.round((Math.max(supportingCount, opposingCount) / directionalEvidence.length) * 100)
        : null;
      const agreementForConfidence = agreement ?? 50;
      const nextEarnings = (earningsBySymbol.get(symbol) ?? [])[0] ?? null;
      const hoursToEarnings = nextEarnings?.report_time
        ? (new Date(nextEarnings.report_time).getTime() - nowMs) / 3600000
        : null;
      const eventInsideHoldingWindow = hoursToEarnings !== null && hoursToEarnings >= 0 && hoursToEarnings <= 5 * 24;

      const quoteFreshness = freshnessFrom(q.retrieved_at ?? q.as_of, 18, nowMs);
      const quoteConfidence = clamp(n(q.confidence) ?? 0.78, 0.35, 1);
      const marketFreshness = avg([spy, qqq].map((row) => row ? freshnessFrom(row.retrieved_at ?? row.as_of, 18, nowMs) : null)) ?? 0.45;
      const optionFreshness = symbolOptions.length
        ? avg(symbolOptions.slice(0, 50).map((row) => freshnessFrom(row.retrieved_at, 12, nowMs))) ?? 0.5
        : 0;
      const newsFreshness = symbolNews.length
        ? avg(symbolNews.slice(0, 12).map((row) => freshnessFrom(row.published_at, 24, nowMs))) ?? 0.5
        : 0;

      const priceProvenance: EvidenceProvenance = priceEvidence === null ? 'unavailable' : 'derived';
      const momentumProvenance: EvidenceProvenance = momentumEvidence === null ? 'unavailable' : 'derived';
      const participationProvenance: EvidenceProvenance = participationEvidence === null ? 'unavailable' : 'derived';
      const marketProvenance: EvidenceProvenance = marketEvidence === null ? 'unavailable' : 'observed';
      const optionsProvenance: EvidenceProvenance = optionsEvidence === null
        ? 'unavailable'
        : symbolOptions.length ? 'observed' : 'imputed';
      const newsProvenance: EvidenceProvenance = newsEvidence === null ? 'unavailable' : 'observed';
      const liquidityProvenance: EvidenceProvenance = liquidityEvidence === null ? 'unavailable' : 'observed';
      const riskRewardProvenance: EvidenceProvenance = riskRewardEvidence === null ? 'unavailable' : 'derived';

      // Redundancy penalties keep correlated evidence from being counted as independent confirmation.
      const priceIndependence = 1.0;
      const momentumIndependence = priceEvidence !== null ? 0.68 : 1.0;
      const participationIndependence = priceEvidence !== null ? 0.78 : 1.0;
      const marketIndependence = 0.88;
      const optionsIndependence = 0.95;
      const newsIndependence = 1.0;
      const liquidityIndependence = optionsEvidence !== null ? 0.82 : 1.0;
      const riskRewardIndependence = priceEvidence !== null ? 0.78 : 1.0;

      const factorSpecs: FactorSpec[] = [
        {
          factor: 'price_trend',
          label: 'Price trend',
          baseWeight: ahp.weights.price_trend,
          signedScore: priceEvidence,
          directional: true,
          provenance: priceProvenance,
          confidence: priceEvidence === null ? 0 : quoteConfidence,
          freshness: priceEvidence === null ? 0 : quoteFreshness,
          sourceQuality: priceEvidence === null ? 0 : 0.88,
          imputationConfidence: 1,
          independence: priceIndependence,
          explanation: priceEvidence === null
            ? 'There is not enough historical price information to evaluate trend structure.'
            : direction === 'neutral'
              ? priceStructureReason
              : `${priceStructureReason} Relative to the proposed ${direction} thesis, this ${evidenceBand(priceEvidence) === 'Weak' || evidenceBand(priceEvidence) === 'Insufficient' ? 'does not vote' : priceEvidence > 0 ? 'supports the thesis' : 'opposes the thesis'}.`,
        },
        {
          factor: 'momentum',
          label: 'Momentum',
          baseWeight: ahp.weights.momentum,
          signedScore: momentumEvidence,
          directional: true,
          provenance: momentumProvenance,
          confidence: momentumEvidence === null ? 0 : 0.82,
          freshness: momentumEvidence === null ? 0 : quoteFreshness,
          sourceQuality: momentumEvidence === null ? 0 : 0.86,
          imputationConfidence: 1,
          independence: momentumIndependence,
          explanation: momentumEvidence === null
            ? 'Momentum cannot be evaluated from the available price history.'
            : evidenceBand(momentumEvidence) === 'Insufficient'
              ? 'Momentum measures are mixed or neutral and do not currently support or oppose the thesis.'
              : evidenceBand(momentumEvidence) === 'Weak'
                ? `Momentum leans ${momentumEvidence > 0 ? 'with' : 'against'} the proposed direction, but the evidence is too weak to vote on the thesis.`
                : `${evidenceBand(momentumEvidence)} momentum evidence ${momentumEvidence > 0 ? 'supports' : 'opposes'} the thesis using MACD, RSI regime, and 5- and 20-session price persistence.`,
        },
        {
          factor: 'participation',
          label: 'Volume and participation',
          baseWeight: ahp.weights.participation,
          signedScore: participationEvidence,
          directional: true,
          provenance: participationProvenance,
          confidence: participationEvidence === null ? 0 : quoteConfidence,
          freshness: participationEvidence === null ? 0 : quoteFreshness,
          sourceQuality: participationEvidence === null ? 0 : 0.88,
          imputationConfidence: 1,
          independence: participationIndependence,
          explanation: participationEvidence === null
            ? 'Volume participation cannot be evaluated from the available data.'
            : evidenceBand(participationEvidence) === 'Insufficient'
              ? 'Trading volume does not currently provide directional confirmation.'
              : evidenceBand(participationEvidence) === 'Weak'
                ? `Volume shows a ${participationEvidence > 0 ? 'supportive' : 'opposing'} lean, but participation is not elevated enough to count as thesis evidence.`
                : `Relative volume of ${computedRelVolume?.toFixed(2) ?? 'unavailable'}x provides ${evidenceBand(participationEvidence).toLowerCase()} ${participationEvidence > 0 ? 'confirmation of' : 'opposition to'} the proposed direction.`,
        },
        {
          factor: 'market_alignment',
          label: 'Broader market alignment',
          baseWeight: ahp.weights.market_alignment,
          signedScore: marketEvidence,
          directional: true,
          provenance: marketProvenance,
          confidence: marketEvidence === null ? 0 : 0.80,
          freshness: marketEvidence === null ? 0 : marketFreshness,
          sourceQuality: marketEvidence === null ? 0 : 0.86,
          imputationConfidence: 1,
          independence: marketIndependence,
          explanation: marketEvidence === null
            ? 'Broader index data are not currently available.'
            : `SPY and QQQ context is ${Math.abs(marketEvidence) < 25 ? 'largely neutral' : marketEvidence > 0 ? 'aligned with' : 'opposed to'} the proposed direction.`,
        },
        {
          factor: 'options_market',
          label: 'Options market',
          baseWeight: ahp.weights.options_market,
          signedScore: optionsEvidence,
          directional: true,
          provenance: optionsProvenance,
          confidence: optionsEvidence === null ? 0 : symbolOptions.length ? 0.86 : 0.45,
          freshness: optionsEvidence === null ? 0 : symbolOptions.length ? optionFreshness : quoteFreshness,
          sourceQuality: optionsEvidence === null ? 0 : symbolOptions.length ? 0.88 : 0.60,
          imputationConfidence: optionsEvidence === null ? 0 : symbolOptions.length ? 1 : 0.45,
          independence: optionsIndependence,
          explanation: optionsEvidence === null
            ? 'Current option-chain activity is not available for this symbol.'
            : `Aggregate put/call volume is ${putCallRatio?.toFixed(2) ?? 'unavailable'}. Without trade-side and opening/closing context, this can show only a weak directional lean and does not vote on the thesis.`,
        },
        {
          factor: 'catalysts_news',
          label: 'News and market events',
          baseWeight: ahp.weights.catalysts_news,
          signedScore: newsEvidence,
          directional: true,
          provenance: newsProvenance,
          confidence: newsEvidence === null ? 0 : clamp(avg(symbolNews.map((item) => n(item.confidence))) ?? 0.60, 0.25, 1),
          freshness: newsEvidence === null ? 0 : newsFreshness,
          sourceQuality: newsEvidence === null ? 0 : 0.78,
          imputationConfidence: 1,
          independence: newsIndependence,
          explanation: newsEvidence === null
            ? (eventInsideHoldingWindow
              ? 'A scheduled earnings event falls inside the expected holding period, but no directional news evidence is currently available.'
              : 'No recent verified news evidence is currently available for this symbol.')
            : evidenceBand(newsEvidence) === 'Insufficient'
              ? 'Recent verified news is not sufficiently directional to support or oppose the thesis.'
              : evidenceBand(newsEvidence) === 'Weak'
                ? `Recent news leans ${newsEvidence > 0 ? 'with' : 'against'} the proposed direction, but not strongly enough to vote on the thesis.`
                : `${evidenceBand(newsEvidence)} verified news/event evidence ${newsEvidence > 0 ? 'supports' : 'opposes'} the proposed direction.`,
        },
        {
          factor: 'liquidity',
          label: 'Option liquidity',
          baseWeight: ahp.weights.liquidity,
          signedScore: liquidityEvidence,
          directional: false,
          provenance: liquidityProvenance,
          confidence: liquidityEvidence === null ? 0 : 0.90,
          freshness: liquidityEvidence === null ? 0 : optionFreshness,
          sourceQuality: liquidityEvidence === null ? 0 : 0.90,
          imputationConfidence: 1,
          independence: liquidityIndependence,
          explanation: liquidityEvidence === null
            ? 'Option bid/ask, volume, and open-interest data are not available.'
            : `Available ${desiredOptionType.toLowerCase()} contracts show a median spread of ${spreadMedian?.toFixed(1) ?? 'unavailable'}%, median open interest of ${oiMedian?.toFixed(0) ?? 'unavailable'}, and median daily volume of ${volumeMedian?.toFixed(0) ?? 'unavailable'}.`,
        },
        {
          factor: 'risk_reward',
          label: 'Risk and reward structure',
          baseWeight: ahp.weights.risk_reward,
          signedScore: riskRewardEvidence,
          directional: false,
          provenance: riskRewardProvenance,
          confidence: riskRewardEvidence === null ? 0 : 0.84,
          freshness: riskRewardEvidence === null ? 0 : quoteFreshness,
          sourceQuality: riskRewardEvidence === null ? 0 : 0.86,
          imputationConfidence: 1,
          independence: riskRewardIndependence,
          explanation: riskRewardEvidence === null
            ? 'Support, resistance, and volatility data are not sufficient to estimate the trade structure.'
            : `The estimated reward-to-risk relationship is approximately ${estimatedRatio?.toFixed(2) ?? 'unavailable'} to 1 using a 1–5 day tactical target and invalidation level bounded by ATR and nearby structure.`,
        },
      ];

      const availableSpecs = factorSpecs.filter((factor) => factor.signedScore !== null);
      const factors = factorSpecs.map((spec) => factorRow(spec));

      const factorByKey = new Map(factors.map((factor) => [factor.factor, factor]));
      const priceFactor = factorByKey.get('price_trend');
      const momentumFactor = factorByKey.get('momentum');
      const participationFactor = factorByKey.get('participation');
      const marketFactor = factorByKey.get('market_alignment');
      const newsFactor = factorByKey.get('catalysts_news');

      const meaningfulVote = (factor: AnyRow | undefined) =>
        factor && (factor.strength_band === 'Moderate' || factor.strength_band === 'Strong')
          ? String(factor.thesis_vote)
          : 'ABSTAIN';

      const confirmationFactors = [momentumFactor, participationFactor].filter(Boolean) as AnyRow[];
      const contextFactors = [marketFactor, newsFactor].filter(Boolean) as AnyRow[];
      const confirmationSupport = confirmationFactors.filter((factor) => meaningfulVote(factor) === 'SUPPORT');
      const confirmationOppose = confirmationFactors.filter((factor) => meaningfulVote(factor) === 'OPPOSE');
      const contextSupport = contextFactors.filter((factor) => meaningfulVote(factor) === 'SUPPORT');
      const contextOppose = contextFactors.filter((factor) => meaningfulVote(factor) === 'OPPOSE');

      const priceMeaningful =
        priceFactor &&
        (priceFactor.strength_band === 'Moderate' || priceFactor.strength_band === 'Strong') &&
        priceFactor.thesis_vote === 'SUPPORT';

      const confirmationState =
        !priceMeaningful ? 'unavailable'
          : confirmationOppose.length > 0 ? 'divergent'
            : confirmationSupport.length >= 2 ? 'confirmed'
              : confirmationSupport.length === 1 ? 'partially_confirmed'
                : 'unconfirmed';

      const contextState =
        contextSupport.length > 0 && contextOppose.length > 0 ? 'mixed'
          : contextOppose.length > 0 ? 'opposing'
            : contextSupport.length > 0 ? 'supportive'
              : 'neutral';

      const interactionFlags: AnyRow[] = [];
      if (priceMeaningful) {
        if (meaningfulVote(momentumFactor) === 'SUPPORT') {
          interactionFlags.push({
            key: 'price_momentum_confirmation',
            role: 'confirmation',
            state: 'confirming',
            label: 'Price and momentum confirm one another',
            detail: 'Momentum is Moderate/Strong in the same direction as the established price structure.',
          });
        } else if (meaningfulVote(momentumFactor) === 'OPPOSE') {
          interactionFlags.push({
            key: 'price_momentum_divergence',
            role: 'confirmation',
            state: 'conflicting',
            label: 'Price and momentum diverge',
            detail: 'Momentum is Moderate/Strong against the established price structure. This weakens continuation confidence.',
          });
        }

        if (meaningfulVote(participationFactor) === 'SUPPORT') {
          interactionFlags.push({
            key: 'price_participation_confirmation',
            role: 'confirmation',
            state: 'confirming',
            label: 'Participation confirms the price move',
            detail: 'Elevated trading participation is aligned with the established price direction.',
          });
        } else if (meaningfulVote(participationFactor) === 'OPPOSE') {
          interactionFlags.push({
            key: 'price_participation_conflict',
            role: 'confirmation',
            state: 'conflicting',
            label: 'Participation conflicts with price',
            detail: 'Elevated participation is occurring against the established price direction.',
          });
        }

        if (meaningfulVote(marketFactor) === 'SUPPORT') {
          interactionFlags.push({
            key: 'market_context_alignment',
            role: 'context',
            state: 'confirming',
            label: 'Broader market context is aligned',
            detail: 'Moderate/Strong market or sector evidence points in the same direction as the stock-level thesis.',
          });
        } else if (meaningfulVote(marketFactor) === 'OPPOSE') {
          interactionFlags.push({
            key: 'market_context_headwind',
            role: 'context',
            state: 'conflicting',
            label: 'Broader market context is a headwind',
            detail: 'Moderate/Strong market or sector evidence points against the stock-level thesis. This is context, not an automatic invalidation.',
          });
        }

        if (meaningfulVote(newsFactor) === 'SUPPORT') {
          interactionFlags.push({
            key: 'catalyst_price_alignment',
            role: 'context',
            state: 'confirming',
            label: 'Catalyst evidence is aligned with price',
            detail: 'Verified news/event evidence and the established price structure point in the same direction.',
          });
        } else if (meaningfulVote(newsFactor) === 'OPPOSE') {
          interactionFlags.push({
            key: 'catalyst_price_conflict',
            role: 'context',
            state: 'conflicting',
            label: 'Catalyst evidence conflicts with price',
            detail: 'Verified news/event evidence points against the established price structure.',
          });
        }
      } else {
        interactionFlags.push({
          key: 'no_primary_structure',
          role: 'primary',
          state: 'insufficient',
          label: 'No established price thesis',
          detail: 'Price/structure is not Moderate or Strong, so confirmation and context families cannot create a directional thesis by themselves.',
        });
      }

      const totalBaseWeight = factorSpecs.reduce((sum, factor) => sum + factor.baseWeight, 0);
      const netSupport = factors.reduce(
        (total, factor) => total + Number(factor.contribution ?? 0),
        0,
      );
      const opportunity = Math.round(clamp(50 + (netSupport / Math.max(totalBaseWeight, 0.0001)) / 2, 0, 100));

      const evidenceFamilies = Object.fromEntries(
        factors.map((factor) => [factor.factor, {
          available: factor.provenance !== 'unavailable',
          provenance: factor.provenance,
          reliability: factor.reliability,
          effective_weight: factor.effective_weight,
        }]),
      );

      const availableFamilies = availableSpecs.length;
      const totalFamilies = factorSpecs.length;
      const weightedAvailable = factorSpecs.reduce(
        (sum, factor) => sum + (factor.signedScore === null ? 0 : factor.baseWeight),
        0,
      );
      const evidenceCompleteness = Math.round(clamp((weightedAvailable / totalBaseWeight) * 100, 0, 100));

      const reliabilityCoverage = factors.reduce(
        (sum, factor) => sum + Number(factor.effective_weight ?? 0),
        0,
      ) / Math.max(totalBaseWeight, 0.0001);
      const evidenceUncertainty = Math.round(clamp((1 - reliabilityCoverage) * 100, 0, 100));
      const evidenceUncertaintyLabel = uncertaintyLabel(evidenceUncertainty);

      const directionalSpecs = factorSpecs.filter((factor) => factor.directional);
      const directionalFactors = factors.filter((factor) =>
        directionalSpecs.some((spec) => spec.factor === factor.factor)
      );
      const directionalBaseWeightTotal = directionalSpecs.reduce((sum, factor) => sum + factor.baseWeight, 0);
      const directionalAvailableWeight = directionalSpecs.reduce(
        (sum, factor) => sum + (factor.signedScore === null ? 0 : factor.baseWeight),
        0,
      );
      const directionalCompleteness = Math.round(
        clamp((directionalAvailableWeight / Math.max(directionalBaseWeightTotal, 0.0001)) * 100, 0, 100),
      );
      const directionalReliabilityCoverage = directionalFactors.reduce(
        (sum, factor) => sum + Number(factor.effective_weight ?? 0),
        0,
      ) / Math.max(directionalBaseWeightTotal, 0.0001);
      const directionalUncertainty = Math.round(
        clamp((1 - directionalReliabilityCoverage) * 100, 0, 100),
      );
      const meaningfulDirectionalFactors = directionalFactors.filter(
        (factor) =>
          (factor.strength_band === 'Moderate' || factor.strength_band === 'Strong') &&
          factor.provenance !== 'unavailable' &&
          Number(factor.reliability ?? 0) >= 0.35,
      );
      const independentDirectionalFamilies = meaningfulDirectionalFactors.length;

      // Bayesian thesis support: evidence updates neutral prior odds.
      // Baseline importance, reliability and redundancy are all preserved in the update.
      const directionalBaseWeight = factorSpecs
        .filter((factor) => factor.directional)
        .reduce((sum, factor) => sum + factor.baseWeight, 0);
      const BAYES_SCALE = 4.0;
      let posteriorLogOdds = 0; // neutral 50% prior
      for (const factor of factors) {
        const spec = factorSpecs.find((item) => item.factor === factor.factor);
        if (!spec?.directional || factor.signed_score === null || factor.thesis_vote === 'ABSTAIN') continue;
        posteriorLogOdds +=
          (Number(factor.signed_score) / 100) *
          Number(factor.reliability ?? 0) *
          (spec.baseWeight / Math.max(directionalBaseWeight, 0.0001)) *
          BAYES_SCALE;
      }
      const thesisSupport = Math.round(logistic(posteriorLogOdds) * 1000) / 10;

      const sourceQuality = Math.round(
        (factors.reduce(
          (sum, factor) => sum + Number(factor.source_quality ?? 0) * Number(factor.base_weight ?? 0),
          0,
        ) / Math.max(totalBaseWeight, 0.0001)) * 100,
      );

      const confidence = Math.round(clamp(
        (thesisSupport * 0.35) +
        (evidenceCompleteness * 0.25) +
        ((100 - evidenceUncertainty) * 0.25) +
        (agreementForConfidence * 0.15),
        0,
        100,
      ));

      const thesisBlockers: string[] = [];
      const tradeBlockers: string[] = [];

      if (agreement !== null && agreement < 60) {
        thesisBlockers.push('The major directional evidence categories are conflicting or ambiguous.');
      }

      if (liquidityEvidence !== null && liquidityEvidence < -25) {
        tradeBlockers.push('Available option contracts have poor liquidity or unusually wide spreads.');
      }
      if (riskRewardEvidence !== null && riskRewardEvidence < -20) {
        tradeBlockers.push('The current structural reward does not adequately compensate for the estimated risk.');
      }
      if (eventInsideHoldingWindow) {
        tradeBlockers.push('A scheduled earnings event falls inside the expected holding period.');
      }

      const supportingMeaningful = meaningfulDirectionalFactors.filter((factor) => Number(factor.signed_score) > 0);
      const opposingMeaningful = meaningfulDirectionalFactors.filter((factor) => Number(factor.signed_score) < 0);
      const strongSupporting = supportingMeaningful.filter((factor) => factor.strength_band === 'Strong');
      const strongOpposing = opposingMeaningful.filter((factor) => factor.strength_band === 'Strong');
      const strongConfirmationOppose = confirmationOppose.filter((factor) => factor.strength_band === 'Strong');
      const meaningfulWeight = meaningfulDirectionalFactors.reduce(
        (sum, factor) => sum + Number(factor.effective_weight ?? 0) * (factor.strength_band === 'Strong' ? 1.35 : 1),
        0,
      );
      const supportingWeight = supportingMeaningful.reduce(
        (sum, factor) => sum + Number(factor.effective_weight ?? 0) * (factor.strength_band === 'Strong' ? 1.35 : 1),
        0,
      );
      const opposingWeight = opposingMeaningful.reduce(
        (sum, factor) => sum + Number(factor.effective_weight ?? 0) * (factor.strength_band === 'Strong' ? 1.35 : 1),
        0,
      );
      const supportShare = meaningfulWeight > 0 ? Math.round((supportingWeight / meaningfulWeight) * 100) : null;
      const opposeShare = meaningfulWeight > 0 ? Math.round((opposingWeight / meaningfulWeight) * 100) : null;

      // Hierarchical corroboration rules:
      // 1) Moderate/Strong price structure is required to establish direction.
      // 2) At least one Moderate/Strong confirmation family (momentum/participation)
      //    is required for Supported.
      // 3) Strongly Supported requires Strong price structure, both confirmation
      //    families aligned, at least one supportive context family, and no Strong opposition.
      // 4) Context can strengthen/weaken a thesis, but cannot create one without price.
      const hasMeaningfulConflict =
        supportingMeaningful.length > 0 && opposingMeaningful.length > 0;

      let thesisState: ThesisState;
      if (!priceMeaningful || direction === 'neutral') {
        thesisState = 'Insufficient Evidence';
      } else if (
        strongConfirmationOppose.length >= 1 &&
        confirmationSupport.length === 0 &&
        (opposeShare ?? 0) >= 67
      ) {
        thesisState = 'Rejected';
      } else if (
        confirmationOppose.length >= 1 &&
        confirmationSupport.length === 0 &&
        (opposeShare ?? 0) >= 55
      ) {
        thesisState = 'Opposed';
      } else if (
        priceFactor?.strength_band === 'Strong' &&
        confirmationSupport.length >= 2 &&
        contextSupport.length >= 1 &&
        supportShare !== null &&
        supportShare >= 80 &&
        strongOpposing.length === 0
      ) {
        thesisState = 'Strongly Supported';
      } else if (
        confirmationSupport.length >= 1 &&
        supportingMeaningful.length >= 3 &&
        supportShare !== null &&
        supportShare >= 67 &&
        strongConfirmationOppose.length === 0
      ) {
        thesisState = 'Supported';
      } else if (hasMeaningfulConflict) {
        thesisState = 'Mixed';
      } else {
        // A coherent direction can exist without enough independent corroboration
        // to call the thesis Supported. Do not label that "Mixed" when nothing
        // meaningful is actually opposing the thesis.
        thesisState = 'Insufficient Evidence';
      }


      const candidatePool = relevantOptions
        .filter((r) => {
          const bid = n(r.bid);
          const ask = n(r.ask);
          const strike = n(r.strike);
          const exp = r.expiration ? new Date(r.expiration).getTime() : NaN;
          const dte = Number.isFinite(exp) ? (exp - nowMs) / 86400000 : -1;
          return bid !== null && ask !== null && strike !== null && dte >= 7 && dte <= 60;
        })
        .sort((a, b) => {
          const spreadA = n(a.spread_pct) ?? 999;
          const spreadB = n(b.spread_pct) ?? 999;
          if (spreadA !== spreadB) return spreadA - spreadB;
          return Math.abs(Number(a.strike) - Number(price ?? a.strike)) - Math.abs(Number(b.strike) - Number(price ?? b.strike));
        });
      const tradeEligible =
        (thesisState === 'Supported' || thesisState === 'Strongly Supported') &&
        tradeBlockers.length === 0;

      const suggestionEligible =
        tradeEligible &&
        supportShare !== null &&
        supportShare >= 67 &&
        independentDirectionalFamilies >= 3 &&
        confirmationSupport.length >= 1 &&
        strongConfirmationOppose.length === 0 &&
        directionalCompleteness >= 65 &&
        directionalUncertainty <= 55;

      const suggested = suggestionEligible ? candidatePool[0] ?? null : null;

      const riskLevel =
        eventInsideHoldingWindow ||
        (liquidityEvidence !== null && liquidityEvidence < 0) ||
        (n(q.iv) !== null && Number(q.iv) > 0.60)
          ? 'High'
          : 'Moderate';

      const topNews = symbolNews[0];
      const catalystSummary = eventInsideHoldingWindow
        ? `Earnings are scheduled within the expected holding period (${nextEarnings.report_time}).`
        : topNews?.headline ?? null;

      const noTradeReason =
        thesisState === 'Insufficient Evidence'
          ? !priceMeaningful
            ? 'Price/structure has not established a Moderate-or-Strong directional thesis. Confirmation and context evidence are shown, but they cannot create a bullish or bearish thesis without meaningful price structure.'
            : confirmationSupport.length === 0 && confirmationOppose.length === 0
              ? `Price/structure establishes a ${direction} direction, but momentum and participation do not yet provide Moderate-or-Strong confirmation. URSORA is waiting for corroboration rather than treating the thesis as supported.`
              : supportingMeaningful.length < 3
                ? `The ${direction} price thesis has confirmation, but only ${supportingMeaningful.length} independent Moderate-or-Strong supporting families currently qualify. At least 3 are required before URSORA calls the thesis Supported.`
                : 'The directional structure is coherent, but corroboration is still below the threshold required for a Supported thesis.'
          : thesisState === 'Mixed'
            ? 'Moderate-or-Strong evidence is genuinely split between support and opposition, so URSORA is treating the thesis as mixed.'
            : thesisState === 'Opposed'
              ? 'The balance of Moderate-or-Strong evidence currently opposes the proposed direction.'
              : thesisState === 'Rejected'
                ? 'Multiple independent evidence families strongly contradict the proposed direction.'
                : tradeBlockers.length
                  ? tradeBlockers.join(' ')
                  : !suggestionEligible
                    ? [
                        directionalCompleteness < 65
                          ? `Directional evidence completeness is ${directionalCompleteness}% and must reach at least 65% for a proactive suggestion.`
                          : null,
                        directionalUncertainty > 55
                          ? `Directional evidence uncertainty is ${directionalUncertainty}% and must be 55% or lower for a proactive suggestion.`
                          : null,
                        independentDirectionalFamilies < 3
                          ? `Only ${independentDirectionalFamilies} independent Moderate-or-Strong directional evidence families currently qualify; at least 3 are required.`
                          : null,
                        supportShare === null
                          ? 'Thesis support cannot yet be established from enough Moderate-or-Strong evidence.'
                          : supportShare < 67
                            ? `Only ${supportShare}% of weighted Moderate-or-Strong evidence supports the proposed direction; at least 67% is required for a proactive suggestion.`
                            : null,
                      ].filter(Boolean).join(' ')
                    : null;

      created.push({
        run_id: runId,
        symbol,
        trading_day: new Date().toISOString().slice(0, 10),
        direction,
        strategy: suggestionEligible ? 'directional option' : 'No Trade',
        confidence_score: confidence,
        opportunity_score: opportunity,
        risk_level: riskLevel,
        holding_period: '1–5 days',
        catalyst_summary: catalystSummary,
        no_trade_reason: noTradeReason,
        stock_price_at_generation: price,
        suggested_expiration: suggested?.expiration ?? null,
        suggested_strike: n(suggested?.strike),
        break_even: null,
        est_premium: null,
        max_defined_loss: null,
        target_price: tacticalTarget,
        invalidation_level: tacticalInvalidation,
        expected_move_pct: price !== null && atr !== null && price > 0 ? (atr / price) * 100 : null,
        score_breakdown: {
          factors,
          raw: {
            change_pct: change,
            momentum_score: momentum,
            composite_orientation: compositeOrientation,
            put_call_ratio: putCallRatio,
            relative_volume: computedRelVolume,
            rsi_14: rsi,
            macd_line: macd?.line ?? null,
            macd_signal: macd?.signal ?? null,
            macd_histogram: macd?.histogram ?? null,
            return_5d_pct: return5,
            return_20d_pct: return20,
            price_structure_higher: higherStructure,
            price_structure_lower: lowerStructure,
            adx_14: dmi?.adx ?? null,
            plus_di_14: dmi?.plusDi ?? null,
            minus_di_14: dmi?.minusDi ?? null,
            sma20_rising: sma20Rising,
            sma20_falling: sma20Falling,
            short_bull_stack: shortBullStack,
            short_bear_stack: shortBearStack,
            long_bull_context: longBullContext,
            long_bear_context: longBearContext,
            breakout_up: breakoutUp,
            breakout_down: breakoutDown,
            reward_risk_ratio: estimatedRatio,
            structural_support: support,
            structural_resistance: resistance,
            tactical_target: tacticalTarget,
            tactical_invalidation: tacticalInvalidation,
            posterior_log_odds: posteriorLogOdds,
          },
          thesis_state: thesisState,
          thesis_support: thesisSupport,
          evidence_completeness: evidenceCompleteness,
          evidence_uncertainty: evidenceUncertainty,
          evidence_uncertainty_label: evidenceUncertaintyLabel,
          directional_completeness: directionalCompleteness,
          directional_uncertainty: directionalUncertainty,
          evidence_families: evidenceFamilies,
          available_families: availableFamilies,
          total_families: totalFamilies,
          agreement_score: agreement,
          agreement_family_count: directionalEvidence.length,
          support_share: supportShare,
          oppose_share: opposeShare,
          strong_supporting_families: strongSupporting.length,
          strong_opposing_families: strongOpposing.length,
          thesis_hierarchy: {
            primary: {
              factor: 'price_trend',
              band: priceFactor?.strength_band ?? 'Insufficient',
              vote: priceFactor?.thesis_vote ?? 'ABSTAIN',
            },
            confirmation: {
              state: confirmationState,
              supporting_families: confirmationSupport.map((factor) => factor.factor),
              opposing_families: confirmationOppose.map((factor) => factor.factor),
            },
            context: {
              state: contextState,
              supporting_families: contextSupport.map((factor) => factor.factor),
              opposing_families: contextOppose.map((factor) => factor.factor),
            },
            auxiliary: {
              options_vote: factorByKey.get('options_market')?.thesis_vote ?? 'ABSTAIN',
              note: 'Aggregate put/call activity is currently capped at Weak and cannot vote without richer options-flow context.',
            },
          },
          interaction_flags: interactionFlags,
          independent_directional_families: independentDirectionalFamilies,
          reliability_coverage: Math.round(reliabilityCoverage * 1000) / 10,
          source_quality: sourceQuality,
          thesis_blockers: thesisBlockers,
          trade_blockers: tradeBlockers,
          trade_eligible: tradeEligible,
          suggestion_eligible: suggestionEligible,
        },
        weights: {
          method: 'AHP baseline weighting + reliability discounting + Bayesian thesis update',
          ahp_consistency_ratio: Math.round(ahp.consistency_ratio * 10000) / 10000,
          base: Object.fromEntries(factorSpecs.map((x) => [x.factor, x.baseWeight])),
          effective: Object.fromEntries(factors.map((x) => [x.factor, x.effective_weight])),
          decisions: [
            `Thesis classification: ${thesisState}.`,
            `Bayesian thesis support: ${thesisSupport}% from a neutral 50% prior.`,
            `Overall evidence completeness: ${evidenceCompleteness}% (${availableFamilies} of ${totalFamilies} primary categories available).`,
            `Directional evidence completeness: ${directionalCompleteness}%.`,
            `Directional evidence uncertainty: ${directionalUncertainty}%.`,
            `Overall evidence uncertainty: ${evidenceUncertainty}% (${evidenceUncertaintyLabel}).`,
            agreement === null
              ? `Directional agreement: insufficient meaningful evidence families to calculate.`
              : `Directional agreement: ${agreement}% across ${directionalEvidence.length} meaningful directional families.`,
            `AHP consistency ratio: ${(ahp.consistency_ratio * 100).toFixed(2)}%.`,
            thesisBlockers.length ? `Thesis constraints: ${thesisBlockers.join(' ')}` : 'No thesis-level directional constraints were identified.',
            tradeBlockers.length ? `Trade constraints: ${tradeBlockers.join(' ')}` : 'No hard trade constraints were identified from the data currently available.',
            suggestionEligible
              ? 'Suggestion eligibility: eligible for proactive contract suggestion.'
              : `Suggestion eligibility: not eligible for proactive suggestion. Current gate values — price structure ${priceFactor?.strength_band ?? 'Insufficient'}, confirmation ${confirmationState}, weighted support ${supportShare ?? 'unavailable'}%, independent Moderate/Strong families ${independentDirectionalFamilies}, directional completeness ${directionalCompleteness}%, directional uncertainty ${directionalUncertainty}%.`,
            'Observed and derived evidence are reliability-discounted for freshness, source quality, and redundancy. Imputed evidence receives an additional imputation-confidence discount. Unavailable evidence contributes no directional support.',
          ],
        },
        regime: snapshot?.regime ?? 'Mixed',
        regime_explanation: snapshot?.regime_note ?? 'Broader market conditions derived from the latest stored market data.',
        engine_version: 'tradecycle-5.2.3',
        is_demo: Boolean(q.is_demo ?? true),
        generated_at: started,
      });
    }

    let signalCount = 0;
    if (created.length) {
      const { error } = await db.from('signals').insert(created);
      if (error) throw error;
      signalCount = created.length;
    }

    const { error: runError } = await db.from('analysis_runs').insert({
      run_id: runId,
      kind,
      trading_day: new Date().toISOString().slice(0, 10),
      signals_generated: signalCount,
      updates_emitted: 0,
      feed_events: 0,
      regime: snapshot?.regime ?? null,
      notes: signalCount
        ? `TradeCycle v5.2.3 swing analysis completed for authenticated user ${user.id}; outside regular hours, price evidence is anchored to the most recent frozen session close.`
        : 'No stored quote data were available; no signals were generated.',
      started_at: started,
      finished_at: new Date().toISOString(),
    });
    if (runError) throw runError;

    return json({
      success: true,
      signals: signalCount,
      updates: 0,
      run_id: runId,
      engine_version: 'tradecycle-5.2.3',
      note: signalCount ? 'Signals generated using all currently available evidence categories.' : 'No stored quote data available.',
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
