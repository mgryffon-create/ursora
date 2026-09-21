/**
 * URSORA — PROVIDER ABSTRACTION LAYER (client-side registry + contracts).
 *
 * Architecture note, deliberately enforced:
 *   INGESTION  (this file + the ingestion half of the `run-analysis` edge
 *              function) is the ONLY layer that talks to a data vendor.
 *   SIGNAL ENGINE (`run-analysis`, scoring half) is a pure function of already
 *              ingested, timestamped rows. It never fetches.
 *
 * Every provider interface below is implemented today by a simulation adapter that
 * returns clearly demo-labelled rows. Real adapters are stubbed: the adapter
 * name, the vendor candidates and the environment secret each adapter needs
 * are declared here and surfaced in the Data Sources settings page. Nothing in
 * the browser ever holds a vendor key — a connected adapter runs inside the
 * ingestion edge function and reads its key from the server environment.
 */

export type ProviderInterface =
  | 'MarketDataProvider'
  | 'OptionsDataProvider'
  | 'NewsProvider'
  | 'FilingsProvider'
  | 'EconomicDataProvider'
  | 'SentimentProvider'
  | 'TranscriptProvider';

export interface ProvenanceStamp {
  /** Human-readable vendor / feed name, e.g. "Reuters" or "simulation adapter". */
  source_name: string;
  /** Trust classification rendered as a badge in the UI. */
  source_type: string;
  /** When the upstream published the datum (null when the vendor omits it). */
  published_at: string | null;
  /** When URSORA fetched it. Always set by the ingestion layer. */
  retrieved_at: string;
  /** 0..1 quality metadata. Demo rows are capped low on purpose. */
  confidence: number | null;
  is_demo: boolean;
}

/** Contract each ingestion adapter must satisfy. Methods are declared so a real
 *  adapter can be dropped in without touching the signal engine. */
export interface ProviderContract {
  interface_name: ProviderInterface;
  /** Methods the ingestion layer calls. */
  methods: string[];
  /** Tables each method writes, so provenance is auditable end to end. */
  writes: string[];
}

export const PROVIDER_CONTRACTS: ProviderContract[] = [
  {
    interface_name: 'MarketDataProvider',
    methods: ['getQuote(symbol)', 'getQuotes(symbols[])', 'getBars(symbol, timeframe, from, to)', 'getPremarket(symbol)'],
    writes: ['quotes', 'ohlcv_bars', 'data_provenance'],
  },
  {
    interface_name: 'OptionsDataProvider',
    methods: ['getChain(symbol, expirations[])', 'getGreeks(contractIds[])', 'getIvSurface(symbol)'],
    writes: ['option_contracts', 'option_quotes', 'data_provenance'],
  },
  {
    interface_name: 'NewsProvider',
    methods: ['getHeadlines(symbol, since)', 'getMarketHeadlines(since)'],
    writes: ['news_items', 'data_provenance'],
  },
  {
    interface_name: 'FilingsProvider',
    methods: ['getFilings(symbol, forms[], since)'],
    writes: ['filings', 'data_provenance'],
  },
  {
    interface_name: 'EconomicDataProvider',
    methods: ['getEconomicCalendar(from, to)', 'getEarningsCalendar(symbols[], from, to)'],
    writes: ['economic_events', 'earnings_events', 'data_provenance'],
  },
  {
    interface_name: 'SentimentProvider',
    methods: ['getRetailSentiment(symbol)', 'getProfessionalSentiment(symbol)'],
    writes: ['sentiment_readings', 'data_provenance'],
  },
  {
    interface_name: 'TranscriptProvider',
    methods: ['getStatements(symbol, since)', 'extractMarketMoving(statements[])'],
    writes: ['transcript_statements', 'data_provenance'],
  },
];

/** The eight factors the signal engine scores, with their baseline weights.
 *  Effective weights are recomputed per run from the market regime and stored
 *  on every signal row, so any historical score can be re-derived exactly. */
export const FACTOR_DEFINITIONS: {
  key: string;
  label: string;
  base_weight: number;
  measures: string;
}[] = [
  { key: 'technical_momentum', label: 'Technical Momentum', base_weight: 0.2, measures: 'Price versus session VWAP, 20/50/200-day structure, intraday momentum, ATR-normalised extension.' },
  { key: 'catalyst_strength', label: 'Catalyst Strength', base_weight: 0.16, measures: 'Dated catalysts weighted by impact rating and exponential publication-age decay, plus proximity of earnings and macro prints.' },
  { key: 'news_sentiment', label: 'News Sentiment', base_weight: 0.14, measures: 'Recency-weighted tone of stored headlines from verified and company sources. Social posts are excluded from this factor entirely.' },
  { key: 'options_flow', label: 'Options Flow', base_weight: 0.16, measures: 'Put/call volume ratio, volume against open interest, unusual-activity screen. Flow is never auto-read as directional.' },
  { key: 'market_alignment', label: 'Market Alignment', base_weight: 0.12, measures: 'Agreement between the single name, its sector and the index tape, scaled by VIX and breadth.' },
  { key: 'liquidity_quality', label: 'Liquidity Quality', base_weight: 0.1, measures: 'At-the-money spread as a share of mid, open interest, contract volume. Poor liquidity can veto an otherwise good thesis.' },
  { key: 'risk_reward', label: 'Risk / Reward', base_weight: 0.08, measures: 'Distance to the next structural level against ATR and the modelled expected move.' },
  { key: 'signal_agreement', label: 'Signal Agreement', base_weight: 0.04, measures: 'Dispersion across the core factors. Disagreement is penalised rather than averaged away.' },
  { key: 'social_sentiment', label: 'Social Sentiment (hard-capped)', base_weight: 0.05, measures: 'Retail cohort readings, permanently capped at 5% of the final score in every regime. Popularity is not evidence.' },
];

export const WEIGHTING_RULES: { trigger: string; effect: string }[] = [
  { trigger: 'A verified headline published inside the last four hours', effect: 'News and catalyst weight rise by up to 75%, decaying exponentially with the age of the freshest item.' },
  { trigger: 'No headline inside 24 hours', effect: 'News weight is cut 30% — stale news is not a catalyst.' },
  { trigger: 'Relative volume below 1.0x', effect: 'Options-flow weight is cut 45%, because flow readings on thin tape are noise.' },
  { trigger: 'Unusual options volume on real volume', effect: 'Options-flow weight rises 25%.' },
  { trigger: 'Earnings or a critical macro print inside the holding window', effect: 'Technical weight is cut 45% and risk/reward weight rises 25% — chart structure does not survive a gap.' },
  { trigger: 'VIX above 20 (above 16)', effect: 'Market-alignment weight rises 50% (18%) — in volatile sessions single names follow the index.' },
  { trigger: 'Chain liquidity below 55/100', effect: 'Liquidity weight rises 60%, so an untradeable contract cannot be scored as an opportunity.' },
  { trigger: 'Always', effect: 'Social sentiment is capped at 5%; price, volume, verified news and options data always outweigh it.' },
];

export const NO_TRADE_RULES: string[] = [
  'Opportunity score below 55 — the engine will not name a contract on weak evidence.',
  'Directional factors conflict (technical, news and flow disagree) — there is no thesis to express.',
  'Liquidity quality below 45/100 — spreads would consume the edge before the thesis resolves.',
  'Factor agreement below 45/100 — the evidence is internally inconsistent.',
  'No contract cleared the contract-selection filters.',
];
