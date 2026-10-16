import { indicators, trainingSession, drawingFeedback, type DrawLine, type Scenario } from './technicals';
import type { Study } from './university';
import type { StudyBar } from './patterns';
export type CapstoneConfig={id:string;title:string;scenario:Scenario;start:number;end:number;studies:Study[];recaps:string[];focus:string;maxRisk:number};
const allStudies:Study[]=['sma','ema','vwap','rsi','macd','bands','atr'];
export const capstones:Record<string,CapstoneConfig>={
 'price-assessment':{id:'price-assessment',title:'Price-action paper assessment',scenario:'steps',start:65,end:110,studies:[],recaps:['structure','drawing-lines','chart-patterns','cup-steps'],focus:'Map a floor and ceiling, define a closed-candle entry condition, then trade or explain why you are waiting.',maxRisk:50},
 'indicator-assessment':{id:'indicator-assessment',title:'Candle-and-indicator paper assessment',scenario:'rebound',start:80,end:130,studies:allStudies,recaps:['confluence','macd','vwap','rsi'],focus:'Separate a local rebound from a broader reversal. Compare candles, location and momentum before choosing an action.',maxRisk:50},
 'execution-assessment':{id:'execution-assessment',title:'Risk-and-execution paper assessment',scenario:'trend',start:80,end:130,studies:['vwap','sma','atr'],recaps:['risk-sizing','execution','plan','scan-news'],focus:'Size to the assignment risk budget, monitor an open position and practice adding, trimming or closing when your plan calls for it.',maxRisk:50},
 'final-assessment':{id:'final-assessment',title:'Final integrated paper assessment',scenario:'chop',start:75,end:130,studies:allStudies,recaps:['confluence','plan','risk-sizing','management','journal-testing'],focus:'Build a plan and respond to a continuously changing session. A well-explained wait or pass can satisfy the process requirements without a trade.',maxRisk:50},
};
export type AssessmentPlan={entry:string;invalidation:string;target:string;thesis:string};
export type AssessmentDecision={clock:number;action:'buy'|'sell'|'wait'|'pass';price:number;quantity:number;reason:string;plan:AssessmentPlan;positionBefore:number;positionAfter:number;cashAfter:number;closedPrice:number;macd:number|null;rsi:number|null};
export type AssessmentAttempt={drawings?:DrawLine[];number:number;clock:number;speed:number;quantity:number;cash:number;position:number;averageCost:number;realized:number;fees:number;plan:AssessmentPlan;reason:string;decisions:AssessmentDecision[];reviewOpen:boolean};
export type ReviewItem={text:string;lesson:string};
export function freshAssessment(config:CapstoneConfig,number=1):AssessmentAttempt{return {number,clock:config.start*60,speed:10,quantity:10,cash:10000,position:0,averageCost:0,realized:0,fees:0,plan:{entry:'',invalidation:'',target:'',thesis:''},reason:'',decisions:[],reviewOpen:false};}
export function assessmentBars(config:CapstoneConfig,attempt=1):StudyBar[]{const shift=(attempt-1)*.17;return trainingSession(config.scenario).map(b=>({...b,open:b.open+shift,high:b.high+shift,low:b.low+shift,close:b.close+shift}));}
export function observedAssessment(all:StudyBar[],clock:number){const count=Math.floor(clock/60),elapsed=clock%60,closed=all.slice(0,count),next=all[count];let forming:StudyBar|undefined;if(next&&elapsed>0){const fraction=elapsed/60,path=[next.open,next.low,next.high,next.close],stage=Math.min(2,Math.floor(fraction*3)),p=fraction*3-stage,current=path[stage]+(path[stage+1]-path[stage])*p,seen=[...path.slice(0,stage+1),current];forming={...next,close:current,high:Math.max(...seen),low:Math.min(...seen),volume:Math.floor(next.volume*fraction)};}return {closed,forming,price:forming?.close??closed.at(-1)!.close};}
export function executeAssessment(state:AssessmentAttempt,config:CapstoneConfig,action:AssessmentDecision['action']):{state:AssessmentAttempt;error?:string}{
 const fail=(error:string)=>({state,error});if(!state.reason)return fail('Choose the evidence behind your decision first.');
 const buy=action==='buy',sell=action==='sell',fill=buy||sell;
 if(fill&&(!Number.isInteger(state.quantity)||state.quantity<1))return fail('Choose a positive whole-share quantity.');
 const plan=state.plan;if(buy&&(!plan.thesis||![plan.entry,plan.invalidation,plan.target].every(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>0)||Number(plan.target)<=Number(plan.entry)))return fail('Record a thesis, positive entry and invalidation prices, and an exit area above entry.');
 const observed=observedAssessment(assessmentBars(config,state.number),state.clock),price=observed.price+(buy?.02:sell?-.02:0),quantity=fill?state.quantity:0,fee=fill?1:0;
 if(buy&&Number(plan.invalidation)>=price)return fail('For this long-share exercise, invalidation must be below the current ask.');
 if(buy&&quantity*price+fee>state.cash)return fail('This quantity and fee exceed available training cash.');
 if(sell&&quantity>state.position)return fail('You cannot sell more shares than the current position.');
 const position=state.position+(buy?quantity:sell?-quantity:0),cash=state.cash+(buy?-quantity*price-fee:sell?quantity*price-fee:0),averageCost=buy?(state.averageCost*state.position+quantity*price+fee)/position:position===0?0:state.averageCost,realized=state.realized+(sell?quantity*(price-state.averageCost)-fee:0),study=indicators(observed.closed),last=observed.closed.length-1;
 const decision:AssessmentDecision={clock:state.clock,action,price,quantity,reason:state.reason,plan:{...plan},positionBefore:state.position,positionAfter:position,cashAfter:cash,closedPrice:observed.closed.at(-1)!.close,macd:study.macd[last],rsi:study.rsi[last]};
 return {state:{...state,cash,position,averageCost,realized,fees:state.fees+fee,decisions:[...state.decisions,decision]}};
}
export function reviewAssessment(state:AssessmentAttempt,config:CapstoneConfig){
 const good:ReviewItem[]=[],review:ReviewItem[]=[],notObserved:ReviewItem[]=[];
 const add=(list:ReviewItem[],text:string,lesson:string)=>{if(!list.some(v=>v.text===text))list.push({text,lesson});};
 const observed=observedAssessment(assessmentBars(config,state.number),state.clock),buys=state.decisions.filter(d=>d.action==='buy');
 if(config.id==='price-assessment'){if(drawingFeedback(state.drawings??[],observed.closed).ok)add(good,'You saved a boundary line connecting separated observed tests.','drawing-lines');else add(review,'Save a boundary line near repeated price tests for the chart-structure assignment.','drawing-lines');}
 for(const d of buys){
  if(d.closedPrice>=Number(d.plan.entry))add(good,'Your latest completed candle met the recorded entry-price condition before buying.','plan');else add(review,'You bought before a completed candle met your recorded entry condition.','plan');
  const risk=d.positionAfter*Math.max(0,d.price-Number(d.plan.invalidation))+1;
  if(risk<=config.maxRisk)add(good,`Estimated position risk stayed within the $${config.maxRisk} assignment budget, including an estimated exit fee. This is not a guaranteed loss cap.`,'risk-sizing');else add(review,`Estimated position risk exceeded the $${config.maxRisk} assignment budget. Recalculate quantity when adding.`,'risk-sizing');
  const consumed=(d.price-Number(d.plan.entry))/(Number(d.plan.target)-Number(d.plan.entry));
  if(consumed>=.75)add(review,'Your fill had already used at least 75% of the room between your recorded entry and exit area. Review late entry and remaining room.','plan');else add(good,'Your entry left more than 25% of the recorded entry-to-exit room in this exercise.','plan');
  if(config.studies.includes('macd')&&d.reason==='confirmed-momentum'&&(d.macd??0)<0)add(review,'Your reason claimed confirmed momentum while completed-candle MACD was below zero. Explain the local rebound versus the broader momentum conflict.','confluence');
 }
 if(state.decisions.some(d=>(d.action==='wait'||d.action==='pass')&&d.positionBefore===0))add(good,'You recorded a reason for waiting or passing instead of forcing an entry.','plan');
 state.decisions.forEach((d,index)=>{if(d.positionAfter<=0||!d.plan.invalidation)return;const next=state.decisions[index+1],until=next?.clock??state.clock,start=Math.floor(d.clock/60),end=Math.floor(until/60),all=assessmentBars(config,state.number);let crossed:number|undefined;for(let i=start;i<end;i++){if(all[i].close<=Number(d.plan.invalidation)){crossed=(i+1)*60;break;}}if(crossed===undefined)return;if(next?.action==='sell'&&next.reason==='invalidation'&&next.clock-crossed<=60)add(good,'You responded to a completed-candle invalidation within one candle in this exercise.','management');else add(review,'A completed candle crossed your recorded invalidation while you held shares. Review the response and the exposure left open.','management');});
 if(state.decisions.some(d=>d.action==='sell'&&d.positionAfter>0))add(good,'You reduced exposure with a partial sale and retained the remaining position in the ledger.','management');else add(notObserved,'A partial trim was not observed in this attempt.','management');
 if(state.decisions.some(d=>d.action==='sell'&&d.positionAfter===0))add(good,'You closed the remaining position and recorded the execution.','execution');
 if(state.position>0)add(review,'Shares remain open. Close the position before completing this day-trading assignment.','management');
 if(!buys.length)add(notObserved,'Entry sizing, adding and exiting were not observed. A reasoned wait or pass can complete this observation task; those execution skills still need separate practice.','execution');
 if(config.id==='final-assessment')add(notObserved,'This share-based assessment does not assess contract selection, option Greeks or option-order execution. Review those lessons and use the separate option trading sandbox for that practice.','options');
 const distinctTimes=new Set(state.decisions.map(d=>Math.floor(d.clock/60))).size,complete=state.clock>=config.end*60&&distinctTimes>=2;
 if(state.clock<config.end*60)add(review,'This is an interim review. Continue the candle feed to the end before completing the assessment.','journal-testing');
 if(distinctTimes<2)add(review,'Record decisions at two different completed-candle times to show how you respond as evidence changes.','plan');
 return {good,review,notObserved,complete,passed:complete&&review.length===0,rubric:'capstone-rubric-1'};
}
