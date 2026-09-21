/**
 * URSORA — CENTRAL GLOSSARY REGISTRY.
 *
 * Every plain-language explanation in the product resolves from THIS module.
 * Definitions are never written inline in a component: add or edit the entry
 * here and every "What does this mean?" surface updates at once.
 *
 * Each entry answers the five questions the product promises:
 *   WHAT IS IT?                         → what[level]
 *   WHY DOES IT MATTER?                 → why
 *   WHAT DOES IT MEAN FOR THIS TRADE?   → forTrade
 *   WHEN CAN IT BE MISLEADING?          → misleading
 *   WHAT IS URSORA SEEING RIGHT NOW?   → context(ctx)  ← optional resolver
 *
 * HARD RULE FOR CONTEXT RESOLVERS: they may only read values passed in from
 * stored/current state. A resolver returns `null` when the value is absent.
 * Nothing here estimates, rounds up from nothing, or invents a live figure.
 *
 * Explanation level is PRESENTATION ONLY. It changes wording, never a score,
 * calculation, recommendation, classification or datum.
 */

export type ExplanationLevel = 'PLAIN' | 'BALANCED' | 'TECHNICAL';

export const EXPLANATION_LEVELS: { key: ExplanationLevel; label: string; hint: string }[] = [
  { key: 'PLAIN', label: 'Plain English', hint: 'Practical meaning first, minimal jargon.' },
  { key: 'BALANCED', label: 'Balanced', hint: 'The professional term plus a concise plain explanation.' },
  { key: 'TECHNICAL', label: 'Technical', hint: 'Professional terminology and more quantitative detail by default.' },
];

export const DEFAULT_EXPLANATION_LEVEL: ExplanationLevel = 'BALANCED';

/**
 * Values a caller may supply for contextual resolution. Every field is optional
 * and nullable: a missing field means the contextual line is simply not shown.
 */
export interface GlossaryContext {
  symbol?: string | null;
  price?: number | null;
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
  volume?: number | null;
  openInterest?: number | null;
  optionType?: string | null;
  strike?: number | null;
  expiration?: string | null;
  dte?: number | null;
  premium?: number | null;
  breakeven?: number | null;
  intrinsic?: number | null;
  extrinsic?: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  iv?: number | null; // decimal, e.g. 0.512 for 51.2%
  vwap?: number | null;
  sma20?: number | null;
  relativeVolume?: number | null;
  support?: number | null;
  resistance?: number | null;
  regime?: string | null;
  vix?: number | null;
  expectedMovePct?: number | null;
  opportunityScore?: number | null;
  confidenceScore?: number | null;
  riskLevel?: string | null;
  thesisHealth?: number | null;
  invalidation?: number | null;
  target?: number | null;
  direction?: string | null;
  catalyst?: string | null;
  behavioralRisk?: number | null;
  behavioralBand?: string | null;
  processAdherence?: number | null;
  sampleSize?: number | null;
  minSample?: number | null;
  winRate?: number | null;
  expectancy?: number | null;
  payoffRatio?: number | null;
  drawdown?: number | null;
  mfe?: number | null;
  mae?: number | null;
  highWater?: number | null;
  giveback?: number | null;
  baselineValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  origin?: string | null;
}

export interface GlossaryEntry {
  key: string;
  term: string;
  category:
    | 'Order book' | 'Contract' | 'Pricing' | 'Greeks' | 'Volatility'
    | 'Technical' | 'Market' | 'URSORA score' | 'Thesis' | 'Performance' | 'Behavioural';
  what: Record<ExplanationLevel, string>;
  why: string;
  forTrade: string;
  misleading: string;
  /** Practical consequence line — the "SO WHAT?" */
  soWhat?: string;
  /** Reads live/stored values only. Returns null when the value is unavailable. */
  context?: (c: GlossaryContext) => string | null;
}

/* ------------------------------ tiny helpers ------------------------------ */

const has = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const n2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (v: number) => `${(v * 100).toFixed(1)}%`;
const sym = (c: GlossaryContext) => (c.symbol ? c.symbol : 'This underlying');

const ENTRIES: GlossaryEntry[] = [
  /* ------------------------------ order book ------------------------------ */
  {
    key: 'bid', term: 'Bid', category: 'Order book',
    what: {
      PLAIN: 'The highest price a buyer is currently willing to pay. If you sell right now, this is roughly what you get.',
      BALANCED: 'Bid — the highest standing buy price in the order book. Selling at market fills at or near the bid.',
      TECHNICAL: 'Best bid: the top-of-book buy limit price. Marketable sell orders cross against resting bid liquidity, subject to displayed size.',
    },
    why: 'It is one half of the real cost of getting in and out. The quoted "price" of an option is not what you transact at.',
    forTrade: 'Your exit price on a long option is closer to the bid than to the mid, so a wide bid makes the trade more expensive than it looks.',
    misleading: 'A bid can be quoted with almost no size behind it. A tight-looking quote on one contract can move sharply the moment a real order arrives.',
    soWhat: 'Assume you sell at the bid, not the mid, when you judge whether a target is realistic.',
    context: (c) => (has(c.bid) ? `${sym(c)} is currently bid $${n2(c.bid)}${has(c.ask) ? ` against a $${n2(c.ask)} ask` : ''} in the stored chain.` : null),
  },
  {
    key: 'ask', term: 'Ask', category: 'Order book',
    what: {
      PLAIN: 'The lowest price a seller will currently accept. If you buy right now, this is roughly what you pay.',
      BALANCED: 'Ask (offer) — the lowest standing sell price in the order book. Buying at market fills at or near the ask.',
      TECHNICAL: 'Best offer: the top-of-book sell limit price. Marketable buy orders lift the offer, subject to displayed size and away-market protection.',
    },
    why: 'It sets your actual entry cost, and with the bid it defines the spread you pay twice — once in, once out.',
    forTrade: 'Entering at the ask immediately puts the position down by the spread. The move has to cover that before the trade is flat.',
    misleading: 'In thin options the ask can be far above fair value for size; a single print at the ask is not evidence of demand.',
    context: (c) => (has(c.ask) ? `${sym(c)} is currently offered at $${n2(c.ask)} in the stored chain.` : null),
  },
  {
    key: 'spread', term: 'Bid-ask spread', category: 'Order book',
    what: {
      PLAIN: 'The gap between what buyers offer and what sellers want. It is a cost you pay just for entering and leaving.',
      BALANCED: 'Bid-ask spread — the difference between best bid and best ask, expressed in dollars or as a percentage of the mid.',
      TECHNICAL: 'Quoted spread = ask − bid. Effective spread is typically narrower than quoted for size traded inside the NBBO, wider when sweeping multiple levels.',
    },
    why: 'The spread is the single most reliable indicator of how expensive an option is to trade, and it is charged to every position regardless of whether the thesis was right.',
    forTrade: 'A wide spread means the underlying has to move further before the position breaks even. On short-dated contracts it can dominate the outcome.',
    misleading: 'Spreads widen mechanically around the open, the close and news. A snapshot taken in one of those windows overstates the normal cost.',
    soWhat: 'If the spread is a large fraction of the premium, the setup needs a bigger move to be worth taking — or a better contract.',
    context: (c) => {
      if (!has(c.bid) || !has(c.ask)) return null;
      const s = c.ask - c.bid;
      const mid = (c.ask + c.bid) / 2;
      const pctOfMid = mid > 0 ? (s / mid) * 100 : null;
      return `Stored quote: $${n2(c.bid)} × $${n2(c.ask)} — a $${n2(s)} spread${pctOfMid !== null ? `, ${pctOfMid.toFixed(1)}% of the mid` : ''}.`;
    },
  },
  {
    key: 'mid', term: 'Mid price', category: 'Pricing',
    what: {
      PLAIN: 'The midpoint between the bid and the ask — a fair-value estimate, not a price you are guaranteed to get.',
      BALANCED: 'Mid — (bid + ask) / 2. Used as the reference price for marking a position when no trade has printed.',
      TECHNICAL: 'Midpoint of the NBBO. Used as the mark for P/L attribution; fills at the mid require a resting counterparty or a price-improvement mechanism.',
    },
    why: 'URSORA marks contract prices at the mid so entries are recorded consistently rather than flattered by a favourable side of the book.',
    forTrade: 'Your realistic entry is between the mid and the ask, and your realistic exit is between the mid and the bid. Plan with that, not with the mid alone.',
    misleading: 'In an illiquid contract the mid can sit in a gap where no one trades at all.',
    context: (c) => (has(c.mid) ? `Stored mid for this contract: $${n2(c.mid)}.` : null),
  },
  {
    key: 'liquidity', term: 'Liquidity', category: 'Order book',
    what: {
      PLAIN: 'How easily you can get in and out at a sensible price.',
      BALANCED: 'Liquidity — the depth and tightness of the market for a contract, read from volume, open interest and the bid-ask spread.',
      TECHNICAL: 'Composite of quoted spread, displayed depth, open interest and realised turnover; determines market impact and the width of the executable range.',
    },
    why: 'A correct thesis in an illiquid contract can still lose money because the exit is not available at the price the model assumed.',
    forTrade: 'Poor liquidity is a reason to size down, choose a different strike or expiry, or take no trade at all.',
    misleading: 'High volume on a single unusual print is not liquidity. Persistent two-sided interest is.',
    context: (c) => {
      const parts: string[] = [];
      if (has(c.volume)) parts.push(`${c.volume.toLocaleString('en-US')} contracts traded`);
      if (has(c.openInterest)) parts.push(`${c.openInterest.toLocaleString('en-US')} open interest`);
      if (has(c.bid) && has(c.ask)) parts.push(`$${n2(c.ask - c.bid)} spread`);
      return parts.length ? `Stored for this contract: ${parts.join(', ')}.` : null;
    },
  },
  {
    key: 'volume', term: 'Volume', category: 'Order book',
    what: {
      PLAIN: 'How many contracts (or shares) changed hands today.',
      BALANCED: 'Volume — the count of contracts traded during the session. Resets each day.',
      TECHNICAL: 'Session turnover. For options, volume without a matching rise in open interest implies intraday round-trips rather than new positioning.',
    },
    why: 'Volume shows whether anyone is actually trading the thing you are about to trade.',
    forTrade: 'Low volume in the specific contract means your order is a larger share of the market and more likely to move the price against you.',
    misleading: 'Volume is a daily count. Early in the session it always looks low, which is a clock artefact, not a liquidity verdict.',
    context: (c) => (has(c.volume) ? `${c.volume.toLocaleString('en-US')} traded in the stored session snapshot.` : null),
  },
  {
    key: 'open_interest', term: 'Open interest', category: 'Contract',
    what: {
      PLAIN: 'How many contracts are currently held open by all participants.',
      BALANCED: 'Open interest — total outstanding contracts not yet closed or exercised. Updated once daily, not intraday.',
      TECHNICAL: 'Cumulative open positions per strike/expiry, published with a one-session lag. Rising OI with rising volume indicates new positioning rather than closing flow.',
    },
    why: 'It is the best available measure of whether a strike has a real market rather than a quoted one.',
    forTrade: 'Very low open interest usually means a wide spread and a difficult exit, however attractive the strike looks.',
    misleading: 'Open interest updates overnight. Today’s activity is not in today’s number.',
    context: (c) => (has(c.openInterest) ? `${c.openInterest.toLocaleString('en-US')} contracts of open interest stored for this strike.` : null),
  },

  /* -------------------------------- contract ------------------------------ */
  {
    key: 'call', term: 'Call', category: 'Contract',
    what: {
      PLAIN: 'A contract that gains value when the stock rises. You pay a premium for the right to buy at a set price.',
      BALANCED: 'Call option — the right, not the obligation, to buy 100 shares at the strike before expiration. Long calls profit from upside.',
      TECHNICAL: 'Long call: positive delta, positive gamma, negative theta, positive vega. Payoff at expiry = max(S − K, 0) − premium.',
    },
    why: 'It is the standard way URSORA expresses a bullish directional thesis with capped downside.',
    forTrade: 'Your maximum loss is the premium paid. Your break-even is the strike plus that premium, not the current price.',
    misleading: 'Being right on direction is not enough — the move has to be large enough and fast enough to beat the premium and time decay.',
  },
  {
    key: 'put', term: 'Put', category: 'Contract',
    what: {
      PLAIN: 'A contract that gains value when the stock falls. You pay a premium for the right to sell at a set price.',
      BALANCED: 'Put option — the right, not the obligation, to sell 100 shares at the strike before expiration. Long puts profit from downside.',
      TECHNICAL: 'Long put: negative delta, positive gamma, negative theta, positive vega. Payoff at expiry = max(K − S, 0) − premium.',
    },
    why: 'It expresses a bearish thesis with a known, capped maximum loss.',
    forTrade: 'Break-even is the strike minus the premium. A modest decline that stops above break-even still loses money.',
    misleading: 'Puts often carry a volatility premium into known events, so a correct bearish call can still lose when volatility collapses afterwards.',
  },
  {
    key: 'strike', term: 'Strike', category: 'Contract',
    what: {
      PLAIN: 'The price level the contract is built around.',
      BALANCED: 'Strike price — the level at which the option can be exercised. It fixes where intrinsic value begins.',
      TECHNICAL: 'Exercise price K. Moneyness (S/K) drives delta, gamma concentration and the intrinsic/extrinsic split.',
    },
    why: 'Strike selection determines how much of the premium is time value and how much the underlying must move to pay.',
    forTrade: 'A further out-of-the-money strike is cheaper but needs a larger move; a closer strike costs more but converts a smaller move into profit.',
    misleading: 'A cheap strike is not a cheap trade — it is usually a lower-probability one.',
    context: (c) => (has(c.strike) ? `This contract: $${n2(c.strike)} strike${c.optionType ? ` ${String(c.optionType).toUpperCase()}` : ''}.` : null),
  },
  {
    key: 'expiration', term: 'Expiration', category: 'Contract',
    what: {
      PLAIN: 'The date the contract stops existing. After it, the option is worth its intrinsic value or nothing.',
      BALANCED: 'Expiration — the final date the contract can be exercised. All remaining time value is zero at expiry.',
      TECHNICAL: 'Expiry date; for US equity options, settlement is on the third-Friday cycle plus weeklies, with exercise decisions at 17:30 ET.',
    },
    why: 'It is the hard deadline for the thesis. The market does not owe you time.',
    forTrade: 'Your thesis must resolve before this date, not eventually.',
    misleading: 'Expiration alone says nothing about risk — a 30-day option on a stock reporting tomorrow is a very different instrument from a quiet one.',
    context: (c) => (c.expiration ? `Stored expiration: ${c.expiration}${has(c.dte) ? ` (${c.dte} DTE)` : ''}.` : null),
  },
  {
    key: 'dte', term: 'DTE (days to expiration)', category: 'Contract',
    what: {
      PLAIN: 'How many days are left before the contract expires.',
      BALANCED: 'DTE — calendar days to expiration. It governs how fast time value decays and how sensitive the contract is to a move.',
      TECHNICAL: 'Days to expiry; theta decay accelerates roughly with 1/√T as T→0, and gamma concentrates near the money.',
    },
    why: 'Time is a cost you pay every day you hold. Fewer days means faster decay and more sensitivity.',
    forTrade: 'A short DTE demands that the move happens now. If the thesis needs a week to play out, a contract with 3 DTE is the wrong instrument.',
    misleading: 'Low DTE options look cheap in dollars while being the most expensive in decay terms.',
    context: (c) => (has(c.dte) ? `${c.dte} DTE remaining on the stored contract.` : null),
  },
  {
    key: 'premium', term: 'Premium', category: 'Pricing',
    what: {
      PLAIN: 'The price you pay for the contract. One contract covers 100 shares, so a $1.80 quote costs $180.',
      BALANCED: 'Premium — the contract price, quoted per share and multiplied by 100 per contract. It is the maximum loss on a long option.',
      TECHNICAL: 'Option price = intrinsic + extrinsic. Multiplier 100 for standard US equity options.',
    },
    why: 'It is the amount at risk, and the hurdle the underlying move must clear.',
    forTrade: 'Total risk on the position is premium × 100 × contracts, plus fees.',
    misleading: 'A low premium does not mean low risk of loss — it usually means a lower probability of finishing in the money.',
    context: (c) => (has(c.premium) ? `Stored premium $${n2(c.premium)} per share — $${n2(c.premium * 100)} per contract.` : null),
  },
  {
    key: 'breakeven', term: 'Break-even', category: 'Pricing',
    what: {
      PLAIN: 'The underlying price where the trade stops losing and starts making money at expiry.',
      BALANCED: 'Break-even — strike plus premium for a call, strike minus premium for a put, measured at expiration.',
      TECHNICAL: 'BE = K + P (call) or K − P (put) at expiry; before expiry the effective break-even moves with remaining extrinsic value.',
    },
    why: 'It is the honest hurdle. Direction alone does not pay.',
    forTrade: 'Compare break-even with the stored target and the expected move. If break-even sits beyond the expected move, the trade needs an outlier.',
    misleading: 'Break-even applies at expiry. Before expiry a position can be profitable below it, or unprofitable above it, because of time value.',
    context: (c) => (has(c.breakeven) ? `Stored break-even: $${n2(c.breakeven)}${has(c.price) ? ` against a last price of $${n2(c.price)}` : ''}.` : null),
  },
  {
    key: 'intrinsic', term: 'Intrinsic value', category: 'Pricing',
    what: {
      PLAIN: 'The part of the price that is real right now — what the contract would be worth if it expired this second.',
      BALANCED: 'Intrinsic value — max(spot − strike, 0) for a call, max(strike − spot, 0) for a put. It cannot decay.',
      TECHNICAL: 'Exercise value of the option; the non-optional component of price, invariant to volatility and time.',
    },
    why: 'Intrinsic value is the portion of premium that time cannot take away from you.',
    forTrade: 'A contract that is all extrinsic value is entirely a bet on a move happening in time.',
    misleading: 'Intrinsic value can vanish quickly on a move in the underlying; it is not a floor on the position value.',
    context: (c) => (has(c.intrinsic) ? `Stored intrinsic value: $${n2(c.intrinsic)}.` : null),
  },
  {
    key: 'extrinsic', term: 'Extrinsic value', category: 'Pricing',
    what: {
      PLAIN: 'The part of the price you pay for time and uncertainty. It shrinks to zero at expiry.',
      BALANCED: 'Extrinsic (time) value — premium minus intrinsic value. Driven by time remaining and implied volatility.',
      TECHNICAL: 'Optionality value; decays with theta and repricing in implied volatility, reaching zero at expiry.',
    },
    why: 'It is the amount that decays away if nothing happens.',
    forTrade: 'High extrinsic value means you are paying a lot for the possibility of a move — the move must be large, or soon, or both.',
    misleading: 'Extrinsic value is not "overpriced" by itself; it can be entirely justified by a genuine event.',
    context: (c) => (has(c.extrinsic) ? `Stored extrinsic value: $${n2(c.extrinsic)}.` : null),
  },

  /* --------------------------------- greeks ------------------------------- */
  {
    key: 'delta', term: 'Delta', category: 'Greeks',
    what: {
      PLAIN: 'Roughly how much the contract moves for a $1 move in the stock.',
      BALANCED: 'Delta — the rate of change of option price with respect to the underlying, from −1 to +1. Loosely read as the market-implied chance of finishing in the money.',
      TECHNICAL: '∂V/∂S. Also the hedge ratio: a 0.45-delta call behaves like 45 long shares for small moves, before gamma effects.',
    },
    why: 'Delta tells you how directly the position is exposed to the thesis you are actually expressing.',
    forTrade: 'A low-delta contract needs a much larger move to respond; a high-delta contract costs more but tracks the stock more closely.',
    misleading: 'Reading delta as a probability is an approximation, not a fact. It assumes the model, and it changes as the stock moves.',
    context: (c) => {
      if (!has(c.delta)) return null;
      const perDollar = Math.abs(c.delta) * 100;
      return `Stored delta ${c.delta.toFixed(2)} — about $${n2(perDollar)} of contract value per $1 move in ${c.symbol ?? 'the underlying'}.`;
    },
  },
  {
    key: 'gamma', term: 'Gamma', category: 'Greeks',
    what: {
      PLAIN: 'How quickly the contract’s sensitivity itself changes as the stock moves.',
      BALANCED: 'Gamma — the rate of change of delta. High gamma means the position accelerates in your favour, and against you, very quickly.',
      TECHNICAL: '∂²V/∂S². Peaks at the money and rises sharply as expiry approaches, which is why short-dated at-the-money positions are unstable.',
    },
    why: 'Gamma is why short-dated options feel violent: the exposure is not constant.',
    forTrade: 'High gamma near expiry means the P/L swings are much larger than the premium suggests, in both directions.',
    misleading: 'Gamma is attractive only when the move arrives. Without movement it is simply an expensive way to hold theta risk.',
    context: (c) => (has(c.gamma) ? `Stored gamma ${c.gamma.toFixed(4)} — delta changes by about ${(c.gamma).toFixed(3)} per $1 move.` : null),
  },
  {
    key: 'theta', term: 'Theta', category: 'Greeks',
    what: {
      PLAIN: 'How much value the contract loses each day just from time passing.',
      BALANCED: 'Theta — daily time decay. It is the rent you pay for holding optionality, charged whether or not the stock moves.',
      TECHNICAL: '∂V/∂t, quoted per calendar day. Decay accelerates non-linearly into expiry for at-the-money contracts.',
    },
    why: 'Theta is the clock running against every long option position.',
    forTrade: 'If the thesis needs several days to resolve, decay must be part of the plan, not a surprise.',
    misleading: 'Quoted theta assumes everything else stays still. A rise in implied volatility can more than offset a day of decay — and a fall can multiply it.',
    soWhat: 'Hold a long option through a quiet session and you pay theta for nothing.',
    context: (c) => {
      if (!has(c.theta)) return null;
      const perContract = Math.abs(c.theta) * 100;
      return `Stored theta ${c.theta.toFixed(3)} — this contract loses roughly $${n2(perContract)} per contract per day if nothing else changes.`;
    },
  },
  {
    key: 'vega', term: 'Vega', category: 'Greeks',
    what: {
      PLAIN: 'How much the contract’s price moves when the market’s expectation of future movement changes.',
      BALANCED: 'Vega — sensitivity to a one-point change in implied volatility. Long options are long vega.',
      TECHNICAL: '∂V/∂σ per 1 volatility point. Largest for at-the-money contracts with more time remaining.',
    },
    why: 'It explains the common experience of being right on direction and still losing money after an event.',
    forTrade: 'Buying into an event usually means buying elevated implied volatility; the post-event collapse is charged to you through vega.',
    misleading: 'Vega is quoted for a one-point move, but volatility rarely moves alone — it usually moves with the underlying.',
    context: (c) => (has(c.vega) ? `Stored vega ${c.vega.toFixed(3)} — about $${n2(Math.abs(c.vega) * 100)} per contract per one-point change in implied volatility.` : null),
  },

  /* ------------------------------- volatility ----------------------------- */
  {
    key: 'iv', term: 'Implied volatility (IV)', category: 'Volatility',
    what: {
      PLAIN: 'How much movement the market is pricing in. Higher means options are more expensive.',
      BALANCED: 'Implied volatility — the annualised volatility implied by the option’s price. It is a price, not a forecast.',
      TECHNICAL: 'σ solved from the pricing model given market price; expressed annualised. Skew and term structure make a single IV figure a simplification.',
    },
    why: 'IV determines what you pay for the same thesis. The same view can be a good trade at one IV and a poor one at another.',
    forTrade: 'Entering at elevated IV means you need a larger move to profit, and you carry the risk of IV falling back.',
    misleading: 'High IV is not automatically "expensive" — it is often correct pricing ahead of a real event. Comparing IV across different tickers without context is meaningless.',
    soWhat: 'Check whether IV is high because of a scheduled catalyst you are deliberately trading, or high for reasons you cannot name.',
    context: (c) => (has(c.iv) ? `${sym(c)} implied volatility is currently ${pc(c.iv)} in the stored chain.` : null),
  },
  {
    key: 'vix', term: 'VIX', category: 'Market',
    what: {
      PLAIN: 'A market-wide gauge of how much movement traders expect over the next month.',
      BALANCED: 'VIX — 30-day implied volatility of S&P 500 options. Commonly used as a market stress and risk-appetite reading.',
      TECHNICAL: 'Model-free implied variance of SPX options over a constant 30-day horizon, published by Cboe.',
    },
    why: 'It frames whether the whole market is calm or stressed, which changes how much single-name evidence is worth.',
    forTrade: 'Elevated VIX widens spreads, raises premiums and increases the chance of being stopped out by noise.',
    misleading: 'VIX describes the index, not your ticker. A quiet VIX says nothing about a stock with its own event tomorrow.',
    context: (c) => (has(c.vix) ? `VIX in the stored snapshot: ${n2(c.vix)}.` : null),
  },
  {
    key: 'volatility_regime', term: 'Volatility regime', category: 'Market',
    what: {
      PLAIN: 'Whether the market is currently calm, normal or jumpy.',
      BALANCED: 'Volatility regime — a classification of the current volatility environment used to contextualise setups.',
      TECHNICAL: 'Regime label derived from index implied volatility level and its recent trend, used as a conditioning variable rather than a signal.',
    },
    why: 'The same technical setup behaves differently in a calm tape and a stressed one.',
    forTrade: 'In a high-volatility regime, position size and invalidation distance matter more than entry precision.',
    misleading: 'Regime labels are lagging summaries; regimes change faster than the label does.',
  },
  {
    key: 'expected_move', term: 'Expected move', category: 'Volatility',
    what: {
      PLAIN: 'How far the market is pricing the stock to move by a date — roughly, the size of the typical outcome.',
      BALANCED: 'Expected move — the magnitude of move implied by option pricing over a horizon, usually one standard deviation.',
      TECHNICAL: 'Approximately S × σ × √(T/365), or the at-the-money straddle price, giving a ~68% containment band under a lognormal assumption.',
    },
    why: 'It is the cleanest reality check on a price target.',
    forTrade: 'If your target is far outside the expected move, you are implicitly betting on an outlier — which may be fine, but should be deliberate.',
    misleading: 'It is symmetric and model-based. Real outcomes are skewed, and the band is not a limit on anything.',
    context: (c) => (has(c.expectedMovePct) ? `Stored expected move for this horizon: ±${c.expectedMovePct.toFixed(1)}%.` : null),
  },

  /* -------------------------------- technical ----------------------------- */
  {
    key: 'vwap', term: 'VWAP', category: 'Technical',
    what: {
      PLAIN: 'The average price weighted by how much traded at each level today — a rough line between buyers and sellers in control.',
      BALANCED: 'Volume-weighted average price — the session’s average transaction price. Often used as an intraday reference for institutional execution.',
      TECHNICAL: 'Σ(price × volume) / Σ(volume) from the session open, anchored intraday; commonly used as an execution benchmark.',
    },
    why: 'It is the most widely watched intraday level, so it often behaves like one.',
    forTrade: 'Price above VWAP with rising volume supports a bullish intraday thesis; price below it weakens one.',
    misleading: 'VWAP resets every session and means little in the first few minutes, or in a stock that gapped.',
    soWhat: 'A bullish trade entered below VWAP is fighting the session’s average buyer — expect either a reclaim or a reason.',
    context: (c) => {
      if (!has(c.vwap) || !has(c.price)) return null;
      const rel = c.price > c.vwap ? 'above' : c.price < c.vwap ? 'below' : 'at';
      return `${sym(c)} last traded $${n2(c.price)}, ${rel} its stored VWAP of $${n2(c.vwap)}.`;
    },
  },
  {
    key: 'moving_average', term: 'Moving average', category: 'Technical',
    what: {
      PLAIN: 'The average price over the last N days, drawn as a line to smooth out noise.',
      BALANCED: 'Moving average — a rolling mean of closing prices (e.g. 20-day) used to read trend direction and dynamic support.',
      TECHNICAL: 'SMA/EMA of closes over a fixed lookback; a lagging filter whose slope is a trend proxy and whose level acts as a reference band.',
    },
    why: 'It gives trend a definition that can be tested rather than eyeballed.',
    forTrade: 'Entering against the direction of the relevant moving average means the trend is not supporting the thesis.',
    misleading: 'Moving averages lag by construction. In a sharp reversal they confirm the old move, not the new one.',
    context: (c) => (has(c.sma20) && has(c.price) ? `${sym(c)} at $${n2(c.price)} against a stored 20-day average of $${n2(c.sma20)}.` : null),
  },
  {
    key: 'relative_volume', term: 'Relative volume', category: 'Technical',
    what: {
      PLAIN: 'How busy the stock is today compared with a normal day.',
      BALANCED: 'Relative volume — today’s volume as a multiple of the average for the same time of day.',
      TECHNICAL: 'RVOL = session volume / mean volume at matched intraday time, typically over a 20–30 session lookback.',
    },
    why: 'Participation is what separates a move that holds from a drift that fades.',
    forTrade: 'A breakout on low relative volume has weak confirmation; the same level on 2× volume is materially different evidence.',
    misleading: 'Relative volume spikes on index rebalances, expiries and one-off block trades that carry no directional information.',
    context: (c) => (has(c.relativeVolume) ? `Stored relative volume: ${c.relativeVolume.toFixed(2)}× the usual pace for this time of day.` : null),
  },
  {
    key: 'support', term: 'Support', category: 'Technical',
    what: {
      PLAIN: 'A price area where buyers have stepped in before.',
      BALANCED: 'Support — a level where demand has previously halted declines, used as a reference for invalidation.',
      TECHNICAL: 'Prior swing lows, value-area lows or high-volume nodes where resting demand has historically absorbed supply.',
    },
    why: 'It gives a bullish thesis a place to be wrong that is defined in advance.',
    forTrade: 'A close below support is usually the cleanest objective invalidation for a long.',
    misleading: 'Support is a zone, not a line, and it is only meaningful while the reason it existed still applies.',
    context: (c) => (has(c.support) ? `Stored support reference: $${n2(c.support)}.` : null),
  },
  {
    key: 'resistance', term: 'Resistance', category: 'Technical',
    what: {
      PLAIN: 'A price area where sellers have stepped in before.',
      BALANCED: 'Resistance — a level where supply has previously capped advances, used for targets and for judging breakout quality.',
      TECHNICAL: 'Prior swing highs, value-area highs or high-volume nodes where resting supply has historically absorbed demand.',
    },
    why: 'It sets a realistic first target and explains where a move is likely to pause.',
    forTrade: 'A target beyond a major resistance needs a reason the level will break this time.',
    misleading: 'Once broken decisively, resistance stops being resistance — the old level is not a permanent ceiling.',
    context: (c) => (has(c.resistance) ? `Stored resistance reference: $${n2(c.resistance)}.` : null),
  },
  {
    key: 'momentum', term: 'Momentum', category: 'Technical',
    what: {
      PLAIN: 'Whether price has been moving persistently in one direction, and how forcefully.',
      BALANCED: 'Momentum — the rate and persistence of price change over a lookback window.',
      TECHNICAL: 'Rate-of-change or oscillator reading over a defined lookback; used as a continuation filter, not a standalone entry.',
    },
    why: 'Momentum is a conditioning fact: the same setup in a stalling tape is a different trade.',
    forTrade: 'Entering after momentum has already extended raises the cost of being early and shortens the distance to invalidation.',
    misleading: 'Momentum readings are strongest right before they turn; extreme readings are not a timing tool.',
  },
  {
    key: 'trend', term: 'Trend', category: 'Technical',
    what: {
      PLAIN: 'The general direction price has been going over the period you care about.',
      BALANCED: 'Trend — a directional bias defined by a sequence of higher highs and lows (or lower), confirmed by a moving-average slope.',
      TECHNICAL: 'Directional persistence over a stated horizon; only meaningful with the timeframe attached.',
    },
    why: 'Trades aligned with the higher-timeframe trend have more ways to work.',
    forTrade: 'Name the timeframe. A bullish daily trend inside a bearish weekly one is a different proposition from both.',
    misleading: 'Every trend is obvious in hindsight and ambiguous at the right edge of the chart.',
  },
  {
    key: 'breakout', term: 'Breakout', category: 'Technical',
    what: {
      PLAIN: 'Price pushing through a level it has struggled with before.',
      BALANCED: 'Breakout — a move beyond a defined range or resistance level, normally requiring volume confirmation to be treated as valid.',
      TECHNICAL: 'Range expansion beyond a prior boundary with participation confirmation; unconfirmed breaks frequently revert inside the range.',
    },
    why: 'Breakouts are where continuation theses are usually initiated — and where false signals cluster.',
    forTrade: 'Without volume confirmation, a breakout entry is a guess with a very close invalidation.',
    misleading: 'Breakouts fail routinely, and the failure is often faster than the move that preceded it.',
  },
  {
    key: 'reversal', term: 'Reversal', category: 'Technical',
    what: {
      PLAIN: 'A change of direction after a sustained move.',
      BALANCED: 'Reversal — a shift from one directional regime to the opposite, usually requiring structural confirmation rather than a single candle.',
      TECHNICAL: 'Break of market structure against the prevailing trend with follow-through; distinct from a pullback within trend.',
    },
    why: 'Reversal trades have the worst risk profile when taken early and the best when confirmed.',
    forTrade: 'Define what would prove the reversal did not happen before entering, not after.',
    misleading: 'Most apparent reversals are pullbacks. The distinction is only visible after the fact.',
  },
  {
    key: 'volume_confirmation', term: 'Volume confirmation', category: 'Technical',
    what: {
      PLAIN: 'Checking that a price move came with real participation, not just a few trades.',
      BALANCED: 'Volume confirmation — requiring above-average volume to accompany a breakout or reversal before treating it as evidence.',
      TECHNICAL: 'Participation filter: move magnitude weighted by relative volume; reduces false-positive range breaks.',
    },
    why: 'It is the cheapest filter available against false signals.',
    forTrade: 'A setup that scores well on price structure but fails volume confirmation is a WAIT, not a trade.',
    misleading: 'Volume can be inflated by mechanical flows with no directional view at all.',
  },

  /* --------------------------------- market ------------------------------- */
  {
    key: 'market_breadth', term: 'Market breadth', category: 'Market',
    what: {
      PLAIN: 'How many stocks are participating in the market’s move, not just the biggest ones.',
      BALANCED: 'Breadth — the proportion of issues advancing versus declining, used to judge whether a market move is broad or narrow.',
      TECHNICAL: 'Advance/decline statistics, new highs/lows and percentage above moving averages; narrow breadth indicates index moves driven by few constituents.',
    },
    why: 'Narrow breadth means index strength may not extend to your single name.',
    forTrade: 'A bullish single-name setup in weak breadth has the tape against it even when the index is green.',
    misleading: 'Breadth can stay narrow for long periods without resolving; it is context, not a timing signal.',
  },
  {
    key: 'market_regime', term: 'Market regime', category: 'Market',
    what: {
      PLAIN: 'What kind of market we are in right now — leaning risk-on, risk-off, or mixed.',
      BALANCED: 'Market regime — a classification of the broad environment (e.g. Risk-On / Risk-Off / Mixed) used to contextualise every signal.',
      TECHNICAL: 'Composite label from index trend, volatility level and breadth; a conditioning variable stored with every signal for later segmentation.',
    },
    why: 'URSORA stores the regime with each signal so performance can later be segmented by environment rather than averaged across all of them.',
    forTrade: 'Check whether your thesis depends on the regime holding. If it does, the regime is part of your invalidation.',
    misleading: 'Regime labels are summaries of the recent past and change at inconvenient moments.',
    context: (c) => (c.regime ? `Stored regime on this signal: ${c.regime}.` : null),
  },
  {
    key: 'sector_alignment', term: 'Sector alignment', category: 'Market',
    what: {
      PLAIN: 'Whether the stock’s sector is moving the same way as your trade idea.',
      BALANCED: 'Sector alignment — agreement between the single-name thesis and its sector’s direction.',
      TECHNICAL: 'Relative strength of the ticker versus its sector ETF; disagreement implies idiosyncratic rather than systematic drivers.',
    },
    why: 'A single name fighting its own sector needs a stock-specific reason.',
    forTrade: 'Alignment is supporting evidence. Divergence is not fatal, but it should be explainable.',
    misleading: 'Sector ETFs are dominated by a few constituents; alignment can be an artefact of one large member.',
  },
  {
    key: 'index_alignment', term: 'Index alignment', category: 'Market',
    what: {
      PLAIN: 'Whether the broad market is moving with or against your idea.',
      BALANCED: 'Index alignment — agreement between the thesis direction and the broad market trend.',
      TECHNICAL: 'Beta-adjusted agreement with the benchmark; misalignment increases the share of return that must come from idiosyncratic movement.',
    },
    why: 'Most single names inherit a large part of their daily move from the index.',
    forTrade: 'A bullish trade against a falling index requires the stock to overcome its own beta.',
    misleading: 'High-beta names can align with the index and still fail on their own news.',
  },
  {
    key: 'catalyst', term: 'Catalyst', category: 'Market',
    what: {
      PLAIN: 'A specific, dated event that could move the stock — earnings, a product launch, an economic release.',
      BALANCED: 'Catalyst — a scheduled or announced event with a known date that can reprice the underlying.',
      TECHNICAL: 'Dated event risk; drives term-structure distortion in implied volatility and post-event volatility crush.',
    },
    why: 'A thesis with a dated catalyst has a reason to resolve in a known timeframe; one without relies on drift.',
    forTrade: 'Know whether you are trading INTO the catalyst (paying elevated IV) or AFTER it (post-crush).',
    misleading: 'Catalysts frequently produce the move and the opposite price reaction. The event is not the thesis.',
    context: (c) => (c.catalyst ? `Stored catalyst on this signal: ${c.catalyst}.` : null),
  },

  /* ----------------------------- URSORA scores --------------------------- */
  {
    key: 'opportunity_score', term: 'Opportunity Score', category: 'URSORA score',
    what: {
      PLAIN: 'URSORA’s 0–100 ranking of how well this setup lines up today, compared with the others on the list.',
      BALANCED: 'Opportunity Score — a 0–100 composite of the evidence URSORA has for this setup: technical structure, volume confirmation, catalyst proximity, contract quality and market context.',
      TECHNICAL: 'Deterministic weighted composite over stored evidence components, computed at signal generation and frozen in the signal ledger with its inputs.',
    },
    why: 'It exists to RANK today’s candidates consistently, so attention goes to the best-evidenced setups rather than the loudest ones.',
    forTrade: 'Read it as position in a queue, not as a verdict. A high score means the evidence is unusually complete, not that the trade will work.',
    misleading: 'It is NOT a probability of profit, an expected return, or a recommendation. It is computed from the data available at generation time; if the data was thin, the score reflects the evidence, not the future.',
    soWhat: 'Use it to decide what to examine first. Use the thesis, the contract and your own plan to decide whether to act.',
    context: (c) => (has(c.opportunityScore) ? `Stored Opportunity Score on this signal: ${Math.round(c.opportunityScore)} / 100.` : null),
  },
  {
    key: 'confidence', term: 'Confidence', category: 'URSORA score',
    what: {
      PLAIN: 'How complete and how consistent the evidence behind this setup is.',
      BALANCED: 'Confidence — a 0–100 measure of evidence quality: how many independent sources agree, how fresh they are, and how few gaps there are.',
      TECHNICAL: 'Evidence-quality index over source coverage, agreement and recency; independent of expected payoff and of direction.',
    },
    why: 'It separates "we have a lot of corroborating data" from "we have a thin case".',
    forTrade: 'Low confidence with a high opportunity score means an attractive-looking setup built on incomplete evidence.',
    misleading: 'Confidence is about the DATA, not about the outcome. A perfectly evidenced setup can still lose.',
    context: (c) => (has(c.confidenceScore) ? `Stored Confidence on this signal: ${Math.round(c.confidenceScore)} / 100.` : null),
  },
  {
    key: 'risk', term: 'Risk (signal risk level)', category: 'URSORA score',
    what: {
      PLAIN: 'How rough this trade is likely to be — how much it can move against you before it resolves.',
      BALANCED: 'Risk level — Low / Moderate / High / Extreme, derived from volatility, liquidity, event exposure and the distance to invalidation.',
      TECHNICAL: 'Categorical risk band from realised/implied volatility, spread width, event proximity and invalidation distance in ATR terms.',
    },
    why: 'It sets the sizing conversation before the entry conversation.',
    forTrade: 'A High-risk classification is a sizing instruction, not a prohibition.',
    misleading: 'It does not predict loss. A Low-risk classification can still produce a full loss of premium.',
    context: (c) => (c.riskLevel ? `Stored risk level on this signal: ${c.riskLevel}.` : null),
  },
  {
    key: 'thesis_health', term: 'Thesis Health', category: 'Thesis',
    what: {
      PLAIN: 'Whether the reasons you took the trade still hold right now.',
      BALANCED: 'Thesis Health — a 0–100 comparison of the ORIGINAL thesis conditions against CURRENT stored conditions. Falling health means the original reasons are eroding.',
      TECHNICAL: 'Component-wise re-evaluation of the stored thesis predicates against current values, re-scored on the same deterministic weights used at generation.',
    },
    why: 'Most losing trades stop being valid long before they are exited. This makes that visible while the position is open.',
    forTrade: 'Deteriorating health is a prompt to re-read the invalidation, not an automatic exit instruction.',
    misleading: 'Health measures the THESIS, not the P/L. A profitable position can have a broken thesis, and a losing position can have an intact one.',
    context: (c) => (has(c.thesisHealth) ? `Current stored Thesis Health: ${Math.round(c.thesisHealth)} / 100.` : null),
  },
  {
    key: 'thesis', term: 'Thesis', category: 'Thesis',
    what: {
      PLAIN: 'The reason the trade should work, written down before you take it.',
      BALANCED: 'Thesis — the stated case for a position: direction, evidence, expected path, target and the level that would prove it wrong.',
      TECHNICAL: 'Structured predicate set stored at generation, each component independently re-evaluable post-entry.',
    },
    why: 'A thesis that was never written down cannot be checked, and cannot be learned from.',
    forTrade: 'If you cannot state it in one sentence, the setup is not ready.',
    misleading: 'A thesis is not a prediction. It is a falsifiable case.',
  },
  {
    key: 'original_thesis', term: 'Original Thesis', category: 'Thesis',
    what: {
      PLAIN: 'Exactly what you believed at entry, frozen so it cannot be rewritten later.',
      BALANCED: 'Original Thesis — the immutable record of the thesis as stored at entry time.',
      TECHNICAL: 'Immutable entry-time snapshot; subsequent changes are appended to the modification log rather than applied in place.',
    },
    why: 'Memory reliably rewrites the reason for a trade after the outcome is known. The stored record does not.',
    forTrade: 'At review, this is the benchmark you are actually measured against.',
    misleading: 'It is a record, not a judgement — being wrong later does not make the original reasoning careless.',
  },
  {
    key: 'current_thesis', term: 'Current Thesis', category: 'Thesis',
    what: {
      PLAIN: 'What the same evidence says about the trade right now.',
      BALANCED: 'Current Thesis — the same thesis components re-evaluated against current stored data, shown side by side with the original.',
      TECHNICAL: 'Live re-evaluation of the stored predicate set; divergence from the original is attributed component by component.',
    },
    why: 'The comparison, not either column alone, is what tells you whether to stay.',
    forTrade: 'Where the two columns disagree, that specific component is the thing to check.',
    misleading: 'Current data is only as fresh as its provider. Check the timestamp before treating a change as real.',
  },
  {
    key: 'invalidation', term: 'Invalidation', category: 'Thesis',
    what: {
      PLAIN: 'The point where you agree, in advance, that the idea was wrong.',
      BALANCED: 'Invalidation — the pre-stated condition or price level that falsifies the thesis and ends the trade.',
      TECHNICAL: 'Falsification predicate defined pre-entry; breaching it is a process event regardless of the position’s P/L.',
    },
    why: 'It converts an open-ended loss into a defined one, decided while you are still objective.',
    forTrade: 'Moving invalidation further away after entry is the single most commonly recorded plan deviation.',
    misleading: 'An invalidation placed inside normal noise is not risk control — it is a guarantee of being stopped out.',
    context: (c) => (has(c.invalidation) ? `Stored invalidation level: $${n2(c.invalidation)}.` : null),
  },
  {
    key: 'target', term: 'Target', category: 'Thesis',
    what: {
      PLAIN: 'Where you plan to take profit if the idea works.',
      BALANCED: 'Target — the pre-stated exit level or condition on the favourable side of the thesis.',
      TECHNICAL: 'Objective exit predicate; combined with invalidation distance it defines the planned payoff ratio.',
    },
    why: 'Without a target, "let it run" and "no plan" are indistinguishable at review.',
    forTrade: 'Compare target distance with the expected move before committing.',
    misleading: 'A target is not a forecast, and hitting it is not proof the process was sound.',
    context: (c) => (has(c.target) ? `Stored target level: $${n2(c.target)}.` : null),
  },
  {
    key: 'no_trade', term: 'NO TRADE', category: 'URSORA score',
    what: {
      PLAIN: 'URSORA found a setup but concluded the evidence does not support acting on it.',
      BALANCED: 'NO TRADE — an explicit classification meaning the evidence, liquidity or risk profile does not justify a position at current prices.',
      TECHNICAL: 'Terminal classification emitted when gating criteria fail; recorded in the ledger alongside actionable signals for later calibration.',
    },
    why: 'Recording the rejections is what allows the ranking to be evaluated honestly later.',
    forTrade: 'It is a finished answer, not a slow "maybe".',
    misleading: 'NO TRADE is not a bearish call. It is a statement about evidence, not about direction.',
  },
  {
    key: 'wait', term: 'WAIT', category: 'URSORA score',
    what: {
      PLAIN: 'The idea may be valid, but something specific still has to happen first.',
      BALANCED: 'WAIT — the thesis is plausible but a stated precondition (confirmation, level reclaim, event) has not occurred yet.',
      TECHNICAL: 'Deferred classification with an explicit unmet precondition recorded; re-evaluated on the next analysis run.',
    },
    why: 'It names the missing condition instead of leaving you to guess when to act.',
    forTrade: 'The precondition is the entry trigger. Entering before it is, by definition, a plan deviation.',
    misleading: 'WAIT does not mean the move will wait for you. Some setups resolve without ever confirming.',
  },

  /* ------------------------------ performance ----------------------------- */
  {
    key: 'expectancy', term: 'Expectancy', category: 'Performance',
    what: {
      PLAIN: 'What you make or lose on an average trade, over many trades.',
      BALANCED: 'Expectancy — the mean result per trade: (win rate × average win) − (loss rate × average loss).',
      TECHNICAL: 'First moment of the realised per-trade return distribution; unstable below roughly 30 observations and highly sensitive to outliers.',
    },
    why: 'It is the only performance number that combines how often you win with how much you win.',
    forTrade: 'Positive expectancy in a small sample is not evidence of an edge — it is a small sample.',
    misleading: 'A handful of outliers can carry the whole figure. Always read it with the sample size next to it.',
    context: (c) => (has(c.expectancy) ? `Stored expectancy over your recorded trades: ${c.expectancy.toFixed(2)}${c.unit ?? '%'}${has(c.sampleSize) ? ` across ${c.sampleSize} trades` : ''}.` : null),
  },
  {
    key: 'win_rate', term: 'Win rate', category: 'Performance',
    what: {
      PLAIN: 'How often your trades finish profitable.',
      BALANCED: 'Win rate — winning trades as a percentage of closed trades. Meaningless without the payoff ratio beside it.',
      TECHNICAL: 'Empirical hit rate; on its own it is uninformative about expectancy since payoff asymmetry dominates.',
    },
    why: 'It is the most over-weighted statistic in trading and the least informative on its own.',
    forTrade: 'A 40% win rate with a 3:1 payoff beats a 70% win rate with a 1:3 payoff.',
    misleading: 'It can be raised at will by cutting winners early and holding losers — which lowers expectancy.',
    context: (c) => (has(c.winRate) ? `Stored win rate: ${c.winRate.toFixed(1)}%${has(c.sampleSize) ? ` over ${c.sampleSize} closed trades` : ''}.` : null),
  },
  {
    key: 'payoff_ratio', term: 'Payoff ratio', category: 'Performance',
    what: {
      PLAIN: 'How big your average winner is compared with your average loser.',
      BALANCED: 'Payoff ratio — average win divided by average loss. Together with win rate it determines expectancy.',
      TECHNICAL: 'E[win]/|E[loss]|; the breakeven win rate is 1/(1 + payoff ratio).',
    },
    why: 'It is where most process improvement actually shows up.',
    forTrade: 'Cutting a winner before the target lowers this number permanently in your record.',
    misleading: 'One exceptional winner can inflate it for months.',
    context: (c) => (has(c.payoffRatio) ? `Stored payoff ratio: ${c.payoffRatio.toFixed(2)}×.` : null),
  },
  {
    key: 'drawdown', term: 'Drawdown', category: 'Performance',
    what: {
      PLAIN: 'How far you fell from your best point before recovering.',
      BALANCED: 'Drawdown — the decline from a running peak in cumulative results, usually quoted as the maximum observed.',
      TECHNICAL: 'max(peak − trough) over the equity path; path-dependent and strictly worse than the terminal return implies.',
    },
    why: 'It describes the experience of the strategy, which is what determines whether it gets abandoned.',
    forTrade: 'Size so that a normal drawdown is survivable without changing the process.',
    misleading: 'Historical maximum drawdown is a floor on expectations, not a limit.',
    context: (c) => (has(c.drawdown) ? `Stored maximum drawdown in your ledger: ${c.drawdown.toFixed(1)}%.` : null),
  },
  {
    key: 'mfe', term: 'MFE (maximum favourable excursion)', category: 'Performance',
    what: {
      PLAIN: 'The best the trade ever looked before you closed it.',
      BALANCED: 'Maximum favourable excursion — the peak unrealised gain reached while the position was open.',
      TECHNICAL: 'Supremum of unrealised P/L over the holding period; compared with realised P/L to quantify capture efficiency.',
    },
    why: 'The gap between MFE and your actual exit is a measurable, fixable process fact.',
    forTrade: 'A pattern of large MFE and small realised gain points at exits, not entries.',
    misleading: 'MFE is only computable where the position was marked frequently enough; sparse marks understate it.',
    context: (c) => (has(c.mfe) ? `Stored MFE on this trade: ${c.mfe.toFixed(1)}%.` : null),
  },
  {
    key: 'mae', term: 'MAE (maximum adverse excursion)', category: 'Performance',
    what: {
      PLAIN: 'The worst the trade ever looked before it resolved.',
      BALANCED: 'Maximum adverse excursion — the deepest unrealised loss reached while the position was open.',
      TECHNICAL: 'Infimum of unrealised P/L over the holding period; used to calibrate invalidation distance against normal noise.',
    },
    why: 'It shows whether your invalidation levels sit inside ordinary noise.',
    forTrade: 'If winners routinely show a deep MAE, the invalidation is probably too tight — or the entry too early.',
    misleading: 'A shallow MAE on a small sample says nothing about the next trade.',
    context: (c) => (has(c.mae) ? `Stored MAE on this trade: ${c.mae.toFixed(1)}%.` : null),
  },
  {
    key: 'high_water', term: 'High-water P/L', category: 'Behavioural',
    what: {
      PLAIN: 'The best your account stood at during the session.',
      BALANCED: 'Session high-water P/L — the peak cumulative profit reached during a trading session.',
      TECHNICAL: 'Running maximum of intraday cumulative realised P/L; the reference point for giveback measurement.',
    },
    why: 'It is the reference point for measuring giveback, which is one of the most consistent behavioural markers in a trading record.',
    forTrade: 'Knowing where the session peaked makes the decision to keep trading a conscious one.',
    misleading: 'The high-water mark is visible only in hindsight; it was never an available exit.',
    context: (c) => (has(c.highWater) ? `Session high-water P/L recorded: ${c.highWater.toFixed(2)}.` : null),
  },
  {
    key: 'giveback', term: 'Giveback', category: 'Behavioural',
    what: {
      PLAIN: 'How much of the session’s best profit was handed back.',
      BALANCED: 'Giveback — the decline from the session high-water P/L, in currency and as a fraction of the peak.',
      TECHNICAL: 'high-water − current cumulative P/L; expressed as a fraction of high-water for cross-session comparability.',
    },
    why: 'Large giveback is an observable process event, and it is one URSORA can measure without interpreting your state of mind.',
    forTrade: 'URSORA reports the number and the comparison with your own history. It does not tell you to stop and does not diagnose why.',
    misleading: 'Giveback within normal variance is not a finding. Below the configured sample threshold no comparison is asserted at all.',
    context: (c) => (has(c.giveback) ? `Giveback from the session peak: ${c.giveback.toFixed(2)}.` : null),
  },

  /* ------------------------------ behavioural ----------------------------- */
  {
    key: 'behavioral_risk', term: 'Behavioural Risk', category: 'Behavioural',
    what: {
      PLAIN: 'How far today’s trading is from your own normal pattern.',
      BALANCED: 'Behavioural Risk — a 0–100 deviation score comparing today’s observable trading (size, frequency, re-entry timing, giveback, setup quality) against YOUR OWN stored baseline.',
      TECHNICAL: 'Weighted deviation composite over per-category z-like gates defined in behavioral/config.ts, scaled by the user’s sensitivity setting; each contributing factor is itemised with its own sample size.',
    },
    why: 'It is measured against your own history, not against a generic standard of how anyone should trade.',
    forTrade: 'It is information, not permission. URSORA never blocks a trade and never diagnoses an emotional state.',
    misleading: 'It is NOT a psychological assessment. It measures recorded trade attributes only, and says nothing about why they occurred. Below the minimum sample it reports INSUFFICIENT DATA rather than a score.',
    soWhat: 'A high reading means today looks unlike your normal sessions — worth one deliberate look at size and pace before the next entry.',
    context: (c) => {
      if (!has(c.behavioralRisk)) return null;
      const band = c.behavioralBand ? ` (${c.behavioralBand})` : '';
      return `Current stored Behavioural Risk: ${Math.round(c.behavioralRisk)} / 100${band}.`;
    },
  },
  {
    key: 'process_adherence', term: 'Process Adherence', category: 'Behavioural',
    what: {
      PLAIN: 'How closely you followed the plan you wrote, regardless of whether the trade made money.',
      BALANCED: 'Process Adherence — a 0–100 score over planned entry, size, invalidation, target handling and setup match. Profitability is deliberately excluded.',
      TECHNICAL: 'Weighted adherence composite (weights in ADHERENCE_WEIGHTS) over plan/execution deltas; outcome is intentionally not an input.',
    },
    why: 'Outcome is noisy over a few trades; process is measurable on every single one.',
    forTrade: 'A profitable trade with poor adherence is still a process failure, and it is the kind that gets repeated.',
    misleading: 'It cannot score what was never written down. A trade with no stored plan is recorded as unplanned rather than scored as perfect.',
    context: (c) => (has(c.processAdherence) ? `Stored Process Adherence for this trade: ${Math.round(c.processAdherence)} / 100.` : null),
  },
  {
    key: 'baseline', term: 'Baseline', category: 'Behavioural',
    what: {
      PLAIN: 'What your normal trading looks like, measured from your own recorded trades.',
      BALANCED: 'Baseline — rolling medians of your position size, trades per session, holding time, entry quality and session timing, computed from your stored history.',
      TECHNICAL: 'Rolling per-user central tendencies updated incrementally as trades close; medians are used rather than means for outlier resistance.',
    },
    why: 'Every behavioural comparison in URSORA is against this, never against another trader.',
    forTrade: 'Until enough trades exist, there is no baseline and no comparison is made.',
    misleading: 'A baseline built during an unusual period describes that period. It updates as history accumulates.',
    context: (c) => (has(c.baselineValue) ? `Your stored baseline for this measure: ${c.baselineValue.toFixed(2)}${c.unit ?? ''}${has(c.sampleSize) ? ` (n=${c.sampleSize})` : ''}.` : null),
  },
  {
    key: 'deviation', term: 'Deviation from baseline', category: 'Behavioural',
    what: {
      PLAIN: 'How different today is from your own normal.',
      BALANCED: 'Deviation — the difference between a current measured value and your stored baseline for that measure, as a multiple or percentage.',
      TECHNICAL: 'Current/baseline ratio evaluated against the gates in DEVIATION, scaled by the sensitivity factor; reported with sample size and confidence label.',
    },
    why: 'Deviation is observable. Motivation is not, so URSORA reports the first and never claims the second.',
    forTrade: 'A deviation is a fact for you to interpret, with your own context that URSORA cannot see.',
    misleading: 'Deviation is not misconduct. Deliberately sizing up on a high-conviction setup is a deviation too.',
    context: (c) => {
      if (!has(c.currentValue) || !has(c.baselineValue) || c.baselineValue === 0) return null;
      return `Current ${c.currentValue.toFixed(2)}${c.unit ?? ''} against your baseline ${c.baselineValue.toFixed(2)}${c.unit ?? ''} — ${(c.currentValue / c.baselineValue).toFixed(2)}× your normal.`;
    },
  },
  {
    key: 'rapid_reentry', term: 'Rapid re-entry', category: 'Behavioural',
    what: {
      PLAIN: 'Opening another trade very soon after closing one.',
      BALANCED: 'Rapid re-entry — a new entry within a short configured window after an exit, measured in minutes from the stored timestamps.',
      TECHNICAL: 'Inter-trade interval below DEVIATION.rapidReentryMinutes, scaled by sensitivity; counted per session and compared with the user’s own distribution.',
    },
    why: 'The interval between trades is one of the few decision-quality proxies that can be measured objectively.',
    forTrade: 'URSORA records the interval and compares it with your history. It draws no conclusion about your state of mind.',
    misleading: 'Fast re-entry can be a legitimate scalping style. That is exactly why it is compared with YOUR baseline and not a rule.',
  },
  {
    key: 'size_escalation', term: 'Position-size escalation', category: 'Behavioural',
    what: {
      PLAIN: 'Sizing up beyond your usual amount, especially within a single session.',
      BALANCED: 'Position-size escalation — position size above a configured multiple of your rolling median size.',
      TECHNICAL: 'Size/median-size ratio crossing the notable/elevated/high gates in DEVIATION, evaluated per trade and per session sequence.',
    },
    why: 'Size changes the consequences of everything else in the process.',
    forTrade: 'An escalation is reported with the multiple and the baseline so you can judge whether it was deliberate.',
    misleading: 'A larger position on a rare, well-evidenced setup is a sound decision that still registers as a deviation.',
  },
  {
    key: 'trade_origin', term: 'Trade origin', category: 'Behavioural',
    what: {
      PLAIN: 'Where the trade idea came from — URSORA, someone else, your own analysis, or a spur-of-the-moment decision.',
      BALANCED: 'Trade origin — a user-set label (URSORA-supported, external trader signal, independent planned, spontaneous, other) recorded with each trade.',
      TECHNICAL: 'Categorical provenance field, always user-asserted and never inferred, used to segment outcome and adherence statistics by idea source.',
    },
    why: 'It lets URSORA show how your results differ depending on how the idea was generated — which is otherwise invisible.',
    forTrade: 'Set it honestly at entry. It can be corrected later, and the correction is recorded rather than overwriting history.',
    misleading: 'Segmented results by origin need a real sample in each bucket before any comparison is meaningful.',
    context: (c) => (c.origin ? `Recorded origin for this trade: ${c.origin.replace(/_/g, ' ').toLowerCase()}.` : null),
  },
];

export const GLOSSARY: Record<string, GlossaryEntry> = Object.fromEntries(ENTRIES.map((e) => [e.key, e]));
export const GLOSSARY_LIST = ENTRIES;
export const GLOSSARY_CATEGORIES = Array.from(new Set(ENTRIES.map((e) => e.category)));

export const getTerm = (key: string): GlossaryEntry | null => GLOSSARY[key] ?? null;

/** Resolve the contextual line for a term. Returns null when no stored value supports it. */
export function resolveContext(key: string, ctx: GlossaryContext | undefined): string | null {
  const entry = GLOSSARY[key];
  if (!entry || !entry.context || !ctx) return null;
  try {
    return entry.context(ctx);
  } catch {
    return null;
  }
}

/** Short inline definition at the requested level — used for tooltips and captions. */
export function shortDefinition(key: string, level: ExplanationLevel): string | null {
  const entry = GLOSSARY[key];
  return entry ? entry.what[level] : null;
}
