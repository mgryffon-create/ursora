/** Shared causal thesis ancestry and entry geometry. All bars are CLOSED evidence.
 * Reconfirmation never resets the original move. Thresholds are product heuristics,
 * not calibrated probabilities or a claim about the best achievable entry.
 */
export type ThesisBar = { bar_time: string; available_at?: string; open: number; high: number; low: number; close: number };
export type ThesisSnapshot = { direction: 'bullish' | 'bearish' | 'neutral'; confirmed: boolean; confirmation: number | null; invalidation: number | null };
export type ThesisAnchor = {
  direction: 'bullish' | 'bearish'; established_at: string; confirmation_price: number;
  invalidation_price: number | null; target_price: number | null;
  move_unit: number; history_start: string; origin_status: 'first_observed_confirmation';
};
const session = (at: string) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const delta = (a: number, b: number, d: string) => d === 'bullish' ? b - a : a - b;
const available = (b: ThesisBar) => b.available_at ?? b.bar_time;

/** Replay prefixes; a detector cannot see later bars when establishing an anchor.
 * A hard invalidation ends the lineage. A later confirmation starts a new one.
 */
export function replayThesis(bars: ThesisBar[], detect: (prefix: ThesisBar[]) => ThesisSnapshot): ThesisAnchor | null {
  let active: ThesisAnchor | null = null;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const broken = active && active.invalidation_price !== null &&
      (active.direction === 'bullish' ? bar.low <= active.invalidation_price : bar.high >= active.invalidation_price);
    if (broken) { active = null; continue; }
    const prefix = bars.slice(0, i + 1);
    const candidate = detect(prefix);
    if (!candidate.confirmed || candidate.direction === 'neutral' || candidate.confirmation === null) continue;
    if (active?.direction === candidate.direction) continue;
    const ranges = prefix.slice(-20).map(b => b.high - b.low).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const unit = ranges.length ? ranges[Math.floor(ranges.length / 2)] : 0;
    // Freeze only an observed structural obstacle ahead of confirmation. No
    // synthetic target and no target invented from the later entry location.
    const prior = prefix.slice(0, -1);
    const structural: number[] = [];
    for (let j = 1; j < prior.length - 1; j++) {
      if (candidate.direction === 'bullish' && prior[j].high >= prior[j - 1].high && prior[j].high >= prior[j + 1].high) structural.push(prior[j].high);
      if (candidate.direction === 'bearish' && prior[j].low <= prior[j - 1].low && prior[j].low <= prior[j + 1].low) structural.push(prior[j].low);
    }
    if (prior.length) structural.push(candidate.direction === 'bullish' ? Math.max(...prior.map(b => b.high)) : Math.min(...prior.map(b => b.low)));
    const obstacles = structural.filter(p => delta(bar.close, p, candidate.direction) > 0)
      .sort((a, b) => delta(bar.close, a, candidate.direction) - delta(bar.close, b, candidate.direction));
    active = {
      direction: candidate.direction, established_at: available(bar), confirmation_price: bar.close,
      invalidation_price: candidate.invalidation, target_price: obstacles[0] ?? null,
      move_unit: unit, history_start: available(bars[0]), origin_status: 'first_observed_confirmation',
    };
  }
  return active;
}

export function assessThesisEntry(anchor: ThesisAnchor | null, bars: ThesisBar[], at: string, price: number) {
  if (!anchor || !(price > 0) || +new Date(anchor.established_at) > +new Date(at)) return null;
  const rows = bars.filter(b => +new Date(available(b)) > +new Date(anchor.established_at) && +new Date(available(b)) <= +new Date(at));
  const move = delta(anchor.confirmation_price, price, anchor.direction);
  const targetMove = anchor.target_price === null ? null : delta(anchor.confirmation_price, anchor.target_price, anchor.direction);
  const consumed = targetMove !== null && targetMove > 0 ? move / targetMove * 100 : null;
  const risk = anchor.invalidation_price === null ? null : delta(anchor.invalidation_price, price, anchor.direction);
  const reward = anchor.target_price === null ? null : delta(price, anchor.target_price, anchor.direction);
  const sessions = new Set([session(anchor.established_at), ...rows.map(b => session(b.bar_time)), session(at)]).size - 1;
  let extreme = anchor.confirmation_price, pullback: 'not_observed' | 'developing' | 'held' | 'failed' = 'not_observed';
  let pullbackExtreme = extreme;
  let pullbackStarted = -1;
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    const adverse = anchor.direction === 'bullish' ? b.low : b.high;
    if (anchor.invalidation_price !== null && delta(anchor.invalidation_price, adverse, anchor.direction) <= 0) { pullback = 'failed'; break; }
    // Close-to-close progress avoids assuming an ordering of intrabar extremes.
    if (delta(extreme, b.close, anchor.direction) > 0) extreme = b.close;
    if (pullback === 'developing') {
      if (delta(b.close, pullbackExtreme, anchor.direction) > 0) pullbackExtreme = b.close;
      if (i > pullbackStarted && delta(pullbackExtreme, b.close, anchor.direction) >= anchor.move_unit * 0.5 &&
          delta(b.open, b.close, anchor.direction) > 0) { pullback = 'held'; extreme = b.close; }
    } else if (anchor.move_unit > 0 && delta(b.close, extreme, anchor.direction) >= anchor.move_unit * 0.5) {
      pullbackExtreme = b.close;
      pullbackStarted = i;
      pullback = 'developing';
    }
  }
  const extension = anchor.move_unit > 0 ? move / anchor.move_unit : null;
  const targetReached = anchor.target_price !== null && rows.some(b => delta(anchor.target_price!, anchor.direction === 'bullish' ? b.high : b.low, anchor.direction) >= 0);
  const label = pullback === 'failed' ? 'thesis_invalidated'
    : reward !== null && reward <= 0 ? 'late_extended'
    : pullback === 'developing' ? 'pullback_unconfirmed'
    : (consumed !== null && consumed >= 80) || (extension !== null && extension >= 1.5) ? 'late_extended'
    : consumed !== null && consumed >= 60 ? 'late_confirmed_move'
    : 'confirmed_location';
  const date = new Date(anchor.established_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const summary = `The ${anchor.direction} thesis was first confirmed in available history on ${date} ET${sessions ? `, ${sessions} observed trading session${sessions === 1 ? '' : 's'} before entry` : ''}. Using the last completed candle as the entry-price proxy, the underlying had moved ${move.toFixed(2)} (${(move / anchor.confirmation_price * 100).toFixed(2)}%) in the thesis direction.` +
    (consumed === null ? ' No substantiated target was available at establishment, so the fraction of the move consumed is unknown.' : ` ${consumed.toFixed(0)}% of the original confirmation-to-structural-target distance was consumed; remaining reward/risk was ${risk !== null && risk > 0 ? Math.max(0, reward! / risk).toFixed(2) + 'R' : 'unavailable'}.`) +
    (targetReached ? ' The original structural target had already been touched before entry.' : '') +
    (pullback === 'developing' ? ' A pullback was developing without a confirmed hold at entry.' : pullback === 'held' ? ' A pullback showed a price rejection before entry; this does not erase prior extension.' : pullback === 'failed' ? ' The original thesis invalidation had been crossed before entry.' : ' No material pullback was observed after confirmation.') +
    ' Timing thresholds are heuristic; price history alone does not establish the trader’s intent.';
  return {
    version: 'thesis-entry-1', ...anchor, entry_at: at, entry_price_proxy: price,
    prior_sessions: sessions, elapsed_minutes: Math.max(0, (+new Date(at) - +new Date(anchor.established_at)) / 60000),
    move_before_entry: move, move_before_entry_pct: move / anchor.confirmation_price * 100,
    move_consumed_pct: consumed, remaining_reward_risk: reward !== null && risk !== null && risk > 0 ? reward / risk : null,
    extension_units: extension, original_target_reached_before_entry: targetReached,
    pullback_status: pullback, entry_quality_label: label, summary,
    evidence_cutoff: at, target_basis: 'structural_obstacle_at_first_confirmation',
  };
}
