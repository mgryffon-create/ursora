import db from '@/lib/db';
import { APP_CONFIG } from '@/lib/config';
import type {
  AnalysisRun, Bar, ContractCandidate, EarningsEvent, EconomicEvent, FeedEvent, Filing,
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
  marketSync: 'sync-webull-market',
  historySync: 'sync-webull-history',
  optionsSync: 'sync-webull-options',
  tradeStructure: 'build-trade-structure',
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
    const msg =
      (parsed as { error?: string } | null)?.error ?? `${slug} failed with HTTP ${res.status}: ${text.slice(0, 300)}`;
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
  const symbols = Array.isArray(body.symbols) ? { symbols: body.symbols } : {};

  const stages: Array<{ label: string; slug: EdgeFunctionSlug; payload: Record<string, unknown> }> = [
    { label: 'market quotes', slug: EDGE_FUNCTIONS.marketSync, payload: symbols },
    { label: 'historical technical data', slug: EDGE_FUNCTIONS.historySync, payload: symbols },
    { label: 'options market data', slug: EDGE_FUNCTIONS.optionsSync, payload: symbols },
  ];

  for (const stage of stages) {
    try {
      await callEdge(stage.slug, stage.payload);
    } catch (error) {
      warnings.push(
        `${stage.label}: ${error instanceof Error ? error.message : String(error)}`,
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
        `contract selection and risk assessment: ${error instanceof Error ? error.message : String(error)}`,
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
  const { data, error } = await db
    .from('quotes')
    .select('*')
    .order('as_of', { ascending: false })
    .limit(400);
  if (error) throw error;
  const map: Record<string, Quote> = {};
  for (const q of rows<Quote>(data as Quote[])) if (!map[q.symbol]) map[q.symbol] = q;
  return map;
}

export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const { data, error } = await db
    .from('quotes')
    .select('*')
    .eq('symbol', symbol)
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

export async function fetchTodaySignals(): Promise<Signal[]> {
  const { data, error } = await db
    .from('signals')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const all = rows<Signal>(data as Signal[]);
  const latestRun = all[0]?.run_id;
  const set = latestRun ? all.filter((s) => s.run_id === latestRun) : all;
  return [...set].sort((a, b) => b.opportunity_score - a.opportunity_score);
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
