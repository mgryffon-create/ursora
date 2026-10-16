// Deterministic short choice sets preserve original answer indices and learner progress.
// Favor patterns with similar structures, not arbitrary obviously unrelated labels.
type Choice={label:string;value:number};
const family=(s:string)=>{
 const n=s.toLowerCase();
 if(/wedge|triangle|pennant/.test(n))return 'compression';
 if(/flag|rectangle|channel|continuation|pullback/.test(n))return 'continuation';
 if(/double|head and shoulders|top|bottom/.test(n))return 'reversal';
 if(/cup|handle|round/.test(n))return 'rounded';
 if(/doji|spinning top|star/.test(n))return 'indecision';
 if(/hammer|hanging man|shooting star|inverted hammer/.test(n))return 'wick';
 if(/engulf|harami|inside|outside/.test(n))return 'multi';
 return 'other';
};
const hash=(text:string)=>{let h=2166136261;for(const ch of text)h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0;};
export function shortChoices(choices:Choice[],correct:number,seed:string,limit=5):Choice[]{
 if(choices.length<=limit)return choices;
 const answer=choices.find(c=>c.value===correct);
 if(!answer)return choices.slice(0,limit);
 const currentFamily=family(answer.label);
 const score=(item:Choice)=>{
  const a=answer.label.toLowerCase(),b=item.label.toLowerCase();
  const direction=(s:string)=>/bull|ascending|rising|inverse|bottom/.test(s)?'up':/bear|descending|falling|top/.test(s)?'down':'neutral';
  const structural=family(item.label)===currentFamily?0:2;
  const directional=direction(a)===direction(b)?0:1;
  return structural*100+directional*10+(hash(seed+':'+item.value)%10);
 };
 const wrong=choices.filter(c=>c.value!==correct).sort((a,b)=>score(a)-score(b));
 // Stable varying set of three to five options, with the correct option retained.
 const n=Math.min(limit,Math.max(3,choices.length>=12?5:choices.length));
 return [answer,...wrong.slice(0,n-1)].sort((a,b)=>hash(seed+'order'+a.value)-hash(seed+'order'+b.value));
}
