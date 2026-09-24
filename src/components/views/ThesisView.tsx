import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Ban, Bot, Building2, CalendarClock, ClipboardList, Gauge, Layers, LineChart, MessageSquareQuote,
  Newspaper, ShieldAlert, Sparkles, Users, X,
} from 'lucide-react';
import {
  fetchBars, fetchCandidates, fetchEarnings, fetchEconomicEvents, fetchFilings, fetchNews, fetchQuote, fetchRisk,
  fetchSentiment, fetchSignal, fetchSnapshot, fetchTickers, fetchTranscripts,
  track,
} from '@/lib/api';
import type {
  Bar, ContractCandidate, EarningsEvent, EconomicEvent, Filing, MarketSnapshot, NewsItem, Quote, RiskAssessment,
  SentimentReading, Signal, Ticker, TranscriptStatement,
} from '@/lib/types';
import {
  changeColor, clockET, compact, dte, ivPct, money, num, pct, scoreColor, stampET,
} from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DataBadge, DemoBadge, DirectionTag, Disclaimer, EmptyState, FlagTag, Metric, Panel, Provenance, RiskTag, ScoreBar,
  SourceBadge, Spinner, Unavailable, Val,
} from '@/components/common/Primitives';
import PriceChart from '@/components/charts/PriceChart';
import AnalystChat from '@/components/AnalystChat';
import { cn } from '@/lib/utils';

const SENTIMENT_ORDER = ['Very Bearish', 'Bearish', 'Mixed', 'Bullish', 'Very Bullish'];

const SentimentGauge: React.FC<{ reading: SentimentReading | undefined; title: string }> = ({ reading, title }) => {
  const idx = reading ? SENTIMENT_ORDER.indexOf(reading.label) : -1;
  return (
    <div className="rounded-sm border border-zinc-800 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{title}</span>
        {reading ? <SourceBadge type={reading.source_type} /> : null}
      </div>
      <div
        className={cn(
          'mt-2 font-mono text-sm font-semibold uppercase tracking-wide',
          idx <= 1 && idx >= 0 ? 'text-red-300' : idx === 2 ? 'text-sky-300' : idx > 2 ? 'text-emerald-300' : 'text-zinc-500',
        )}
      >
        {reading?.label ?? <Unavailable />}
      </div>
      <div className="mt-2 flex gap-1">
        {SENTIMENT_ORDER.map((l, i) => (
          <div
            key={l}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i === idx ? (i <= 1 ? 'bg-red-500' : i === 2 ? 'bg-sky-500' : 'bg-emerald-500') : 'bg-zinc-800',
            )}
            title={l}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Metric label="Sentiment score" value={reading?.score} />
        <Metric label="Mention volume" value={compact(reading?.mention_volume)} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{reading?.note ?? <Unavailable />}</p>
      <div className="mt-2 font-mono text-[10px] text-zinc-600">
        sources: {reading?.sources?.length ? reading.sources.join(', ') : 'DATA UNAVAILABLE'}
      </div>
    </div>
  );
};

export const ThesisView: React.FC<{ signalId: number; onBack: () => void }> = ({ signalId, onBack }) => {
  useAuth();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [candidates, setCandidates] = useState<ContractCandidate[]>([]);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptStatement[]>([]);
  const [sentiment, setSentiment] = useState<SentimentReading[]>([]);
  const [bars, setBars] = useState<Bar[]>([]);
  const [econ, setEcon] = useState<EconomicEvent[]>([]);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [showAllNews, setShowAllNews] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setShowAllNews(false);
    (async () => {
      const sig = await fetchSignal(signalId);
      if (!active) return;
      setSignal(sig);
      if (!sig) {
        setLoading(false);
        return;
      }
      const [q, tks, snap, cands, rk, nw, fl, tr, se, bs, ec, ea] = await Promise.all([
        fetchQuote(sig.symbol), fetchTickers(), fetchSnapshot(), fetchCandidates(sig.id), fetchRisk(sig.id),
        fetchNews(sig.symbol, 14), fetchFilings(sig.symbol), fetchTranscripts(sig.symbol), fetchSentiment(sig.symbol),
        fetchBars(sig.symbol, 80), fetchEconomicEvents(), fetchEarnings(),
      ]);
      if (!active) return;
      setQuote(q);
      setTicker(tks.find((t) => t.symbol === sig.symbol) ?? null);
      setSnapshot(snap);
      setCandidates(cands);
      setRisk(rk);
      setNews(nw);
      setFilings(fl);
      setTranscripts(tr);
      setSentiment(se);
      setBars(bs);
      setEcon(ec.filter((e) => e.affected_symbols.includes(sig.symbol)));
      setEarnings(ea.filter((e) => e.symbol === sig.symbol));
      setLoading(false);
      track('thesis_viewed', { symbol: sig.symbol, opportunity: sig.opportunity_score });
    })();
    return () => {
      active = false;
    };
  }, [signalId]);

  const factors = useMemo(() => signal?.score_breakdown?.factors ?? [], [signal]);
  const thesisState = signal?.score_breakdown?.thesis_state ?? null;
  const evidenceCompleteness = signal?.score_breakdown?.evidence_completeness ?? null;
  const directionalCompleteness = signal?.score_breakdown?.directional_completeness ?? null;
  const directionalUncertainty = signal?.score_breakdown?.directional_uncertainty ?? null;
  const availableFamilies = signal?.score_breakdown?.available_families ?? null;
  const totalFamilies = signal?.score_breakdown?.total_families ?? null;
  const agreementScore = signal?.score_breakdown?.agreement_score ?? null;
  const agreementFamilyCount = signal?.score_breakdown?.agreement_family_count ?? null;
  const supportShare = signal?.score_breakdown?.support_share ?? null;
  const thesisHierarchy = signal?.score_breakdown?.thesis_hierarchy ?? null;
  const interactionFlags = signal?.score_breakdown?.interaction_flags ?? [];
  const thesisBlockers = signal?.score_breakdown?.thesis_blockers ?? signal?.score_breakdown?.blockers ?? [];
  const tradeBlockers = signal?.score_breakdown?.trade_blockers ?? [];
  const balanced = useMemo(() => candidates.find((c) => c.profile === 'Balanced') ?? candidates[0] ?? null, [candidates]);
  const retail = sentiment.find((s) => s.cohort === 'retail');
  const professional = sentiment.find((s) => s.cohort === 'professional');

  if (loading) return <Spinner label="Preparing the trade analysis" />;
  if (!signal) {
    return <EmptyState title="Signal not found" body="This signal record is not in the store." action={<Button onClick={onBack}>Back to opportunities</Button>} />;
  }

  const isNoTrade = signal.strategy === 'No Trade';
  const analysisHasInferred = factors.some((factor) => factor.provenance === 'imputed');
  const optionsObserved = [
    quote?.call_volume,
    quote?.put_volume,
    quote?.put_call_ratio,
    quote?.total_oi,
    quote?.iv,
  ].some((value) => value !== null && value !== undefined);
  const quoteIsDelayed = Boolean(
    quote?.source_name?.includes('Frozen Session Close') ||
    quote?.source_name?.includes('Daily Aggregates'),
  );

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="rounded-md border border-zinc-800 bg-[#14171c]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 p-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:text-sky-300"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              back to opportunities
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-zinc-50">{signal.symbol}</h1>
              <span className="text-sm text-zinc-400">{ticker?.company ?? <Unavailable />}</span>
              {signal.is_demo
                ? <DemoBadge />
                : analysisHasInferred
                  ? <DataBadge kind="inferred" label="ANALYSIS INCLUDES INFERRED DATA" />
                  : <DataBadge kind="derived" />}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DirectionTag direction={signal.direction} />
              <RiskTag level={signal.risk_level} />
              <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wide text-zinc-300">
                {signal.strategy}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                generated {stampET(signal.generated_at)} · run {signal.run_id} · {signal.engine_version}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <div className="font-mono text-2xl tabular-nums text-zinc-50">
                {money(signal.stock_price_at_generation) ?? <Unavailable />}
              </div>
              <div className={cn(
                'font-mono text-[11px]',
                changeColor(typeof signal.score_breakdown?.raw?.change_pct === 'number'
                  ? signal.score_breakdown.raw.change_pct
                  : null),
              )}>
                {pct(typeof signal.score_breakdown?.raw?.change_pct === 'number'
                  ? signal.score_breakdown.raw.change_pct
                  : null) ?? '—'} · signal price
              </div>
              {quote?.price != null && (
                <div className="mt-0.5 font-mono text-[9px] text-zinc-600">
                  current {money(quote.price)} · {clockET(quote.as_of)}
                </div>
              )}
            </div>
            <div className="w-40 space-y-2">
              <ScoreBar label="Opportunity" score={signal.opportunity_score} />
              <ScoreBar label="Confidence" score={signal.confidence_score} />
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={() => setChatOpen(true)} className="gap-1.5">
                <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                Ask the analyst
              </Button>

            </div>
          </div>
        </div>

        {isNoTrade ? (
          <div className="border-b border-amber-500/30 bg-amber-500/[0.06] p-3">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                {thesisState === 'Supported' || thesisState === 'Strongly Supported'
                  ? `${thesisState} thesis · trade not eligible`
                  : 'No trade identified'}
              </h2>
            </div>
            <p className="mt-2 max-w-4xl text-[13px] leading-relaxed text-zinc-300">{signal.no_trade_reason}</p>
          </div>
        ) : null}

        <div className="grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Holding period" value={signal.holding_period} mono={false} />
          <Metric label="Expiration" value={signal.suggested_expiration} hint={dte(signal.suggested_expiration) !== null ? `${dte(signal.suggested_expiration)} days out` : undefined} />
          <Metric label="Strike" value={num(signal.suggested_strike)} />
          <Metric label="Break-even" value={num(signal.break_even)} />
          <Metric label="Target" value={num(signal.target_price)} valueClass="text-emerald-300" />
          <Metric label="Trade no longer valid at" value={num(signal.invalidation_level)} valueClass="text-amber-300" />
        </div>
        <div className="border-t border-zinc-800 px-3 py-2 text-[12px] leading-relaxed text-zinc-400">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Market-moving event · </span>
          {signal.catalyst_summary ?? <Unavailable />}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-200">{error}</div>
      )}

      {/* EVIDENCE TABS */}
      <Tabs defaultValue="score" className="w-full">
        <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-[#14171c] p-1">
          {[
            { v: 'score', l: 'Score rationale', Icon: Gauge },
            { v: 'market', l: 'Market conditions', Icon: LineChart },
            { v: 'price', l: 'Price movement', Icon: LineChart },
            { v: 'options', l: 'Options data', Icon: Layers },
            { v: 'news', l: 'News & market events', Icon: Newspaper },
            { v: 'exec', l: 'Executive statements', Icon: MessageSquareQuote },
            { v: 'sentiment', l: 'Investor sentiment', Icon: Users },
            { v: 'risk', l: 'Risk', Icon: ShieldAlert },
            { v: 'contracts', l: 'Option contract candidates', Icon: ClipboardList },
          ].map(({ v, l, Icon }) => (
            <TabsTrigger key={v} value={v} className="gap-1.5 font-mono text-[10px] uppercase tracking-wider data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300">
              <Icon className="h-3 w-3" aria-hidden="true" />
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* SCORE BREAKDOWN */}
        <TabsContent value="score" className="mt-3 space-y-3">
          <Panel
            title="Opportunity score rationale"
            subtitle="An interpretation of the evidence included in this run, its relative importance, and whether it affects thesis direction or trade quality. The score summarizes available evidence; it is not a probability of profit."
            right={signal.is_demo
              ? <DemoBadge />
              : analysisHasInferred
                ? <DataBadge kind="inferred" label="INCLUDES INFERRED EVIDENCE" />
                : <DataBadge kind="derived" />}
          >
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Thesis status</div>
                  <div className={cn(
                    'mt-1 text-sm font-semibold',
                    thesisState === 'Strongly Supported' || thesisState === 'Supported'
                      ? 'text-emerald-300'
                      : thesisState === 'Rejected' || thesisState === 'Opposed'
                        ? 'text-red-300'
                        : thesisState === 'Mixed' || thesisState === 'Insufficient Evidence'
                          ? 'text-amber-300'
                          : 'text-zinc-300',
                  )}>
                    {thesisState ?? (signal.engine_version.startsWith('tradecycle-') ? 'Not classified' : 'Legacy score')}
                  </div>
                </div>
                <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Data coverage</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-200">
                    {evidenceCompleteness === null ? 'Not recorded' : `${evidenceCompleteness}%`}
                  </div>
                  {availableFamilies !== null && totalFamilies !== null && (
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      {availableFamilies} of {totalFamilies} evidence categories have usable source data
                    </div>
                  )}
                  {directionalCompleteness !== null && (
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Directional: {directionalCompleteness}% complete{directionalUncertainty !== null ? ` · ${directionalUncertainty}% uncertainty` : ''}
                    </div>
                  )}
                </div>
                <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Qualifying evidence alignment</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-200">
                    {supportShare === null ? 'Insufficient evidence' : `${supportShare}%`}
                  </div>
                  {agreementFamilyCount !== null && (
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      {agreementFamilyCount} Moderate/Strong directional families qualify to vote
                    </div>
                  )}
                </div>
                <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Classification rule</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                    Price/structure establishes the directional thesis. Momentum and participation confirm or contradict it; market, sector, and catalysts provide context. Only Moderate and Strong evidence can vote. Weak and Insufficient evidence abstain.
                  </div>
                </div>
              </div>

              {thesisHierarchy && (
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Primary structure</div>
                    <div className="mt-1 text-[12px] font-semibold text-zinc-200">
                      {thesisHierarchy.primary?.band ?? 'Insufficient'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">
                      Price trend · {thesisHierarchy.primary?.vote === 'SUPPORT' ? 'establishes direction' : 'does not establish direction'}
                    </div>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Confirmation</div>
                    <div className={cn(
                      'mt-1 text-[12px] font-semibold',
                      thesisHierarchy.confirmation?.state === 'confirmed' ? 'text-emerald-300'
                        : thesisHierarchy.confirmation?.state === 'partially_confirmed' ? 'text-sky-300'
                          : thesisHierarchy.confirmation?.state === 'divergent' ? 'text-red-300'
                            : 'text-zinc-300',
                    )}>
                      {(thesisHierarchy.confirmation?.state ?? 'unavailable').replaceAll('_', ' ')}
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Momentum + participation</div>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Context</div>
                    <div className={cn(
                      'mt-1 text-[12px] font-semibold',
                      thesisHierarchy.context?.state === 'supportive' ? 'text-emerald-300'
                        : thesisHierarchy.context?.state === 'opposing' ? 'text-red-300'
                          : thesisHierarchy.context?.state === 'mixed' ? 'text-amber-300'
                            : 'text-zinc-300',
                    )}>
                      {thesisHierarchy.context?.state ?? 'neutral'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Market/sector + verified catalysts</div>
                  </div>
                </div>
              )}

              {interactionFlags.length > 0 && (
                <Panel
                  title="How the evidence interacts"
                  subtitle="These relationships matter more than simply adding independent indicator scores."
                >
                  <div className="grid gap-2 lg:grid-cols-2">
                    {interactionFlags.map((flag) => (
                      <div
                        key={flag.key}
                        className={cn(
                          'rounded-sm border p-2.5',
                          flag.state === 'confirming'
                            ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                            : flag.state === 'conflicting'
                              ? 'border-amber-500/30 bg-amber-500/[0.05]'
                              : 'border-zinc-800 bg-black/20',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">{flag.role}</span>
                          <span className={cn(
                            'font-mono text-[8px] uppercase tracking-wider',
                            flag.state === 'confirming' ? 'text-emerald-300'
                              : flag.state === 'conflicting' ? 'text-amber-300'
                                : 'text-zinc-400',
                          )}>
                            {flag.state}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-zinc-200">{flag.label}</div>
                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{flag.detail}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {thesisBlockers.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-300">Thesis constraints</div>
                  <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-zinc-400">
                    {thesisBlockers.map((blocker) => (
                      <li key={blocker} className="flex gap-2">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {tradeBlockers.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-300">Trade constraints</div>
                  <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-zinc-400">
                    {tradeBlockers.map((blocker) => (
                      <li key={blocker} className="flex gap-2">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!signal.engine_version.startsWith('tradecycle-') && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[12px] leading-relaxed text-zinc-400">
                  This analysis was generated by an earlier scoring model. Its opportunity score may not reconstruct from the factors shown below. Run a new analysis to use the current TradeCycle scoring model.
                </div>
              )}
              <div className={cn(
                'grid gap-3',
                factors.length >= 5 ? 'grid-cols-1 xl:grid-cols-3' : factors.length >= 3 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1',
              )}>
              {factors.map((f) => {
                const importance = Math.round(f.effective_weight * 100);
                const raw = Number(f.raw_score);
                const isTradeQuality = f.factor === 'liquidity' || f.factor === 'risk_reward';

                const signed = Number(f.signed_score ?? 0);
                const engineBand = String(f.strength_band ?? '');
                const engineVote = String(f.thesis_vote ?? '');
                const strength = isTradeQuality
                  ? signed >= 75 ? 'Excellent'
                    : signed >= 50 ? 'Favorable'
                      : signed >= 20 ? 'Adequate'
                        : signed > -20 ? 'Neutral'
                          : signed > -50 ? 'Weak'
                            : 'Poor'
                  : engineBand || (raw >= 70 ? 'Strong' : raw >= 45 ? 'Moderate' : raw >= 20 ? 'Weak' : 'Insufficient');

                const effectText = isTradeQuality
                  ? f.effect === 'INCREASED'
                    ? 'Favorable trade quality'
                    : f.effect === 'DECREASED'
                      ? 'Unfavorable trade quality'
                      : raw > 0
                        ? 'Limited trade-quality contribution'
                        : 'No usable trade-quality evidence'
                  : engineVote === 'SUPPORT'
                    ? `${strength} supporting evidence`
                    : engineVote === 'OPPOSE'
                      ? `${strength} opposing evidence`
                      : strength === 'Weak'
                        ? signed > 0 ? 'Weak bullish lean · no thesis vote' : signed < 0 ? 'Weak bearish lean · no thesis vote' : 'Weak evidence · no thesis vote'
                        : 'Insufficient evidence · no thesis vote';

                const effectLabel = isTradeQuality ? 'Trade-quality effect' : 'Thesis effect';
                const effectValue = isTradeQuality
                  ? f.effect === 'INCREASED'
                    ? 'Improves trade quality'
                    : f.effect === 'DECREASED'
                      ? 'Reduces trade quality'
                      : 'No material effect'
                  : engineVote === 'SUPPORT'
                    ? 'Supports thesis'
                    : engineVote === 'OPPOSE'
                      ? 'Opposes thesis'
                      : 'Abstains';

                return (
                  <div key={f.factor} className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-zinc-100">{f.label}</div>
                        <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-zinc-400">{f.explanation}</p>
                      </div>
                      <span
                        className={cn(
                          'rounded-sm border px-2 py-1 text-[10px] font-medium',
                          !isTradeQuality && engineVote === 'ABSTAIN'
                            ? strength === 'Weak'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                              : 'border-zinc-700 bg-zinc-800/30 text-zinc-400'
                            : f.effect === 'INCREASED'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : f.effect === 'DECREASED'
                                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                                : 'border-zinc-700 text-zinc-400',
                        )}
                      >
                        {effectText}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-800/80 pt-2.5">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-zinc-600">{isTradeQuality ? 'Quality' : 'Strength'}</div>
                        <div className={cn('mt-0.5 text-[11px] font-semibold', scoreColor(isTradeQuality ? Math.max(0, Math.min(100, (signed + 100) / 2)) : raw))}>
                          {strength} · {isTradeQuality ? `${signed > 0 ? '+' : ''}${num(signed, 0)}` : `${num(raw, 0)}/100`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-zinc-600">Weight</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-zinc-200">{importance}%</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-zinc-600">{effectLabel}</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-zinc-200">{effectValue}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>

              {!factors.length && <Unavailable />}

              <div className="rounded-md border border-sky-500/30 bg-sky-500/[0.05] p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Opportunity score</div>
                <div className={cn('mt-1 text-2xl font-semibold tabular-nums', scoreColor(signal.opportunity_score))}>
                  {signal.opportunity_score}/100
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                  The opportunity score summarizes the strength of the evidence that is currently available. Thesis status and evidence completeness determine whether that score is sufficient to support a trade analysis.
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Factor weighting rationale" subtitle={"Market environment used for this analysis: " + (signal.regime ?? 'not available')}>
            <div
              className={cn(
                'grid gap-2',
                (signal.weights?.decisions?.length ?? 0) >= 5
                  ? 'grid-cols-1 lg:grid-cols-3'
                  : (signal.weights?.decisions?.length ?? 0) >= 3
                    ? 'grid-cols-1 md:grid-cols-2'
                    : 'grid-cols-1',
              )}
            >
              {(signal.weights?.decisions ?? []).map((d, i) => (
                <div key={i} className="flex h-full gap-2 rounded-sm border border-zinc-800 bg-black/20 p-2.5 text-[12px] leading-relaxed text-zinc-400">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
                  <span>{d}</span>
                </div>
              ))}
              {(!signal.weights?.decisions?.length ||
                (signal.weights.decisions.length === 1 &&
                  signal.weights.decisions[0] === 'Independent baseline scoring uses only stored market rows.')) && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3">
                  <div className="text-[11px] font-medium text-amber-200">Provisional scoring basis</div>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                    This analysis currently uses only price movement and momentum from stored quote data. Options activity, market events, verified
                    news, broader market alignment, liquidity, risk/reward and cross-factor agreement are not represented.
                    The current score is therefore preliminary and should not be treated as a complete trade analysis.
                  </p>
                </div>
              )}
            </div>

            <details className="mt-3 rounded-md border border-zinc-800 bg-black/20">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-zinc-400 hover:text-zinc-200">
                View technical scoring details
              </summary>
              <div className="overflow-x-auto border-t border-zinc-800 p-3">
                <table className="w-full min-w-[720px] text-left text-[11px]">
                  <thead className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      {['Factor', 'Raw score', 'Baseline weight', 'Current weight', 'Weight adjustment', 'Weighted contribution'].map((h) => (
                        <th key={h} scope="col" className="px-2 py-1.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {factors.map((f) => (
                      <tr key={f.factor}>
                        <td className="px-2 py-2 text-zinc-300">{f.label}</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{num(f.raw_score, 1)}</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-500">{(f.base_weight * 100).toFixed(1)}%</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{(f.effective_weight * 100).toFixed(1)}%</td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-500">
                          {f.weight_change > 0 ? '+' : ''}{(f.weight_change * 100).toFixed(1)} percentage points
                        </td>
                        <td className="px-2 py-2 font-mono tabular-nums text-zinc-300">{num(f.contribution, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <Disclaimer className="mt-3 border-t border-zinc-800 pt-3" />
          </Panel>
        </TabsContent>

        {/* MARKET CONTEXT */}
        <TabsContent value="market" className="mt-3 space-y-3">
          <Panel
            title="Market conditions"
            subtitle="Broader market conditions that may affect this analysis."
            right={snapshot?.is_demo ? <DemoBadge /> : <DataBadge kind="derived" label="DERIVED MARKET CONTEXT" />}
          >
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Market environment" value={snapshot?.regime} mono={false} />
              <Metric label="SPY" value={num(snapshot?.spy_price)} hint={pct(snapshot?.spy_change_pct) ?? undefined} valueClass={changeColor(snapshot?.spy_change_pct)} />
              <Metric label="QQQ" value={num(snapshot?.qqq_price)} hint={pct(snapshot?.qqq_change_pct) ?? undefined} valueClass={changeColor(snapshot?.qqq_change_pct)} />
              <Metric label="IWM" value={num(snapshot?.iwm_price)} hint={pct(snapshot?.iwm_change_pct) ?? undefined} valueClass={changeColor(snapshot?.iwm_change_pct)} />
              <Metric label="VIX" value={num(snapshot?.vix)} hint={pct(snapshot?.vix_change_pct) ?? undefined} />
              <Metric label="US 10Y" value={num(snapshot?.us10y)} />
              <Metric label="US 2Y" value={num(snapshot?.us02y)} />
              <Metric label="Dollar index" value={num(snapshot?.dxy)} />
              <Metric label="WTI" value={num(snapshot?.wti)} />
              <Metric label="Gold" value={num(snapshot?.gold)} />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Market participation</div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{snapshot?.breadth_note ?? <Unavailable />}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Metric label="Stocks rising" value={snapshot?.breadth_advancers} valueClass="text-emerald-300" />
                  <Metric label="Stocks falling" value={snapshot?.breadth_decliners} valueClass="text-red-300" />
                </div>
                <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500">Economic environment</div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{snapshot?.macro_note ?? <Unavailable />}</p>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Sector performance</div>
                <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                  {(snapshot?.sector_performance ?? []).map((s) => (
                    <li
                      key={s.sector}
                      className={cn(
                        'flex items-center justify-between rounded-sm px-2 py-1 text-[11px]',
                        s.sector === ticker?.sector ? 'border border-sky-500/40 bg-sky-500/10' : 'bg-black/20',
                      )}
                    >
                      <span className="text-zinc-300">
                        {s.sector}
                        {s.sector === ticker?.sector && <span className="ml-2 font-mono text-[9px] text-sky-300">this name's sector</span>}
                      </span>
                      <span className={cn('font-mono tabular-nums', changeColor(s.change_pct))}>{pct(s.change_pct)}</span>
                    </li>
                  ))}
                  {!snapshot?.sector_performance?.length && <Unavailable />}
                </ul>
              </div>
            </div>
            {snapshot && (
              <Provenance
                sourceName={snapshot.is_demo ? 'simulation adapter (Market Data)' : 'URSORA derived market context from stored provider data'}
                sourceType="Market Data"
                publishedAt={snapshot.as_of}
                retrievedAt={snapshot.retrieved_at}
                confidence={0.6}
              />
            )}
          </Panel>
        </TabsContent>

        {/* PRICE ACTION */}
        <TabsContent value="price" className="mt-3 space-y-3">
          <Panel
            title="Price movement with key levels drawn"
            right={quote?.is_demo
              ? <DemoBadge />
              : <DataBadge kind={quoteIsDelayed ? 'delayed' : 'observed'} label={quoteIsDelayed ? 'MASSIVE MARKET DATA · SESSION CLOSE' : 'MASSIVE MARKET DATA'} />}
          >
            <PriceChart
              bars={bars}
              levels={[
                { value: quote?.vwap, label: 'VWAP', color: '#38bdf8' },
                { value: quote?.resistance, label: 'Resistance', color: '#34d399' },
                { value: quote?.support, label: 'Support', color: '#f87171' },
                { value: signal.invalidation_level, label: 'Trade no longer valid at', color: '#fbbf24', dash: '2 2' },
                { value: signal.suggested_strike, label: 'Strike', color: '#a78bfa', dash: '6 3' },
              ]}
            />
          </Panel>
          <Panel
            title="Current trading-session movement"
            right={quote?.is_demo
              ? <DemoBadge />
              : <DataBadge kind={quoteIsDelayed ? 'delayed' : 'observed'} label={quoteIsDelayed ? 'MASSIVE MARKET DATA · SESSION CLOSE' : 'MASSIVE MARKET DATA'} />}
          >
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Trend" value={quote?.trend} mono={false} />
              <Metric label="Last" value={num(quote?.price)} />
              <Metric label="Change" value={pct(quote?.change_pct)} valueClass={changeColor(quote?.change_pct)} />
              <Metric label="Session open" value={num(quote?.day_open)} />
              <Metric label="Session high" value={num(quote?.day_high)} />
              <Metric label="Session low" value={num(quote?.day_low)} />
              <Metric label="Premarket" value={num(quote?.premarket_price)} hint={pct(quote?.premarket_change_pct) ?? undefined} />
              <Metric label="Premarket high" value={num(quote?.premarket_high)} />
              <Metric label="Premarket low" value={num(quote?.premarket_low)} />
              <Metric label="Previous close" value={num(quote?.prev_close)} />
              <Metric label="Previous high" value={num(quote?.prev_day_high)} />
              <Metric label="Previous low" value={num(quote?.prev_day_low)} />
              <Metric label="Volume" value={compact(quote?.volume)} />
              <Metric label="Average volume" value={compact(quote?.avg_volume)} />
              <Metric label="Relative volume" value={quote?.rel_volume ? `${num(quote.rel_volume)}x` : null} valueClass="text-sky-300" />
              <Metric label="VWAP" value={num(quote?.vwap)} />
              <Metric label="20-day MA" value={num(quote?.sma20)} />
              <Metric label="50-day MA" value={num(quote?.sma50)} />
              <Metric label="200-day MA" value={num(quote?.sma200)} />
              <Metric label="Support" value={num(quote?.support)} valueClass="text-red-300" />
              <Metric label="Resistance" value={num(quote?.resistance)} valueClass="text-emerald-300" />
              <Metric label="Gap" value={pct(quote?.gap_pct)} />
              <Metric label="ATR" value={num(quote?.atr)} />
              <Metric label="Momentum" value={quote?.momentum_score} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Breakout level</div>
                <p className="mt-1 text-[12px] text-zinc-400">
                  A close above <Val value={num(quote?.resistance)} className="text-emerald-300" /> with relative volume
                  holding above <Val value={num(quote?.rel_volume)} />x confirms continuation.
                </p>
              </div>
              <div className="rounded-sm border border-red-500/30 bg-red-500/5 p-2.5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-red-300">Breakdown level</div>
                <p className="mt-1 text-[12px] text-zinc-400">
                  Losing <Val value={num(quote?.support)} className="text-red-300" /> puts price below its session VWAP
                  and voids the structural case.
                </p>
              </div>
            </div>
            {quote && (
              <Provenance
                sourceName={quote.source_name ?? (quote.is_demo ? 'simulation adapter' : 'market-data provider')}
                sourceType={quote.source_type ?? 'Market Data'}
                publishedAt={quote.published_at}
                retrievedAt={quote.retrieved_at}
                confidence={quote.confidence}
              />
            )}
          </Panel>
        </TabsContent>

        {/* OPTIONS MARKET */}
        <TabsContent value="options" className="mt-3 space-y-3">
          <Panel
            title="Options data"
            right={optionsObserved
              ? <DataBadge kind="delayed" label="MASSIVE OPTIONS · 15M DELAYED" />
              : undefined}
          >
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Call volume" value={compact(quote?.call_volume)} />
              <Metric label="Put volume" value={compact(quote?.put_volume)} />
              <Metric label="Put/call ratio" value={num(quote?.put_call_ratio)} />
              <Metric label="Total open interest" value={compact(quote?.total_oi)} />
              <Metric label="Unusual volume screen" value={quote?.unusual_options_volume ? 'TRIGGERED' : 'not triggered'} mono={false} valueClass={quote?.unusual_options_volume ? 'text-amber-300' : undefined} />
              <Metric label="Implied volatility" value={ivPct(quote?.iv)} />
              <Metric label="IV change" value={pct(quote?.iv_change ? Number(quote.iv_change) * 100 : null)} />
              <Metric label="IV rank" value={quote?.iv_rank} />
              <Metric label="IV percentile" value={quote?.iv_percentile} />
              <Metric label="ATM spread (selected)" value={balanced?.spread_pct ? `${num(balanced.spread_pct)}%` : null} />
            </div>
            <details className="mt-3 rounded-sm border border-amber-500/30 bg-amber-500/[0.06] p-3">
              <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                Why options flow is not automatically read as directional
              </summary>
              <ul className="mt-2 grid gap-2 text-[11px] leading-relaxed text-zinc-400 lg:grid-cols-2">
                <li>
                  Print side: the current Massive Options Starter feed does not provide the trade-side context needed here, so whether these prints hit the
                  ask or the bid is <span className="font-mono text-zinc-300">DATA UNAVAILABLE</span>. Without it, call
                  volume cannot be called bullish.
                </li>
                <li>
                  Opening versus closing: volume above open interest suggests opening activity, but it does not prove
                  it. Here volume is{' '}
                  <Val value={quote?.call_volume && quote?.total_oi ? `${((Number(quote.call_volume) + Number(quote.put_volume ?? 0)) / Number(quote.total_oi)).toFixed(2)}x` : null} />{' '}
                  of total open interest.
                </li>
                <li>
                  Spreads and hedges: multi-leg structures and delta hedges produce the same volume footprint as
                  outright directional buying. Unless the legs are matched, this activity is ambiguous by construction.
                </li>
                <li>
                  Gamma exposure is not displayed: it requires reliable dealer positioning data, which is not available
                  in demo mode. Showing a modelled figure here would be fabrication.
                </li>
              </ul>
            </details>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Selected contract volume" value={compact(balanced?.volume)} />
              <Metric label="Selected open interest" value={compact(balanced?.open_interest)} />
              <Metric label="Volume / OI" value={balanced?.volume && balanced?.open_interest ? `${(Number(balanced.volume) / Number(balanced.open_interest)).toFixed(2)}x` : null} />
              <Metric label="Liquidity score" value={balanced?.liquidity_score} />
            </div>
            <div className="mt-3 rounded-sm border border-zinc-800 bg-black/20 p-2.5 text-[11px] leading-relaxed text-zinc-500">
              Large individual trades and block transactions: <span className="font-mono text-zinc-300">DATA UNAVAILABLE</span>.
              Massive Options Starter supplies delayed chain snapshots, Greeks, IV, volume and open interest, but this
              plan does not supply the individual trade-print context URSORA would need to show size, side and exchange here.
            </div>
            {quote && (
              <Provenance
                sourceName={optionsObserved ? 'Massive Options Starter · 15m delayed' : 'Options data unavailable'}
                sourceType="Market Data"
                publishedAt={quote.as_of}
                retrievedAt={quote.retrieved_at}
                confidence={optionsObserved ? 0.86 : null}
              />
            )}
          </Panel>
        </TabsContent>

        {/* NEWS */}
        <TabsContent value="news" className="mt-3 space-y-3">
          <Panel
            title="News & market events"
            subtitle="Newer items carry more weight. The recency weight shown is the multiplier the engine applied to each item this run."
            right={news.length
              ? (news.some((item) => item.is_demo) ? <DemoBadge /> : <DataBadge kind="observed" label="VERIFIED NEWS" />)
              : undefined}
          >
            <ul className="grid gap-2 xl:grid-cols-2">
              {(showAllNews ? news : news.slice(0, 4)).map((n) => (
                <li key={n.id} className="min-w-0 rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide text-zinc-400">
                      {n.category ?? 'uncategorised'}
                    </span>
                    {n.impact && (
                      <span className={cn(
                        'rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide',
                        n.impact === 'critical' ? 'border-red-500/40 text-red-300'
                          : n.impact === 'high' ? 'border-amber-500/40 text-amber-300'
                            : 'border-zinc-600 text-zinc-400',
                      )}>
                        {n.impact} impact
                      </span>
                    )}
                    {n.sentiment && <DirectionTag direction={n.sentiment} />}
                    <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                      recency weight
                      <span className="inline-block h-1 w-16 overflow-hidden rounded-full bg-zinc-800">
                        <span className="block h-full bg-sky-500" style={{ width: `${Math.round((n.recency_weight ?? 0) * 100)}%` }} />
                      </span>
                      {n.recency_weight?.toFixed(2) ?? 'n/a'}
                    </span>
                  </div>
                  <h4 className="mt-2 text-[13px] font-semibold leading-snug text-zinc-100">
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noreferrer" className="transition-colors hover:text-sky-300">
                        {n.headline}
                      </a>
                    ) : n.headline}
                  </h4>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                    {n.summary ?? 'Brief summary unavailable from this source.'}
                  </p>
                  {n.url && (
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-block font-mono text-[10px] uppercase tracking-wider text-sky-400 hover:text-sky-300"
                    >
                      Read source
                    </a>
                  )}
                  <Provenance
                    sourceName={n.source_name}
                    sourceType={n.source_type}
                    publishedAt={n.published_at}
                    retrievedAt={n.retrieved_at}
                    url={n.url}
                    confidence={n.confidence}
                  />
                </li>
              ))}
              {!news.length && <EmptyState title="No recent news available" body="URSORA does not currently have dated news for this symbol and does not substitute an assumed event." />}
            </ul>
            {news.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllNews((value) => !value)}
                className="mt-3 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
              >
                {showAllNews ? 'Show fewer articles' : `View ${news.length - 4} more articles`}
              </button>
            )}
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="SEC filings" right={<DemoBadge />}>
              <ul className="space-y-2">
                {filings.map((f) => (
                  <li key={f.id} className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-sm border border-indigo-500/40 bg-indigo-500/10 px-1.5 py-[1px] font-mono text-[9px] uppercase text-indigo-300">
                        {f.form_type}
                      </span>
                      <span className="text-[12px] font-semibold text-zinc-200">{f.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{f.summary}</p>
                    <Provenance
                      sourceName={f.source_name}
                      sourceType={f.source_type}
                      publishedAt={f.filed_at}
                      retrievedAt={f.retrieved_at}
                      url={f.url}
                      confidence={f.confidence}
                    />
                  </li>
                ))}
                {!filings.length && <Unavailable />}
              </ul>
            </Panel>
            <Panel title="Scheduled market events for this symbol" right={<DemoBadge />}>
              <ul className="space-y-2">
                {earnings.map((e) => (
                  <li key={`e-${e.id}`} className="rounded-sm border border-amber-500/30 bg-amber-500/[0.05] p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Building2 className="h-3 w-3 text-amber-300" aria-hidden="true" />
                      <span className="font-mono text-[11px] font-semibold text-zinc-100">Earnings</span>
                      <span className="font-mono text-[10px] text-zinc-400">{stampET(e.report_time)}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{e.session}</span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      <Metric label="EPS estimate" value={num(e.eps_estimate)} />
                      <Metric label="Expected price range" value={pct(e.expected_move_pct)} />
                      <Metric label="Date confirmed" value={e.confirmed ? 'yes' : 'no'} mono={false} />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-600">revenue estimate: {e.revenue_estimate ?? 'DATA UNAVAILABLE'}</div>
                  </li>
                ))}
                {econ.map((e) => (
                  <li key={`c-${e.id}`} className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CalendarClock className="h-3 w-3 text-sky-300" aria-hidden="true" />
                      <span className="text-[12px] font-semibold text-zinc-200">{e.title}</span>
                      <span className="ml-auto font-mono text-[10px] text-zinc-500">{stampET(e.event_time)}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{e.detail}</p>
                  </li>
                ))}
                {!earnings.length && !econ.length && <Unavailable />}
              </ul>
            </Panel>
          </div>
        </TabsContent>

        {/* EXEC INTELLIGENCE */}
        <TabsContent value="exec" className="mt-3">
          <Panel
            title="Executive and company statements"
            subtitle="Statements from earnings calls, conferences, investor events, and company presentations that may affect the analysis, shown with source and timing information."
            right={<DemoBadge />}
          >
            <ul className="grid gap-2 xl:grid-cols-2">
              {transcripts.map((t) => (
                <li key={t.id} className="min-w-0 rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-zinc-100">{t.speaker}</span>
                    <span className="text-[11px] text-zinc-500">{t.speaker_role}</span>
                    <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[9px] uppercase text-zinc-400">
                      {t.event_name}
                    </span>
                    {t.market_impact && (
                      <span className={cn(
                        'rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase',
                        t.market_impact === 'high' || t.market_impact === 'critical' ? 'border-amber-500/40 text-amber-300' : 'border-zinc-600 text-zinc-400',
                      )}>
                        {t.market_impact} impact
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-zinc-500">{stampET(t.said_at)}</span>
                  </div>
                  <blockquote className="mt-2 border-l-2 border-sky-500/60 pl-3 text-[13px] italic leading-relaxed text-zinc-200">
                    “{t.quote}”
                  </blockquote>
                  <div className="mt-2">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Relevance to this analysis</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{t.why_it_matters ?? <Unavailable />}</p>
                  </div>
                  <Provenance
                    sourceName={t.source_name}
                    sourceType={t.source_type}
                    publishedAt={t.said_at}
                    retrievedAt={t.retrieved_at}
                    url={t.source_url}
                    confidence={t.confidence}
                  />
                </li>
              ))}
              {!transcripts.length && (
                <EmptyState title="No extracted statements in store" body="The TranscriptProvider has not supplied a market-moving statement for this name. Nothing is inferred in its place." />
              )}
            </ul>
          </Panel>
        </TabsContent>

        {/* SENTIMENT */}
        <TabsContent value="sentiment" className="mt-3">
          <Panel
            title="Investor sentiment"
            subtitle="Retail and professional investor sentiment are shown separately and receive substantially less weight than price, volume, verified news, and options data."
            right={<DemoBadge />}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <SentimentGauge reading={retail} title="Retail sentiment" />
              <SentimentGauge reading={professional} title="Professional / institutional sentiment" />
            </div>
            <div className="mt-3 rounded-sm border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[12px] leading-relaxed text-zinc-400">
              Social popularity alone is not reliable evidence. Mention volume measures attention, not information, and
              it is frequently highest exactly when a move is most crowded. The signal engine caps the social factor at
              5% of the final score in every market environment; if investor sentiment is the only evidence supporting an analysis, the score will
              not clear the tradable threshold.
            </div>
          </Panel>
        </TabsContent>

        {/* RISK */}
        <TabsContent value="risk" className="mt-3 space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              { t: 'Bull case', v: risk?.bull_case, cls: 'border-emerald-500/30 bg-emerald-500/[0.05]', tcls: 'text-emerald-300' },
              { t: 'Base case', v: risk?.base_case, cls: 'border-sky-500/30 bg-sky-500/[0.05]', tcls: 'text-sky-300' },
              { t: 'Bear case', v: risk?.bear_case, cls: 'border-red-500/30 bg-red-500/[0.05]', tcls: 'text-red-300' },
            ].map((c) => (
              <div key={c.t} className={cn('rounded-md border p-3', c.cls)}>
                <h4 className={cn('font-mono text-[10px] font-semibold uppercase tracking-[0.14em]', c.tcls)}>{c.t}</h4>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{c.v ?? <Unavailable />}</p>
              </div>
            ))}
          </div>

          <Panel title="Risk measures" right={<DemoBadge />}>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <Metric label="Premium at risk" value={money(risk?.premium_at_risk)} valueClass="text-red-300" />
              <Metric label="Break-even" value={num(risk?.break_even)} />
              <Metric label="Estimated daily time decay" value={money(risk?.theta_per_day)} valueClass="text-amber-300" />
              <Metric label="Expected price range" value={pct(risk?.expected_move_pct)} />
              <Metric label="Time remaining" value={risk?.time_remaining} mono={false} />
              <Metric label="Trade no longer valid at level" value={num(risk?.invalidation_level)} valueClass="text-amber-300" />
              <Metric label="Max defined loss" value={money(signal.max_defined_loss)} valueClass="text-red-300" />
              <Metric label="Target" value={num(signal.target_price)} valueClass="text-emerald-300" />
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {[
                { t: 'IV risk', v: risk?.iv_risk },
                { t: 'Liquidity risk', v: risk?.liquidity_risk },
                { t: 'Market-event risk', v: risk?.catalyst_risk },
              ].map((r) => (
                <div key={r.t} className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{r.t}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{r.v ?? <Unavailable />}</p>
                </div>
              ))}
            </div>
          </Panel>

          {tradeBlockers.length > 0 && (
            <Panel
              title="Current trade constraints"
              subtitle="Conditions already present that prevent Ursora from suggesting a new trade. These do not necessarily invalidate the directional thesis."
              className="border-amber-500/40"
            >
              <ul className="space-y-2">
                {tradeBlockers.map((blocker) => (
                  <li key={blocker} className="flex gap-2.5 text-[13px] leading-relaxed text-zinc-300">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                    <span>{blocker}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title="Future thesis weakening / invalidation conditions"
            subtitle="Conditions to monitor after a thesis is established. These are distinct from trade constraints that already exist."
            className="border-red-500/40"
          >
            <ol className="space-y-2">
              {(risk?.why_it_could_fail ?? []).map((w, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-zinc-300">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-red-500/40 bg-red-500/10 font-mono text-[9px] text-red-300">
                    {i + 1}
                  </span>
                  {w}
                </li>
              ))}
              {!risk?.why_it_could_fail?.length && <Unavailable />}
            </ol>
            <Disclaimer className="mt-3 border-t border-zinc-800 pt-3" />
          </Panel>
        </TabsContent>

        {/* CONTRACTS */}
        <TabsContent value="contracts" className="mt-3 space-y-3">
          <Panel
            title="Option contract candidates"
            subtitle="Ranked on liquidity, spread, open interest, Greeks, expiry fit, premium, break-even and reach to structure. Illiquid contracts are filtered out before ranking."
            right={candidates.length
              ? <DataBadge kind="derived" label="DERIVED FROM OPTIONS DATA" />
              : undefined}
          >
            {candidates.length === 0 ? (
              <EmptyState
                title="No contract named"
                body="This signal did not clear the engine's thresholds, so no contract is suggested. A direction without a tradeable contract is not a trade."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {candidates.map((c) => (
                  <article
                    key={c.id}
                    className={cn(
                      'rounded-md border p-3 transition-colors',
                      c.profile === 'Balanced' ? 'border-sky-500/50 bg-sky-500/[0.05]' : 'border-zinc-800 bg-black/20 hover:border-zinc-700',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        'rounded-sm border px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-wide',
                        c.profile === 'Aggressive' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                          : c.profile === 'Balanced' ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                      )}>
                        {c.profile}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">contract score {c.selection_score}/100</span>
                    </div>
                    <div className="mt-2 font-mono text-sm font-semibold text-zinc-100">
                      {c.symbol} {c.strike} {c.option_type.toUpperCase()} · {c.expiration}
                      <span className="ml-2 text-[10px] text-zinc-500">{dte(c.expiration)}d</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <Metric label="Bid / Ask" value={`${num(c.bid)} / ${num(c.ask)}`} />
                      <Metric label="Mid" value={num(c.mid)} />
                      <Metric label="Spread" value={`${num(c.spread_pct)}%`} valueClass={Number(c.spread_pct) > 6 ? 'text-amber-300' : undefined} />
                      <Metric label="Liquidity" value={c.liquidity_score} />
                      <Metric label="Volume" value={compact(c.volume)} />
                      <Metric label="Open interest" value={compact(c.open_interest)} />
                      <Metric label="IV" value={ivPct(c.implied_volatility)} />
                      <Metric label="Delta" value={num(c.delta, 3)} />
                      <Metric label="Gamma" value={num(c.gamma, 4)} />
                      <Metric label="Theta" value={num(c.theta, 3)} valueClass="text-amber-300" />
                      <Metric label="Vega" value={num(c.vega, 3)} />
                      <Metric label="Break-even" value={num(c.break_even)} />
                      <Metric label="Premium" value={money(c.est_premium)} />
                      <Metric label="Max loss" value={money(c.max_loss)} valueClass="text-red-300" />
                      <Metric label="Modelled target value" value={money(c.target_value)} valueClass="text-emerald-300" />
                      <Metric label="Model confidence" value={c.prob_thesis_pct ? `${num(c.prob_thesis_pct, 0)}%` : null} />
                    </div>
                    {c.flags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.flags.map((f) => <FlagTag key={f} flag={f} />)}
                      </div>
                    )}
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{c.tradeoff}</p>
                  </article>
                ))}
              </div>
            )}
            <p className="mt-3 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
              Model confidence is derived from contract delta and the evidence score. It is a modelled estimate of the
              analysis remaining valid through expiration — not a probability of profit, and not a guarantee of execution at these
              prices. All chain values are Black-Scholes modelled by the simulation adapter and stored at low confidence.
            </p>
          </Panel>
        </TabsContent>

      </Tabs>

      {/* SLIDE-OVER ANALYST */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 animate-fade-in" role="dialog" aria-label="AI analyst panel">
          <div className="h-full w-full max-w-xl border-l border-zinc-800 bg-[#0b0d10] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Analyst panel · {signal.symbol} analysis context
              </span>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close analyst panel"
                className="text-zinc-500 transition-colors hover:text-zinc-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <AnalystChat
              symbol={signal.symbol}
              signalId={signal.id}
              thread={`thesis-${signal.symbol}`}
              heightClass="h-[calc(100vh-190px)]"
              className="h-[calc(100vh-70px)]"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ThesisView;
