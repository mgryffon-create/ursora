/**
 * URSORA — DETERMINISTIC BEHAVIOURAL ENGINES.
 *
 * PHASE E (baseline), PHASE F (pattern engines), PHASE G (process adherence),
 * PHASE H (behavioural risk).
 *
 * Every function here is a pure function of trade records. No LLM participates
 * in producing any number, band, label or sample size. The AI layer may only
 * read what these functions returned. Every output carries the sample it was
 * computed from, the model version, and a plain-language formula string so the
 * admin inspector can trace it back to the exact trades used.
 */

import {
  ADHERENCE_WEIGHTS, DEVIATION, MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM, MODEL_VERSION,
  SESSION_WINDOWS, TRADE_ORIGINS, bandFor, confidenceFor, sensitivityFactor, windowFor,
  type Sensitivity,
} from '@/lib/behavioral/config';
import type {
  AdherenceResult, Baseline, BehavioralRisk, BehavioralRiskFactor, Observation,
  ProcessOutcomeQuadrant, SegmentStat, SequenceStat, SessionSummary, TradeModification,
  TradeRecord, WindowStat,
} from '@/lib/behavioral/types';
import { minutesLabel, multiple, sessionDateKey, signedMoney } from '@/lib/format';

/* -------------------------------------------------------------------------- */
/*  Small statistical helpers (no dependency, fully testable)                  */
/* -------------------------------------------------------------------------- */

export const median = (xs: number[]): number | null => {
  const v = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export const mean = (xs: number[]): number | null => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export const percentile = (xs: number[], p: number): number | null => {
  const v = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = Math.min(v.length - 1, Math.max(0, Math.round((p / 100) * (v.length - 1))));
  return v[idx];
};

export const round2 = (n: number | null): number | null =>
  n === null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;

/** Percentage deviation of `current` from `baseline`. Null when undefined. */
export const deviationPct = (current: number | null, baseline: number | null): number | null =>
  current === null || baseline === null || baseline === 0 ? null : round2(((current - baseline) / Math.abs(baseline)) * 100);

/* -------------------------------------------------------------------------- */
/*  Trade-level derivations                                                   */
/* -------------------------------------------------------------------------- */

export const isClosed = (t: TradeRecord): boolean => t.result !== 'open' && t.result !== null;

/** Realised P/L in dollars. Prefers the stored figure; otherwise derives it. */
export function tradePl(t: TradeRecord): number | null {
  if (t.realized_pl !== null && t.realized_pl !== undefined) return Number(t.realized_pl);
  const entry = t.entry_price ?? t.contracts !== null ? t.entry_price : null;
  const exit = t.exit_price;
  if (entry === null || exit === null || entry === undefined || exit === undefined) return null;
  const qty = t.contracts ?? 1;
  return round2((Number(exit) - Number(entry)) * qty * 100 - Number(t.fees ?? 0));
}

export function positionSize(t: TradeRecord): number | null {
  if (t.position_size !== null && t.position_size !== undefined) return Number(t.position_size);
  if (t.entry_price === null || t.entry_price === undefined) return null;
  return round2(Number(t.entry_price) * (t.contracts ?? 1) * 100);
}

export function holdingMinutes(t: TradeRecord): number | null {
  const a = t.entry_at ?? t.created_at;
  const b = t.exit_at ?? t.closed_at;
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : null;
}

const entryTime = (t: TradeRecord): number => new Date(t.entry_at ?? t.created_at).getTime();

const byEntryAsc = (a: TradeRecord, b: TradeRecord) => entryTime(a) - entryTime(b);

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* -------------------------------------------------------------------------- */
/*  Segment statistics                                                        */
/* -------------------------------------------------------------------------- */

function statsFor(trades: TradeRecord[], key: string, label: string): WindowStat {
  const closed = trades.filter(isClosed);
  const pls = closed.map(tradePl).filter((n): n is number => n !== null);
  const wins = closed.filter((t) => (tradePl(t) ?? 0) > 0).length;
  return {
    key,
    label,
    trades: trades.length,
    wins,
    winRate: closed.length ? round2((wins / closed.length) * 100) : null,
    expectancy: pls.length ? round2(pls.reduce((a, b) => a + b, 0) / pls.length) : null,
    avgReturnPct: round2(mean(closed.map((t) => Number(t.return_pct)).filter(Number.isFinite))),
    avgSize: round2(mean(trades.map(positionSize).filter((n): n is number => n !== null))),
    totalPl: round2(pls.reduce((a, b) => a + b, 0)) ?? 0,
  };
}

function segment(trades: TradeRecord[], pick: (t: TradeRecord) => string | null): SegmentStat[] {
  const groups = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const k = pick(t);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(t);
    groups.set(k, arr);
  }
  return [...groups.entries()]
    .map(([k, list]) => ({ ...statsFor(list, k, k), segment: k }))
    .sort((a, b) => b.trades - a.trades);
}

/* -------------------------------------------------------------------------- */
/*  PHASE E — TRADER BASELINE ENGINE                                          */
/* -------------------------------------------------------------------------- */

function sequenceStat(trades: TradeRecord[], want: 'win' | 'loss'): SequenceStat {
  const ordered = trades.slice().sort(byEntryAsc);
  const nextSizes: number[] = [];
  const gaps: number[] = [];
  const scores: number[] = [];
  const nextPls: number[] = [];
  let wins = 0;
  let counted = 0;
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const cur = ordered[i];
    if (!isClosed(cur)) continue;
    const pl = tradePl(cur);
    if (pl === null) continue;
    const matches = want === 'win' ? pl > 0 : pl < 0;
    if (!matches) continue;
    const next = ordered[i + 1];
    counted += 1;
    const size = positionSize(next);
    if (size !== null) nextSizes.push(size);
    if (next.opportunity_score !== null) scores.push(Number(next.opportunity_score));
    const exitAt = cur.exit_at ?? cur.closed_at;
    if (exitAt) {
      const gap = (entryTime(next) - new Date(exitAt).getTime()) / 60000;
      if (Number.isFinite(gap) && gap >= 0) gaps.push(gap);
    }
    const npl = tradePl(next);
    if (npl !== null) {
      nextPls.push(npl);
      if (npl > 0) wins += 1;
    }
  }
  return {
    label: want === 'win' ? 'AFTER WIN' : 'AFTER LOSS',
    sample: counted,
    medianNextSize: round2(median(nextSizes)),
    medianMinutesToNext: round2(median(gaps)),
    medianNextScore: round2(median(scores)),
    nextExpectancy: nextPls.length ? round2(nextPls.reduce((a, b) => a + b, 0) / nextPls.length) : null,
    nextWinRate: nextPls.length ? round2((wins / nextPls.length) * 100) : null,
  };
}

export function buildBaseline(trades: TradeRecord[]): Baseline {
  const all = trades.slice().sort(byEntryAsc);
  const closed = all.filter(isClosed);
  const sizes = all.map(positionSize).filter((n): n is number => n !== null);
  const pls = closed.map(tradePl).filter((n): n is number => n !== null);
  const winPls = pls.filter((p) => p > 0);
  const lossPls = pls.filter((p) => p < 0);
  const holds = closed.map(holdingMinutes).filter((n): n is number => n !== null);
  const winHolds = closed.filter((t) => (tradePl(t) ?? 0) > 0).map(holdingMinutes).filter((n): n is number => n !== null);
  const lossHolds = closed.filter((t) => (tradePl(t) ?? 0) < 0).map(holdingMinutes).filter((n): n is number => n !== null);

  const sessions = new Map<string, TradeRecord[]>();
  for (const t of all) {
    const key = t.session_date ?? sessionDateKey(t.entry_at ?? t.created_at);
    if (!key) continue;
    const arr = sessions.get(key) ?? [];
    arr.push(t);
    sessions.set(key, arr);
  }
  const perSession = [...sessions.values()].map((s) => s.length);
  const sessionPls = [...sessions.values()].map((s) =>
    s.filter(isClosed).map(tradePl).filter((n): n is number => n !== null).reduce((a, b) => a + b, 0));

  // Maximum drawdown across the ordered realised equity curve.
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const t of closed) {
    const pl = tradePl(t);
    if (pl === null) continue;
    equity += pl;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak);
  }

  const adhered = closed.filter((t) => t.process_adherence !== null && t.process_adherence !== undefined);
  const withInvalidation = closed.filter((t) => t.intended_invalidation !== null);
  const stopHeld = withInvalidation.filter((t) => (t.max_adverse_excursion ?? 0) > -100).length;

  return {
    sampleSize: all.length,
    closedSample: closed.length,
    firstTradeAt: all[0]?.entry_at ?? all[0]?.created_at ?? null,
    lastTradeAt: all[all.length - 1]?.entry_at ?? all[all.length - 1]?.created_at ?? null,
    tradesPerSessionMean: round2(mean(perSession)),
    tradesPerSessionMedian: round2(median(perSession)),
    medianPositionSize: round2(median(sizes)),
    meanPositionSize: round2(mean(sizes)),
    positionSizeP90: round2(percentile(sizes, 90)),
    medianRiskPerTrade: round2(median(sizes)),
    medianHoldingMinutes: round2(median(holds)),
    medianHoldingWinnersMin: round2(median(winHolds)),
    medianHoldingLosersMin: round2(median(lossHolds)),
    winRate: pls.length ? round2((winPls.length / pls.length) * 100) : null,
    avgWin: winPls.length ? round2(winPls.reduce((a, b) => a + b, 0) / winPls.length) : null,
    avgLoss: lossPls.length ? round2(lossPls.reduce((a, b) => a + b, 0) / lossPls.length) : null,
    payoffRatio:
      winPls.length && lossPls.length
        ? round2(
            (winPls.reduce((a, b) => a + b, 0) / winPls.length) /
              Math.abs(lossPls.reduce((a, b) => a + b, 0) / lossPls.length),
          )
        : null,
    expectancy: pls.length ? round2(pls.reduce((a, b) => a + b, 0) / pls.length) : null,
    maxDrawdown: round2(maxDd),
    avgMfe: round2(mean(closed.map((t) => Number(t.max_favorable_excursion)).filter(Number.isFinite))),
    avgMae: round2(mean(closed.map((t) => Number(t.max_adverse_excursion)).filter(Number.isFinite))),
    medianEntryScore: round2(median(all.map((t) => Number(t.opportunity_score)).filter(Number.isFinite))),
    stopAdherencePct: withInvalidation.length ? round2((stopHeld / withInvalidation.length) * 100) : null,
    plannedSharePct: all.length ? round2((all.filter((t) => t.was_planned !== false).length / all.length) * 100) : null,
    medianSessionPl: round2(median(sessionPls)),
    sessions: sessions.size,
    byWindow: SESSION_WINDOWS.map((w) =>
      statsFor(all.filter((t) => windowFor(t.entry_at ?? t.created_at)?.key === w.key), w.key, w.label)),
    byOrigin: segment(all, (t) =>
      TRADE_ORIGINS.find((o) => o.key === t.origin)?.label ?? (t.origin ? String(t.origin) : null)),
    byStrategy: segment(all, (t) => t.strategy),
    bySetup: segment(all, (t) => t.setup ?? t.strategy),
    byRegime: segment(all, (t) => t.regime),
    bySymbol: segment(all, (t) => t.symbol),
    byDayOfWeek: segment(all, (t) => {
      const iso = t.entry_at ?? t.created_at;
      if (!iso) return null;
      const et = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' }));
      return DOW[et.getDay()] ?? null;
    }),
    byDte: segment(all, (t) => {
      if (!t.expiration || !t.entry_at) return null;
      const d = Math.round((new Date(t.expiration).getTime() - new Date(t.entry_at).getTime()) / 86400000);
      if (!Number.isFinite(d)) return null;
      return d <= 1 ? '0–1 DTE' : d <= 7 ? '2–7 DTE' : d <= 21 ? '8–21 DTE' : d <= 45 ? '22–45 DTE' : '45+ DTE';
    }),
    afterWin: sequenceStat(all, 'win'),
    afterLoss: sequenceStat(all, 'loss'),
    model_version: MODEL_VERSION,
  };
}

/* -------------------------------------------------------------------------- */
/*  PHASE F — SESSION HIGH-WATER ANALYSIS                                     */
/* -------------------------------------------------------------------------- */

export function summariseSession(sessionDate: string, trades: TradeRecord[]): SessionSummary {
  const ordered = trades.slice().sort(byEntryAsc);
  let running = 0;
  let high = 0;
  let highAt: string | null = null;
  let highIndex = -1;
  ordered.forEach((t, i) => {
    const pl = isClosed(t) ? tradePl(t) : null;
    if (pl === null) return;
    running += pl;
    if (running > high) {
      high = running;
      highAt = t.exit_at ?? t.closed_at ?? t.entry_at;
      highIndex = i;
    }
  });
  const final = running;
  const afterHigh = highIndex >= 0 ? ordered.slice(highIndex + 1) : [];
  const plAfterHigh = afterHigh.filter(isClosed).map(tradePl).filter((n): n is number => n !== null)
    .reduce((a, b) => a + b, 0);

  let rapid = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const prevExit = ordered[i - 1].exit_at ?? ordered[i - 1].closed_at;
    if (!prevExit) continue;
    const gap = (entryTime(ordered[i]) - new Date(prevExit).getTime()) / 60000;
    if (Number.isFinite(gap) && gap >= 0 && gap <= DEVIATION.rapidReentryMinutes) rapid += 1;
  }

  const originCounts = new Map<string, { count: number; pl: number }>();
  for (const t of ordered) {
    const label = TRADE_ORIGINS.find((o) => o.key === t.origin)?.label ?? 'Unclassified';
    const rec = originCounts.get(label) ?? { count: 0, pl: 0 };
    rec.count += 1;
    rec.pl += tradePl(t) ?? 0;
    originCounts.set(label, rec);
  }

  const withAdherence = ordered.filter((t) => t.process_adherence !== null && t.process_adherence !== undefined);
  const closedOnes = ordered.filter(isClosed);

  return {
    sessionDate,
    trades: ordered,
    closedCount: closedOnes.length,
    realizedPl: round2(final) ?? 0,
    highWaterPl: round2(high) ?? 0,
    highWaterAt: highAt,
    finalPl: round2(final) ?? 0,
    giveback: round2(Math.max(0, high - final)) ?? 0,
    givebackPct: high > 0 ? round2((Math.max(0, high - final) / high) * 100) : null,
    tradesAfterHighWater: afterHigh.length,
    plAfterHighWater: round2(plAfterHigh) ?? 0,
    avgSize: round2(mean(ordered.map(positionSize).filter((n): n is number => n !== null))),
    avgScore: round2(mean(ordered.map((t) => Number(t.opportunity_score)).filter(Number.isFinite))),
    plannedCount: ordered.filter((t) => t.was_planned !== false).length,
    unplannedCount: ordered.filter((t) => t.was_planned === false).length,
    rapidReentries: rapid,
    originBreakdown: [...originCounts.entries()].map(([origin, v]) => ({ origin, count: v.count, pl: round2(v.pl) ?? 0 })),
    bestProcessTrade: withAdherence.slice().sort((a, b) => (b.process_adherence ?? 0) - (a.process_adherence ?? 0))[0] ?? null,
    worstProcessTrade: withAdherence.slice().sort((a, b) => (a.process_adherence ?? 0) - (b.process_adherence ?? 0))[0] ?? null,
    bestOutcomeTrade: closedOnes.slice().sort((a, b) => (tradePl(b) ?? 0) - (tradePl(a) ?? 0))[0] ?? null,
    worstOutcomeTrade: closedOnes.slice().sort((a, b) => (tradePl(a) ?? 0) - (tradePl(b) ?? 0))[0] ?? null,
  };
}

export function groupSessions(trades: TradeRecord[]): SessionSummary[] {
  const map = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const key = t.session_date ?? sessionDateKey(t.entry_at ?? t.created_at);
    if (!key) continue;
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }
  return [...map.entries()]
    .map(([date, list]) => summariseSession(date, list))
    .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : -1));
}

/**
 * Longitudinal high-water finding. Returns null rather than a claim when the
 * sample is too small — INSUFFICIENT DATA is a valid, required answer.
 */
export function highWaterFinding(sessions: SessionSummary[]): Observation | null {
  const profitable = sessions.filter((s) => s.highWaterPl > 0 && s.tradesAfterHighWater > 0);
  if (profitable.length < 3) return null;
  const reduced = profitable.filter((s) => s.finalPl < s.highWaterPl).length;
  const sharePct = round2((reduced / profitable.length) * 100) ?? 0;
  const avgAfter = round2(mean(profitable.map((s) => s.plAfterHighWater)));
  const label = confidenceFor(profitable.length);
  const directional = profitable.length >= MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM;
  return {
    observation_type: 'session_high_water_giveback',
    category: 'giveback',
    statement: directional
      ? `Across ${profitable.length} sessions where you reached a positive session high and kept trading, additional trades reduced the final session result in ${sharePct}% of them. Average result of trading after the high: ${signedMoney(avgAfter) ?? 'not recorded'}.`
      : `Measured across ${profitable.length} sessions — below the ${MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM}-session minimum URSORA requires before stating a direction. Recorded for later, not asserted.`,
    baseline_value: round2(mean(profitable.map((s) => s.highWaterPl))),
    current_value: round2(mean(profitable.map((s) => s.finalPl))),
    deviation_pct: sharePct,
    unit: 'USD',
    sample_size: profitable.length,
    observation_period: `${profitable.length} qualifying sessions`,
    confidence_label: label,
    construct_key: 'session_giveback',
    evidence_trade_ids: profitable.flatMap((s) => s.trades.map((t) => t.id)).slice(0, 200),
    severity: sharePct >= 65 && directional ? 'ELEVATED' : 'LOW',
    model_version: MODEL_VERSION,
    formula:
      'For each session: order closed trades by entry time, accumulate realised P/L, record the running maximum as the high-water mark, and compare the final accumulated P/L to that maximum. The share is the count of sessions where final < high-water, divided by sessions that reached a positive high-water mark and traded afterwards.',
  };
}

/* -------------------------------------------------------------------------- */
/*  PHASE F — post-win / post-loss, re-entry, sizing, frequency               */
/* -------------------------------------------------------------------------- */

export function sequenceFinding(baseline: Baseline, which: 'win' | 'loss'): Observation | null {
  const seq = which === 'win' ? baseline.afterWin : baseline.afterLoss;
  if (seq.sample < 3 || seq.medianNextSize === null || baseline.medianPositionSize === null) return null;
  const dev = deviationPct(seq.medianNextSize, baseline.medianPositionSize);
  if (dev === null) return null;
  const directional = seq.sample >= MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM;
  const dir = dev >= 0 ? 'larger' : 'smaller';
  return {
    observation_type: which === 'win' ? 'post_win_sizing' : 'post_loss_sizing',
    category: 'sizing',
    statement: directional
      ? `Your median next-position size is ${Math.abs(dev).toFixed(0)}% ${dir} following a ${which === 'win' ? 'winning' : 'losing'} trade than your overall median position size. Median time to the next entry: ${minutesLabel(seq.medianMinutesToNext) ?? 'not recorded'}.`
      : `Recorded across ${seq.sample} occurrences — below the ${MIN_SAMPLE_FOR_DIRECTIONAL_CLAIM} URSORA requires before describing a direction.`,
    baseline_value: baseline.medianPositionSize,
    current_value: seq.medianNextSize,
    deviation_pct: dev,
    unit: 'USD',
    sample_size: seq.sample,
    observation_period: `${seq.sample} sequential pairs`,
    confidence_label: confidenceFor(seq.sample),
    construct_key: 'house_money_effect',
    evidence_trade_ids: [],
    severity: directional && Math.abs(dev) >= 40 ? 'MODERATE' : 'LOW',
    model_version: MODEL_VERSION,
    formula:
      'Order all trades by entry time. For each closed trade with the requested outcome sign, take the immediately following trade and record its position size, opportunity score and minutes since the prior exit. Report the median of those values against the all-trade median position size.',
  };
}

export function sizeObservation(trade: TradeRecord, baseline: Baseline, sensitivity: Sensitivity): Observation | null {
  const size = positionSize(trade);
  if (size === null || baseline.medianPositionSize === null || baseline.medianPositionSize === 0) return null;
  const ratio = size / baseline.medianPositionSize;
  const factor = sensitivityFactor(sensitivity);
  if (ratio < DEVIATION.sizeMultipleNotable * factor) return null;
  const sev = ratio >= DEVIATION.sizeMultipleHigh * factor ? 'HIGH' : ratio >= DEVIATION.sizeMultipleElevated * factor ? 'ELEVATED' : 'MODERATE';
  return {
    observation_type: 'position_size_deviation',
    category: 'sizing',
    statement: `Position size is ${multiple(ratio)} your median position size over the measured window (${signedMoney(size)?.replace('+', '') ?? ''} against a median of ${signedMoney(baseline.medianPositionSize)?.replace('+', '') ?? ''}).`,
    baseline_value: baseline.medianPositionSize,
    current_value: size,
    deviation_pct: deviationPct(size, baseline.medianPositionSize),
    unit: 'USD',
    sample_size: baseline.sampleSize,
    observation_period: `${baseline.sampleSize} trades`,
    confidence_label: confidenceFor(baseline.sampleSize),
    construct_key: 'house_money_effect',
    evidence_trade_ids: [trade.id],
    severity: sev,
    trade_id: trade.id,
    model_version: MODEL_VERSION,
    formula: 'position_size ÷ median(position_size across the baseline window). Position size is entry price × contracts × 100 where not stored directly.',
  };
}

export function frequencyObservation(session: SessionSummary, baseline: Baseline, sensitivity: Sensitivity): Observation | null {
  const med = baseline.tradesPerSessionMedian;
  if (!med || med <= 0 || baseline.sessions < 5) return null;
  const ratio = session.trades.length / med;
  if (ratio < DEVIATION.frequencyMultipleNotable * sensitivityFactor(sensitivity)) return null;
  return {
    observation_type: 'session_frequency_deviation',
    category: 'frequency',
    statement: `${session.trades.length} trades this session against a median session of ${med} (${multiple(ratio)}). Your 90th-percentile session is ${percentile([...Array(baseline.sessions)].map(() => med), 90) ?? med}.`,
    baseline_value: med,
    current_value: session.trades.length,
    deviation_pct: deviationPct(session.trades.length, med),
    unit: 'trades',
    sample_size: baseline.sessions,
    observation_period: `${baseline.sessions} sessions`,
    confidence_label: confidenceFor(baseline.sessions),
    construct_key: 'overtrading',
    evidence_trade_ids: session.trades.map((t) => t.id),
    severity: ratio >= DEVIATION.frequencyMultipleElevated ? 'ELEVATED' : 'MODERATE',
    session_date: session.sessionDate,
    model_version: MODEL_VERSION,
    formula: 'session trade count ÷ median(trade count per session) across all recorded sessions for this account.',
  };
}

export function givebackObservation(session: SessionSummary, sensitivity: Sensitivity): Observation | null {
  if (session.highWaterPl <= 0 || session.givebackPct === null) return null;
  const frac = session.givebackPct / 100;
  if (frac < DEVIATION.givebackFractionNotable * sensitivityFactor(sensitivity)) return null;
  return {
    observation_type: 'session_giveback',
    category: 'giveback',
    statement: `Session P/L is ${signedMoney(session.finalPl)} against a session high of ${signedMoney(session.highWaterPl)} — ${session.givebackPct}% of the high given back across ${session.tradesAfterHighWater} trades since.`,
    baseline_value: session.highWaterPl,
    current_value: session.finalPl,
    deviation_pct: -session.givebackPct,
    unit: 'USD',
    sample_size: session.closedCount,
    observation_period: 'current session',
    confidence_label: confidenceFor(session.closedCount),
    construct_key: 'session_giveback',
    evidence_trade_ids: session.trades.map((t) => t.id),
    severity: frac >= DEVIATION.givebackFractionElevated ? 'ELEVATED' : 'MODERATE',
    session_date: session.sessionDate,
    model_version: MODEL_VERSION,
    formula: '(session high-water P/L − current session P/L) ÷ session high-water P/L, using realised P/L on closed trades ordered by entry time.',
  };
}

export function rapidReentryObservation(session: SessionSummary, sensitivity: Sensitivity): Observation | null {
  if (session.rapidReentries < 2) return null;
  return {
    observation_type: 'rapid_reentry',
    category: 'rapid_reentry',
    statement: `${session.rapidReentries} entries this session occurred within ${DEVIATION.rapidReentryMinutes} minutes of closing the previous position.`,
    baseline_value: DEVIATION.rapidReentryMinutes,
    current_value: session.rapidReentries,
    deviation_pct: null,
    unit: 'entries',
    sample_size: session.trades.length,
    observation_period: 'current session',
    confidence_label: confidenceFor(session.trades.length),
    construct_key: 'reference_dependence',
    evidence_trade_ids: session.trades.map((t) => t.id),
    severity: session.rapidReentries >= 4 * sensitivityFactor(sensitivity) ? 'ELEVATED' : 'MODERATE',
    session_date: session.sessionDate,
    model_version: MODEL_VERSION,
    formula: `Count of entries where (entry time − previous exit time) ≤ ${DEVIATION.rapidReentryMinutes} minutes, within one session.`,
  };
}

export function setupQualityObservation(session: SessionSummary, baseline: Baseline): Observation | null {
  if (session.avgScore === null || baseline.medianEntryScore === null || session.trades.length < 2) return null;
  const drop = baseline.medianEntryScore - session.avgScore;
  if (drop < DEVIATION.qualityDropPoints) return null;
  return {
    observation_type: 'entry_quality_deviation',
    category: 'low_quality_setup',
    statement: `Average opportunity score on this session's entries is ${session.avgScore.toFixed(0)} against your median entry score of ${baseline.medianEntryScore.toFixed(0)} — ${drop.toFixed(0)} points lower.`,
    baseline_value: baseline.medianEntryScore,
    current_value: session.avgScore,
    deviation_pct: deviationPct(session.avgScore, baseline.medianEntryScore),
    unit: 'score',
    sample_size: baseline.sampleSize,
    observation_period: `${baseline.sampleSize} trades`,
    confidence_label: confidenceFor(baseline.sampleSize),
    construct_key: 'attention_driven_entry',
    evidence_trade_ids: session.trades.map((t) => t.id),
    severity: drop >= 20 ? 'ELEVATED' : 'MODERATE',
    session_date: session.sessionDate,
    model_version: MODEL_VERSION,
    formula: 'median(opportunity_score at entry, all trades) − mean(opportunity_score at entry, this session).',
  };
}

export function unplannedObservation(session: SessionSummary): Observation | null {
  if (session.unplannedCount < 2) return null;
  return {
    observation_type: 'unplanned_trades',
    category: 'unplanned_trade',
    statement: `${session.unplannedCount} of ${session.trades.length} entries this session have no stored pre-entry plan.`,
    baseline_value: session.trades.length,
    current_value: session.unplannedCount,
    deviation_pct: round2((session.unplannedCount / Math.max(1, session.trades.length)) * 100),
    unit: 'trades',
    sample_size: session.trades.length,
    observation_period: 'current session',
    confidence_label: confidenceFor(session.trades.length),
    construct_key: 'attention_driven_entry',
    evidence_trade_ids: session.trades.filter((t) => t.was_planned === false).map((t) => t.id),
    severity: session.unplannedCount >= 4 ? 'ELEVATED' : 'MODERATE',
    session_date: session.sessionDate,
    model_version: MODEL_VERSION,
    formula: 'Count of session trades with was_planned = false or no linked trade_plan_id.',
  };
}

/* -------------------------------------------------------------------------- */
/*  PHASE G — PLAN DEVIATION + PROCESS ADHERENCE                              */
/*  Profitability is not an input and must never become one.                  */
/* -------------------------------------------------------------------------- */

export function assessAdherence(
  trade: TradeRecord,
  plan: { intended_entry_low: number | null; intended_entry_high: number | null; intended_invalidation: number | null; intended_target: number | null; intended_position_size: number | null; setup: string | null } | null,
  mods: TradeModification[] = [],
): AdherenceResult {
  const components: AdherenceResult['components'] = [];
  const deviations: AdherenceResult['deviations'] = [];
  const W = ADHERENCE_WEIGHTS;

  // 1. Planned entry
  const entry = trade.entry_price;
  if (plan && plan.intended_entry_low !== null && plan.intended_entry_high !== null && entry !== null) {
    const inZone = entry >= plan.intended_entry_low && entry <= plan.intended_entry_high;
    components.push({
      key: 'planned_entry', label: 'Planned entry adherence', earned: inZone ? W.planned_entry : 0, possible: W.planned_entry,
      note: inZone ? 'Entry price fell inside the stored entry zone.' : `Entry at ${signedMoney(entry)?.replace('+', '')} was outside the stored zone.`,
    });
    if (!inZone) deviations.push({ type: 'entered_after_zone', label: 'Entered materially after the intended entry zone', detail: `Zone ${plan.intended_entry_low}–${plan.intended_entry_high}, filled at ${entry}.` });
  } else {
    components.push({ key: 'planned_entry', label: 'Planned entry adherence', earned: 0, possible: W.planned_entry, note: 'No stored entry zone to measure against.' });
    if (!plan) deviations.push({ type: 'no_stored_plan', label: 'Traded a ticker with no stored plan', detail: 'No pre-entry plan record is linked to this trade.' });
  }

  // 2. Size adherence
  const size = positionSize(trade);
  if (plan?.intended_position_size && size !== null) {
    const ratio = size / plan.intended_position_size;
    const ok = ratio <= 1.15;
    components.push({
      key: 'size_adherence', label: 'Size adherence', earned: ok ? W.size_adherence : Math.max(0, Math.round(W.size_adherence * (1 - Math.min(1, ratio - 1)))), possible: W.size_adherence,
      note: ok ? 'Position size was at or below the planned size.' : `Size was ${multiple(ratio)} the planned size.`,
    });
    if (!ok) deviations.push({ type: 'size_beyond_plan', label: 'Size beyond the planned size', detail: `Planned ${signedMoney(plan.intended_position_size)?.replace('+', '')}, taken ${signedMoney(size)?.replace('+', '')}.` });
  } else {
    components.push({ key: 'size_adherence', label: 'Size adherence', earned: 0, possible: W.size_adherence, note: 'No planned position size stored.' });
  }

  // 3. Invalidation adherence — the heaviest single weight.
  const invalidationMods = mods.filter((m) => m.field_changed === 'intended_invalidation' || m.deviation_type === 'invalidation_widened' || m.deviation_type === 'invalidation_removed');
  const hasInvalidation = (plan?.intended_invalidation ?? trade.intended_invalidation) !== null;
  const invalidationClean = hasInvalidation && invalidationMods.length === 0;
  components.push({
    key: 'invalidation_adherence', label: 'Invalidation adherence',
    earned: invalidationClean ? W.invalidation_adherence : hasInvalidation ? Math.max(0, W.invalidation_adherence - invalidationMods.length * 10) : 0,
    possible: W.invalidation_adherence,
    note: !hasInvalidation ? 'No invalidation level was recorded before entry.' : invalidationClean ? 'The original invalidation level was left in place.' : `${invalidationMods.length} change(s) to the invalidation level after entry.`,
  });
  for (const m of invalidationMods) {
    deviations.push({
      type: m.deviation_type ?? 'invalidation_widened',
      label: m.deviation_type === 'invalidation_removed' ? 'Invalidation removed' : 'Invalidation moved farther away',
      detail: `${m.previous_value ?? 'not recorded'} → ${m.new_value ?? 'removed'}.`,
    });
  }

  // 4. Target / process
  const targetMods = mods.filter((m) => m.field_changed === 'intended_target');
  const hasTarget = (plan?.intended_target ?? trade.intended_target) !== null;
  components.push({
    key: 'target_process', label: 'Target and exit process', earned: hasTarget && targetMods.length === 0 ? W.target_process : hasTarget ? Math.round(W.target_process / 2) : 0, possible: W.target_process,
    note: !hasTarget ? 'No target was recorded before entry.' : targetMods.length ? `${targetMods.length} target change(s) after entry.` : 'The original target was left in place.',
  });

  // 5. Setup adherence
  const setupMatch = !plan?.setup || !trade.setup ? null : plan.setup === trade.setup;
  components.push({
    key: 'setup_adherence', label: 'Setup adherence', earned: setupMatch === true ? W.setup_adherence : setupMatch === false ? 0 : Math.round(W.setup_adherence / 2), possible: W.setup_adherence,
    note: setupMatch === null ? 'Setup was not recorded on both the plan and the trade.' : setupMatch ? 'Executed setup matched the planned setup.' : `Planned ${plan?.setup}, executed ${trade.setup}.`,
  });
  if (setupMatch === false) deviations.push({ type: 'outside_strategy_rules', label: 'Outside the stated strategy rules', detail: `Planned ${plan?.setup}, executed ${trade.setup}.` });

  // 6. Unplanned penalty
  const planned = trade.was_planned !== false && plan !== null;
  components.push({
    key: 'unplanned_penalty', label: 'Pre-entry plan present', earned: planned ? W.unplanned_penalty : 0, possible: W.unplanned_penalty,
    note: planned ? 'A pre-entry plan was stored before the entry.' : 'This entry was recorded without a pre-entry plan.',
  });

  const possible = components.reduce((a, c) => a + c.possible, 0);
  const earned = components.reduce((a, c) => a + c.earned, 0);
  const score = possible ? Math.round((earned / possible) * 100) : 0;

  // PHASE G — outcome vs process, all four cases explicit.
  let quadrant: ProcessOutcomeQuadrant | null = null;
  let quadrantNote: string | null = null;
  if (isClosed(trade)) {
    const pl = tradePl(trade);
    const goodProcess = score >= 70;
    const goodOutcome = (pl ?? 0) > 0;
    quadrant = goodProcess
      ? goodOutcome ? 'GOOD PROCESS + GOOD OUTCOME' : 'GOOD PROCESS + BAD OUTCOME'
      : goodOutcome ? 'BAD PROCESS + GOOD OUTCOME' : 'BAD PROCESS + BAD OUTCOME';
    quadrantNote =
      quadrant === 'GOOD PROCESS + GOOD OUTCOME'
        ? 'The trade followed the stored plan and produced a gain. Both are recorded separately because one does not establish the other.'
        : quadrant === 'GOOD PROCESS + BAD OUTCOME'
          ? 'The trade followed the stored plan and still lost. A losing outcome on an adhered plan is an expected part of any positive-expectancy process.'
          : quadrant === 'BAD PROCESS + GOOD OUTCOME'
            ? 'Profitable outcome, but the trade materially departed from the original plan. The gain does not validate the departure.'
            : 'The trade departed from the stored plan and lost. Process and outcome are reported separately; only the process part is under direct control.';
  }

  return { score, components, deviations, quadrant, quadrantNote, model_version: MODEL_VERSION };
}

/* -------------------------------------------------------------------------- */
/*  PHASE H — BEHAVIOURAL RISK ENGINE                                         */
/*  Deterministic. Never consults an LLM. Never touches market assessment.    */
/* -------------------------------------------------------------------------- */

const SEVERITY_POINTS: Record<Observation['severity'], number> = { LOW: 4, MODERATE: 10, ELEVATED: 20, HIGH: 32 };

export function assessBehavioralRisk(observations: Observation[], enabled: Set<string> | null = null): BehavioralRisk {
  const usable = observations.filter((o) => (enabled ? enabled.has(o.category) : true));
  const factors: BehavioralRiskFactor[] = usable.map((o) => ({
    key: o.observation_type,
    label: o.statement,
    points: SEVERITY_POINTS[o.severity],
    observation: o,
  }));
  const points = Math.min(100, factors.reduce((a, f) => a + f.points, 0));
  const band = bandFor(points);
  return {
    band,
    points,
    factors: factors.sort((a, b) => b.points - a.points),
    model_version: MODEL_VERSION,
    note: factors.length
      ? 'Behavioural risk describes observable deviation from your own plan and baseline. It is computed separately from market opportunity and thesis health, and does not change either.'
      : 'No reliable deviation detected against your recorded baseline for this session. This is a measurement, not an endorsement of any individual trade.',
  };
}

/* -------------------------------------------------------------------------- */
/*  Orchestration — the full deterministic pass for one trader                */
/* -------------------------------------------------------------------------- */

export interface TraderIntelligence {
  baseline: Baseline;
  sessions: SessionSummary[];
  today: SessionSummary | null;
  observations: Observation[];
  risk: BehavioralRisk;
  patterns: Observation[];
  hasEnoughData: boolean;
}

export function computeTraderIntelligence(
  trades: TradeRecord[],
  opts: { sensitivity?: Sensitivity; enabledCategories?: Set<string> | null; todayKey?: string } = {},
): TraderIntelligence {
  const sensitivity = opts.sensitivity ?? 'STANDARD';
  const baseline = buildBaseline(trades);
  const sessions = groupSessions(trades);
  const todayKey = opts.todayKey ?? sessionDateKey(new Date().toISOString());
  const today = sessions.find((s) => s.sessionDate === todayKey) ?? sessions[0] ?? null;

  const sessionObs: Observation[] = [];
  if (today) {
    for (const o of [
      givebackObservation(today, sensitivity),
      frequencyObservation(today, baseline, sensitivity),
      rapidReentryObservation(today, sensitivity),
      setupQualityObservation(today, baseline),
      unplannedObservation(today),
    ]) if (o) sessionObs.push(o);
    const openOrLatest = today.trades.slice().sort(byEntryAsc).reverse()[0];
    if (openOrLatest) {
      const so = sizeObservation(openOrLatest, baseline, sensitivity);
      if (so) sessionObs.push(so);
    }
  }

  const patterns: Observation[] = [];
  for (const o of [
    highWaterFinding(sessions),
    sequenceFinding(baseline, 'win'),
    sequenceFinding(baseline, 'loss'),
  ]) if (o) patterns.push(o);

  return {
    baseline,
    sessions,
    today,
    observations: sessionObs,
    risk: assessBehavioralRisk(sessionObs, opts.enabledCategories ?? null),
    patterns,
    hasEnoughData: baseline.sampleSize > 0,
  };
}
