import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Ban, Bot, Building2, CalendarClock, ClipboardList, Gauge, Layers, LineChart, MessageSquareQuote,
  Newspaper, ShieldAlert, Sparkles, Users, X,
} from 'lucide-react';
import {
  fetchBars, fetchCandidates, fetchChartBars, fetchEarnings, fetchEconomicEvents, fetchFilings, fetchNews, fetchOptionMarketSummary, fetchQuote, fetchRisk,
  fetchSentiment, fetchSignal, fetchSnapshot, fetchTickers, fetchTranscripts,
  track,
} from '@/lib/api';
import type {
  Bar, ChartHorizon, ContractCandidate, EarningsEvent, EconomicEvent, Filing, MarketSnapshot, NewsItem, Quote, RiskAssessment,
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


function deriveDailyReactionLevels(
  bars: Bar[],
  referencePrice: number | null,
): {
  support: number | null;
  resistance: number | null;
  supportTouches: number;
  resistanceTouches: number;
} {
  if (!bars.length || referencePrice === null) {
    return { support: null, resistance: null, supportTouches: 0, resistanceTouches: 0 };
  }

  const ordered = [...bars]
    .filter((bar) => Number.isFinite(Number(bar.high)) && Number.isFinite(Number(bar.low)) && Number.isFinite(Number(bar.close)))
    .sort((a, b) => String(a.bar_time).localeCompare(String(b.bar_time)))
    .slice(-10);

  if (ordered.length < 4) {
    return { support: null, resistance: null, supportTouches: 0, resistanceTouches: 0 };
  }

  const ranges = ordered
    .map((bar) => Number(bar.high) - Number(bar.low))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianRange = ranges.length
    ? ranges[Math.floor(ranges.length / 2)]
    : Math.max(referencePrice * 0.01, 0.5);
  const tolerance = Math.max(referencePrice * 0.0025, medianRange * 0.12, 0.15);

  const cluster = (
    field: 'high' | 'low',
    side: 'above' | 'below',
  ): { level: number | null; touches: number } => {
    const values = ordered.map((bar, index) => ({
      index,
      value: Number(bar[field]),
      open: Number(bar.open),
      close: Number(bar.close),
      high: Number(bar.high),
      low: Number(bar.low),
    }));

    const candidates: Array<{ level: number; touches: number; rejections: number; distance: number }> = [];

    for (const seed of values) {
      if (!Number.isFinite(seed.value)) continue;
      if (side === 'above' && seed.value <= referencePrice) continue;
      if (side === 'below' && seed.value >= referencePrice) continue;

      const members = values.filter((item) => Math.abs(item.value - seed.value) <= tolerance);
      const uniqueSessions = new Set(members.map((item) => item.index));
      if (uniqueSessions.size < 2) continue;

      const level = members.reduce((sum, item) => sum + item.value, 0) / members.length;
      let rejections = 0;

      for (const item of members) {
        const sessionRange = Math.max(item.high - item.low, tolerance);
        if (field === 'high') {
          const rejectionDepth = item.high - item.close;
          if (rejectionDepth >= Math.max(sessionRange * 0.22, tolerance * 0.5)) rejections += 1;
        } else {
          const rejectionDepth = item.close - item.low;
          if (rejectionDepth >= Math.max(sessionRange * 0.22, tolerance * 0.5)) rejections += 1;
        }
      }

      if (rejections < 1) continue;

      candidates.push({
        level,
        touches: uniqueSessions.size,
        rejections,
        distance: Math.abs(level - referencePrice),
      });
    }

    candidates.sort((a, b) =>
      b.touches - a.touches ||
      b.rejections - a.rejections ||
      a.distance - b.distance
    );

    const best = candidates[0];
    return best ? { level: best.level, touches: best.touches } : { level: null, touches: 0 };
  };

  const resistance = cluster('high', 'above');
  const support = cluster('low', 'below');

  return {
    support: support.level,
    resistance: resistance.level,
    supportTouches: support.touches,
    resistanceTouches: resistance.touches,
  };
}

export const ThesisView: React.FC<{
  signalId: number;
  initialTab?: string;
  focusNewsId?: number | null;
  onBack: () => void;
}> = ({ signalId, initialTab = 'score', focusNewsId = null, onBack }) => {
  useAuth();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [candidates, setCandidates] = useState<ContractCandidate[]>([]);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [optionSummary, setOptionSummary] = useState<Awaited<ReturnType<typeof fetchOptionMarketSummary>>>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptStatement[]>([]);
  const [sentiment, setSentiment] = useState<SentimentReading[]>([]);
  const [bars, setBars] = useState<Bar[]>([]);
  const [chartHorizon, setChartHorizon] = useState<ChartHorizon>('1M');
  const [chartBarsByHorizon, setChartBarsByHorizon] = useState<Partial<Record<ChartHorizon, Bar[]>>>({});
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [econ, setEcon] = useState<EconomicEvent[]>([]);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [showAllNews, setShowAllNews] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [signalId, initialTab, focusNewsId]);

  useEffect(() => {
    if (activeTab !== 'news' || !focusNewsId || !news.length) return;
    const id = window.setTimeout(() => {
      document.getElementById(`news-item-${focusNewsId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [activeTab, focusNewsId, news]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setShowAllNews(false);
    setChartHorizon('1M');
    setChartBarsByHorizon({});
    setChartError(null);

    (async () => {
      try {
        const sig = await fetchSignal(signalId);
        if (!active) return;
        setSignal(sig);
        if (!sig) return;

        // Only block first paint on the data needed to render the thesis shell.
        // Expensive enrichment and fresh chart history load after the page is visible.
        const [q, tks, cands, rk, bs] = await Promise.all([
          fetchQuote(sig.symbol),
          fetchTickers(),
          fetchCandidates(sig.id),
          fetchRisk(sig.id),
          fetchBars(sig.symbol, 80),
        ]);
        if (!active) return;

        setQuote(q);
        setTicker(tks.find((t) => t.symbol === sig.symbol) ?? null);
        setCandidates(cands);
        setRisk(rk);
        setBars(bs);
        setChartBarsByHorizon({ '1M': bs.slice(-23) });
        void fetchOptionMarketSummary(sig.symbol, q?.price ?? null)
          .then((summary) => {
            if (active) setOptionSummary(summary);
          })
          .catch((optionError) => {
            console.warn('URSORA option summary did not finish loading:', optionError);
          });
        setLoading(false);
        track('thesis_viewed', { symbol: sig.symbol, opportunity: sig.opportunity_score });

        // Secondary evidence should never hold the entire trade-analysis page hostage.
        void Promise.all([
          fetchSnapshot(),
          fetchNews(sig.symbol, 12, 72),
          fetchFilings(sig.symbol),
          fetchTranscripts(sig.symbol),
          fetchSentiment(sig.symbol),
          fetchEconomicEvents(),
          fetchEarnings(),
        ]).then(([snap, nw, fl, tr, se, ec, ea]) => {
          if (!active) return;
          setSnapshot(snap);
          setNews(nw);
          setFilings(fl);
          setTranscripts(tr);
          setSentiment(se);
          setEcon(ec.filter((e) => e.affected_symbols.includes(sig.symbol)));
          setEarnings(ea.filter((e) => e.symbol === sig.symbol));
        }).catch((secondaryError) => {
          console.warn('URSORA secondary thesis evidence did not finish loading:', secondaryError);
        });

        setChartLoading(true);
        void fetchChartBars(sig.symbol, '1M')
          .then((initialChart) => {
            if (!active) return;
            setChartBarsByHorizon((current) => ({ ...current, '1M': initialChart.bars }));
          })
          .catch((chartLoadError) => {
            if (!active) return;
            setChartError(chartLoadError instanceof Error ? chartLoadError.message : String(chartLoadError));
          })
          .finally(() => {
            if (active) setChartLoading(false);
          });
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [signalId]);

  const factors = useMemo(() => signal?.score_breakdown?.factors ?? [], [signal]);
  const thesisState = signal?.score_breakdown?.thesis_state ?? null;
  const legacyEvidenceCompleteness = signal?.score_breakdown?.evidence_completeness ?? null;
  const legacyDirectionalCompleteness = signal?.score_breakdown?.directional_completeness ?? null;
  const legacyDirectionalUncertainty = signal?.score_breakdown?.directional_uncertainty ?? null;
  const legacyAvailableFamilies = signal?.score_breakdown?.available_families ?? null;
  const legacyTotalFamilies = signal?.score_breakdown?.total_families ?? null;
  const agreementScore = signal?.score_breakdown?.agreement_score ?? null;
  const agreementFamilyCount = signal?.score_breakdown?.agreement_family_count ?? null;
  const supportShare = signal?.score_breakdown?.support_share ?? null;
  const thesisHierarchy = signal?.score_breakdown?.thesis_hierarchy ?? null;
  const interactionFlags = signal?.score_breakdown?.interaction_flags ?? [];
  const thesisBlockers = signal?.score_breakdown?.thesis_blockers ?? signal?.score_breakdown?.blockers ?? [];
  const tradeBlockers = signal?.score_breakdown?.trade_blockers ?? [];
  const rawAnalysis = signal?.score_breakdown?.raw ?? {};
  const evidenceContract = signal?.score_breakdown?.evidence_contract ?? null;
  const contractCoverage = evidenceContract?.coverage ?? null;
  const evidenceCompleteness = contractCoverage?.weighted_completeness_pct ?? legacyEvidenceCompleteness;
  const directionalCompleteness = contractCoverage?.directional_weighted_completeness_pct ?? legacyDirectionalCompleteness;
  const directionalUncertainty = contractCoverage?.uncertainty_pct ?? legacyDirectionalUncertainty;
  const reliabilityAdjustedCoverage = contractCoverage?.reliability_adjusted_coverage_pct ?? null;
  const availableFamilies = contractCoverage?.available_families ?? legacyAvailableFamilies;
  const totalFamilies = contractCoverage?.total_families ?? legacyTotalFamilies;
  const scoreMeta = (signal?.score_breakdown ?? {}) as Record<string, unknown>;
  const rawNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const tacticalSupport = rawNumber(rawAnalysis.tactical_support);
  const tacticalResistance = rawNumber(rawAnalysis.tactical_resistance);
  const contextSupport = rawNumber(rawAnalysis.context_support);
  const contextResistance = rawNumber(rawAnalysis.context_resistance);
  const tacticalLookback = rawNumber(rawAnalysis.tactical_lookback_sessions);
  const tacticalTargetBasis = typeof rawAnalysis.tactical_target_basis === 'string' ? rawAnalysis.tactical_target_basis : null;
  const tacticalInvalidationBasis = typeof rawAnalysis.tactical_invalidation_basis === 'string' ? rawAnalysis.tactical_invalidation_basis : null;
  const localMoveUnit = rawNumber(rawAnalysis.local_move_unit);
  const recentMedianRange5 = rawNumber(rawAnalysis.recent_median_range_5);
  const recentMedianCloseMove5 = rawNumber(rawAnalysis.recent_median_abs_close_move_5);
  const chartBars = chartBarsByHorizon[chartHorizon] ?? bars.slice(-23);
  const analysisPrice = rawNumber(signal?.stock_price_at_generation);
  const dailyReaction = deriveDailyReactionLevels(bars, quote?.price ?? analysisPrice);
  const isV59 = signal?.engine_version === 'tradecycle-5.9.0';
  const swingSetup = typeof rawAnalysis.swing_setup === 'string' ? rawAnalysis.swing_setup : 'unclassified';
  const swingPriceBand = typeof rawAnalysis.swing_price_band === 'string' ? rawAnalysis.swing_price_band : 'Insufficient';
  const swingMomentumBand = typeof rawAnalysis.swing_momentum_band === 'string' ? rawAnalysis.swing_momentum_band : 'Insufficient';
  const swingMomentumConfirmed = rawAnalysis.swing_momentum_confirmed === true;
  const swingFrameValid = rawAnalysis.swing_tactical_frame_valid === true;
  const swingRewardRisk = rawNumber(rawAnalysis.swing_reward_risk_ratio);
  const contractSelectionState = typeof scoreMeta.contract_selection_state === 'string'
    ? scoreMeta.contract_selection_state
    : 'not_applicable';
  const v59Decision = scoreMeta.v59_decision && typeof scoreMeta.v59_decision === 'object'
    ? scoreMeta.v59_decision as Record<string, unknown>
    : null;
  const contextConfirmationCount = rawNumber(v59Decision?.context_confirmation_count);
  const researchOnlyContracts = contractSelectionState === 'pending_live_execution_data';
  const riskFailureConditions = (risk?.why_it_could_fail ?? []).map((message) =>
    thesisState === 'Supported' && /suggestion-eligible/i.test(message)
      ? 'Before entry, contract-specific execution quality and executable pricing must still be confirmed.'
      : message
  );
  const liquidityRiskText = researchOnlyContracts && candidates.length
    ? 'Indicative research contracts are available, but executable bid/ask pricing is unavailable, so contract-specific liquidity cannot yet be confirmed.'
    : risk?.liquidity_risk;
  const momentumContract = evidenceContract?.families?.momentum ?? null;
  const priceContract = evidenceContract?.families?.price_trend ?? null;
  const contractPointNumber = (key: string): number | null => {
    const point = evidenceContract?.points?.[key];
    if (!point || point.value === null || point.value === undefined || point.value === '') return null;
    const parsed = Number(point.value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const optionCallVolume = evidenceContract ? contractPointNumber('options_call_volume') : optionSummary?.call_volume ?? null;
  const optionPutVolume = evidenceContract ? contractPointNumber('options_put_volume') : optionSummary?.put_volume ?? null;
  const optionPutCallRatio = evidenceContract ? contractPointNumber('options_put_call_ratio') : optionSummary?.put_call_ratio ?? null;
  const optionTotalOi = evidenceContract ? contractPointNumber('options_total_open_interest') : optionSummary?.total_oi ?? null;
  const optionIv = evidenceContract ? contractPointNumber('options_iv_median') : optionSummary?.iv ?? null;
  const optionEvidencePoint = evidenceContract?.points?.options_put_call_ratio ?? null;
  const contractNewsCount = evidenceContract ? contractPointNumber('news_item_count') : null;
  const signalGeneratedMs = signal?.generated_at ? new Date(signal.generated_at).getTime() : NaN;
  const runNewsCutoffMs = Number.isFinite(signalGeneratedMs) ? signalGeneratedMs - 72 * 60 * 60 * 1000 : null;
  const runBoundNews = evidenceContract && contractNewsCount === 0
    ? []
    : news
        .filter((item) => {
          if (runNewsCutoffMs === null) return true;
          const published = new Date(item.published_at).getTime();
          return Number.isFinite(published) && published >= runNewsCutoffMs && published <= signalGeneratedMs;
        })
        .slice(0, contractNewsCount !== null && contractNewsCount >= 0 ? contractNewsCount : undefined);
  const runEvidenceNewsIds = new Set(runBoundNews.map((item) => item.id));
  const newsForDisplay = focusNewsId
    ? [
        ...news.filter((item) => item.id === focusNewsId),
        ...news.filter((item) => item.id !== focusNewsId),
      ]
    : news;
  const visibleNews = showAllNews ? newsForDisplay : newsForDisplay.slice(0, 4);

  const scopedMarketRegime = snapshot?.regime
    ? snapshot.market_status === 'equity-only context'
      ? `Equity ${snapshot.regime}`
      : snapshot.regime
    : null;
  const analysisRegimeLabel = signal?.regime
    ? snapshot?.market_status === 'equity-only context'
      ? `Equity ${signal.regime}`
      : signal.regime
    : 'not available';

  const tacticalFrameValid = Boolean(v59Decision?.tactical_frame_valid);
  const runRiskScenarios = tacticalFrameValid
    ? {
        bull: risk?.bull_case ?? null,
        base: risk?.base_case ?? null,
        bear: risk?.bear_case ?? null,
      }
    : {
        bull: signal?.direction === 'neutral'
          ? 'Bullish monitoring case: price develops a clear upward structure and momentum remains constructive enough to confirm it.'
          : 'Bullish monitoring case: directional evidence strengthens enough to establish a usable 1–5 day frame.',
        base: 'No trade is established. Continue monitoring until price structure, directional confirmation and a usable tactical frame are all present.',
        bear: signal?.direction === 'neutral'
          ? 'Bearish monitoring case: price develops a clear downward structure and momentum confirms the move.'
          : 'Bearish monitoring case: directional evidence weakens or reverses before a usable trade frame is established.',
      };

  const chartLevels = [
    { value: analysisPrice, label: 'Thesis anchor', color: '#60a5fa', dash: '3 3' },
    { value: signal?.target_price, label: '1–5 day target', color: '#34d399', dash: '6 3' },
    { value: signal?.invalidation_level, label: '1–5 day invalidation', color: '#fbbf24', dash: '2 2' },
    { value: dailyReaction.resistance, label: `Daily reaction resistance${dailyReaction.resistanceTouches ? ` · ${dailyReaction.resistanceTouches} touches` : ''}`, color: '#22d3ee', dash: '4 2' },
    { value: dailyReaction.support, label: `Daily reaction support${dailyReaction.supportTouches ? ` · ${dailyReaction.supportTouches} touches` : ''}`, color: '#c084fc', dash: '4 2' },
    { value: tacticalResistance, label: 'Reachable resistance', color: '#34d399' },
    { value: tacticalSupport, label: 'Reachable support', color: '#f87171' },
    { value: contextResistance, label: 'Recent swing resistance', color: '#10b981', dash: '2 5' },
    { value: contextSupport, label: 'Recent swing support', color: '#fb7185', dash: '2 5' },
  ];

  const selectChartHorizon = async (horizon: ChartHorizon) => {
    setChartHorizon(horizon);
    setChartError(null);

    if (chartBarsByHorizon[horizon]?.length || !signal?.symbol) return;

    setChartLoading(true);
    try {
      const result = await fetchChartBars(signal.symbol, horizon);
      setChartBarsByHorizon((current) => ({ ...current, [horizon]: result.bars }));
    } catch (chartLoadError) {
      setChartError(chartLoadError instanceof Error ? chartLoadError.message : String(chartLoadError));
    } finally {
      setChartLoading(false);
    }
  };

  const balanced = useMemo(() => candidates.find((c) => c.profile === 'Balanced') ?? candidates[0] ?? null, [candidates]);
  const retail = sentiment.find((s) => s.cohort === 'retail');
  const professional = sentiment.find((s) => s.cohort === 'professional');

  if (loading) return <Spinner label="Preparing the trade analysis" />;
  if (!signal) {
    return <EmptyState title="Signal not found" body="This signal record is not in the store." action={<Button onClick={onBack}>Back to opportunities</Button>} />;
  }

  const isNoTrade = signal.strategy === 'No Trade';
  const analysisHasInferred = factors.some((factor) => factor.provenance === 'imputed');
  const optionsObserved = evidenceContract
    ? optionEvidencePoint?.status === 'observed' || optionEvidencePoint?.status === 'no_meaningful_evidence'
    : Boolean(optionSummary?.contract_count);
  const quoteIsDelayed = Boolean(
    quote?.source_name?.includes('Frozen Session Close') ||
    quote?.source_name?.includes('Daily Aggregates'),
  );
  const quoteSessionDate = quote?.as_of
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
      }).format(new Date(quote.as_of))
    : null;
  const quoteContextLine = quote?.price != null
    ? quoteIsDelayed
      ? `session close ${money(quote.price)}${quoteSessionDate ? ` · ${quoteSessionDate}` : ''}`
      : `latest quote ${money(quote.price)} · ${clockET(quote.as_of)}`
    : null;

  return (
    <div className="space-y-4">
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
              {quoteContextLine && (
                <div className="mt-0.5 font-mono text-[9px] text-zinc-600">
                  {quoteContextLine}
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
            { v: 'contracts', l: researchOnlyContracts ? 'Indicative option research' : 'Option contract candidates', Icon: ClipboardList },
          ].map(({ v, l, Icon }) => (
            <TabsTrigger key={v} value={v} className="gap-1.5 font-mono text-[10px] uppercase tracking-wider data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300">
              <Icon className="h-3 w-3" aria-hidden="true" />
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="score" className="mt-3 space-y-3">
          <Panel
            title="Opportunity score rationale"
            subtitle={isV59
              ? 'TradeCycle 5.9 evaluates a 1–5 day swing setup using short-horizon price direction, aligned momentum and a usable tactical frame. Secondary evidence changes conviction and execution quality; it does not manufacture direction.'
              : 'An interpretation of the evidence included in this run, its relative importance, and whether it affects thesis direction or trade quality. The score summarizes available evidence; it is not a probability of profit.'}
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
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Weighted evidence completeness</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-200">
                    {evidenceCompleteness === null ? 'Not recorded' : `${evidenceCompleteness}%`}
                  </div>
                  {availableFamilies !== null && totalFamilies !== null && (
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Family availability: {availableFamilies} of {totalFamilies} have usable source data
                    </div>
                  )}
                  {directionalCompleteness !== null && (
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Directional evidence: {directionalCompleteness}% complete
                    </div>
                  )}
                  {reliabilityAdjustedCoverage !== null && (
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      Reliability-adjusted coverage: {reliabilityAdjustedCoverage}%{directionalUncertainty !== null ? ` · ${directionalUncertainty}% uncertainty` : ''}
                    </div>
                  )}
                </div>
                {isV59 ? (
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Core swing evidence</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-200">
                      Price {priceContract?.strength_band ?? swingPriceBand} · Momentum {momentumContract?.strength_band ?? swingMomentumBand}
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-600">
                      {momentumContract
                        ? momentumContract.thesis_vote === 'ABSTAIN'
                          ? momentumContract.vote_reason
                          : `Momentum ${momentumContract.thesis_vote === 'SUPPORT' ? 'confirms' : 'opposes'} the ${signal.direction} price direction.`
                        : `Momentum ${swingMomentumConfirmed ? 'confirms' : 'does not yet confirm'} the ${signal.direction} price direction`}
                    </div>
                  </div>
                ) : (
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
                )}
                <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Classification rule</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                    {isV59
                      ? 'A 1–5 day swing requires usable short-horizon direction, Moderate-or-Strong momentum in the same direction, a valid tactical target/invalidation frame, and no Strong short-horizon contradiction. Participation, broader market, options and news are supporting context rather than mandatory votes.'
                      : 'Price/structure establishes the directional thesis. Momentum and participation confirm or contradict it; market, sector, and catalysts provide context. Only Moderate and Strong evidence can vote. Weak and Insufficient evidence abstain.'}
                  </div>
                </div>
              </div>

              {isV59 ? (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Swing setup</div>
                    <div className="mt-1 text-[12px] font-semibold text-zinc-200">{swingSetup.replaceAll('_', ' ')}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Holding frame · 1–5 days</div>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Price direction</div>
                    <div className="mt-1 text-[12px] font-semibold text-zinc-200">{swingPriceBand} · {signal.direction}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Establishes the short-horizon lean</div>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Momentum confirmation</div>
                    <div className={cn('mt-1 text-[12px] font-semibold', swingMomentumConfirmed ? 'text-emerald-300' : 'text-amber-300')}>
                      {swingMomentumBand} · {swingMomentumConfirmed ? 'confirmed' : 'not confirmed'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Moderate/Strong alignment is required</div>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Tactical frame</div>
                    <div className={cn('mt-1 text-[12px] font-semibold', swingFrameValid ? 'text-emerald-300' : 'text-amber-300')}>
                      {swingFrameValid ? 'usable' : 'not usable'}{swingRewardRisk !== null ? ` · ${swingRewardRisk.toFixed(2)} R:R` : ''}
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Target and invalidation must fit the 1–5 day lane</div>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3 md:col-span-1 xl:col-span-2">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Secondary confirmation</div>
                    <div className="mt-1 text-[12px] font-semibold text-zinc-200">
                      {contextConfirmationCount === null ? 'Not quantified' : `${contextConfirmationCount} Moderate/Strong context confirmations`}
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Participation, broader market and verified catalysts can raise conviction but do not create the thesis.</div>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-black/20 p-3 md:col-span-1 xl:col-span-2">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600">Contract selection</div>
                    <div className="mt-1 text-[12px] font-semibold text-zinc-200">{contractSelectionState.replaceAll('_', ' ')}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">Execution readiness is separate from whether the underlying swing setup is supported.</div>
                  </div>
                </div>
              ) : thesisHierarchy ? (
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
              ) : null}

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
                const contractFamily = evidenceContract?.families?.[f.factor] ?? null;
                const absoluteContractScore = contractFamily?.absolute_score;
                const raw = absoluteContractScore !== null && absoluteContractScore !== undefined
                  ? Math.abs(Number(absoluteContractScore))
                  : Number(f.raw_score);
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
                      : contractFamily && (strength === 'Moderate' || strength === 'Strong')
                        ? `${strength} standalone evidence · no thesis vote`
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
                  {isV59
                    ? 'The opportunity score summarizes the available evidence. TradeCycle 5.9 does not use that number alone as the swing gate: price direction, aligned momentum and a usable 1–5 day frame determine setup support, while secondary evidence changes conviction.'
                    : 'The opportunity score summarizes the strength of the evidence that is currently available. Thesis status and evidence completeness determine whether that score is sufficient to support a trade analysis.'}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Factor weighting rationale" subtitle={"Market environment used for this analysis: " + analysisRegimeLabel}>
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

        <TabsContent value="market" className="mt-3 space-y-3">
          <Panel
            title="Market conditions"
            subtitle="Broader market conditions that may affect this analysis."
            right={snapshot?.is_demo ? <DemoBadge /> : <DataBadge kind="derived" label="DERIVED MARKET CONTEXT" />}
          >
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Market environment" value={scopedMarketRegime} mono={false} />
              <Metric label="SPY" value={num(snapshot?.spy_price)} hint={pct(snapshot?.spy_change_pct) ?? undefined} valueClass={changeColor(snapshot?.spy_change_pct)} />
              <Metric label="QQQ" value={num(snapshot?.qqq_price)} hint={pct(snapshot?.qqq_change_pct) ?? undefined} valueClass={changeColor(snapshot?.qqq_change_pct)} />
              <Metric label="IWM" value={num(snapshot?.iwm_price)} hint={pct(snapshot?.iwm_change_pct) ?? undefined} valueClass={changeColor(snapshot?.iwm_change_pct)} />
              <Metric label="VIX" value={num(snapshot?.vix)} hint={pct(snapshot?.vix_change_pct) ?? undefined} />
              <Metric label="US 10Y" value={num(snapshot?.us10y)} />
              <Metric label="US 2Y" value={num(snapshot?.us02y)} />
              <Metric label="Broad USD index" value={num(snapshot?.dxy)} />
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

        <TabsContent value="price" className="mt-3 space-y-3">
          <Panel
            title="Price movement with tactical swing levels"
            subtitle={tacticalLookback
              ? `The tactical frame stays fixed while you change the history view. TradeCycle uses ${tacticalLookback} recent daily sessions plus a 5-session realized-move profile; the chart horizon changes only the candles shown.`
              : 'The tactical frame stays fixed while you change the history view; the chart horizon changes only the candles shown.'}
            right={quote?.is_demo
              ? <DemoBadge />
              : <DataBadge kind={quoteIsDelayed ? 'delayed' : 'observed'} label={quoteIsDelayed ? 'MASSIVE MARKET DATA · SESSION CLOSE' : 'MASSIVE MARKET DATA'} />}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(['1D', '1W', '1M', '3M', '6M', '1Y'] as ChartHorizon[]).map((horizon) => (
                  <button
                    key={horizon}
                    type="button"
                    onClick={() => { void selectChartHorizon(horizon); }}
                    className={cn(
                      'rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors',
                      chartHorizon === horizon
                        ? 'border-sky-500/60 bg-sky-500/[0.10] text-sky-300'
                        : 'border-zinc-800 bg-black/20 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
                    )}
                  >
                    {horizon}
                  </button>
                ))}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                view only · TradeCycle remains 1–5 days
              </div>
            </div>

            {chartError && (
              <div className="mb-3 rounded-sm border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[10px] text-amber-200">
                {chartError}
              </div>
            )}

            {chartLoading && !chartBarsByHorizon[chartHorizon]?.length ? (
              <div className="flex h-56 items-center justify-center rounded-sm border border-dashed border-zinc-800 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                loading {chartHorizon} market bars
              </div>
            ) : (
              <PriceChart
                bars={chartBars}
                horizon={chartHorizon}
                levels={chartLevels}
              />
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Target basis</div>
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  {tacticalTargetBasis ?? 'Recent swing structure with ATR reachability fallback.'}
                </div>
              </div>
              <div className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Invalidation basis</div>
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  {tacticalInvalidationBasis ?? 'Recent swing structure with ATR noise buffer.'}
                </div>
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Metric label="Local move unit" value={num(localMoveUnit)} />
              <Metric label="Median 5-session range" value={num(recentMedianRange5)} />
              <Metric label="Median 5-session close move" value={num(recentMedianCloseMove5)} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Metric label="Reachable support" value={num(tacticalSupport)} valueClass="text-red-300" />
              <Metric label="Reachable resistance" value={num(tacticalResistance)} valueClass="text-emerald-300" />
              <Metric label="Current daily reaction support" value={num(dailyReaction.support)} hint={dailyReaction.supportTouches ? `${dailyReaction.supportTouches} touches / recent rejections` : undefined} valueClass="text-violet-300" />
              <Metric label="Current daily reaction resistance" value={num(dailyReaction.resistance)} hint={dailyReaction.resistanceTouches ? `${dailyReaction.resistanceTouches} touches / recent rejections` : undefined} valueClass="text-cyan-300" />
              <Metric label="Recent swing support" value={num(contextSupport)} valueClass="text-zinc-400" />
              <Metric label="Recent swing resistance" value={num(contextResistance)} valueClass="text-zinc-400" />
            </div>
          </Panel>
          <Panel
            title={quoteIsDelayed ? "Session-close market snapshot" : "Current trading-session movement"}
            right={quote?.is_demo
              ? <DemoBadge />
              : <DataBadge kind={quoteIsDelayed ? 'delayed' : 'observed'} label={quoteIsDelayed ? 'MASSIVE MARKET DATA · SESSION CLOSE' : 'MASSIVE MARKET DATA'} />}
          >
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Trend" value={quote?.trend} mono={false} />
              <Metric label={quoteIsDelayed ? "Close" : "Last"} value={num(quote?.price)} />
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
              <Metric label="Broader support" value={num(quote?.support)} valueClass="text-red-300" />
              <Metric label="Broader resistance" value={num(quote?.resistance)} valueClass="text-emerald-300" />
              <Metric label="Gap" value={pct(quote?.gap_pct)} />
              <Metric label="ATR" value={num(quote?.atr)} />
              <Metric label="Momentum" value={quote?.momentum_score} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Broader breakout context</div>
                <p className="mt-1 text-[12px] text-zinc-400">
                  The broader stored resistance is <Val value={num(quote?.resistance)} className="text-emerald-300" />. It informs context, but the 1–5 day target above is derived from nearer swing structure and ATR reachability.
                </p>
              </div>
              <div className="rounded-sm border border-red-500/30 bg-red-500/5 p-2.5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-red-300">Broader breakdown context</div>
                <p className="mt-1 text-[12px] text-zinc-400">
                  The broader stored support is <Val value={num(quote?.support)} className="text-red-300" />. It does not automatically become the 1–5 day invalidation level when that level is too distant for the trade horizon.
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

        <TabsContent value="options" className="mt-3 space-y-3">
          <Panel
            title="Options data"
            right={optionsObserved
              ? <DataBadge kind="delayed" label="MASSIVE OPTIONS · 15M DELAYED" />
              : undefined}
          >
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Call volume" value={compact(optionCallVolume)} />
              <Metric label="Put volume" value={compact(optionPutVolume)} />
              <Metric label="Put/call ratio" value={num(optionPutCallRatio)} />
              <Metric label="Total open interest" value={compact(optionTotalOi)} />
              <Metric label="Unusual volume screen" value={optionSummary ? (optionSummary.unusual_options_volume ? 'TRIGGERED' : 'not triggered') : null} mono={false} valueClass={optionSummary?.unusual_options_volume ? 'text-amber-300' : undefined} />
              <Metric label="Implied volatility" value={ivPct(optionIv)} />
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
                  <Val value={optionCallVolume && optionTotalOi ? `${((Number(optionCallVolume) + Number(optionPutVolume ?? 0)) / Number(optionTotalOi)).toFixed(2)}x` : null} />{' '}
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
                publishedAt={optionSummary?.retrieved_at ?? quote.as_of}
                retrievedAt={optionSummary?.retrieved_at ?? quote.retrieved_at}
                confidence={optionsObserved ? 0.86 : null}
              />
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="news" className="mt-3 space-y-3">
          <Panel
            title="News & market events"
            subtitle="Current verified symbol-level news from the last 72 hours. Articles marked RUN EVIDENCE were available to this analysis; newer or separately refreshed items are current context only and do not retroactively change the stored run."
            right={news.length
              ? (news.some((item) => item.is_demo) ? <DemoBadge /> : <DataBadge kind="observed" label="VERIFIED NEWS · CURRENT CONTEXT" />)
              : undefined}
          >
            <ul className="grid gap-2 xl:grid-cols-2">
              {visibleNews.map((n) => {
                const wasRunEvidence = runEvidenceNewsIds.has(n.id);
                const focused = focusNewsId === n.id;
                return (
                  <li
                    id={`news-item-${n.id}`}
                    key={n.id}
                    className={cn(
                      'min-w-0 rounded-sm border bg-black/20 p-2.5 transition-colors',
                      focused ? 'border-sky-500/60 bg-sky-500/[0.05]' : 'border-zinc-800',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide text-zinc-400">
                        {n.category ?? 'uncategorised'}
                      </span>
                      <span className={cn(
                        'rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide',
                        wasRunEvidence
                          ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                          : 'border-sky-500/30 bg-sky-500/[0.06] text-sky-300',
                      )}>
                        {wasRunEvidence ? 'run evidence' : 'current context · not in run'}
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
                        Read full source
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
                );
              })}
              {!news.length && <EmptyState title="No recent news available" body="URSORA does not currently have dated news for this symbol and does not substitute an assumed event." />}
            </ul>
            {newsForDisplay.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllNews((value) => !value)}
                className="mt-3 font-mono text-[10px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
              >
                {showAllNews ? 'Show fewer articles' : `View ${newsForDisplay.length - 4} more articles`}
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

        <TabsContent value="risk" className="mt-3 space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              { t: 'Bull case', v: runRiskScenarios.bull, cls: 'border-emerald-500/30 bg-emerald-500/[0.05]', tcls: 'text-emerald-300' },
              { t: 'Base case', v: runRiskScenarios.base, cls: 'border-sky-500/30 bg-sky-500/[0.05]', tcls: 'text-sky-300' },
              { t: 'Bear case', v: runRiskScenarios.bear, cls: 'border-red-500/30 bg-red-500/[0.05]', tcls: 'text-red-300' },
            ].map((c) => (
              <div key={c.t} className={cn('rounded-md border p-3', c.cls)}>
                <h4 className={cn('font-mono text-[10px] font-semibold uppercase tracking-[0.14em]', c.tcls)}>{c.t}</h4>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{c.v ?? <Unavailable />}</p>
              </div>
            ))}
          </div>

          <Panel
            title="Risk measures"
            right={risk?.is_demo ? <DemoBadge /> : <DataBadge kind="derived" label="DERIVED RISK CONTEXT" />}
          >
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
                { t: 'Liquidity risk', v: liquidityRiskText },
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
              {riskFailureConditions.map((w, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-zinc-300">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-red-500/40 bg-red-500/10 font-mono text-[9px] text-red-300">
                    {i + 1}
                  </span>
                  {w}
                </li>
              ))}
              {!riskFailureConditions.length && <Unavailable />}
            </ol>
            <Disclaimer className="mt-3 border-t border-zinc-800 pt-3" />
          </Panel>
        </TabsContent>

        <TabsContent value="contracts" className="mt-3 space-y-3">
          <Panel
            title={researchOnlyContracts ? "Indicative option research" : "Option contract candidates"}
            subtitle={researchOnlyContracts
              ? "Research-ranked contracts derived from delayed options data. These are not executable candidates because live bid/ask pricing is unavailable."
              : "Ranked on liquidity, spread, open interest, Greeks, expiry fit, premium, break-even and reach to structure. Illiquid contracts are filtered out before ranking."}
            right={candidates.length
              ? <DataBadge kind={researchOnlyContracts ? "delayed" : "derived"} label={researchOnlyContracts ? "INDICATIVE · NOT EXECUTABLE" : "DERIVED FROM OPTIONS DATA"} />
              : undefined}
          >
            {candidates.length === 0 ? (
              <EmptyState
                title="No contract named"
                body={isV59 && thesisState === 'Supported'
                  ? 'The underlying swing setup is supported, but URSORA does not currently have executable contract pricing that clears the contract-selection layer.'
                  : 'This signal did not clear the swing setup gate, so no contract is suggested.'}
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
                      <Metric label="Bid / Ask" value={c.bid != null && c.ask != null ? `${num(c.bid)} / ${num(c.ask)}` : null} />
                      <Metric label="Mid" value={num(c.mid)} />
                      <Metric label="Spread" value={c.spread_pct != null ? `${num(c.spread_pct)}%` : null} valueClass={Number(c.spread_pct) > 6 ? 'text-amber-300' : undefined} />
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
              prices. Contract values shown here come from the stored options snapshot used by URSORA; if required pricing fields are unavailable, no executable contract is named.
            </p>
          </Panel>
        </TabsContent>
      </Tabs>

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
