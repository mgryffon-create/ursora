import type { TraderProfile } from '@/lib/types';
import type { Baseline, TradeCycleThesisEvent, TradeRecord } from '@/lib/behavioral/types';
import { holdingMinutes, isClosed, tradePl } from '@/lib/behavioral/engine';

export type ProfileContextCategory = 'baseline' | 'process' | 'patterns';
export type ProfileContextStatus = 'ALIGNED' | 'MIXED' | 'DIVERGENT' | 'INSUFFICIENT DATA' | 'PROFILE ONLY';

export interface ProfileContextInsight {
  key: string;
  category: ProfileContextCategory;
  profileSignal: string;
  observed: string;
  status: ProfileContextStatus;
  detail: string;
  sample: number;
  evidenceTradeIds: number[];
  contextItems?: Array<{ label: string; value: string }>;
}

const STYLE_LABELS: Record<string, string> = {
  '0dte': '0DTE / same-day',
  intraday: 'Intraday',
  swing_1_5d: 'Swing · 1–5 days',
  short_term_1_4w: 'Short-term · 1–4 weeks',
  long_term: 'Long-term',
};

const TRADE_TYPE_LABELS: Record<string, string> = {
  long_calls: 'Long calls',
  long_puts: 'Long puts',
  shares: 'Shares',
  debit_spreads: 'Debit spreads',
  credit_spreads: 'Credit spreads',
  covered_calls: 'Covered calls',
  cash_secured_puts: 'Cash-secured puts',
  other: 'Other',
};

const GOAL_LABELS: Record<string, string> = {
  grow_capital: 'Grow capital',
  income: 'Generate income',
  consistency: 'Build consistency',
  discipline: 'Reduce impulsive trading',
  repeatable_process: 'Build a repeatable process',
  hedge: 'Protect / hedge a portfolio',
};

const URSORA_LABELS: Record<string, string> = {
  find_setups: 'Find setups',
  choose_contracts: 'Choose contracts',
  stay_disciplined: 'Stay disciplined',
  thesis_weakening: 'Track thesis weakening',
  understand_habits: 'Understand my habits',
  position_sizing: 'Improve position sizing',
  reduce_overtrading: 'Reduce overtrading',
  review_what_works: 'Review what works',
};

const HABIT_LABELS: Record<string, string> = {
  hold_losers: 'Hold losers too long',
  exit_winners_early: 'Exit winners too early',
  overtrade: 'Overtrade',
  size_up_emotionally: 'Size up emotionally',
  revenge_trade: 'Revenge trade',
  reenter_quickly: 'Re-enter too quickly',
  chase_moves: 'Chase moves',
  ignore_invalidation: 'Ignore invalidation',
  none_unsure: 'None / not sure',
};

const label = (value: string, map: Record<string, string>) => map[value] ?? value.replaceAll('_', ' ');

const styleForHold = (minutes: number | null): string | null => {
  if (minutes === null) return null;
  if (minutes <= 390) return 'intraday';
  if (minutes <= 5 * 24 * 60) return 'swing_1_5d';
  if (minutes <= 28 * 24 * 60) return 'short_term_1_4w';
  return 'long_term';
};

const tradeTypeFor = (trade: TradeRecord): string => {
  const strategy = String(trade.strategy ?? trade.setup ?? '').toLowerCase();
  const asset = String(trade.asset_type ?? '').toLowerCase();
  if (asset.includes('stock') || asset.includes('equity') || (!trade.option_type && !trade.expiration)) return 'shares';
  if (strategy.includes('debit') && strategy.includes('spread')) return 'debit_spreads';
  if (strategy.includes('credit') && strategy.includes('spread')) return 'credit_spreads';
  if (strategy.includes('covered') && strategy.includes('call')) return 'covered_calls';
  if ((strategy.includes('cash') || strategy.includes('secured')) && strategy.includes('put')) return 'cash_secured_puts';
  if (String(trade.option_type ?? '').toLowerCase() === 'call') return 'long_calls';
  if (String(trade.option_type ?? '').toLowerCase() === 'put') return 'long_puts';
  return 'other';
};

const currentMonthPl = (trades: TradeRecord[]) => {
  const now = new Date();
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  return trades.filter(isClosed).reduce((sum, trade) => {
    const when = new Date(trade.exit_at ?? trade.closed_at ?? trade.created_at);
    if (when.getUTCMonth() !== month || when.getUTCFullYear() !== year) return sum;
    return sum + (tradePl(trade) ?? 0);
  }, 0);
};

const statusFromShare = (share: number, aligned = 0.7, mixed = 0.45): ProfileContextStatus =>
  share >= aligned ? 'ALIGNED' : share >= mixed ? 'MIXED' : 'DIVERGENT';

export function deriveProfileContext(
  profile: TraderProfile | null,
  trades: TradeRecord[],
  baseline: Baseline,
  thesisEvents: TradeCycleThesisEvent[] = [],
): ProfileContextInsight[] {
  if (!profile) return [];
  const insights: ProfileContextInsight[] = [];
  const closed = trades.filter(isClosed);
  const losingClosed = closed.filter((trade) => (tradePl(trade) ?? 0) < 0);

  const eventsByTrade = new Map<number, TradeCycleThesisEvent[]>();
  for (const event of thesisEvents) {
    const list = eventsByTrade.get(event.trade_id) ?? [];
    list.push(event);
    eventsByTrade.set(event.trade_id, list);
  }

  const invalidationEpisodes = trades.filter((trade) => {
    const exitAt = trade.exit_at ?? trade.closed_at;
    if (!exitAt) return false;
    const exitMs = new Date(exitAt).getTime();
    return (eventsByTrade.get(trade.id) ?? []).some((event) => {
      const state = String(event.thesis_state ?? '').toLowerCase();
      const invalidated = state === 'rejected' || state === 'unsupported' || state.includes('invalidat');
      const eventMs = new Date(event.created_at).getTime();
      return invalidated && Number.isFinite(eventMs) && eventMs < exitMs;
    });
  });

  const supportedExitEpisodes = closed.filter((trade) => {
    const exitAt = trade.exit_at ?? trade.closed_at;
    if (!exitAt) return false;
    const exitMs = new Date(exitAt).getTime();
    const prior = (eventsByTrade.get(trade.id) ?? [])
      .filter((event) => new Date(event.created_at).getTime() <= exitMs)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const state = String(prior?.thesis_state ?? '').toLowerCase();
    return state === 'supported' || state === 'strongly supported';
  });

  // BASELINE: intended trading horizons vs observed holding behavior.
  if (profile.trading_styles.length) {
    const withHold = closed
      .map((trade) => ({ trade, minutes: holdingMinutes(trade) }))
      .filter((row): row is { trade: TradeRecord; minutes: number } => row.minutes !== null);

    if (!withHold.length) {
      insights.push({
        key: 'trading_style',
        category: 'baseline',
        profileSignal: profile.trading_styles.map((v) => label(v, STYLE_LABELS)).join(' · '),
        observed: 'No closed trades with measurable hold time',
        status: 'INSUFFICIENT DATA',
        detail: 'Brokerage history will let URSORA compare the time horizons you selected with how long positions are actually held.',
        sample: 0,
        evidenceTradeIds: [],
      });
    } else {
      const matched = withHold.filter(({ minutes }) => {
        const inferred = styleForHold(minutes);
        return inferred !== null && profile.trading_styles.includes(inferred);
      });
      const share = matched.length / withHold.length;
      const inferredTypical = styleForHold(baseline.medianHoldingMinutes);
      insights.push({
        key: 'trading_style',
        category: 'baseline',
        profileSignal: profile.trading_styles.map((v) => label(v, STYLE_LABELS)).join(' · '),
        observed: inferredTypical ? `Typical hold resembles ${label(inferredTypical, STYLE_LABELS)}` : 'Hold time not established',
        status: statusFromShare(share),
        detail: `${Math.round(share * 100)}% of measurable closed trades fall inside one of your stated trading horizons.`,
        sample: withHold.length,
        evidenceTradeIds: withHold.map((row) => row.trade.id).slice(0, 200),
      });
    }
  }

  // BASELINE: preferred structures vs structures actually used.
  if (profile.trade_types.length) {
    const typed = trades.map((trade) => ({ trade, type: tradeTypeFor(trade) }));
    if (!typed.length) {
      insights.push({
        key: 'trade_types',
        category: 'baseline',
        profileSignal: profile.trade_types.map((v) => label(v, TRADE_TYPE_LABELS)).join(' · '),
        observed: 'No brokerage or recorded trade history yet',
        status: 'INSUFFICIENT DATA',
        detail: 'Connected trade activity will show whether the structures you actually use match the structures you say you prefer.',
        sample: 0,
        evidenceTradeIds: [],
      });
    } else {
      const matched = typed.filter(({ type }) => profile.trade_types.includes(type));
      const counts = new Map<string, number>();
      typed.forEach(({ type }) => counts.set(type, (counts.get(type) ?? 0) + 1));
      const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
      insights.push({
        key: 'trade_types',
        category: 'baseline',
        profileSignal: profile.trade_types.map((v) => label(v, TRADE_TYPE_LABELS)).join(' · '),
        observed: `Most recorded activity: ${label(common, TRADE_TYPE_LABELS)}`,
        status: statusFromShare(matched.length / typed.length),
        detail: `${Math.round((matched.length / typed.length) * 100)}% of recorded trades use a structure listed in MyURSORA.`,
        sample: typed.length,
        evidenceTradeIds: typed.map(({ trade }) => trade.id).slice(0, 200),
      });
    }
  }

  // PROCESS: explicit max-loss preference vs realized closed-trade losses.
  if (profile.max_loss_type !== 'none' && profile.max_loss_value !== null) {
    if (profile.max_loss_type === 'dollar') {
      const losses = closed
        .map((trade) => ({ trade, pl: tradePl(trade) }))
        .filter((row): row is { trade: TradeRecord; pl: number } => row.pl !== null && row.pl < 0);
      if (!losses.length) {
        insights.push({
          key: 'max_loss',
          category: 'process',
          profileSignal: `Max loss: $${profile.max_loss_value} per trade`,
          observed: 'No realized losing trades to compare',
          status: 'INSUFFICIENT DATA',
          detail: 'This comparison uses realized loss only; it does not claim the stated amount was the planned risk on a trade.',
          sample: 0,
          evidenceTradeIds: [],
        });
      } else {
        const within = losses.filter(({ pl }) => Math.abs(pl) <= Number(profile.max_loss_value));
        insights.push({
          key: 'max_loss',
          category: 'process',
          profileSignal: `Max loss: $${profile.max_loss_value} per trade`,
          observed: `${within.length} of ${losses.length} realized losses stayed within that amount`,
          status: statusFromShare(within.length / losses.length, 0.8, 0.6),
          detail: 'Realized-loss consistency is shown separately from whether the trade itself was good or bad.',
          sample: losses.length,
          evidenceTradeIds: losses.map(({ trade }) => trade.id).slice(0, 200),
        });
      }
    } else {
      insights.push({
        key: 'max_loss_percent',
        category: 'process',
        profileSignal: `Max loss: ${profile.max_loss_value}%`,
        observed: 'Account-equity context required',
        status: 'PROFILE ONLY',
        detail: 'Once brokerage balances are connected, URSORA can compare risk as a percentage of account value without estimating the denominator.',
        sample: 0,
        evidenceTradeIds: [],
      });
    }
  }

  // PROCESS: repeatable-process / discipline goals vs planning consistency.
  if (profile.primary_goals.some((goal) => ['consistency', 'discipline', 'repeatable_process'].includes(goal))
      || profile.ursora_goals.includes('stay_disciplined')) {
    const desired = [
      ...profile.primary_goals.filter((goal) => ['consistency', 'discipline', 'repeatable_process'].includes(goal)).map((v) => label(v, GOAL_LABELS)),
      ...(profile.ursora_goals.includes('stay_disciplined') ? [label('stay_disciplined', URSORA_LABELS)] : []),
    ];
    if (!trades.length || baseline.plannedSharePct === null) {
      insights.push({
        key: 'process_consistency',
        category: 'process',
        profileSignal: desired.join(' · '),
        observed: 'Planning consistency not established',
        status: 'INSUFFICIENT DATA',
        detail: 'Brokerage trades linked to URSORA plans will let this compare stated process goals with observed plan usage and adherence.',
        sample: trades.length,
        evidenceTradeIds: trades.map((trade) => trade.id).slice(0, 200),
      });
    } else {
      insights.push({
        key: 'process_consistency',
        category: 'process',
        profileSignal: desired.join(' · '),
        observed: `${baseline.plannedSharePct}% of recorded trades are planned`,
        status: baseline.plannedSharePct >= 80 ? 'ALIGNED' : baseline.plannedSharePct >= 55 ? 'MIXED' : 'DIVERGENT',
        detail: 'Planning share is a process measure only. Profitability is not used to decide whether this behavior matches your stated process goal.',
        sample: trades.length,
        evidenceTradeIds: trades.map((trade) => trade.id).slice(0, 200),
      });
    }
  }

  // PROCESS: stated profit target vs recorded result, when mathematically comparable.
  if (profile.profit_target_type !== 'none' && profile.profit_target_value !== null) {
    let observed: number | null = null;
    let unit = '$';
    if (profile.profit_target_type === 'monthly_dollar') observed = currentMonthPl(trades);
    if (profile.profit_target_type === 'per_trade_dollar' && baseline.expectancy !== null) observed = baseline.expectancy;
    if (profile.profit_target_type === 'per_trade_percent') {
      const returns = closed.map((trade) => Number(trade.return_pct)).filter(Number.isFinite);
      observed = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
      unit = '%';
    }
    if (profile.profit_target_type === 'weekly_dollar') {
      // Avoid inventing a weekly result until a dedicated period aggregation is available.
      observed = null;
    }
    insights.push({
      key: 'profit_target',
      category: 'process',
      profileSignal: `Target: ${unit}${profile.profit_target_value} · ${profile.profit_target_type.replaceAll('_', ' ')}`,
      observed: observed === null ? 'Comparable result not available yet' : `${unit}${observed.toFixed(2)} observed`,
      status: observed === null ? 'INSUFFICIENT DATA' : observed >= Number(profile.profit_target_value) ? 'ALIGNED' : 'MIXED',
      detail: 'Target comparison is descriptive. URSORA does not encourage additional trading to reach a target.',
      sample: closed.length,
      evidenceTradeIds: closed.map((trade) => trade.id).slice(0, 200),
    });
  }

  // PATTERNS: self-reported habits tested against measurable proxies.
  for (const habit of profile.self_reported_habits.filter((value) => value !== 'none_unsure')) {
    let observed = 'No reliable trade-data test is available yet';
    let status: ProfileContextStatus = 'INSUFFICIENT DATA';
    let detail = 'MyURSORA records this as a hypothesis about your own behavior until enough observable trade data exists.';
    let sample = trades.length;
    let ids = trades.map((trade) => trade.id).slice(0, 200);
    const contextItems: Array<{ label: string; value: string }> = [];

    if (habit === 'hold_losers') {
      if (invalidationEpisodes.length > 0) {
        observed = `${invalidationEpisodes.length} episode${invalidationEpisodes.length === 1 ? '' : 's'} following thesis invalidation`;
        status = invalidationEpisodes.length >= 3 ? 'ALIGNED' : 'MIXED';
        detail = 'These are positions that remained open after URSORA recorded the directional thesis as unsupported or rejected. Outcome is not used to define the behavior.';
        sample = invalidationEpisodes.length;
        ids = invalidationEpisodes.map((trade) => trade.id).slice(0, 200);
        contextItems.push({ label: 'After invalidation', value: `${invalidationEpisodes.length} episodes` });
      } else if (baseline.medianHoldingLosersMin !== null && baseline.medianHoldingWinnersMin !== null) {
        const ratio = baseline.medianHoldingWinnersMin > 0
          ? baseline.medianHoldingLosersMin / baseline.medianHoldingWinnersMin
          : null;
        observed = `Median loser hold ${Math.round(baseline.medianHoldingLosersMin)}m vs winner ${Math.round(baseline.medianHoldingWinnersMin)}m`;
        status = ratio !== null && ratio >= 1.25 ? 'ALIGNED' : ratio !== null && ratio <= 0.9 ? 'DIVERGENT' : 'MIXED';
        detail = status === 'ALIGNED'
          ? 'Your recorded holding-time history currently supports the habit you identified.'
          : status === 'DIVERGENT'
            ? 'Your recorded holding-time history currently does not support the habit you identified.'
            : 'The holding-time difference is not large enough for a clear confirmation or contradiction.';
        sample = losingClosed.length;
        ids = losingClosed.map((trade) => trade.id).slice(0, 200);
      }
      if (baseline.medianHoldingLosersMin !== null) {
        contextItems.push({ label: 'Median loser hold', value: `${Math.round(baseline.medianHoldingLosersMin)}m` });
      }
      if (baseline.medianHoldingWinnersMin !== null) {
        contextItems.push({ label: 'Median winner hold', value: `${Math.round(baseline.medianHoldingWinnersMin)}m` });
      }
    }

    if (habit === 'reenter_quickly' && baseline.afterLoss.sample >= 3 && baseline.afterLoss.medianMinutesToNext !== null) {
      observed = `Typical next entry after a loss: ${Math.round(baseline.afterLoss.medianMinutesToNext)} minutes`;
      status = baseline.afterLoss.medianMinutesToNext <= 10 ? 'ALIGNED'
        : baseline.afterLoss.medianMinutesToNext <= 30 ? 'MIXED' : 'DIVERGENT';
      detail = status === 'ALIGNED'
        ? 'The recorded sequence currently supports your self-reported rapid re-entry pattern.'
        : 'The recorded sequence does not currently show a strong rapid re-entry pattern.';
      sample = baseline.afterLoss.sample;
    }

    if (habit === 'size_up_emotionally' && baseline.afterLoss.sample >= 3 && baseline.afterLoss.medianNextSize !== null && baseline.medianPositionSize !== null) {
      const ratio = baseline.medianPositionSize > 0 ? baseline.afterLoss.medianNextSize / baseline.medianPositionSize : null;
      observed = ratio === null ? 'Sizing comparison unavailable' : `Post-loss median size is ${ratio.toFixed(2)}× typical size`;
      status = ratio !== null && ratio >= 1.2 ? 'ALIGNED' : ratio !== null && ratio <= 1.05 ? 'DIVERGENT' : 'MIXED';
      detail = 'URSORA can observe sizing after losses; it does not infer an emotion or motive from that behavior.';
      sample = baseline.afterLoss.sample;
    }

    if (habit === 'exit_winners_early') {
      const winningSupportedExits = supportedExitEpisodes.filter((trade) => (tradePl(trade) ?? 0) > 0);
      if (winningSupportedExits.length) {
        observed = `${winningSupportedExits.length} profitable exit${winningSupportedExits.length === 1 ? '' : 's'} while thesis evidence was still supportive`;
        status = winningSupportedExits.length >= 3 ? 'ALIGNED' : 'MIXED';
        detail = 'This does not mean the exit was wrong. It identifies episodes where the position was closed while the latest recorded directional evidence still supported the thesis.';
        sample = winningSupportedExits.length;
        ids = winningSupportedExits.map((trade) => trade.id).slice(0, 200);
      }
      contextItems.push({ label: 'Supported-thesis exits', value: `${winningSupportedExits.length} episodes` });
    }

    if (habit === 'overtrade') {
      contextItems.push({ label: 'Typical trades / session', value: baseline.tradesPerSessionMedian === null ? 'Not established' : String(baseline.tradesPerSessionMedian) });
      contextItems.push({ label: 'Mean trades / session', value: baseline.tradesPerSessionMean === null ? 'Not established' : String(baseline.tradesPerSessionMean) });
    }

    if (habit === 'reenter_quickly' || habit === 'revenge_trade') {
      if (baseline.afterLoss.medianMinutesToNext !== null) {
        contextItems.push({ label: 'After-loss re-entry', value: `${Math.round(baseline.afterLoss.medianMinutesToNext)}m median` });
      }
      contextItems.push({ label: 'Measured sequences', value: String(baseline.afterLoss.sample) });
    }

    if (habit === 'size_up_emotionally') {
      if (baseline.afterLoss.medianNextSize !== null) {
        contextItems.push({ label: 'Post-loss median size', value: `${Math.round(baseline.afterLoss.medianNextSize)}` });
      }
      if (baseline.medianPositionSize !== null) {
        contextItems.push({ label: 'Typical median size', value: `${Math.round(baseline.medianPositionSize)}` });
      }
    }

    if (habit === 'ignore_invalidation') {
      observed = invalidationEpisodes.length
        ? `${invalidationEpisodes.length} episode${invalidationEpisodes.length === 1 ? '' : 's'} remained open following thesis invalidation`
        : 'No recorded post-invalidation hold episode yet';
      status = invalidationEpisodes.length >= 3 ? 'ALIGNED' : invalidationEpisodes.length > 0 ? 'MIXED' : 'INSUFFICIENT DATA';
      detail = 'The pipeline counts only episodes with a timestamped thesis invalidation before the recorded exit.';
      sample = invalidationEpisodes.length;
      ids = invalidationEpisodes.map((trade) => trade.id).slice(0, 200);
      contextItems.push({ label: 'After invalidation', value: `${invalidationEpisodes.length} episodes` });
    }

    insights.push({
      key: `habit_${habit}`,
      category: 'patterns',
      profileSignal: label(habit, HABIT_LABELS),
      observed,
      status,
      detail,
      sample,
      evidenceTradeIds: ids,
      contextItems,
    });
  }

  // PATTERNS: "understand habits" / review what works goals get an explicit readiness row.
  for (const goal of profile.ursora_goals.filter((value) => ['understand_habits', 'review_what_works', 'reduce_overtrading', 'position_sizing'].includes(value))) {
    const enough = trades.length >= 6;
    insights.push({
      key: `ursora_goal_${goal}`,
      category: 'patterns',
      profileSignal: label(goal, URSORA_LABELS),
      observed: enough ? `${trades.length} recorded trades available for personal comparison` : `${trades.length} recorded trades so far`,
      status: enough ? 'PROFILE ONLY' : 'INSUFFICIENT DATA',
      detail: enough
        ? 'This goal tells Trader Intelligence which personal comparisons are most relevant to surface; individual pattern claims still require their own evidence threshold.'
        : 'Brokerage history will increase the amount of personal evidence available for this goal.',
      sample: trades.length,
      evidenceTradeIds: trades.map((trade) => trade.id).slice(0, 200),
    });
  }

  return insights;
}
