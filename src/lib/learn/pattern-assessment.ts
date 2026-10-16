import type { Pattern } from './patterns';
const confusions: Record<string,string[]> = {
 hammer:['hanging-man','inverted-hammer'], 'hanging-man':['hammer','shooting-star'],
 'inverted-hammer':['shooting-star','hammer'], 'shooting-star':['inverted-hammer','hanging-man'],
 doji:['spinning-top','inside-bar'], 'spinning-top':['doji','hammer'],
 'bull-engulf':['bear-engulf','bull-harami'], 'bear-engulf':['bull-engulf','bear-harami'],
 'bull-harami':['bull-engulf','bear-harami'], 'bear-harami':['bear-engulf','bull-harami'],
 'tweezer-bottom':['tweezer-top','hammer'], 'tweezer-top':['tweezer-bottom','shooting-star'],
 'morning-star':['evening-star','bull-harami'], 'evening-star':['morning-star','bear-harami'],
 'soldiers':['crows','bull-engulf'], 'crows':['soldiers','bear-engulf'],
 'inside-bar':['bull-harami','doji'],
 'bull-flag':['bear-flag','bull-pennant'],'bear-flag':['bull-flag','bear-pennant'],
 'double-top':['double-bottom','head-shoulders'],'double-bottom':['double-top','inverse-head-shoulders'],
 'head-shoulders':['inverse-head-shoulders','double-top'],'inverse-head-shoulders':['head-shoulders','double-bottom'],
 'ascending-triangle':['descending-triangle','symmetrical-triangle'],'descending-triangle':['ascending-triangle','symmetrical-triangle'],
 'symmetrical-triangle':['ascending-triangle','descending-triangle'],
 'failed-breakout':['ascending-triangle','bull-rectangle'],'micro-pullback':['bull-flag','abcd'],
 abcd:['micro-pullback','double-bottom'],'rising-wedge':['falling-wedge','bull-flag'],
 'falling-wedge':['rising-wedge','bear-flag'],'bull-rectangle':['bear-rectangle','bull-flag'],
 'bear-rectangle':['bull-rectangle','bear-flag'],'bull-pennant':['bear-pennant','bull-flag'],
 'bear-pennant':['bull-pennant','bear-flag'],'cup-handle':['inverse-cup','double-bottom'],
 'inverse-cup':['cup-handle','double-top'],
};
// Distinguish the actual observation and prior context, not a generic bullish/bearish promise.
export function patternInterpretations(pattern: Pattern, catalog: Pattern[]) {
  const candidates = [...(confusions[pattern.id] ?? []).map(id=>catalog.find(p=>p.id===id)), ...catalog]
    .filter((p): p is Pattern => !!p && p.id !== pattern.id);
  const alternatives = candidates.filter((p,i)=>candidates.findIndex(v=>v.id===p.id)===i).slice(0,2);
  const describe = (p: Pattern) => `${p.context}: ${p.shape}`;
  // Slot 1 is the canonical stored answer; only its visible position is randomized.
  return [describe(alternatives[0]), describe(pattern), describe(alternatives[1])];
}
