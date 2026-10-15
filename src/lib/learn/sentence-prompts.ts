/** Scaffolds support expression, not answer scoring. Choices are never preselected. */
export type PromptKind = 'thesis' | 'buy' | 'sell' | 'wait';
export type SentenceBlank = { prefix: string; choices: { text: string; explanation: string }[] };
export const sentencePrompts: Record<PromptKind, { legend: string; blanks: SentenceBlank[] }> = {
  thesis: {
    legend: 'Build your thesis',
    blanks: [
      { prefix: 'I expect price to', choices: [
        { text: 'continue higher', explanation: 'You expect the upward direction to continue.' },
        { text: 'move sideways', explanation: 'You expect price to stay within a range rather than travel clearly up or down.' },
        { text: 'move lower', explanation: 'You expect the next meaningful movement to be downward.' },
        { text: 'remain unclear for now', explanation: 'You do not yet have enough evidence to choose a direction.' },
      ] },
      { prefix: 'because I observe', choices: [
        { text: 'higher swing highs and higher swing lows', explanation: 'The recent peaks and dips are moving upward. Check the candles before choosing this.' },
        { text: 'repeated moves between the same price areas', explanation: 'Price keeps moving back and forth inside a range.' },
        { text: 'lower swing highs and lower swing lows', explanation: 'The recent peaks and dips are moving downward.' },
        { text: 'too little completed evidence to judge', explanation: 'An unfinished candle or a short history may leave the direction uncertain.' },
      ] },
      { prefix: 'before entering, I will wait for', choices: [
        { text: 'two completed candles above my entry level', explanation: 'Wait for two candles to finish above the price you selected; an intrabar move is not a completed close.' },
        { text: 'a pullback that holds, followed by a completed upward candle', explanation: 'Look for a retreat that stops making lower lows, then a finished candle showing recovery.' },
        { text: 'a break of a price area followed by a retest that holds', explanation: 'Price crosses an area, returns to it and shows evidence it can stay on the new side.' },
        { text: 'a clearer setup before deciding whether to trade', explanation: 'Waiting is a valid decision when you cannot yet explain an entry.' },
      ] },
    ],
  },
  buy: {
    legend: 'Build your entry or addition reason',
    blanks: [
      { prefix: 'I am buying because', choices: [
        { text: 'my recorded entry condition has occurred', explanation: 'Compare the visible evidence with the condition you recorded in your plan.' },
        { text: 'a pullback appears to be holding', explanation: 'Identify the evidence that the retreat is stopping; a single upward tick may not be enough.' },
        { text: 'new completed evidence supports adding', explanation: 'An addition needs a reason to increase exposure, as well as room in your budget.' },
        { text: 'I am anticipating confirmation that has not occurred', explanation: 'This records an early entry honestly. It does not establish that confirmation has happened.' },
      ] },
      { prefix: 'the evidence I am using is', choices: [
        { text: 'completed candles above my entry level', explanation: 'A completed close is a finished observation rather than the changing current candle.' },
        { text: 'a retreat that stopped making lower lows and then recovered', explanation: 'Compare successive dips and the recovery before calling the pullback held.' },
        { text: 'a price-area retest that held', explanation: 'A retest returns to a previously crossed area; a hold needs observable follow-through.' },
        { text: 'movement inside the current unfinished candle', explanation: 'That movement can change before the candle closes; the review will preserve this choice.' },
      ] },
    ],
  },
  sell: {
    legend: 'Build your trim or exit reason',
    blanks: [
      { prefix: 'I am reducing my position because', choices: [
        { text: 'price reached my planned exit area', explanation: 'Compare the current price with your original target rather than moving the goal after the fact.' },
        { text: 'my thesis invalidation condition occurred', explanation: 'The condition you said would prove your idea wrong is now visible.' },
        { text: 'the evidence supporting my thesis weakened', explanation: 'Name what changed; ordinary fluctuation alone may not invalidate your thesis.' },
        { text: 'I am reducing exposure while the thesis remains intact', explanation: 'A trim reduces the amount still exposed without requiring you to abandon the whole thesis.' },
      ] },
      { prefix: 'I intend to', choices: [
        { text: 'trim part and reassess the remainder', explanation: 'Choose a sell quantity smaller than your available position.' },
        { text: 'close the entire remaining position', explanation: 'Choose the quantity of contracts you still hold, excluding any already reserved to sell.' },
      ] },
    ],
  },
  wait: {
    legend: 'Build your wait or pass reason',
    blanks: [
      { prefix: 'I am waiting or passing because', choices: [
        { text: 'my entry condition has not occurred', explanation: 'The evidence required by your plan is not visible yet.' },
        { text: 'the pullback has not shown a hold', explanation: 'Price has retreated, but you cannot yet identify sufficient recovery evidence.' },
        { text: 'price has already traveled too far toward my target', explanation: 'Compare how much movement has already happened with the distance remaining.' },
        { text: 'the direction is unclear or price is moving sideways', explanation: 'There may not be a clear directional opportunity for your current plan.' },
        { text: 'the contract cost does not fit my budget', explanation: 'A directionally appealing idea can still exceed your chosen exposure limit.' },
      ] },
    ],
  },
};
export function sentenceSelections(kind: PromptKind, value: string): string[] {
  return sentencePrompts[kind].blanks.map(blank => blank.choices.find(choice => value.includes(`${blank.prefix} ${choice.text}`))?.text ?? '');
}
export function buildSentence(kind: PromptKind, selections: string[]): string {
  return sentencePrompts[kind].blanks.map((blank, i) => `${blank.prefix} ${blank.choices.some(choice => choice.text === selections[i]) ? selections[i] : '[choose]'}`).join('; ') + '.';
}
export function responseComplete(value: string): boolean {
  return value.trim().length > 0 && !value.includes('[choose]');
}
