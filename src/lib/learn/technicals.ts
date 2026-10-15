import type { StudyBar } from './patterns';
export type Series = (number|null)[];
export function sma(values:number[],period:number):Series {return values.map((_,i)=>i+1<period?null:values.slice(i+1-period,i+1).reduce((a,b)=>a+b,0)/period);}
export function ema(values:number[],period:number):Series {let previous:number|null=null;return values.map((v,i)=>{if(i+1<period)return null;previous=previous===null?values.slice(0,period).reduce((a,b)=>a+b,0)/period:previous+(v-previous)*2/(period+1);return previous;});}
export function rsi(values:number[],period=14):Series {let gain=0,loss=0;return values.map((v,i)=>{if(!i)return null;const change=v-values[i-1];if(i<=period){gain+=Math.max(0,change)/period;loss+=Math.max(0,-change)/period;if(i<period)return null;}else{gain=(gain*(period-1)+Math.max(0,change))/period;loss=(loss*(period-1)+Math.max(0,-change))/period;}return gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);});}
export function indicators(bars:StudyBar[]) {
 const closes=bars.map(b=>b.close),fast=ema(closes,12),slow=ema(closes,26),macd=closes.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]!-slow[i]!);
 const first=macd.findIndex(v=>v!==null),signal:Series=closes.map(()=>null);if(first>=0)ema(macd.slice(first) as number[],9).forEach((v,i)=>signal[first+i]=v);
 const middle=sma(closes,20);const deviation=closes.map((_,i)=>middle[i]===null?null:Math.sqrt(closes.slice(i-19,i+1).reduce((sum,v)=>sum+(v-middle[i]!)**2,0)/20));
 let volume=0,total=0,atr:number|null=null;
 const vwap=bars.map(b=>{volume+=b.volume;total+=(b.high+b.low+b.close)/3*b.volume;return volume?total/volume:b.close;});
 const ranges=bars.map((b,i)=>Math.max(b.high-b.low,i?Math.abs(b.high-bars[i-1].close):0,i?Math.abs(b.low-bars[i-1].close):0));
 const atrs=ranges.map((v,i)=>{if(i<13)return null;atr=atr===null?ranges.slice(0,14).reduce((a,b)=>a+b,0)/14:(atr*13+v)/14;return atr;});
 return {sma:sma(closes,20),ema:ema(closes,9),vwap,rsi:rsi(closes),macd,signal,histogram:macd.map((v,i)=>v===null||signal[i]===null?null:v-signal[i]!),upper:middle.map((v,i)=>v===null?null:v+2*deviation[i]!),lower:middle.map((v,i)=>v===null?null:v-2*deviation[i]!),atr:atrs};
}
export type Scenario = 'trend'|'chop'|'rebound'|'cup'|'steps'|'selloff'|'wedge'|'rising-wedge'|'falling-wedge';
export function trainingSession(kind:Scenario):StudyBar[] {
 const out:StudyBar[]=[];let previous=100;
 for(let i=0;i<150;i++){
  const noise=Math.sin(i*2.17)*.11+Math.sin(i*.73)*.08;
  const base=kind==='trend'?100+i*.055+Math.sin(i*.25)*.38:kind==='chop'?102+Math.sin(i*.6)*.75+Math.sin(i*1.7)*.15:kind==='rebound'?108-i*.045+(i>98?(i-98)*.11:0)+Math.sin(i*.33)*.22:kind==='cup'?104-(i>65&&i<110?Math.sin((i-65)/45*Math.PI)*3:0)+(i>=110&&i<124?-(i-110)*.05:i>=124?(i-124)*.12:0):kind==='steps'?100+Math.floor(i/15)*.55+Math.min(i%15,7)*.045:kind==='selloff'?108-i*.045-(i>95?(i-95)*.09:0)+Math.sin(i*.4)*.23:102+(kind==='rising-wedge'?i*.03:kind==='falling-wedge'?-i*.03:0)+Math.sin(i*Math.PI/5)*Math.max(.12,2.3-i*.014);
  let close=base+noise,open=previous;
  if(kind==='rebound'&&i===106)close=open-.55;
  if(kind==='rebound'&&i===107){open=previous-.1;close=out[106].open+.25;}
  const wick=.12+Math.abs(Math.sin(i))* .13;
  out.push({open,close,high:Math.max(open,close)+wick,low:Math.min(open,close)-wick,volume:Math.round(500+Math.abs(close-open)*2200+(kind==='selloff'&&i>95?1800:0)+(i%17)*37)});previous=close;
 }
 return out;
}
export type DrawPoint={index:number;price:number};export type DrawLine={a:DrawPoint;b:DrawPoint};
export function drawingFeedback(lines:DrawLine[],bars:StudyBar[],wedge=false):{ok:boolean;text:string} {
 if(lines.length<(wedge?2:1))return {ok:false,text:wedge?'Draw both an upper and a lower boundary.':'Draw at least one line using two separated observations.'};
 const valid=lines.filter(l=>Math.abs(l.a.index-l.b.index)>=5&&l.a.index<bars.length&&l.b.index<bars.length);
 if(valid.length<(wedge?2:1))return {ok:false,text:'Choose anchor points at least five candles apart so the line represents more than a tiny fluctuation.'};
 const touches=(l:DrawLine)=>bars.reduce((sum,b,i)=>{if(i<Math.min(l.a.index,l.b.index)||i>Math.max(l.a.index,l.b.index))return sum;const value=l.a.price+(l.b.price-l.a.price)*(i-l.a.index)/(l.b.index-l.a.index);return sum+(Math.min(Math.abs(b.high-value),Math.abs(b.low-value))<.35?1:0);},0);
 if(valid.some(l=>touches(l)<2))return {ok:false,text:'Place the boundaries near at least two visible highs or lows. Avoid a line floating far from price.'};
 if(wedge){const [one,two]=valid.slice(-2);const at=(l:DrawLine,i:number)=>l.a.price+(l.b.price-l.a.price)*(i-l.a.index)/(l.b.index-l.a.index);const from=Math.max(Math.min(one.a.index,one.b.index),Math.min(two.a.index,two.b.index)),to=Math.min(Math.max(one.a.index,one.b.index),Math.max(two.a.index,two.b.index));if(to-from<5)return {ok:false,text:'Extend both boundaries across the same portion of the chart.'};const gapStart=at(one,from)-at(two,from),gapEnd=at(one,to)-at(two,to);if(gapStart*gapEnd<=0||Math.abs(gapEnd)>=Math.abs(gapStart))return {ok:false,text:'For this compression exercise, the upper and lower boundaries should narrow toward each other without already crossing.'};}
 return {ok:true,text:wedge?'The boundaries touch observed price and converge over a shared interval. This describes compression; breakout direction remains unknown.':'The line connects separated observations near visible price tests. Now check the next interaction rather than treating your drawing as a barrier.'};
}
