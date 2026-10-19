import {trainingSession,type Scenario} from './technicals';
import type {StudyBar} from './patterns';
/** Independent authored variants: causal OHLC, stable within an attempt, no real-market performance claim. */
export function assessmentSession(seed:number,attempt:number):StudyBar[]{
 let state=(seed+Math.imul(attempt,2654435761))>>>0;
 const random=()=>{state+=0x6D2B79F5;let n=Math.imul(state^(state>>>15),1|state);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};
 const regimes:Scenario[]=['trend','selloff','chop','rebound','steps','cup','falling-wedge','rising-wedge'];
 const kind=regimes[((seed>>>0)+attempt-1)%regimes.length],base=trainingSession(kind),scale=.55+random()*1.8,offset=25+random()*160;
 const event=86+Math.floor(random()*35),shock=(random()-.5)*2.4;let prior=offset,noise=0;
 return base.map((bar,i)=>{noise=noise*.7+(random()-.5)*.3;const close=offset+(bar.close-100)*scale+noise+(i>=event?shock:0),open=i===0?offset:prior;
 const wick=(.06+random()*.18)*scale;prior=close;
 return {open,close,high:Math.max(open,close)+wick,low:Math.min(open,close)-wick*(.7+random()*.6),volume:Math.round(bar.volume*(.5+random()*1.5)*(i===event?3:1))};});
}
