import type { HistoricalPlaybackResponse } from './api';

const sessionKey = (at: string) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** Entry support only: realized P/L and post-entry events never determine this headline. */
export function historicalEntryHeadline(playback: HistoricalPlaybackResponse, tradeDirection?: string | null): string {
  const review = playback.review;
  const rawDirection = String(review?.evidence?.trade_direction ?? tradeDirection ?? '').toLowerCase();
  const direction = ['bullish', 'long'].includes(rawDirection) ? 'Bullish'
    : ['bearish', 'short'].includes(rawDirection) ? 'Bearish' : 'Directional';
  if (!review) return `Insufficient pre-entry evidence to assess ${direction.toLowerCase()} thesis`;

  if (review.directional_agreement === 'opposed') {
    return `${direction} entry opposed the substantiated ${review.retro_direction} thesis`;
  }
  if (review.retro_direction !== 'neutral') {
    if (review.entry_quality_label === 'late_extended') return `${direction} entry after an extended thesis move`;
    if (review.entry_quality_label === 'late_confirmed_move') return `${direction} entry after most of the original target distance`;
    if (review.entry_quality_label === 'pullback_unconfirmed') return `${direction} entry before the pullback showed a confirmed hold`;
    const thesis = review.retro_direction === 'bullish' ? 'Bullish' : 'Bearish';
    return review.session_state === 'existing_thesis'
      ? `Existing ${thesis.toLowerCase()} thesis; no fresh confirmation before entry`
      : `${thesis} thesis substantiated before entry`;
  }

  // Match the reconstruction's minimum history requirements, rather than treating
  // an unavailable session-regime label as absence of a broader thesis.
  const beforeEntry = playback.bars.filter((bar) => +new Date(bar.bar_time) < +new Date(playback.episode.entry_at));
  const sameSession = !playback.episode.exit_at || sessionKey(playback.episode.entry_at) === sessionKey(playback.episode.exit_at);
  const sessionBars = beforeEntry.filter((bar) => sessionKey(bar.bar_time) === sessionKey(playback.episode.entry_at));
  const thirtyMinuteSlots = new Set(beforeEntry.map((bar) => Math.floor(+new Date(bar.bar_time) / 1_800_000)));
  const sufficientHistory = sameSession ? sessionBars.length >= 3 || thirtyMinuteSlots.size >= 8 : thirtyMinuteSlots.size >= 6;
  return sufficientHistory
    ? `${direction} thesis not substantiated before entry`
    : `Insufficient pre-entry evidence to assess ${direction.toLowerCase()} thesis`;
}
