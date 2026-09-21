import { AuthError, requireUser } from '../_shared/auth.ts';
import { handleOptions, json } from '../_shared/http.ts';

type AnyRow = Record<string, any>;
type ThesisState = 'Rejected' | 'Unsupported' | 'Preliminary' | 'Supported' | 'Strongly Supported';

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

function factorRow(spec: FactorSpec) {
  const signed = spec.signedScore ?? 0;
  const strength = spec.signedScore === null ? 0 : Math.abs(signed);
  const meaningful = strength >= 25;
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
    contribution: spec.signedScore === null ? 0 : signed * effectiveWeight,
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
  'market_alignment',
  'options_market',
  'catalysts_news',
  'liquidity',
  'risk_reward',
] as const;

// Initial v4 expert priorities encoded as a perfectly reciprocal pairwise matrix.
// These are intentionally explicit and should be re-calibrated against backtest data later.
const AHP_PRIORITY = {
  price_trend: 0.23,
  momentum: 0.15,
  market_alignment: 0.13,
  options_market: 0.17,
  catalysts_news: 0.13,
  liquidity: 0.10,
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
  const randomIndex = 1.32; // Saaty RI for n=7
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
    const ahp = deriveAhpWeights();

    const { data: snapshot } = await db
      .from('market_snapshots')
      .select('*')
      .order('as_of', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: latestQuotes, error: quoteError } = await db
      .from('quotes')
      .select('*')
      .order('as_of', { ascending: false })
      .limit(500);
    if (quoteError) throw quoteError;

    const bySymbol = new Map<string, AnyRow>();
    for (const q of latestQuotes ?? []) {
      const symbol = String(q.symbol ?? '').toUpperCase();
      if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, q);
    }


    let barRows: AnyRow[] = [];
    try {
      const { data } = await db
        .from('ohlcv_bars')
        .select('symbol,bar_time,high,low,close')
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
    let optionRows: AnyRow[] = [];
    try {
      const { data } = await db
        .from('option_market_snapshots')
        .select('*')
        .gte('retrieved_at', new Date(nowMs - 36 * 3600000).toISOString())
        .order('retrieved_at', { ascending: false })
        .limit(4000);
      optionRows = data ?? [];
    } catch { optionRows = []; }

    let recentNews: AnyRow[] = [];
    try {
      const { data } = await db
        .from('news_items')
        .select('symbol,headline,sentiment,sentiment_score,impact,published_at,is_demo')
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
    for (const row of optionRows) {
      const s = String(row.underlying_symbol ?? '').toUpperCase();
      if (!s) continue;
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

      // ----- Absolute market orientations (-100 bearish, +100 bullish) -----
      const priceParts: number[] = [];
      if (change !== null) priceParts.push(Math.sign(change) * Math.min(100, Math.abs(change) * 24));
      if (trend.includes('up')) priceParts.push(60);
      else if (trend.includes('down')) priceParts.push(-60);
      if (price !== null && sma20 !== null) priceParts.push(price >= sma20 ? 30 : -30);
      if (sma20 !== null && sma50 !== null) priceParts.push(sma20 >= sma50 ? 45 : -45);
      if (sma50 !== null && sma200 !== null) priceParts.push(sma50 >= sma200 ? 55 : -55);
      const priceOrientation = avg(priceParts);

      const momentumOrientation = momentum === null ? null : clamp((momentum - 50) * 2.5);

      const symbolOptions = optionByUnderlying.get(symbol) ?? [];
      const callVolume = symbolOptions.filter((r) => String(r.option_type).toUpperCase() === 'CALL')
        .reduce((a, r) => a + Number(r.volume ?? 0), 0);
      const putVolume = symbolOptions.filter((r) => String(r.option_type).toUpperCase() === 'PUT')
        .reduce((a, r) => a + Number(r.volume ?? 0), 0);
      const putCallRatio = callVolume > 0 ? putVolume / callVolume : n(q.put_call_ratio);

      let optionOrientation: number | null = null;
      if (putCallRatio !== null) {
        // ~1.0 is neutral; ratios below 1 favor calls, above 1 favor puts.
        optionOrientation = clamp((1 - putCallRatio) * 85);
      }

      const symbolNews = newsBySymbol.get(symbol) ?? [];
      const newsScores: number[] = [];
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
        newsScores.push(clamp(signed) * impactMultiplier(item.impact) * recency);
      }
      const newsOrientation = newsScores.length ? clamp(newsScores.reduce((a, b) => a + b, 0) / newsScores.length) : null;

      // Determine proposed direction from independent directional evidence.
      const orientationInputs = [priceOrientation, momentumOrientation, broadMarketOrientation, optionOrientation, newsOrientation]
        .filter((v): v is number => v !== null);
      const compositeOrientation = orientationInputs.length ? orientationInputs.reduce((a, b) => a + b, 0) / orientationInputs.length : 0;
      const direction = directionName(compositeOrientation);

      // ----- Relative evidence scores: positive supports proposed direction -----
      const priceEvidence = relativeToDirection(priceOrientation, direction);
      const momentumEvidence = relativeToDirection(momentumOrientation, direction);
      const marketEvidence = relativeToDirection(broadMarketOrientation, direction);
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

      // Risk/reward from technical structure when historical bars are available.
      let riskRewardEvidence: number | null = null;
      let estimatedRatio: number | null = null;
      if (price !== null && atr !== null && atr > 0 && direction !== 'neutral') {
        const targetDistance = direction === 'bullish'
          ? (resistance !== null && resistance > price ? resistance - price : atr * 1.5)
          : (support !== null && support < price ? price - support : atr * 1.5);
        const riskDistance = direction === 'bullish'
          ? (support !== null && support < price ? price - support : atr)
          : (resistance !== null && resistance > price ? resistance - price : atr);
        if (riskDistance > 0) {
          estimatedRatio = targetDistance / riskDistance;
          riskRewardEvidence = clamp((estimatedRatio - 1) * 70);
        }
      }

      // Cross-factor agreement only considers independent directional factors with meaningful strength.
      const directionalEvidence = [priceEvidence, momentumEvidence, marketEvidence, optionsEvidence, newsEvidence]
        .filter((v): v is number => v !== null && Math.abs(v) >= 25);
      const supportingCount = directionalEvidence.filter((v) => v > 0).length;
      const opposingCount = directionalEvidence.filter((v) => v < 0).length;
      const agreement = directionalEvidence.length
        ? Math.round((Math.max(supportingCount, opposingCount) / directionalEvidence.length) * 100)
        : 50;
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
            : `Current price movement, trend direction, and moving-average structure provide ${Math.abs(priceEvidence) < 25 ? 'limited' : priceEvidence > 0 ? 'supporting' : 'opposing'} evidence for the proposed ${direction} direction.`,
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
          explanation: momentum === null
            ? 'A momentum reading is not currently available.'
            : `The momentum reading is ${momentum.toFixed(1)}/100 and provides ${Math.abs(momentumEvidence ?? 0) < 25 ? 'limited directional evidence' : (momentumEvidence ?? 0) > 0 ? 'meaningful confirmation' : 'meaningful contradiction'}.`,
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
            : `Observed call and put activity produces a put/call volume ratio of ${putCallRatio?.toFixed(2) ?? 'unavailable'}, which ${Math.abs(optionsEvidence) < 25 ? 'does not provide meaningful directional confirmation' : optionsEvidence > 0 ? 'supports' : 'opposes'} the proposed direction.`,
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
            : `Recent stored news and event information ${Math.abs(newsEvidence) < 25 ? 'is not strongly directional' : newsEvidence > 0 ? 'supports' : 'opposes'} the proposed direction.`,
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
            : `The estimated reward-to-risk relationship is approximately ${estimatedRatio?.toFixed(2) ?? 'unavailable'} to 1 using current support/resistance and ATR derived from stored daily price history.`,
        },
      ];

      const availableSpecs = factorSpecs.filter((factor) => factor.signedScore !== null);
      const factors = factorSpecs.map((spec) => factorRow(spec));

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

      const directionalFactors = factors.filter((factor) =>
        factorSpecs.find((spec) => spec.factor === factor.factor)?.directional
      );
      const independentDirectionalFamilies = directionalFactors.filter(
        (factor) => factor.provenance !== 'unavailable' && Number(factor.reliability ?? 0) >= 0.35,
      ).length;

      // Bayesian thesis support: evidence updates neutral prior odds.
      // Baseline importance, reliability and redundancy are all preserved in the update.
      const directionalBaseWeight = factorSpecs
        .filter((factor) => factor.directional)
        .reduce((sum, factor) => sum + factor.baseWeight, 0);
      const BAYES_SCALE = 4.0;
      let posteriorLogOdds = 0; // neutral 50% prior
      for (const factor of factors) {
        const spec = factorSpecs.find((item) => item.factor === factor.factor);
        if (!spec?.directional || factor.signed_score === null) continue;
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
        (agreement * 0.15),
        0,
        100,
      ));

      const blockers: string[] = [];
      if (liquidityEvidence !== null && liquidityEvidence < -25) blockers.push('Available option contracts have poor liquidity or unusually wide spreads.');
      if (riskRewardEvidence !== null && riskRewardEvidence < -20) blockers.push('The current structural reward does not adequately compensate for the estimated risk.');
      if (eventInsideHoldingWindow) blockers.push('A scheduled earnings event falls inside the expected holding period.');
      if (directionalEvidence.length >= 3 && agreement < 60) blockers.push('The major directional evidence categories do not agree sufficiently.');

      let thesisState: ThesisState;
      if (direction === 'neutral') thesisState = 'Unsupported';
      else if (thesisSupport < 35 && evidenceCompleteness >= 60) thesisState = 'Rejected';
      else if (
        evidenceCompleteness < 55 ||
        evidenceUncertainty > 55 ||
        independentDirectionalFamilies < 3
      ) thesisState = 'Preliminary';
      else if (blockers.length) thesisState = 'Unsupported';
      else if (
        thesisSupport >= 78 &&
        evidenceCompleteness >= 75 &&
        evidenceUncertainty <= 35 &&
        agreement >= 70 &&
        opportunity >= 65
      ) thesisState = 'Strongly Supported';
      else if (
        thesisSupport >= 65 &&
        evidenceCompleteness >= 65 &&
        evidenceUncertainty <= 45 &&
        agreement >= 60
      ) thesisState = 'Supported';
      else if (thesisSupport < 35) thesisState = 'Rejected';
      else thesisState = 'Unsupported';

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
      const suggested = (thesisState === 'Supported' || thesisState === 'Strongly Supported') ? candidatePool[0] ?? null : null;

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
        thesisState === 'Preliminary'
          ? `The analysis is preliminary because evidence completeness is ${evidenceCompleteness}% and uncertainty is ${evidenceUncertainty}%. URSORA requires at least three sufficiently independent directional evidence families before classifying the thesis as supported.`
          : thesisState === 'Unsupported'
            ? (blockers.length ? blockers.join(' ') : 'The available evidence does not provide sufficient agreement and strength to support this trade analysis.')
            : thesisState === 'Rejected'
              ? 'The available evidence materially contradicts the proposed direction.'
              : null;

      created.push({
        run_id: runId,
        symbol,
        trading_day: new Date().toISOString().slice(0, 10),
        direction,
        strategy: thesisState === 'Supported' || thesisState === 'Strongly Supported' ? 'directional option' : 'No Trade',
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
        target_price: direction === 'bullish' ? resistance : direction === 'bearish' ? support : null,
        invalidation_level: direction === 'bullish' ? support : direction === 'bearish' ? resistance : null,
        expected_move_pct: price !== null && atr !== null && price > 0 ? (atr / price) * 100 : null,
        score_breakdown: {
          factors,
          raw: {
            change_pct: change,
            momentum_score: momentum,
            composite_orientation: compositeOrientation,
            put_call_ratio: putCallRatio,
            relative_volume: relVolume,
            reward_risk_ratio: estimatedRatio,
            posterior_log_odds: posteriorLogOdds,
          },
          thesis_state: thesisState,
          thesis_support: thesisSupport,
          evidence_completeness: evidenceCompleteness,
          evidence_uncertainty: evidenceUncertainty,
          evidence_uncertainty_label: evidenceUncertaintyLabel,
          evidence_families: evidenceFamilies,
          available_families: availableFamilies,
          total_families: totalFamilies,
          agreement_score: agreement,
          independent_directional_families: independentDirectionalFamilies,
          reliability_coverage: Math.round(reliabilityCoverage * 1000) / 10,
          source_quality: sourceQuality,
          blockers,
        },
        weights: {
          method: 'AHP baseline weighting + reliability discounting + Bayesian thesis update',
          ahp_consistency_ratio: Math.round(ahp.consistency_ratio * 10000) / 10000,
          base: Object.fromEntries(factorSpecs.map((x) => [x.factor, x.baseWeight])),
          effective: Object.fromEntries(factors.map((x) => [x.factor, x.effective_weight])),
          decisions: [
            `Thesis classification: ${thesisState}.`,
            `Bayesian thesis support: ${thesisSupport}% from a neutral 50% prior.`,
            `Evidence completeness: ${evidenceCompleteness}% (${availableFamilies} of ${totalFamilies} primary categories available).`,
            `Evidence uncertainty: ${evidenceUncertainty}% (${evidenceUncertaintyLabel}).`,
            `Evidence agreement: ${agreement}% among meaningful directional categories.`,
            `AHP consistency ratio: ${(ahp.consistency_ratio * 100).toFixed(2)}%.`,
            blockers.length ? `Trade constraints: ${blockers.join(' ')}` : 'No hard trade constraints were identified from the data currently available.',
            'Observed and derived evidence are reliability-discounted for freshness, source quality, and redundancy. Imputed evidence receives an additional imputation-confidence discount. Unavailable evidence contributes no directional support.',
          ],
        },
        regime: snapshot?.regime ?? 'Mixed',
        regime_explanation: snapshot?.regime_note ?? 'Broader market conditions derived from the latest stored market data.',
        engine_version: 'tradecycle-4',
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
        ? `TradeCycle v4 probabilistic evidence analysis completed for authenticated user ${user.id}.`
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
      engine_version: 'tradecycle-4',
      note: signalCount ? 'Signals generated using all currently available evidence categories.' : 'No stored quote data available.',
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
