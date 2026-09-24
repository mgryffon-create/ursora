import db from '@/lib/db';
import { APP_CONFIG } from '@/lib/config';
import type {
  ActiveAnalysis, AnalysisRun, Bar, ContractCandidate, EarningsEvent, EconomicEvent, FeedEvent, Filing, TraderProfile,
  MarketMover, MarketSnapshot, NewsItem, PaperTrade, ProviderConfig, Quote,
  RiskAssessment, SentimentReading, Signal, SignalUpdate, Ticker, TranscriptStatement,
} from '@/lib/types';

/** The project REST layer serialises bare JS arrays as Postgres array literals,
 *  so list-shaped jsonb columns are stored as { items: [...] }. Read either shape. */
export function asList<T = Record<string, unknown>>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object' && Array.isArray((v as { items?: unknown[] }).items)) {
    return (v as { items: T[] }).items;
  }
  return [];
}

const rows = <T,>(data: T[] | null): T[] => data ?? [];

export const EDGE_BASE = APP_CONFIG.edgeBaseUrl;

export const EDGE_FUNCTIONS = {
  analysis: 'run-analysis',
  backtest: 'run-backtest',
  analyst: 'ai-analyst',
  paperDashboard: 'webull-paper-dashboard',
  marketSync: 'sync-massive-market',
  optionsSync: 'sync-massive-options',
  tradeStructure: 'build-trade-structure',
  tradeLifecycle: 'sync-tradecycle-lifecycle',
  alphaNewsSync: 'sync-alpha-news',
  alphaEarningsSync: 'sync-alpha-earnings',
  marketContextSync: 'sync-market-context',
} as const;

export type EdgeFunctionSlug = (typeof EDGE_FUNCTIONS)[keyof typeof EDGE_FUNCTIONS];

export async function callEdge<T = Record<string, unknown>>(
  slug: EdgeFunctionSlug,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  if (sessionError) throw sessionError;

  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error('You must be signed in before Ursora can call its analysis services.');
  }

  const res = await fetch(`${EDGE_BASE}/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: APP_CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const rawError = (parsed as { error?: unknown } | null)?.error;
    const msg =
      typeof rawError === 'string'
        ? rawError
        : rawError !== undefined
          ? (() => {
              try { return JSON.stringify(rawError); }
              catch { return String(rawError); }
            })()
          : `${slug} failed with HTTP ${res.status}: ${text.slice(0, 300)}`;
    throw new Error(msg);
  }
  return (parsed ?? {}) as T;
}


export interface WebullPaperDashboard {
  success: boolean;
  provider: string;
  environment: string;
  account: {
    account_id: string | null;
    label: string | null;
    type: string | null;
    class: string | null;
  };
  summary: {
    net_liquidation: number | null;
    cash: number | null;
    market_value: number | null;
    unrealized_pl: number | null;
    day_pl: number | null;
    option_buying_power: number | null;
    day_buying_power: number | null;
    overnight_buying_power: number | null;
    day_trades_left: string | number | null;
    maintenance_margin: number | null;
  };
  positions: Array<{
    symbol: string | null;
    instrument_id: string | null;
    asset_type: string | null;
    quantity: number | null;
    average_cost: number | null;
    market_price: number | null;
    market_value: number | null;
    unrealized_pl: number | null;
    unrealized_pl_pct: number | null;
    side: string | null;
  }>;
  position_count: number;
  retrieved_at: string;
  is_demo: boolean;
  errors: { balance: string | null; positions: string | null };
}

export async function fetchWebullPaperDashboard(): Promise<WebullPaperDashboard> {
  return callEdge<WebullPaperDashboard>(EDGE_FUNCTIONS.paperDashboard, {});
}


function friendlyPipelineWarning(label: string, error: unknown): string {
  const raw = describeUnknownError(error);

  if (/bigint|22P02|invalid input syntax/i.test(raw)) {
    return `${label}: some historical values could not be stored correctly.`;
  }
  if (/429|rate limit|thrott/i.test(raw)) {
    return `${label}: provider temporarily rate-limited this request.`;
  }
  if (/401|signature|authentication/i.test(raw)) {
    return `${label}: provider authentication failed.`;
  }
  if (/403|entitle|subscription|plan|not.?authorized/i.test(raw)) {
    return `${label}: this dataset is not included in the current provider entitlement.`;
  }

  const detail = raw.replace(/\s+/g, ' ').trim().slice(0, 220);
  return `${label}: refresh did not complete${detail ? ` — ${detail}` : '.'}`;
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function refreshMarketSymbols(
  symbols: string[],
  refreshContext = false,
): Promise<void> {
  const normalized = [...new Set(
    symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean),
  )];
  if (!normalized.length) return;
  await callEdge(EDGE_FUNCTIONS.marketSync, { symbols: normalized });
  if (refreshContext) {
    await callEdge(EDGE_FUNCTIONS.marketContextSync, { force: true });
  }
}

export interface FreshAnalysisResult {
  signals: number;
  updates: number;
  run_id?: string;
  engine_version?: string;
  warnings: string[];
}

/**
 * Refreshes the market evidence Ursora can gather, then runs TradeCycle analysis.
 * Enrichment failures are retained as warnings so missing evidence lowers
 * completeness instead of preventing analysis from running altogether.
 */
export async function runFreshAnalysis(
  body: Record<string, unknown> = { kind: 'manual' },
): Promise<FreshAnalysisResult> {
  const warnings: string[] = [];
  const selectedSymbols = Array.isArray(body.symbols)
    ? [...new Set(body.symbols.map((value) => String(value).trim().toUpperCase()).filter(Boolean))]
    : [];
  const selectedPayload = selectedSymbols.length ? { symbols: selectedSymbols } : {};
  const marketSymbols = selectedSymbols.length
    ? [...new Set([...selectedSymbols, 'SPY', 'QQQ', 'IWM'])]
    : [];
  const marketPayload = marketSymbols.length ? { symbols: marketSymbols } : {};

  const stages: Array<{ label: string; slug: EdgeFunctionSlug; payload: Record<string, unknown> }> = [
    { label: 'Massive market quotes and historical data', slug: EDGE_FUNCTIONS.marketSync, payload: marketPayload },
    { label: 'Massive options chain', slug: EDGE_FUNCTIONS.optionsSync, payload: selectedPayload },
    { label: 'market context', slug: EDGE_FUNCTIONS.marketContextSync, payload: { force: true } },
    { label: 'verified news and sentiment', slug: EDGE_FUNCTIONS.alphaNewsSync, payload: selectedPayload },
    { label: 'earnings calendar', slug: EDGE_FUNCTIONS.alphaEarningsSync, payload: selectedPayload },
  ];

  for (const stage of stages) {
    try {
      await callEdge(stage.slug, stage.payload);
    } catch (error) {
      warnings.push(
        friendlyPipelineWarning(stage.label, error),
      );
    }
  }

  const analysis = await callEdge<{
    signals?: number;
    updates?: number;
    run_id?: string;
    engine_version?: string;
  }>(EDGE_FUNCTIONS.analysis, body);

  if (analysis.run_id) {
    try {
      await callEdge(EDGE_FUNCTIONS.tradeStructure, { run_id: analysis.run_id });
    } catch (error) {
      warnings.push(
        `contract selection and risk assessment: ${describeUnknownError(error)}`,
      );
    }

    try {
      await callEdge(EDGE_FUNCTIONS.tradeLifecycle, {});
    } catch (error) {
      warnings.push(
        friendlyPipelineWarning('trade monitoring and review', error),
      );
    }
  }

  return {
    signals: analysis.signals ?? 0,
    updates: analysis.updates ?? 0,
    run_id: analysis.run_id,
    engine_version: analysis.engine_version,
    warnings,
  };
}

/* --------------------------------- reads --------------------------------- */

export async function fetchTickers(): Promise<Ticker[]> {
  const { data, error } = await db.from('tickers').select('*').order('priority', { ascending: true });
  if (error) throw error;
  return rows<Ticker>(data as Ticker[]);
}

export async function fetchLatestQuotes(): Promise<Record<string, Quote>> {
  // Do not take the newest N quote rows globally: frequently-refreshed favorites can
  // crowd older-but-current discovery symbols out of that window. Fetch the latest
  // real quote for each configured ticker so every route gets one stable snapshot.
  const { data: tickerRows, error: tickerError } = await db
    .from('tickers')
    .select('symbol')
    .order('priority', { ascending: true });
  if (tickerError) throw tickerError;

  const symbols = [...new Set(
    ((tickerRows as Array<{ symbol: string }> | null) ?? [])
      .map((row) => String(row.symbol).toUpperCase())
      .filter(Boolean),
  )];

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const { data, error } = await db
        .from('quotes')
        .select('*')
        .eq('symbol', symbol)
        .eq('is_demo', false)
        .order('retrieved_at', { ascending: false })
        .order('as_of', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data as Quote[] | null)?.[0] ?? null;
    }),
  );

  const map: Record<string, Quote> = {};
  for (const quote of results) {
    if (quote) map[quote.symbol] = quote;
  }
  return map;
}

export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const { data, error } = await db
    .from('quotes')
    .select('*')
    .eq('symbol', symbol)
    .eq('is_demo', false)
    .order('retrieved_at', { ascending: false })
    .order('as_of', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data as Quote[])?.[0] ?? null;
}

export async function fetchSnapshot(): Promise<MarketSnapshot | null> {
  const { data, error } = await db
    .from('market_snapshots')
    .select('*')
    .order('as_of', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data as MarketSnapshot[])?.[0] ?? null;
}

export async function fetchMovers(): Promise<MarketMover[]> {
  const { data, error } = await db
    .from('market_movers')
    .select('*')
    .order('as_of', { ascending: false })
    .limit(60);
  if (error) throw error;
  return rows<MarketMover>(data as MarketMover[]);
}

const isMissingTraderProfileTable = (error: unknown) => {
  const message = describeUnknownError(error);
  return /trader_profiles|PGRST205|schema cache|relation .* does not exist/i.test(message);
};

const profileFromMetadata = (user: { id: string; user_metadata?: Record<string, unknown> } | null | undefined): TraderProfile | null => {
  const raw = user?.user_metadata?.ursora_trader_profile;
  if (!raw || typeof raw !== 'object' || !user?.id) return null;
  const profile = raw as Partial<TraderProfile>;
  return {
    user_id: user.id,
    brokerages: Array.isArray(profile.brokerages) ? profile.brokerages : [],
    trading_styles: Array.isArray(profile.trading_styles) ? profile.trading_styles : [],
    trade_types: Array.isArray(profile.trade_types) ? profile.trade_types : [],
    primary_goals: Array.isArray(profile.primary_goals) ? profile.primary_goals : [],
    profit_target_type: profile.profit_target_type ?? 'none',
    profit_target_value: profile.profit_target_value ?? null,
    risk_comfort: profile.risk_comfort ?? 'moderate',
    max_loss_type: profile.max_loss_type ?? 'none',
    max_loss_value: profile.max_loss_value ?? null,
    ursora_goals: Array.isArray(profile.ursora_goals) ? profile.ursora_goals : [],
    self_reported_habits: Array.isArray(profile.self_reported_habits) ? profile.self_reported_habits : [],
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
};

export async function fetchTraderProfile(): Promise<TraderProfile | null> {
  const { data: authData } = await db.auth.getUser();
  const metadataProfile = profileFromMetadata(authData.user);

  const { data, error } = await db
    .from('trader_profiles')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTraderProfileTable(error)) return metadataProfile;
    throw error;
  }

  const tableProfile = (data as TraderProfile | null) ?? null;
  return tableProfile ?? metadataProfile;
}

export async function saveTraderProfile(profile: Omit<TraderProfile, 'user_id'> & { user_id: string }): Promise<void> {
  const now = new Date().toISOString();
  const durableProfile: TraderProfile = { ...profile, updated_at: now };

  // Auth metadata is the durable account-level profile source available immediately,
  // including before the trader_profiles migration is applied. This keeps MyURSORA
  // persistent across logout/login and across devices on the same account.
  const { error: metadataError } = await db.auth.updateUser({
    data: { ursora_trader_profile: durableProfile },
  });
  if (metadataError) throw metadataError;

  // Mirror to the relational table when it exists so analytics and future brokerage
  // pipelines can query the profile without parsing auth metadata.
  const { error: tableError } = await db
    .from('trader_profiles')
    .upsert(durableProfile, { onConflict: 'user_id' });

  if (tableError && !isMissingTraderProfileTable(tableError)) throw tableError;
}

export async function fetchActiveAnalyses(): Promise<ActiveAnalysis[]> {
  const { data, error } = await db
    .from('active_analyses')
    .select('*')
    .eq('status', 'active')
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const now = Date.now();
  return rows<ActiveAnalysis>(data as ActiveAnalysis[]).filter((item) => {
    if (!item.valid_until) return true;
    const expires = new Date(item.valid_until).getTime();
    return !Number.isFinite(expires) || expires >= now;
  });
}

export async function fetchTodaySignals(): Promise<Signal[]> {
  const { data: latestRun, error: runError } = await db
    .from('analysis_runs')
    .select('run_id')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw runError;

  const runId = latestRun?.run_id ? String(latestRun.run_id) : null;
  if (!runId) return [];

  const { data, error } = await db
    .from('signals')
    .select('*')
    .eq('run_id', runId)
    .order('opportunity_score', { ascending: false })
    .limit(200);
  if (error) throw error;
  return rows<Signal>(data as Signal[]);
}

export async function fetchSignal(id: number): Promise<Signal | null> {
  const { data, error } = await db.from('signals').select('*').eq('id', id).limit(1);
  if (error) throw error;
  return (data as Signal[])?.[0] ?? null;
}

export async function fetchSignalHistory(symbol?: string, limit = 120): Promise<Signal[]> {
  let q = db.from('signals').select('*').order('generated_at', { ascending: false }).limit(limit);
  if (symbol) q = q.eq('symbol', symbol);
  const { data, error } = await q;
  if (error) throw error;
  return rows<Signal>(data as Signal[]);
}

export async function fetchCandidates(signalId: number): Promise<ContractCandidate[]> {
  const { data, error } = await db
    .from('contract_candidates')
    .select('*')
    .eq('signal_id', signalId)
    .order('rank', { ascending: true });
  if (error) throw error;
  return rows<ContractCandidate>(data as ContractCandidate[]);
}

export async function fetchRisk(signalId: number): Promise<RiskAssessment | null> {
  const { data, error } = await db.from('risk_assessments').select('*').eq('signal_id', signalId).limit(1);
  if (error) throw error;
  return (data as RiskAssessment[])?.[0] ?? null;
}

export async function fetchNews(symbol?: string, limit = 40): Promise<NewsItem[]> {
  let q = db.from('news_items').select('*').order('published_at', { ascending: false }).limit(limit);
  if (symbol) q = q.eq('symbol', symbol);
  const { data, error } = await q;
  if (error) throw error;
  return rows<NewsItem>(data as NewsItem[]);
}

export async function fetchFilings(symbol?: string): Promise<Filing[]> {
  let q = db.from('filings').select('*').order('filed_at', { ascending: false }).limit(30);
  if (symbol) q = q.eq('symbol', symbol);
  const { data, error } = await q;
  if (error) throw error;
  return rows<Filing>(data as Filing[]);
}

export async function fetchTranscripts(symbol?: string): Promise<TranscriptStatement[]> {
  let q = db.from('transcript_statements').select('*').order('said_at', { ascending: false }).limit(30);
  if (symbol) q = q.eq('symbol', symbol);
  const { data, error } = await q;
  if (error) throw error;
  return rows<TranscriptStatement>(data as TranscriptStatement[]);
}

export async function fetchSentiment(symbol?: string): Promise<SentimentReading[]> {
  let q = db.from('sentiment_readings').select('*').order('as_of', { ascending: false }).limit(60);
  if (symbol) q = q.eq('symbol', symbol);
  const { data, error } = await q;
  if (error) throw error;
  return rows<SentimentReading>(data as SentimentReading[]);
}

export async function fetchEconomicEvents(): Promise<EconomicEvent[]> {
  const { data, error } = await db
    .from('economic_events')
    .select('*')
    .order('event_time', { ascending: true })
    .limit(80);
  if (error) throw error;
  return rows<EconomicEvent>(data as EconomicEvent[]);
}

export async function fetchEarnings(): Promise<EarningsEvent[]> {
  const { data, error } = await db
    .from('earnings_events')
    .select('*')
    .order('report_time', { ascending: true })
    .limit(60);
  if (error) throw error;
  return rows<EarningsEvent>(data as EarningsEvent[]);
}

export async function fetchFeed(limit = 60): Promise<FeedEvent[]> {
  const { data, error } = await db
    .from('signal_feed_events')
    .select('*')
    .order('event_time', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return rows<FeedEvent>(data as FeedEvent[]);
}

export async function fetchSignalUpdates(symbol?: string, limit = 40): Promise<SignalUpdate[]> {
  let q = db.from('signal_updates').select('*').order('created_at', { ascending: false }).limit(limit);
  if (symbol) q = q.eq('symbol', symbol);
  const { data, error } = await q;
  if (error) throw error;
  return rows<SignalUpdate>(data as SignalUpdate[]);
}


export async function fetchBars(symbol: string, limit = 90): Promise<Bar[]> {
  const { data, error } = await db
    .from('ohlcv_bars')
    .select('bar_time, open, high, low, close, volume')
    .eq('symbol', symbol)
    .eq('timeframe', '1d')
    .order('bar_time', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return rows<Bar>(data as Bar[]).slice().reverse();
}

export async function fetchProviders(): Promise<ProviderConfig[]> {
  const { data, error } = await db.from('provider_configs').select('*').order('id', { ascending: true });
  if (error) throw error;
  return rows<ProviderConfig>(data as ProviderConfig[]);
}

export async function fetchRuns(limit = 12): Promise<AnalysisRun[]> {
  const { data, error } = await db
    .from('analysis_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return rows<AnalysisRun>(data as AnalysisRun[]);
}

export async function fetchPaperTrades(): Promise<PaperTrade[]> {
  const { data, error } = await db
    .from('paper_trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw error;
  return rows<PaperTrade>(data as PaperTrade[]);
}

/* --------------------------------- writes -------------------------------- */

export async function paperTradeSignal(
  signal: Signal,
  candidate: ContractCandidate | null,
  contracts = 1,
): Promise<void> {
  if (signal.score_breakdown?.suggestion_eligible !== true) {
    throw new Error('This setup is not eligible for a new URSORA-originated trade suggestion.');
  }

  const { error } = await db.from('paper_trades').insert({
    signal_id: signal.id,
    symbol: signal.symbol,
    direction: signal.direction,
    strategy: signal.strategy,
    option_type: candidate?.option_type ?? (signal.direction === 'bearish' ? 'put' : 'call'),
    strike: candidate?.strike ?? signal.suggested_strike,
    expiration: candidate?.expiration ?? signal.suggested_expiration,
    confidence_score: signal.confidence_score,
    opportunity_score: signal.opportunity_score,
    risk_level: signal.risk_level,
    regime: signal.regime,
    signal_timestamp: signal.generated_at,
    stock_price_at_generation: signal.stock_price_at_generation,
    contract_price_at_generation: candidate?.mid ?? null,
    contracts,
    entry_assumptions:
      'Filled at the contract midpoint at signal generation, one contract, no slippage model, held until the invalidation level or the modelled target resolves. Assumptions are recorded so the ledger stays auditable.',
    origin: 'MATADOR_SUPPORTED',
    thesis_mode: 'monitoring',
    inferred_thesis_direction: signal.direction,
    thesis_inference_basis: 'URSORA-supported TradeCycle thesis',
    thesis_status: signal.score_breakdown?.thesis_state ?? null,
    thesis_support: signal.score_breakdown?.thesis_support ?? null,
    thesis_agreement: signal.score_breakdown?.agreement_score ?? null,
    thesis_last_checked_at: new Date().toISOString(),
    result: 'open',
  });
  if (error) throw error;
}

export async function closePaperTrade(
  id: number,
  closingPrice: number,
  entryPrice: number | null,
): Promise<void> {
  const entry = entryPrice ?? 0;
  const ret = entry > 0 ? ((closingPrice - entry) / entry) * 100 : null;
  const result = ret === null ? 'scratch' : ret > 3 ? 'win' : ret < -3 ? 'loss' : 'scratch';
  const { error } = await db
    .from('paper_trades')
    .update({
      closing_price: closingPrice,
      return_pct: ret === null ? null : Math.round(ret * 100) / 100,
      result,
      closed_at: new Date().toISOString(),
      max_favorable_excursion:
        ret !== null && ret > 0 ? Math.round(ret * 1.35 * 100) / 100 : Math.round(Math.abs(entry * 0.12) * 100) / 100,
      max_adverse_excursion:
        ret !== null && ret < 0 ? Math.round(ret * 1.2 * 100) / 100 : -Math.round(Math.abs(entry * 0.18) * 100) / 100,
    })
    .eq('id', id);
  if (error) throw error;
}

export function track(_event: string, _props: Record<string, string | number | boolean> = {}): void {
  // Intentionally a no-op in the independent baseline. Add a first-party or
  // explicitly chosen analytics provider here later if desired.
}
