import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, BookOpen, Brain, CheckCircle2, FlaskConical, Gauge,
  Loader2, Microscope, ShieldCheck, Sparkles, XCircle,
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
import {
  DEFAULT_BEHAVIORAL_PREFS, enabledCategories, fetchBehavioralPrefs, fetchLiterature,
  fetchModifications, fetchTradePlans, fetchTradeRecords, saveBehavioralPrefs, setTradeOrigin,
  type BehavioralPrefs,
} from '@/lib/behavioral/api';
import { generateProfile, PROFILES, type ProfileKey } from '@/lib/behavioral/synthetic';
import { runBehavioralTests, summariseTests, type TestResult } from '@/lib/behavioral/tests';
import type { LitConstruct, LitLink, LitStudy, TradeModification, TradePlan, TradeRecord } from '@/lib/behavioral/types';
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

export const TraderIntelligenceView: React.FC<{ onOpenThesis?: (id: number) => void }> = () => {
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
    try {
      const [t, p, m, pr, l, tp] = await Promise.all([
        fetchTradeRecords(user?.id ?? null),
        fetchTradePlans(user?.id ?? null),
        fetchModifications(user?.id ?? null),
        fetchBehavioralPrefs(user?.id ?? null),
        fetchLiterature(),
        user ? fetchTraderProfile() : Promise.resolve(null),
      ]);
      setTrades(t);
      setPlans(p);
      setMods(m);
      setPrefs(pr);
      setLit(l);
      setTraderProfile(tp);
    } catch (e) {
      setError(reportError('trader-intelligence', e, 'Trader Intelligence data could not be loaded.'));
      setErrorState(classifyError(e));
    } finally {
      setLoading(false);
    }
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
        emptyForNewUser ? (
          <EmptyState title="Insufficient data" body="No trades are recorded for this account, so there is no baseline to compute. URSORA will not populate an example baseline — an invented baseline would make every later deviation meaningless." />
        ) : (
          <div className="space-y-3">
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
              <p className="mt-2 font-mono text-[10px] text-zinc-600">
                Confidence for this sample: <ConfidenceTag label={intel.baseline.sampleSize >= 60 ? 'HIGH-CONFIDENCE PERSONAL PATTERN' : intel.baseline.sampleSize >= 30 ? 'ESTABLISHED PERSONAL PATTERN' : intel.baseline.sampleSize >= 15 ? 'EMERGING PATTERN' : intel.baseline.sampleSize >= 6 ? 'EARLY SIGNAL' : 'INSUFFICIENT DATA'} sample={baseline.sampleSize} />
              </p>
            </Panel>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="By time of day" subtitle="Results are grouped by time of day. Average return is calculated per closed trade.">
                <Table
                  head={['Time period', 'Trades', 'Win %', 'Average return', 'Average size']}
                  rows={baseline.byWindow.filter((w) => w.trades > 0).map((w) => [
                    w.label, w.trades, w.winRate === null ? '—' : `${w.winRate}%`,
                    signedMoney(w.expectancy) ?? '—', signedMoney(w.avgSize)?.replace('+', '') ?? '—',
                  ])}
                  empty="No trades fall inside a defined session window."
                />
              </Panel>
              <Panel title="By trade origin" subtitle="External signals are never assumed superior. This measures them.">
                <Table
                  head={['Trade source', 'Trades', 'Win %', 'Average return', 'Total profit/loss']}
                  rows={baseline.byOrigin.map((o) => [
                    o.segment, o.trades, o.winRate === null ? '—' : `${o.winRate}%`,
                    signedMoney(o.expectancy) ?? '—', signedMoney(o.totalPl) ?? '—',
                  ])}
                />
              </Panel>
              <Panel title="By strategy and setup">
                <Table
                  head={['Setup', 'Trades', 'Win %', 'Average return']}
                  rows={baseline.bySetup.slice(0, 8).map((s) => [
                    s.segment, s.trades, s.winRate === null ? '—' : `${s.winRate}%`, signedMoney(s.expectancy) ?? '—',
                  ])}
                />
              </Panel>
              <Panel title="By market environment" subtitle="Results are grouped by the broader market conditions recorded when each trade was opened.">
                <Table
                  head={['Market environment', 'Trades', 'Win %', 'Average return']}
                  rows={baseline.byRegime.map((s) => [
                    s.segment, s.trades, s.winRate === null ? '—' : `${s.winRate}%`, signedMoney(s.expectancy) ?? '—',
                  ])}
                />
              </Panel>
              <Panel title="By day of week">
                <Table head={['Day', 'Trades', 'Win %', 'Average return']}
                  rows={baseline.byDayOfWeek.map((s) => [s.segment, s.trades, s.winRate === null ? '—' : `${s.winRate}%`, signedMoney(s.expectancy) ?? '—'])} />
              </Panel>
              <Panel title="By days to expiration">
                <Table head={['Days to expiration', 'Trades', 'Win %', 'Average return']}
                  rows={baseline.byDte.map((s) => [s.segment, s.trades, s.winRate === null ? '—' : `${s.winRate}%`, signedMoney(s.expectancy) ?? '—'])} />
              </Panel>
            </div>

            <Panel title="Sequence behaviour" subtitle="What your next trade looks like after a win and after a loss. Phrased as observed behaviour only.">
              <Table
                head={['Sequence', 'Trade pairs', 'Typical next size', 'Typical time between trades', 'Next-trade average return', 'Next win %']}
                rows={[baseline.afterWin, baseline.afterLoss].map((s) => [
                  s.label, s.sample, signedMoney(s.medianNextSize)?.replace('+', '') ?? '—',
                  minutesLabel(s.medianMinutesToNext) ?? '—', signedMoney(s.nextExpectancy) ?? '—',
                  s.nextWinRate === null ? '—' : `${s.nextWinRate}%`,
                ])}
              />
            </Panel>
          </div>
        )
      )}

      {/* --------------------------------- PATTERNS -------------------------------- */}
      {tab === 'patterns' && (
        <div className="space-y-3">
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
        emptyForNewUser ? (
          <EmptyState title="Insufficient data" body="Process adherence is measured against a stored pre-entry plan. Record a paper trade from an opportunity to create the first plan." />
        ) : (
          <div className="space-y-3">
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
          </div>
        )
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
