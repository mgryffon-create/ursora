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
  /** When URSORA fetched it. At all times set by the ingestion layer. */
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
  { key: 'technical_momentum', label: 'Technical Momentum', base_weight: 0.2, measures: 'How price is moving relative to recent trends, typical trading ranges, and the current session.' },
  { key: 'catalyst_strength', label: 'Catalyst Strength', base_weight: 0.16, measures: 'The importance and timing of earnings, economic reports, company announcements, and other scheduled market events.' },
  { key: 'news_sentiment', label: 'News Sentiment', base_weight: 0.14, measures: 'The tone and timing of recent verified news and company announcements. Social-media discussion is evaluated separately.' },
  { key: 'options_flow', label: 'Options Flow', base_weight: 0.16, measures: 'Whether options trading activity is unusually strong and whether calls or puts are receiving greater attention. Activity alone is not treated as directional proof.' },
  { key: 'market_alignment', label: 'Market Alignment', base_weight: 0.12, measures: 'Whether the symbol is moving consistently with its sector and the broader market, including current volatility and overall market participation.' },
  { key: 'liquidity_quality', label: 'Liquidity Quality', base_weight: 0.1, measures: 'How easily an option contract could reasonably be entered or exited based on its spread, trading volume, and open interest.' },
  { key: 'risk_reward', label: 'Risk / Reward', base_weight: 0.08, measures: 'The potential reward relative to the amount of price movement and risk required for the trade to work.' },
  { key: 'signal_agreement', label: 'Signal Agreement', base_weight: 0.04, measures: 'How consistently the major evidence categories support the same conclusion. Conflicting evidence reduces the score.' },
  { key: 'social_sentiment', label: 'Social Sentiment (hard-capped)', base_weight: 0.05, measures: 'Retail-investor sentiment. This factor has a limited effect on the overall score because popularity alone is not reliable evidence.' },
];

export const WEIGHTING_RULES: { trigger: string; effect: string }[] = [
  { trigger: 'Important verified news published within the last four hours', effect: 'Recent verified news and scheduled-event information receive greater emphasis while they are most relevant.' },
  { trigger: 'No recent verified news within 24 hours', effect: 'Older news receives less emphasis because its effect may already be reflected in the market.' },
  { trigger: 'Trading volume is below its normal level', effect: 'Options activity receives less emphasis when overall trading activity is unusually light.' },
  { trigger: 'Options activity is unusually high while the underlying stock is actively trading', effect: 'Options activity receives greater emphasis.' },
  { trigger: 'Earnings or a major economic report occurs during the expected holding period', effect: 'Price-pattern evidence receives less emphasis while event-related risk receives more emphasis.' },
  { trigger: 'Market volatility is elevated', effect: 'Broader market conditions receive more emphasis when volatility is elevated.' },
  { trigger: 'Available option contracts have limited liquidity', effect: 'Contract liquidity receives greater emphasis so difficult-to-trade options do not appear more attractive than they are.' },
  { trigger: 'At all times', effect: 'Retail sentiment remains a minor factor; price, volume, verified news, and options data carry substantially more weight.' },
];

export const NO_TRADE_RULES: string[] = [
  'Opportunity score below the minimum threshold — URSORA does not identify a contract when the supporting evidence is too weak.',
  'Major evidence categories point in different directions, so there is not enough agreement to support a trade.',
  'Available option contracts are too difficult or expensive to trade efficiently.',
  'The available evidence is too inconsistent to support a clear conclusion.',
  'No available option contract met the minimum trading criteria.',
];
