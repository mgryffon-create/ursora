import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, BookOpen, Brain, CheckCircle2, FlaskConical, Gauge,
  History, Loader2, Microscope, ShieldCheck, Sparkles, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Disclaimer, EmptyState, InfoHint, Panel, SectionHeading, Spinner } from '@/components/common/Primitives';
import { StateNotice } from '@/components/common/StateNotice';
import PatternCard, { ConfidenceTag } from '@/components/trader/PatternCard';
import { classifyError, reportError } from '@/lib/errors';
import { dateLabel, minutesLabel, multiple, signedMoney, timeLabel } from '@/lib/format';

import { fetchTraderProfile, track } from '@/lib/api';
import {
  ALERT_CATEGORIES, MODEL_VERSION, SENSITIVITY, TRADE_ORIGINS, bandTone,
  type Sensitivity,
} from '@/lib/behavioral/config';
import {
  computeTraderIntelligence, assessAdherence, tradePl, positionSize, holdingMinutes, isClosed,
} from '@/lib/behavioral/engine';
import { deriveProfileContext, type ProfileContextInsight } from '@/lib/behavioral/profile-context';
import {
  DEFAULT_BEHAVIORAL_PREFS, enabledCategories, fetchBehavioralPrefs, fetchLiterature,
  fetchBrokerageTradeRecords, fetchModifications, fetchTradeCycleThesisEvents, fetchTradePlans, saveBehavioralPrefs, setTradeOrigin,
  type BehavioralPrefs,
} from '@/lib/behavioral/api';
import { generateProfile, PROFILES, type ProfileKey } from '@/lib/behavioral/synthetic';
import { runBehavioralTests, summariseTests, type TestResult } from '@/lib/behavioral/tests';
import type { LitConstruct, LitLink, LitStudy, TradeCycleThesisEvent, TradeModification, TradePlan, TradeRecord } from '@/lib/behavioral/types';
import type { TraderProfile } from '@/lib/types';

type Tab = 'today' | 'baseline' | 'patterns' | 'process' | 'performance' | 'research';

const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
  { key: 'patterns', label: 'Patterns', Icon: Sparkles },
  { key: 'baseline', label: 'Baseline', Icon: Gauge },
  { key: 'process', label: 'Process', Icon: ShieldCheck },
  { key: 'performance', label: 'Performance', Icon: BarChart3 },
  { key: 'research', label: 'Research', Icon: BookOpen },
];

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: string; help?: string }> = ({ label, value, hint, tone, help }) => (
  <div className="min-w-0 rounded-sm border border-zinc-800/80 bg-black/20 px-2.5 py-2">
    <div className="flex min-w-0 items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
      <span className="truncate">{label}</span>
      {help && <InfoHint text={help} />}
    </div>
    <div className={cn('mt-1 truncate font-mono text-sm tabular-nums text-zinc-100', tone)}>{value}</div>
    {hint && <div className="mt-0.5 truncate text-[10px] text-zinc-600">{hint}</div>}
  </div>
);
const ProfilePatternCheckCard: React.FC<{
  insight: ProfileContextInsight;
  tone: (status: ProfileContextInsight['status']) => string;
  onOpenEvidence?: (tradeIds: number[]) => void;
}> = ({ insight, tone, onOpenEvidence }) => (
  <article className="rounded-md border border-zinc-800 bg-[#111419] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">MyURSORA pattern check</div>
        <h3 className="mt-1 text-sm font-semibold text-zinc-100">{insight.profileSignal}</h3>
      </div>
      <span className={cn(
        'rounded-sm border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider',
        insight.status === 'ALIGNED' ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
          : insight.status === 'DIVERGENT' ? 'border-red-500/30 bg-red-500/[0.06]'
            : insight.status === 'MIXED' ? 'border-amber-500/30 bg-amber-500/[0.06]'
              : 'border-zinc-700 bg-black/20',
        tone(insight.status),
      )}>
        {insight.status}
      </span>
    </div>

    <div className="mt-3 rounded-sm border border-zinc-800 bg-black/25 px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Observed context</div>
      <div className="mt-1 text-[13px] font-medium text-zinc-200">{insight.observed}</div>
    </div>

    {insight.contextItems && insight.contextItems.length > 0 && (
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {insight.contextItems.map((item) => (
          <div key={`${insight.key}-${item.label}`} className="rounded-sm border border-zinc-800/80 bg-black/20 px-2.5 py-2">
            <div className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">{item.label}</div>
            <div className="mt-0.5 text-[11px] text-zinc-300">{item.value}</div>
          </div>
        ))}
      </div>
    )}

    <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">{insight.detail}</p>
    <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
        {insight.sample > 0 ? `${insight.sample} evidence episode${insight.sample === 1 ? '' : 's'}` : 'Awaiting measurable episodes'}
      </span>
      {insight.evidenceTradeIds.length > 0 && onOpenEvidence && (
        <button
          type="button"
          onClick={() => onOpenEvidence(insight.evidenceTradeIds)}
          className="inline-flex items-center gap-1 rounded-sm border border-sky-500/30 bg-sky-500/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-sky-300 transition-colors hover:border-sky-400/60 hover:bg-sky-500/10"
        >
          <History className="h-3 w-3" aria-hidden="true" />
          View episodes
        </button>
      )}
    </div>
  </article>
);


const Table: React.FC<{ head: string[]; rows: (React.ReactNode[])[]; empty?: string; headHelp?: Record<string, string> }> = ({ head, rows, empty, headHelp = {} }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[520px] border-collapse text-left">
      <thead>
        <tr className="border-b border-zinc-800">
          {head.map((h) => (
            <th key={h} scope="col" className="py-1.5 pr-3 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              <span className="inline-flex items-center gap-1">{h}{headHelp[h] && <InfoHint text={headHelp[h]} />}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={head.length} className="py-3 font-mono text-[11px] text-zinc-600">{empty ?? 'No rows recorded.'}</td></tr>
        ) : rows.map((r, i) => (
          <tr key={i} className="border-b border-zinc-800/50 transition-colors last:border-0 hover:bg-black/30">
            {r.map((c, j) => (
              <td key={j} className="py-1.5 pr-3 font-mono text-[11px] tabular-nums text-zinc-300">{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SectionContext: React.FC<{ items: Array<string | null | undefined> }> = ({ items }) => {
  const visible = items.filter((item): item is string => Boolean(item));
  if (!visible.length) return null;
  return (
    <div className="mt-3 border-t border-zinc-800/70 pt-2.5">
      <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-600">Read on this sample</div>
      <div className="mt-1.5 grid gap-1.5">
        {visible.map((item, index) => (
          <div key={index} className="flex items-start gap-2 text-[10px] leading-relaxed text-zinc-500">
            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const TraderIntelligenceView: React.FC<{
  onOpenThesis?: (id: number) => void;
  onOpenHistoricalEvidence?: (tradeIds: number[]) => void;
}> = ({ onOpenHistoricalEvidence }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('patterns');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<ReturnType<typeof classifyError> | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [plans, setPlans] = useState<TradePlan[]>([]);
  const [mods, setMods] = useState<TradeModification[]>([]);
  const [prefs, setPrefs] = useState<BehavioralPrefs>(DEFAULT_BEHAVIORAL_PREFS);
  const [traderProfile, setTraderProfile] = useState<TraderProfile | null>(null);
  const [thesisEvents, setThesisEvents] = useState<TradeCycleThesisEvent[]>([]);
  const [lit, setLit] = useState<{ constructs: LitConstruct[]; studies: LitStudy[]; links: LitLink[] }>({ constructs: [], studies: [], links: [] });
  const [demoProfile, setDemoProfile] = useState<ProfileKey | null>(null);
  const [tests, setTests] = useState<TestResult[] | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorState(null);

    const [tradeResult, planResult, modResult, prefResult, litResult, profileResult, thesisResult] = await Promise.allSettled([
      fetchBrokerageTradeRecords(user?.id ?? null),
      fetchTradePlans(user?.id ?? null),
      fetchModifications(user?.id ?? null),
      fetchBehavioralPrefs(user?.id ?? null),
      fetchLiterature(),
      user ? fetchTraderProfile() : Promise.resolve(null),
      user ? fetchTradeCycleThesisEvents(user.id) : Promise.resolve([]),
    ]);

    if (tradeResult.status === 'fulfilled') {
      setTrades(tradeResult.value);
    } else {
      setTrades([]);
      const message = reportError('trader-intelligence-trades', tradeResult.reason, 'Brokerage and trade history could not be loaded.');
      setError(message);
      setErrorState(classifyError(tradeResult.reason));
    }

    setPlans(planResult.status === 'fulfilled' ? planResult.value : []);
    setMods(modResult.status === 'fulfilled' ? modResult.value : []);
    setPrefs(prefResult.status === 'fulfilled' ? prefResult.value : DEFAULT_BEHAVIORAL_PREFS);
    setLit(litResult.status === 'fulfilled' ? litResult.value : { constructs: [], studies: [], links: [] });
    setTraderProfile(profileResult.status === 'fulfilled' ? profileResult.value : null);
    setThesisEvents(thesisResult.status === 'fulfilled' ? thesisResult.value : []);

    for (const [name, result] of [
      ['plans', planResult],
      ['modifications', modResult],
      ['preferences', prefResult],
      ['literature', litResult],
      ['profile', profileResult],
      ['thesis-events', thesisResult],
    ] as const) {
      if (result.status === 'rejected') {
        console.warn('Trader Intelligence optional source unavailable:', name, result.reason);
      }
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const activeTrades = useMemo<TradeRecord[]>(
    () => (demoProfile ? generateProfile(demoProfile) : trades),
    [demoProfile, trades],
  );

  const intel = useMemo(
    () => computeTraderIntelligence(activeTrades, {
      sensitivity: prefs.sensitivity,
      enabledCategories: enabledCategories(prefs, ALERT_CATEGORIES),
      todayKey: demoProfile ? undefined : undefined,
    }),
    [activeTrades, prefs, demoProfile],
  );

  const { baseline, sessions, today, risk, patterns, observations } = intel;
  const profileContext = useMemo(
    () => deriveProfileContext(traderProfile, activeTrades, baseline, thesisEvents),
    [traderProfile, activeTrades, baseline, thesisEvents],
  );
  const profileRowsFor = (category: ProfileContextInsight['category']) =>
    profileContext.filter((row) => row.category === category);

  const segmentExtremes = <T extends { trades: number; expectancy: number | null }>(rows: T[]) => {
    const eligible = rows.filter((row) => row.trades > 0 && row.expectancy !== null);
    if (!eligible.length) return { best: null as T | null, worst: null as T | null };
    const sorted = [...eligible].sort((a, b) => (b.expectancy ?? -Infinity) - (a.expectancy ?? -Infinity));
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  };
  const windowRows = baseline.byWindow.filter((row) => row.trades > 0);
  const windowExtremes = segmentExtremes(windowRows);
  const originExtremes = segmentExtremes(baseline.byOrigin);
  const setupExtremes = segmentExtremes(baseline.bySetup);
  const regimeExtremes = segmentExtremes(baseline.byRegime);
  const dayExtremes = segmentExtremes(baseline.byDayOfWeek);
  const dteExtremes = segmentExtremes(baseline.byDte);
  const regimeSample = baseline.byRegime.reduce((sum, row) => sum + row.trades, 0);
  const dteSample = baseline.byDte.reduce((sum, row) => sum + row.trades, 0);
  const originSample = baseline.byOrigin.reduce((sum, row) => sum + row.trades, 0);
  const winnerLoserHoldGap =
    baseline.medianHoldingWinnersMin !== null && baseline.medianHoldingLosersMin !== null
      ? baseline.medianHoldingLosersMin - baseline.medianHoldingWinnersMin
      : null;
  const afterLossSizeLift =
    baseline.afterLoss.medianNextSize !== null && baseline.afterWin.medianNextSize !== null && baseline.afterWin.medianNextSize > 0
      ? ((baseline.afterLoss.medianNextSize / baseline.afterWin.medianNextSize) - 1) * 100
      : null;
  const contextTone = (status: ProfileContextInsight['status']) =>
    status === 'ALIGNED'
      ? 'text-emerald-400'
      : status === 'DIVERGENT'
        ? 'text-red-300'
        : status === 'MIXED'
          ? 'text-amber-300'
          : status === 'PROFILE ONLY'
            ? 'text-sky-300'
            : 'text-zinc-500';
  const constructFor = (key: string | null) => lit.constructs.find((c) => c.construct_key === key) ?? null;

  const toggleCategory = async (key: string) => {
    const next = { ...prefs.categories, [key]: prefs.categories[key] === false };
    setPrefs((p) => ({ ...p, categories: next }));
    if (!user) return;
    setSavingPrefs(true);
    setPrefsMsg(null);
    try {
      await saveBehavioralPrefs(user.id, { categories: next });
      setPrefsMsg('Alert preferences saved.');
      track('behavioral_prefs_saved', { category: key, enabled: next[key] !== false });
    } catch (e) {
      setPrefsMsg(reportError('behavioral-prefs', e, 'Preferences could not be saved.'));
    } finally {
      setSavingPrefs(false);
    }
  };

  const changeSensitivity = async (s: Sensitivity) => {
    setPrefs((p) => ({ ...p, sensitivity: s }));
    if (!user) return;
    try {
      await saveBehavioralPrefs(user.id, { sensitivity: s });
      setPrefsMsg(`Sensitivity set to ${s.toLowerCase()}.`);
    } catch (e) {
      setPrefsMsg(reportError('behavioral-prefs', e, 'Sensitivity could not be saved.'));
    }
  };

  const changeOrigin = async (tradeId: number, origin: string) => {
    if (demoProfile) return;
    setTrades((prev) => prev.map((t) => (t.id === tradeId ? { ...t, origin: origin as TradeRecord['origin'] } : t)));
    try {
      await setTradeOrigin(tradeId, origin);
      track('trade_origin_set', { origin });
    } catch (e) {
      setError(reportError('trade-origin', e, 'The trade origin could not be updated.'));
    }
  };

  if (loading) return <Spinner label="Loading Trader Intelligence" />;

  const emptyForNewUser = activeTrades.length === 0;

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Patterns"
        title="Recurring patterns in your trading decisions"
        description="URSORA reviews your recorded trading behavior to identify patterns in planning, execution, and consistency. This section evaluates your trading process rather than market conditions and does not make psychological or clinical judgments."
        right={
          <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider', bandTone(risk.band))}>
            <Brain className="h-3 w-3" aria-hidden="true" />
            process risk: {risk.band}
          </span>
        }
      />

      {error && (
        <StateNotice
          state={errorState ?? classifyError(error)}
          subject="Trader Intelligence"
          onRetry={() => void load()}
        />
      )}

      {traderProfile && (
        <Panel
          title="Your stated trading baseline"
          subtitle="Trader Intelligence compares observed behavior with these self-defined preferences; it does not use them to change market evidence."
        >
          <div className="flex flex-wrap gap-2">
            {traderProfile.trading_styles.slice(0, 3).map((value) => (
              <span key={value} className="rounded-sm border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-sky-300">
                {value.replaceAll('_', ' ')}
              </span>
            ))}
            <span className="rounded-sm border border-zinc-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
              risk · {traderProfile.risk_comfort}
            </span>
            {traderProfile.primary_goals.slice(0, 2).map((value) => (
              <span key={value} className="rounded-sm border border-zinc-700 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                {value.replaceAll('_', ' ')}
              </span>
            ))}
          </div>
          {traderProfile.self_reported_habits.length > 0 && (
            <p className="mt-2 text-[11px] text-zinc-500">
              Self-reported focus: {traderProfile.self_reported_habits.slice(0, 3).map((value) => value.replaceAll('_', ' ')).join(' · ')}
            </p>
          )}
        </Panel>
      )}

      {/* THE THREE DISTINCT SYSTEMS — never collapsed into one number */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Market intelligence</div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Summarizes current market conditions and opportunities. These measures are separate from your personal trading behavior.
          </p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Trade intelligence</div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Summarizes the evidence, risk, and changes associated with a specific trade analysis.
          </p>
        </div>
        <div className="rounded-md border border-sky-500/30 bg-sky-500/[0.05] p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-sky-400">Trader intelligence</div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            Evaluates how consistently your recorded decisions follow your stated trading process. This does not alter the market score for a trade.
          </p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); track('trader_intel_tab', { tab: key }); }}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors',
              tab === key ? 'border-sky-500 text-sky-300' : 'border-transparent text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {import.meta.env.DEV && (
        <>
        {/* DEV-ONLY SYNTHETIC PROFILE SWITCH */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2">
          <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">Synthetic profile</span>
          <span className="text-[10px] text-zinc-500">Dev harness only. Never written to your history.</span>
          <div className="ml-auto flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setDemoProfile(null)}
              className={cn('rounded-sm border px-1.5 py-[2px] font-mono text-[9px] uppercase transition-colors',
                demoProfile === null ? 'border-sky-500/50 bg-sky-500/10 text-sky-300' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300')}
            >
              my data
            </button>
            {PROFILES.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.expectation}
                onClick={() => { setDemoProfile(p.key); track('synthetic_profile_loaded', { profile: p.key }); }}
                className={cn('rounded-sm border px-1.5 py-[2px] font-mono text-[9px] uppercase transition-colors',
                  demoProfile === p.key ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300')}
              >
                {p.key === 'NEW' ? 'new user' : `profile ${p.key}`}
              </button>
            ))}
          </div>
        </div>
        {demoProfile && (
          <p className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
            synthetic data — {PROFILES.find((p) => p.key === demoProfile)?.name}. Expected: {PROFILES.find((p) => p.key === demoProfile)?.expectation}
          </p>
        )}


        </>
      )}

      {/* ---------------------------------- TODAY --------------------------------- */}
      {tab === 'today' && (
        emptyForNewUser ? (
          <EmptyState
            title="Trader Intelligence"
            body="URSORA needs trading history before it can identify your personal patterns. Build your baseline through paper trading, manual trade history, or a supported brokerage connection (read-only). Nothing is estimated in the meantime — no personalised insight is shown until there is data behind it."
          />
        ) : (
          <div className="space-y-3">
            <Panel
              title="Trader state — current session"
              subtitle={today ? `Session of ${dateLabel(today.trades[0]?.entry_at ?? today.trades[0]?.created_at) ?? today.sessionDate}` : 'No session recorded yet.'}
              right={<span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">model {MODEL_VERSION}</span>}
            >
              {today ? (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                  <Stat label="Trades today" value={today.trades.length} hint={`median session ${baseline.tradesPerSessionMedian ?? '—'}`} />
                  <Stat label="Session P/L" value={signedMoney(today.finalPl) ?? '—'}
                    tone={today.finalPl > 0 ? 'text-emerald-400' : today.finalPl < 0 ? 'text-red-400' : ''} />
                  <Stat label="Session high-water" value={signedMoney(today.highWaterPl) ?? '—'}
                    hint={today.highWaterAt ? `at ${timeLabel(today.highWaterAt)}` : 'not reached'} />
                  <Stat label="Giveback" value={today.givebackPct === null ? 'not applicable' : `${today.givebackPct}%`}
                    tone={(today.givebackPct ?? 0) > 40 ? 'text-amber-300' : ''} hint={signedMoney(-today.giveback) ?? ''} />
                  <Stat label="Avg size" value={signedMoney(today.avgSize)?.replace('+', '') ?? '—'}
                    hint={baseline.medianPositionSize ? `baseline ${signedMoney(baseline.medianPositionSize)?.replace('+', '')}` : ''} />
                  <Stat label="Size vs baseline"
                    value={today.avgSize && baseline.medianPositionSize ? multiple(today.avgSize / baseline.medianPositionSize) ?? '—' : 'not recorded'} />
                  <Stat label="Avg opportunity score" value={today.avgScore?.toFixed(0) ?? 'not recorded'}
                    hint={baseline.medianEntryScore ? `median ${baseline.medianEntryScore.toFixed(0)}` : ''} />
                  <Stat label="Planned / unplanned" value={`${today.plannedCount} / ${today.unplannedCount}`} />
                  <Stat label="Rapid re-entries" value={today.rapidReentries} hint="within 10 minutes of an exit" />
                  <Stat label="Stop adherence"
                    value={baseline.stopAdherencePct === null ? 'not recorded' : `${baseline.stopAdherencePct}%`} hint="across your history" />
                </div>
              ) : (
                <StateNotice state={{ kind: 'NO_DATA', label: 'NO DATA', tone: 'neutral', explanation: 'No trades are recorded for the current session.', remedy: 'Record a paper trade to begin the session.' }} />
              )}
            </Panel>

            <Panel
              title={`Behavioral risk — ${risk.band}`}
              subtitle={risk.note}
              right={<span className="font-mono text-[10px] text-zinc-600">{risk.points} points</span>}
            >
              {risk.factors.length === 0 ? (
                <p className="font-mono text-[11px] uppercase tracking-wider text-emerald-400/80">
                  no reliable deviation detected
                </p>
              ) : (
                <ul className="space-y-2">
                  {risk.factors.slice(0, 4).map((f) => (
                    <li key={f.key} className="rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide',
                          f.observation.severity === 'HIGH' ? 'border-red-500/40 bg-red-500/10 text-red-300'
                            : f.observation.severity === 'ELEVATED' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                              : 'border-sky-500/40 bg-sky-500/10 text-sky-300')}>
                          {f.observation.severity}
                        </span>
                        <ConfidenceTag label={f.observation.confidence_label} sample={f.observation.sample_size} />
                        <button
                          type="button"
                          onClick={() => setInspecting(inspecting === f.key ? null : f.key)}
                          className="ml-auto font-mono text-[9px] uppercase tracking-wider text-sky-400 transition-colors hover:text-sky-300"
                        >
                          why?
                        </button>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-300" style={{ textWrap: 'pretty' }}>{f.label}</p>
                      {inspecting === f.key && (
                        <dl className="mt-2 grid gap-1 border-t border-zinc-800 pt-2 text-[10px] text-zinc-500 sm:grid-cols-2">
                          <div><dt className="inline font-mono uppercase text-zinc-600">observation — </dt><dd className="inline">{f.observation.observation_type.replace(/_/g, ' ')}</dd></div>
                          <div><dt className="inline font-mono uppercase text-zinc-600">baseline — </dt><dd className="inline">{f.observation.baseline_value ?? 'not recorded'} {f.observation.unit}</dd></div>
                          <div><dt className="inline font-mono uppercase text-zinc-600">deviation — </dt><dd className="inline">{f.observation.deviation_pct === null ? 'not applicable' : `${f.observation.deviation_pct}%`}</dd></div>
                          <div><dt className="inline font-mono uppercase text-zinc-600">confidence — </dt><dd className="inline">{f.observation.confidence_label} (n={f.observation.sample_size})</dd></div>
                          <div className="sm:col-span-2"><dt className="inline font-mono uppercase text-zinc-600">literature context — </dt><dd className="inline">{constructFor(f.observation.construct_key)?.name ?? 'user-specific observed pattern only'}</dd></div>
                          <div className="sm:col-span-2"><dt className="inline font-mono uppercase text-zinc-600">calculation — </dt><dd className="inline">{f.observation.formula}</dd></div>
                        </dl>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {observations.length > 0 && (
              <Panel title="Session observations" subtitle="The most meaningful deviations only. URSORA does not produce warning walls.">
                <div className="grid gap-2 lg:grid-cols-2">
                  {observations.map((o, i) => (
                    <PatternCard key={`${o.observation_type}-${i}`} observation={o} construct={constructFor(o.construct_key)} studies={lit.studies} links={lit.links} />
                  ))}
                </div>
              </Panel>
            )}

            <Panel title="Behavioral alerts" subtitle="Enable or disable each category. Sensitivity scales every threshold; it never changes the arithmetic.">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Sensitivity</span>
                {SENSITIVITY.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void changeSensitivity(s)}
                    className={cn('rounded-sm border px-2 py-[2px] font-mono text-[9px] uppercase transition-colors',
                      prefs.sensitivity === s ? 'border-sky-500/50 bg-sky-500/10 text-sky-300' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300')}
                  >
                    {s}
                  </button>
                ))}
                {savingPrefs && <Loader2 className="h-3 w-3 animate-spin text-zinc-500" aria-hidden="true" />}
              </div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {ALERT_CATEGORIES.map((c) => {
                  const on = prefs.categories[c.key] !== false;
                  return (
                    <label key={c.key} className="flex cursor-pointer items-start gap-2 rounded-sm border border-zinc-800 bg-black/20 p-2 transition-colors hover:border-zinc-700">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => void toggleCategory(c.key)}
                        className="mt-0.5 h-3 w-3 accent-sky-500"
                        aria-label={`Toggle ${c.label} alerts`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-zinc-300">{c.label}</span>
                        <span className="block text-[10px] leading-snug text-zinc-600">{c.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {prefsMsg && <p className="mt-2 font-mono text-[10px] text-zinc-500">{prefsMsg}</p>}
              {!user && <p className="mt-2 font-mono text-[10px] text-amber-300/80">Sign in to store alert preferences against your account.</p>}
            </Panel>
          </div>
        )
      )}

      {/* --------------------------------- BASELINE -------------------------------- */}
      {tab === 'baseline' && (
          <div className="space-y-3">
            {traderProfile && (
              <Panel
                title="MyURSORA baseline context"
                subtitle="Your stated trading identity belongs here even before brokerage history arrives. Observed alignment fills in as trade data accumulates."
              >
                <Table
                  head={['MyURSORA', 'Observed behavior', 'Alignment', 'Context']}
                  rows={profileRowsFor('baseline').map((row) => [
                    row.profileSignal,
                    row.observed,
                    <span key="status" className={cn('font-semibold', contextTone(row.status))}>{row.status}</span>,
                    <span key="detail" className="text-zinc-500">{row.detail}</span>,
                  ])}
                  empty="Add trading style or trade-type preferences in MyURSORA to create baseline context."
                />
              </Panel>
            )}
            {emptyForNewUser ? (
              <EmptyState title="Waiting for trade history" body="Your MyURSORA baseline is set. Once brokerage or recorded trade history is available, this tab will compare your actual holding periods, structures, sizing and trading cadence with that stated baseline." />
            ) : (
              <>
            <Panel title="Derived baseline" subtitle={`Computed from ${baseline.sampleSize} recorded trades across ${baseline.sessions} sessions. Every figure below is derived from your own history only.`}>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Trades / session" value={`${baseline.tradesPerSessionMedian ?? '—'} med`} hint={`${baseline.tradesPerSessionMean ?? '—'} mean`} />
                <Stat label="Median size" value={signedMoney(baseline.medianPositionSize)?.replace('+', '') ?? '—'} hint={`p90 ${signedMoney(baseline.positionSizeP90)?.replace('+', '') ?? '—'}`} />
                <Stat label="Median hold" value={minutesLabel(baseline.medianHoldingMinutes) ?? '—'} hint={`W ${minutesLabel(baseline.medianHoldingWinnersMin) ?? '—'} / L ${minutesLabel(baseline.medianHoldingLosersMin) ?? '—'}`} />
                <Stat label="Win rate" value={baseline.winRate === null ? '—' : `${baseline.winRate}%`} hint={`${baseline.closedSample} closed`} />
                <Stat label="Average return per trade" value={signedMoney(baseline.expectancy) ?? '—'} hint="per closed trade" />
                <Stat label="Payoff ratio" value={baseline.payoffRatio === null ? '—' : multiple(baseline.payoffRatio) ?? '—'} hint={`avg W ${signedMoney(baseline.avgWin) ?? '—'}`} />
                <Stat label="Largest decline" value={signedMoney(baseline.maxDrawdown) ?? '—'} tone="text-red-300" />
                <Stat label="Median entry score" value={baseline.medianEntryScore?.toFixed(0) ?? 'not recorded'} />
                <Stat label="Planned share" value={baseline.plannedSharePct === null ? '—' : `${baseline.plannedSharePct}%`} />
                <Stat label="Average best move" value={baseline.avgMfe?.toFixed(1) ?? 'not recorded'} />
                <Stat label="Average worst move" value={baseline.avgMae?.toFixed(1) ?? 'not recorded'} />
                <Stat label="Median session P/L" value={signedMoney(baseline.medianSessionPl) ?? '—'} />
              </div>
              <SectionContext items={[
                baseline.expectancy !== null && baseline.winRate !== null
                  ? `You win ${baseline.winRate}% of closed trades, while the average closed trade is ${signedMoney(baseline.expectancy) ?? 'unavailable'}.`
                  : null,
                baseline.payoffRatio !== null
                  ? `Average winner size is ${multiple(baseline.payoffRatio) ?? '—'} of average loser size. Below 1× means losses are larger than wins on average.`
                  : null,
                winnerLoserHoldGap !== null
                  ? winnerLoserHoldGap > 0
                    ? `Losing trades are held about ${minutesLabel(winnerLoserHoldGap)} longer than winning trades at the median.`
                    : winnerLoserHoldGap < 0
                      ? `Winning trades are held about ${minutesLabel(Math.abs(winnerLoserHoldGap))} longer than losing trades at the median.`
                      : 'Winning and losing trades have the same median hold in this sample.'
                  : null,
              ]} />
              <p className="mt-2 font-mono text-[10px] text-zinc-600">
                Confidence for this sample: <ConfidenceTag label={intel.baseline.sampleSize >= 60 ? 'HIGH-CONFIDENCE PERSONAL PATTERN' : intel.baseline.sampleSize >= 30 ? 'ESTABLISHED PERSONAL PATTERN' : intel.baseline.sampleSize >= 15 ? 'EMERGING PATTERN' : intel.baseline.sampleSize >= 6 ? 'EARLY SIGNAL' : 'INSUFFICIENT DATA'} sample={baseline.sampleSize} />
              </p>
            </Panel>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="By time of day" subtitle="Compares when you enter, how often those entries work, and how size changes across the session.">
                <Table
                  head={['Time period', 'Trades', 'Win %', 'Average return', 'Average size']}
                  rows={baseline.byWindow.filter((w) => w.trades > 0).map((w) => [
                    w.label, w.trades, w.winRate === null ? '—' : `${w.winRate}%`,
                    signedMoney(w.expectancy) ?? '—', signedMoney(w.avgSize)?.replace('+', '') ?? '—',
                  ])}
                  empty="No trades fall inside a defined session window."
                />
                <SectionContext items={[
                  windowExtremes.best ? `${windowExtremes.best.label} has the strongest average result at ${signedMoney(windowExtremes.best.expectancy) ?? '—'} across ${windowExtremes.best.trades} trades.` : null,
                  windowExtremes.worst && windowExtremes.worst !== windowExtremes.best ? `${windowExtremes.worst.label} has the weakest average result at ${signedMoney(windowExtremes.worst.expectancy) ?? '—'} across ${windowExtremes.worst.trades} trades.` : null,
                  'A window with only a few trades is an observation to watch, not a stable personal rule.',
                ]} />
              </Panel>
              <Panel title="By trade origin" subtitle="Compares results by where the trade idea came from. Unclassified trades limit how useful this comparison can be.">
                <Table
                  head={['Trade source', 'Trades', 'Win %', 'Average return', 'Total profit/loss']}
                  rows={baseline.byOrigin.map((o) => [
                    o.segment, o.trades, o.winRate === null ? '—' : `${o.winRate}%`,
                    signedMoney(o.expectancy) ?? '—', signedMoney(o.totalPl) ?? '—',
                  ])}
                />
                <SectionContext items={[
                  baseline.byOrigin.length === 1 && baseline.byOrigin[0]?.segment === 'Other'
                    ? `All ${originSample} classified trades are currently grouped as Other, so source comparison is not meaningful yet.`
                    : originExtremes.best ? `${originExtremes.best.segment} has the strongest average result at ${signedMoney(originExtremes.best.expectancy) ?? '—'} across ${originExtremes.best.trades} trades.` : null,
                  baseline.byOrigin.length > 1 && originExtremes.worst && originExtremes.worst !== originExtremes.best ? `${originExtremes.worst.segment} has the weakest average result at ${signedMoney(originExtremes.worst.expectancy) ?? '—'} across ${originExtremes.worst.trades} trades.` : null,
                ]} />
              </Panel>
              <Panel title="By strategy and setup" subtitle="Compares the structures you actually use so you can see which trade types are helping or hurting the overall baseline.">
                <Table
                  head={['Setup', 'Trades', 'Win %', 'Average return']}
                  rows={baseline.bySetup.slice(0, 8).map((s) => [
                    s.segment, s.trades, s.winRate === null ? '—' : `${s.winRate}%`, signedMoney(s.expectancy) ?? '—',
                  ])}
                />
                <SectionContext items={[
                  setupExtremes.best ? `${setupExtremes.best.segment} has the strongest average result at ${signedMoney(setupExtremes.best.expectancy) ?? '—'} across ${setupExtremes.best.trades} trades.` : null,
                  setupExtremes.worst && setupExtremes.worst !== setupExtremes.best ? `${setupExtremes.worst.segment} has the weakest average result at ${signedMoney(setupExtremes.worst.expectancy) ?? '—'} across ${setupExtremes.worst.trades} trades.` : null,
                ]} />
              </Panel>
              <Panel title="By market environment" subtitle="Shows whether outcomes differ with the broader market regime recorded at entry, without filling missing regime data after the fact.">
                <Table
                  head={['Market environment', 'Trades', 'Win %', 'Average return']}
                  rows={baseline.byRegime.map((s) => [
                    s.segment, s.trades, s.winRate === null ? '—' : `${s.winRate}%`, signedMoney(s.expectancy) ?? '—',
                  ])}
                />
                <SectionContext items={[
                  regimeSample < baseline.sampleSize ? `Market-environment context exists for ${regimeSample} of ${baseline.sampleSize} recorded trades, so this is only a partial view.` : null,
                  regimeExtremes.best ? `${regimeExtremes.best.segment} currently has the strongest observed average result at ${signedMoney(regimeExtremes.best.expectancy) ?? '—'} across ${regimeExtremes.best.trades} trades.` : null,
                  baseline.byRegime.length === 1 ? 'Only one market environment is represented, so there is not yet a meaningful regime comparison.' : null,
                ]} />
              </Panel>
              <Panel title="By day of week" subtitle="Describes day-level differences in your history. Small samples are context, not a trading rule.">
                <Table head={['Day', 'Trades', 'Win %', 'Average return']}
                  rows={baseline.byDayOfWeek.map((s) => [s.segment, s.trades, s.winRate === null ? '—' : `${s.winRate}%`, signedMoney(s.expectancy) ?? '—'])} />
                <SectionContext items={[
                  dayExtremes.best ? `${dayExtremes.best.segment} has the strongest average result at ${signedMoney(dayExtremes.best.expectancy) ?? '—'} across ${dayExtremes.best.trades} trades.` : null,
                  dayExtremes.worst && dayExtremes.worst !== dayExtremes.best ? `${dayExtremes.worst.segment} has the weakest average result at ${signedMoney(dayExtremes.worst.expectancy) ?? '—'} across ${dayExtremes.worst.trades} trades.` : null,
                  'Weekday differences are descriptive; they do not establish that the day caused the result.',
                ]} />
              </Panel>
              <Panel title="By days to expiration" subtitle="Separates same-day options from longer-dated contracts so 0DTE behavior does not get blended into swing behavior.">
                <Table head={['Days to expiration', 'Trades', 'Win %', 'Average return']}
                  rows={baseline.byDte.map((s) => [s.segment, s.trades, s.winRate === null ? '—' : `${s.winRate}%`, signedMoney(s.expectancy) ?? '—'])} />
                <SectionContext items={[
                  dteSample < baseline.sampleSize ? `DTE context exists for ${dteSample} of ${baseline.sampleSize} recorded trades.` : null,
                  dteExtremes.best ? `${dteExtremes.best.segment} has the strongest average result at ${signedMoney(dteExtremes.best.expectancy) ?? '—'} across ${dteExtremes.best.trades} trades.` : null,
                  dteExtremes.worst && dteExtremes.worst !== dteExtremes.best ? `${dteExtremes.worst.segment} has the weakest average result at ${signedMoney(dteExtremes.worst.expectancy) ?? '—'} across ${dteExtremes.worst.trades} trades.` : null,
                ]} />
              </Panel>
            </div>

            <Panel title="Sequence behaviour" subtitle="Compares what happens after a win versus after a loss: next size, re-entry timing, and next-trade outcome. No motive or emotion is inferred.">
              <Table
                head={['Sequence', 'Trade pairs', 'Typical next size', 'Typical time between trades', 'Next-trade average return', 'Next win %']}
                rows={[baseline.afterWin, baseline.afterLoss].map((s) => [
                  s.label, s.sample, signedMoney(s.medianNextSize)?.replace('+', '') ?? '—',
                  minutesLabel(s.medianMinutesToNext) ?? '—', signedMoney(s.nextExpectancy) ?? '—',
                  s.nextWinRate === null ? '—' : `${s.nextWinRate}%`,
                ])}
              />
              <SectionContext items={[
                afterLossSizeLift !== null
                  ? afterLossSizeLift > 0
                    ? `Your typical next position after a loss is ${afterLossSizeLift.toFixed(0)}% larger than after a win.`
                    : `Your typical next position after a loss is ${Math.abs(afterLossSizeLift).toFixed(0)}% smaller than after a win.`
                  : null,
                baseline.afterLoss.nextExpectancy !== null && baseline.afterWin.nextExpectancy !== null
                  ? `The next trade averages ${signedMoney(baseline.afterLoss.nextExpectancy) ?? '—'} after a loss versus ${signedMoney(baseline.afterWin.nextExpectancy) ?? '—'} after a win.`
                  : null,
                baseline.afterLoss.medianMinutesToNext !== null && baseline.afterWin.medianMinutesToNext !== null
                  ? `Typical re-entry timing is ${minutesLabel(baseline.afterLoss.medianMinutesToNext)} after a loss versus ${minutesLabel(baseline.afterWin.medianMinutesToNext)} after a win.`
                  : null,
              ]} />
            </Panel>
              </>
            )}
          </div>
      )}

      {/* --------------------------------- PATTERNS -------------------------------- */}
      {tab === 'patterns' && (
        <div className="space-y-3">
          {traderProfile && (
            <Panel
              title="MyURSORA pattern checks"
              subtitle="Each self-reported habit becomes its own evidence card. Relevant behavioral episodes and measurements pipe into the card as brokerage and TradeCycle history accumulates."
            >
              {profileRowsFor('patterns').length > 0 ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {profileRowsFor('patterns').map((row) => (
                    <ProfilePatternCheckCard
                      key={row.key}
                      insight={row}
                      tone={contextTone}
                      onOpenEvidence={onOpenHistoricalEvidence}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500">Add habits or Trader Intelligence goals in MyURSORA to create personal pattern checks.</p>
              )}
            </Panel>
          )}

          {patterns.length === 0 ? (
            <EmptyState
              title={emptyForNewUser ? 'Insufficient data' : 'No statistically meaningful personal pattern identified'}
              body={emptyForNewUser
                ? 'URSORA needs trading history before it can identify your personal patterns. Build your baseline through paper trading, manual trade history, or a supported brokerage connection.'
                : 'Your recorded history does not currently support a pattern claim at the required sample size. This is a valid result: URSORA does not manufacture an insight to fill the page.'}
            />
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {patterns.map((o, i) => (
                <PatternCard key={`${o.observation_type}-${i}`} observation={o} construct={constructFor(o.construct_key)} studies={lit.studies} links={lit.links} />
              ))}
            </div>
          )}

          {!emptyForNewUser && (
            <Panel title="Personal trader profile" subtitle="Analytical, not a personality type. Every line is a measured segment of your own history.">
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Strongest setup" help="The setup with the highest average realized P/L per closed trade in your recorded history. This describes past results; it is not a prediction." value={baseline.bySetup.slice().sort((a, b) => (b.expectancy ?? -1e9) - (a.expectancy ?? -1e9))[0]?.segment ?? 'not recorded'} />
                <Stat label="Weakest setup" help="The setup with the lowest average realized P/L per closed trade in your recorded history." value={baseline.bySetup.slice().sort((a, b) => (a.expectancy ?? 1e9) - (b.expectancy ?? 1e9))[0]?.segment ?? 'not recorded'} />
                <Stat label="Best window" help="The time-of-day segment with the highest average realized P/L per closed trade in your history." value={baseline.byWindow.filter((w) => w.trades > 0).sort((a, b) => (b.expectancy ?? -1e9) - (a.expectancy ?? -1e9))[0]?.label ?? 'not recorded'} />
                <Stat label="Weakest window" help="The time-of-day segment with the lowest average realized P/L per closed trade in your history." value={baseline.byWindow.filter((w) => w.trades > 0).sort((a, b) => (a.expectancy ?? 1e9) - (b.expectancy ?? 1e9))[0]?.label ?? 'not recorded'} />
                <Stat label="Typical size" help="Your median recorded position size. Median is used so a few unusually large trades do not distort what is typical." value={signedMoney(baseline.medianPositionSize)?.replace('+', '') ?? 'not recorded'} />
                <Stat label="Best market environment" help="The recorded market regime associated with the highest average realized P/L per closed trade in your history." value={baseline.byRegime.slice().sort((a, b) => (b.expectancy ?? -1e9) - (a.expectancy ?? -1e9))[0]?.segment ?? 'not recorded'} />
                <Stat label="Weakest market environment" help="The recorded market regime associated with the lowest average realized P/L per closed trade in your history." value={baseline.byRegime.slice().sort((a, b) => (a.expectancy ?? 1e9) - (b.expectancy ?? 1e9))[0]?.segment ?? 'not recorded'} />
                <Stat label="Best origin" help="The source category associated with the highest average realized P/L per closed trade. Origin describes where the trade idea came from." value={baseline.byOrigin.slice().sort((a, b) => (b.expectancy ?? -1e9) - (a.expectancy ?? -1e9))[0]?.segment ?? 'not recorded'} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500" style={{ textWrap: 'pretty' }}>
                These are observed associations in your recorded history. They describe what happened, not why, and they do not
                predict any individual future trade.
              </p>
            </Panel>
          )}
        </div>
      )}

      {/* --------------------------------- PROCESS --------------------------------- */}
      {tab === 'process' && (
          <div className="space-y-3">
            {traderProfile && (
              <Panel
                title="MyURSORA process context"
                subtitle="Your stated goals and boundaries are shown immediately. Brokerage and plan data later determines whether actual behavior is aligned, mixed, or divergent."
              >
                <Table
                  head={['MyURSORA goal / boundary', 'Observed behavior', 'Alignment', 'Context']}
                  rows={profileRowsFor('process').map((row) => [
                    row.profileSignal,
                    row.observed,
                    <span key="status" className={cn('font-semibold', contextTone(row.status))}>{row.status}</span>,
                    <span key="detail" className="text-zinc-500">{row.detail}</span>,
                  ])}
                  empty="Add a process goal, target, or risk boundary in MyURSORA to create process context."
                />
              </Panel>
            )}

            {emptyForNewUser ? (
              <EmptyState title="Waiting for trade history" body="Your process goals are recorded. Once trade and plan data is available, URSORA will compare actual loss limits, planning consistency, re-entry behavior and adherence with those stated goals." />
            ) : (
              <>
            <Panel title="Process adherence" subtitle="Scored from plan adherence only. Profitability is deliberately excluded and must never be added.">
              <Table
                head={['Trade', 'Origin', 'Adherence', 'Outcome', 'Process × outcome']}
                rows={activeTrades.filter(isClosed).slice(0, 14).map((t) => {
                  const plan = plans.find((p) => p.id === t.trade_plan_id) ?? null;
                  const a = assessAdherence(t, plan, mods.filter((m) => m.trade_id === t.id));
                  const pl = tradePl(t);
                  return [
                    <span key="s" className="text-zinc-100">{t.symbol} {t.option_type ?? ''} {t.strike ?? ''}</span>,
                    <select
                      key="o"
                      value={t.origin ?? 'MATADOR_SUPPORTED'}
                      onChange={(e) => void changeOrigin(t.id, e.target.value)}
                      aria-label={`Trade origin for ${t.symbol}`}
                      className="rounded-sm border border-zinc-700 bg-black/40 px-1 py-[1px] font-mono text-[10px] text-zinc-300 transition-colors hover:border-sky-500/40"
                    >
                      {TRADE_ORIGINS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>,
                    <span key="a" className={cn(a.score >= 70 ? 'text-emerald-400' : a.score >= 45 ? 'text-amber-300' : 'text-red-300')}>{a.score}/100</span>,
                    <span key="p" className={cn((pl ?? 0) > 0 ? 'text-emerald-400' : (pl ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400')}>{signedMoney(pl) ?? 'not recorded'}</span>,
                    <span key="q" className="text-[10px] text-zinc-400">{a.quadrant ?? 'open'}</span>,
                  ];
                })}
                empty="No closed trades to score yet."
              />
            </Panel>

            <Panel title="Outcome versus process" subtitle="All four cases are classified explicitly. A profitable departure from plan is still a departure from plan.">
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {(['GOOD PROCESS + GOOD OUTCOME', 'GOOD PROCESS + BAD OUTCOME', 'BAD PROCESS + GOOD OUTCOME', 'BAD PROCESS + BAD OUTCOME'] as const).map((q) => {
                  const count = activeTrades.filter(isClosed).filter((t) => {
                    const plan = plans.find((p) => p.id === t.trade_plan_id) ?? null;
                    return assessAdherence(t, plan, mods.filter((m) => m.trade_id === t.id)).quadrant === q;
                  }).length;
                  const good = q.startsWith('GOOD PROCESS');
                  return (
                    <div key={q} className={cn('rounded-sm border p-2.5', good ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-amber-500/25 bg-amber-500/[0.05]')}>
                      <div className="flex items-center gap-1.5">
                        {good ? <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" /> : <XCircle className="h-3 w-3 text-amber-400" aria-hidden="true" />}
                        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-400">{q}</span>
                      </div>
                      <div className="mt-1 font-mono text-lg tabular-nums text-zinc-100">{count}</div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Recorded plan deviations" subtitle="Deviations are recorded first and evaluated later. None of them is automatically irrational.">
              <Table
                head={['Trade', 'Deviation', 'Detail']}
                rows={activeTrades.slice(0, 40).flatMap((t) => {
                  const plan = plans.find((p) => p.id === t.trade_plan_id) ?? null;
                  return assessAdherence(t, plan, mods.filter((m) => m.trade_id === t.id)).deviations
                    .map((d) => [t.symbol, d.label, <span key="d" className="text-zinc-500">{d.detail}</span>]);
                }).slice(0, 20)}
                empty="No plan deviations are recorded."
              />
            </Panel>
              </>
            )}
          </div>
      )}

      {/* ------------------------------- PERFORMANCE ------------------------------- */}
      {tab === 'performance' && (
        emptyForNewUser ? (
          <EmptyState title="Insufficient data" body="No sessions are recorded yet, so there is no progress to compare." />
        ) : (
          <div className="space-y-3">
            <Panel title="Session review" subtitle="Process is reported separately from money. Both are shown; neither is used to justify the other.">
              <ul className="grid gap-1.5 2xl:grid-cols-2">
                {sessions.slice(0, 10).map((s) => (
                  <li key={s.sessionDate} className="rounded-sm border border-zinc-800 bg-black/20">
                    <button
                      type="button"
                      onClick={() => setExpandedSession(expandedSession === s.sessionDate ? null : s.sessionDate)}
                      aria-expanded={expandedSession === s.sessionDate}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-2 text-left transition-colors hover:bg-black/40"
                    >
                      <span className="font-mono text-[11px] text-zinc-200">{dateLabel(`${s.sessionDate}T14:30:00Z`) ?? s.sessionDate}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{s.trades.length} trades</span>
                      <span className={cn('font-mono text-[11px] tabular-nums', s.finalPl > 0 ? 'text-emerald-400' : s.finalPl < 0 ? 'text-red-400' : 'text-zinc-400')}>
                        {signedMoney(s.finalPl)}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">high {signedMoney(s.highWaterPl)}</span>
                      {s.giveback > 0 && <span className="font-mono text-[10px] text-amber-300">giveback {signedMoney(-s.giveback)}</span>}
                      <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-sky-400">{expandedSession === s.sessionDate ? 'hide' : 'review'}</span>
                    </button>
                    {expandedSession === s.sessionDate && (
                      <div className="space-y-2 border-t border-zinc-800 p-2.5">
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                          <Stat label="Closed" help="Trades in this session that have a recorded exit and can contribute realized P/L." value={s.closedCount} />
                          <Stat label="After session high" help="Trades entered after the session had already reached its highest cumulative realized P/L. The smaller number shows the net P/L from those later trades." value={`${s.tradesAfterHighWater} trades`} hint={signedMoney(s.plAfterHighWater) ?? ''} />
                          <Stat label="Planned / unplanned" help="Planned trades had a recorded pre-entry plan. Unplanned trades did not. This is a process classification, not a quality judgment by itself." value={`${s.plannedCount} / ${s.unplannedCount}`} />
                          <Stat label="Rapid re-entries" help="A new position opened within the configured rapid-reentry window after a prior exit. It is flagged for review, not automatically treated as a mistake." value={s.rapidReentries} />
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          <div className="rounded-sm border border-zinc-800 bg-black/30 p-2">
                            <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Trade origin breakdown<InfoHint text="Shows where the session's trade ideas originated and the realized P/L associated with each source category. It does not claim the source caused the result." /></div>
                            <ul className="mt-1 space-y-0.5">
                              {s.originBreakdown.map((o) => (
                                <li key={o.origin} className="font-mono text-[10px] text-zinc-400">
                                  {o.origin} — {o.count} trades, {signedMoney(o.pl)}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-sm border border-zinc-800 bg-black/30 p-2">
                            <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Outcome and process highlights<InfoHint text="Best and worst outcome refer to realized P/L. Best process refers to the highest plan-adherence score. A profitable trade can still have weak process, and vice versa." /></div>
                            <p className="mt-1 font-mono text-[10px] text-zinc-400">
                              Best outcome — {s.bestOutcomeTrade ? `${s.bestOutcomeTrade.symbol} ${signedMoney(tradePl(s.bestOutcomeTrade))}` : 'not recorded'}
                            </p>
                            <p className="font-mono text-[10px] text-zinc-400">
                              Worst outcome — {s.worstOutcomeTrade ? `${s.worstOutcomeTrade.symbol} ${signedMoney(tradePl(s.worstOutcomeTrade))}` : 'not recorded'}
                            </p>
                            <p className="font-mono text-[10px] text-zinc-400">
                              Best process — {s.bestProcessTrade ? `${s.bestProcessTrade.symbol} ${s.bestProcessTrade.process_adherence}/100` : 'not recorded'}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-sm border border-zinc-800 bg-black/30 p-2">
                          <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Session trade timeline<InfoHint text="A chronological view of entries, position size, holding time, realized P/L, and the trade associated with the session's cumulative P/L high." /></div>
                          <ol className="mt-1 space-y-0.5">
                            {s.trades.map((t) => (
                              <li key={t.id} className="flex flex-wrap items-baseline gap-2 font-mono text-[10px] text-zinc-400">
                                <span className="text-zinc-600">{timeLabel(t.entry_at ?? t.created_at) ?? '—'}</span>
                                <span className="text-zinc-200">{t.symbol}</span>
                                <span>entry {signedMoney(positionSize(t))?.replace('+', '') ?? '—'}</span>
                                <span>hold {minutesLabel(holdingMinutes(t)) ?? 'open'}</span>
                                <span className={cn((tradePl(t) ?? 0) > 0 ? 'text-emerald-400' : (tradePl(t) ?? 0) < 0 ? 'text-red-400' : '')}>
                                  {signedMoney(tradePl(t)) ?? 'open'}
                                </span>
                                {s.highWaterAt && (t.exit_at ?? t.closed_at) === s.highWaterAt && (
                                  <span className="rounded-sm border border-sky-500/40 px-1 text-[9px] uppercase text-sky-300">session high</span>
                                )}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel
              title="Progress over time"
              subtitle="Rolling windows summarize your recorded sessions. Overlapping windows may contain the same trades; compare them as context, not as independent samples."
              help="This table asks whether your process and results are changing across broader time windows. It does not assume fewer trades, higher P/L, or any one metric automatically means improvement."
            >
              <Table
                head={['Period', 'Sessions', 'Trades', 'Average closed-trade P/L', 'Session high given back', 'Unplanned trades']}
                headHelp={{
                  Period: 'The rolling lookback window ending today.',
                  Sessions: 'Distinct trading days represented inside that lookback window.',
                  Trades: 'Total recorded trades inside the period.',
                  'Average closed-trade P/L': 'Mean realized dollar P/L across closed trades in the period. This is not a percentage return.',
                  'Session high given back': 'Across sessions in the period, the cumulative amount by which final realized P/L finished below each session’s earlier cumulative P/L high.',
                  'Unplanned trades': 'The percentage of recorded trades in the period without a stored pre-entry plan.',
                }}
                rows={[30, 90, 180, 365].map((days) => {
                  const cutoff = Date.now() - days * 86400000;
                  const within = sessions.filter((s) => new Date(`${s.sessionDate}T20:00:00Z`).getTime() >= cutoff);
                  const t = within.flatMap((s) => s.trades);
                  const pls = t.filter(isClosed).map(tradePl).filter((n): n is number => n !== null);
                  const give = within.reduce((a, s) => a + s.giveback, 0);
                  const unplanned = t.filter((x) => x.was_planned === false).length;
                  return [
                    days === 365 ? '1Y' : days === 180 ? '6M' : `${days}D`,
                    within.length, t.length,
                    pls.length ? signedMoney(pls.reduce((a, b) => a + b, 0) / pls.length) ?? '—' : 'insufficient data',
                    signedMoney(-give) ?? '—',
                    t.length ? `${Math.round((unplanned / t.length) * 100)}%` : '—',
                  ];
                })}
              />
            </Panel>
          </div>
        )
      )}

      {/* --------------------------------- RESEARCH -------------------------------- */}
      {tab === 'research' && (
        <div className="space-y-3">
          <Panel
            title="Research library"
            subtitle="Constructs URSORA references, how each is operationalised, and the studies linked to it. URSORA does not fabricate citations: where a DOI was not verified, the field says so rather than guessing one."
          >
            <div className="grid gap-2 xl:grid-cols-2">
              {lit.constructs.length === 0 && <div className="xl:col-span-2"><StateNotice state={{ kind: 'NO_DATA', label: 'NO DATA', tone: 'neutral', explanation: 'The research library returned no constructs.', remedy: 'Reload the page; if it persists the literature tables need seeding.' }} /></div>}
              {lit.constructs.map((c) => (
                <details key={c.construct_key} className="group rounded-sm border border-zinc-800 bg-black/20 p-2.5">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-200">
                    <Microscope className="h-3 w-3 text-indigo-400" aria-hidden="true" />
                    {c.name}
                    <span className={cn('rounded-sm border px-1.5 py-[1px] text-[9px] uppercase tracking-wide',
                      c.evidence_grade.startsWith('STRONG') ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : c.evidence_grade.startsWith('MODERATE') ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                          : c.evidence_grade.startsWith('LIMITED') ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                            : 'border-zinc-600 bg-zinc-800/60 text-zinc-400')}>
                      {c.evidence_grade}
                    </span>
                    <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] text-[9px] uppercase tracking-wide text-zinc-500">{c.layer}</span>
                  </summary>
                  <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-zinc-400" style={{ textWrap: 'pretty' }}>
                    <p><span className="font-mono uppercase text-zinc-600">definition — </span>{c.plain_definition}</p>
                    <p><span className="font-mono uppercase text-zinc-600">URSORA operationalisation — </span>{c.matador_operationalization}</p>
                    <p><span className="font-mono uppercase text-zinc-600">variables required — </span>{c.variables_required}</p>
                    <p><span className="font-mono uppercase text-zinc-600">minimum sample — </span>{c.min_sample} · {c.confidence_requirement}</p>
                    {c.known_limitations && <p className="text-amber-200/70"><span className="font-mono uppercase text-zinc-600">known limitations — </span>{c.known_limitations}</p>}
                    <ul className="space-y-1 border-t border-zinc-800 pt-1.5">
                      {lit.links.filter((l) => l.construct_key === c.construct_key).map((l) => {
                        const st = lit.studies.find((s) => s.study_key === l.study_key);
                        if (!st) return null;
                        return (
                          <li key={l.study_key} className="text-[10px] text-zinc-500">
                            <span className={cn('font-mono uppercase',
                              l.relation === 'SUPPORTS' ? 'text-emerald-400/80' : l.relation === 'CHALLENGES' ? 'text-red-400/80' : 'text-amber-400/80')}>
                              {l.relation}
                            </span>{' '}
                            <span className="text-zinc-300">{st.authors} ({st.year}).</span> {st.title}. {st.source}.{' '}
                            <span className="text-zinc-600">{st.doi ? `DOI ${st.doi}` : st.doi_status}</span>
                            <div className="mt-0.5 pl-3 text-zinc-600">Finding — {st.finding_summary}</div>
                            <div className="pl-3 text-zinc-600">Population — {st.population_studied}</div>
                            <div className="pl-3 text-zinc-600">Limitations — {st.known_limitations}</div>
                            {l.note && <div className="pl-3 text-zinc-600">Relation note — {l.note}</div>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          </Panel>

          <Panel
            title="Engine inspector and test harness"
            subtitle="Every behavioural number is produced by a deterministic function. Run the suite to verify the engines against the synthetic profiles."
            right={
              <button
                type="button"
                onClick={() => { setTests(runBehavioralTests()); track('behavioral_tests_run', {}); }}
                className="inline-flex items-center gap-1.5 rounded-sm border border-sky-500/40 bg-sky-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-sky-300 transition-colors hover:bg-sky-500/20"
              >
                <FlaskConical className="h-3 w-3" aria-hidden="true" />
                run tests
              </button>
            }
          >
            {tests === null ? (
              <p className="font-mono text-[11px] text-zinc-500">
                No run in this session. The suite covers baselines, sample thresholds, sizing, frequency, giveback,
                post-win and post-loss sequences, rapid re-entry, time-of-day segmentation, origin classification,
                process adherence, plan deviations, risk banding, literature mapping, immutability, model versioning,
                look-ahead protection, and all four process-by-outcome cases.
              </p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const s = summariseTests(tests);
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-zinc-300">{s.passed}/{s.total} passing</span>
                      {s.failed > 0 && <span className="font-mono text-[11px] text-red-300">{s.failed} failing</span>}
                    </div>
                  );
                })()}
                <ul className="space-y-0.5">
                  {tests.map((t) => (
                    <li key={t.name} className="flex items-start gap-2 border-b border-zinc-800/50 py-1 last:border-0">
                      {t.passed
                        ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                        : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" aria-hidden="true" />}
                      <span className="min-w-0">
                        <span className="block text-[11px] text-zinc-300">{t.name}</span>
                        <span className="block font-mono text-[10px] text-zinc-600">{t.group} — {t.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel title="What URSORA does not do" subtitle="Guardrails, stated to the user rather than assumed.">
            <ul className="grid gap-1.5 text-[11px] leading-relaxed text-zinc-400 sm:grid-cols-2">
              {[
                'It does not diagnose emotions, psychological conditions, or mental-health states, and it never will.',
                'It does not label you as a type of trader. It evaluates behaviour against your own plan and baseline.',
                'It does not treat a population research finding as a finding about you.',
                'It does not gamify: no streaks, badges, leaderboards, social comparison, or encouragement to trade more.',
                'It does not execute trades, modify orders, move money, or exercise contracts. Brokerage access is read-only.',
                'It does not let a low behavioural risk raise a market score, or an elevated one lower it.',
              ].map((line) => (
                <li key={line} className="flex items-start gap-1.5 rounded-sm border border-zinc-800 bg-black/20 p-2">
                  <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" aria-hidden="true" />
                  <span style={{ textWrap: 'pretty' }}>{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <Disclaimer />
    </div>
  );
};

export default TraderIntelligenceView;
