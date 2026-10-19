import React, { useEffect, useState } from 'react';
import LessonDepth from './LessonDepth';
import {lessonDepth} from '@/lib/learn/lesson-depth';
import {lessonSkills} from '@/lib/learn/competencies';
import { type Unit } from '@/lib/learn/university';
import { trainingSession, indicators, type Scenario } from '@/lib/learn/technicals';
import type { StudyBar } from '@/lib/learn/patterns';
import { PREPARE_UPDATE_EVENT } from '@/lib/deployment-update';
import { useLearnState } from './LearnProgress';
import MarketClassChart from './MarketClassChart';
import ExerciseStage from './ExerciseStage';
import ExerciseContinuation from './ExerciseContinuation';
import ExerciseFeedback from './ExerciseFeedback';
import { newQuizSeed, shuffleQuiz } from '@/lib/learn/quiz-order';
import { improveQuestion } from '@/lib/learn/question-quality';
import { shortChoices } from '@/lib/learn/short-choices';
import PaperAssessment from './PaperAssessment';
import BrokerageWorksheet from './BrokerageWorksheet';
import { capstones } from '@/lib/learn/capstones';
type ModuleState={card:number;case:number;answers:Record<number,string>;checked:Record<number,boolean>;explanationInPractice?:boolean};
export type LearnFeature='opportunities'|'command'|'trades'|'history'|'backtest'|'trader'|'profile';
type Props={unit:Unit;practice:boolean;onPractice:()=>void;onReturn:()=>void;onNext:()=>void;onPass:()=>void;onOpenLesson:(id:string)=>void;onOpenFeature?:(feature:LearnFeature)=>void};
export default function UniversityModule({unit,practice,onPractice,onReturn,onNext,onPass,onOpenLesson,onOpenFeature}:Props){
 const [showConceptChecks,setShowConceptChecks]=useState(false);
 const [randomization,setRandomization]=useLearnState(`module-order-v1:${unit.id}`,()=>({seed:newQuizSeed(),initialized:false}));
 const order=shuffleQuiz(unit.cases.map((_,i)=>i),randomization.seed,'cases');
 const startingCase=order[0];
 const [state,setState]=useLearnState<ModuleState>(`university-module-v1:${unit.id}`,{card:0,case:order[0],answers:{},checked:{}});
 useEffect(()=>{if(randomization.initialized)return;setRandomization(value=>({...value,initialized:true}));if(state.case===0 && Object.keys(state.answers).length===0 && Object.keys(state.checked).length===0 && startingCase!==0)setState(value=>({...value,case:startingCase}));},[randomization.initialized,state.case,state.answers,state.checked,startingCase,setState,setRandomization]);
 const item=improveQuestion(unit.id,state.case,unit.cases[Math.min(state.case,unit.cases.length-1)]),card=unit.cards[Math.min(state.card,unit.cards.length-1)];
 const casePosition=order.indexOf(state.case);
 const moveCase=(position:number)=>setState(v=>({...v,case:order[position]}));
 const options=shuffleQuiz(shortChoices(item.options.map((text,i)=>({label:text,value:i})),item.correct,randomization.seed+':'+unit.id+':'+state.case).map(({label,value})=>({text:label,value})),randomization.seed,`answer:${state.case}`);
 const scenario=practice?item.scenario:unit.scenario,bars=trainingSession(scenario).slice(0,unit.assessment?capstones[unit.assessment].start:130);
 const usesChart=['price','indicators'].includes(lessonSkills[unit.id])||!!unit.drawing||!!unit.cumulative;
 const nextSet=state.card<unit.cards.length-1?{title:unit.cards[state.card+1].title,onNext:()=>setState(v=>({...v,card:Math.min(v.card+1,unit.cards.length-1),explanationInPractice:true}))}:undefined;
 const passed=unit.cases.every((q,i)=>state.checked[i]&&Number(state.answers[i])===q.correct);
 useEffect(()=>{if(passed&&!unit.assessment)onPass();},[passed,onPass,unit.assessment]);
 if(!practice && unit.drawing) return <ExerciseStage title={unit.title} label={`Stage ${unit.stage} · Guided drawing · Explanation ${state.card+1} of ${unit.cards.length}`} onReturn={onReturn}
  visual={usesChart?<MarketClassChart exercise compactTools key={unit.id} bars={bars} title="Draw directly on the chart · time vs price" persistKey={unit.id+':study'} drawing={unit.drawing}/>:<LessonReference unit={unit}/>}
  navigation={<><button onClick={onReturn}>Return to curriculum</button><button onClick={onPractice}>Practice examples</button><button onClick={onNext}>Next lesson</button></>}>
  <h2>{card.title}</h2>
  <p>{card.text}</p>
  <p className="exercise-stage-guidance">Select Draw line, then tap or click the starting and ending locations. The horizontal X axis shows time; the vertical Y axis shows USD price. Use Check drawing for feedback.</p>
  <div className="exercise-stage-actions"><button disabled={state.card===0} onClick={()=>setState(v=>({...v,card:v.card-1}))}>Previous explanation</button><button onClick={()=>state.card<unit.cards.length-1?setState(v=>({...v,card:v.card+1})):onPractice()}>{state.card<unit.cards.length-1?'Next explanation':'Start focused practice'}</button></div>
 </ExerciseStage>;
 if(practice && !unit.assessment && !unit.worksheet && !unit.tour && state.explanationInPractice) return <ExerciseStage title={unit.title} label={`Next set of terms · Explanation ${state.card+1} of ${unit.cards.length}`} onReturn={onReturn}
  visual={usesChart?<MarketClassChart exercise compactTools key={`${unit.id}:explanation:${state.card}`} bars={trainingSession(unit.scenario).slice(0,130)} title="See the explanation on the chart" allowed={unit.studies} initial={unit.studies.slice(0,1)} drawing={unit.drawing} persistKey={unit.id+':study'}/>:<LessonReference unit={unit}/>}
  navigation={<><button onClick={()=>setState(v=>({...v,explanationInPractice:false}))}>Review questions</button><span>Explanation {state.card+1} of {unit.cards.length}</span></>}>
  <h2>{card.title}</h2><p>{card.text}</p><div className="exercise-stage-actions"><button disabled={state.card===0} onClick={()=>setState(v=>({...v,card:v.card-1}))}>Previous explanation</button></div>
  <ExerciseContinuation position={0} total={1} onNextExample={()=>{}} onNextLesson={onNext} nextSet={nextSet}/>
 </ExerciseStage>;
 if(practice && !unit.assessment && !unit.worksheet && !unit.tour && (!unit.cumulative || showConceptChecks)) return <ExerciseStage title={unit.title} label={`Focused practice · Example ${casePosition+1} of ${unit.cases.length}`} onReturn={onReturn}
  visual={usesChart?<MarketClassChart exercise compactTools key={`${unit.id}:${state.case}`} bars={bars} title={`Practice chart · ${scenario}`} allowed={unit.studies} initial={unit.studies.length>2?unit.studies.slice(0,1):unit.studies} drawing={unit.drawing} persistKey={`${unit.id}:case:${state.case}`}/>:<LessonReference unit={unit}/>}
  navigation={<>{unit.cumulative && <button onClick={()=>setShowConceptChecks(false)}>Back to session</button>}<button disabled={casePosition===0} onClick={()=>moveCase(casePosition-1)}>Previous</button><span className="exercise-stage-nav-status">Example {casePosition+1} of {unit.cases.length}</span></>}>
  <p className="exercise-stage-step">Understanding check {casePosition+1} of {unit.cases.length}</p>
  <label>{item.prompt}<select value={state.answers[state.case]??''} onChange={event=>setState(v=>({...v,answers:{...v.answers,[v.case]:event.target.value},checked:{...v.checked,[v.case]:false}}))}><option value="" disabled>Choose an explanation…</option>{options.map(option=><option key={option.value} value={option.value}>{option.text}</option>)}</select></label>
  <button className="learn-primary" disabled={state.answers[state.case]===undefined} onClick={()=>setState(v=>({...v,checked:{...v.checked,[v.case]:true}}))}>Check explanation</button>
  {state.checked[state.case] ? <ExerciseFeedback correct={Number(state.answers[state.case])===item.correct} text={`${Number(state.answers[state.case])===item.correct?'Correct.':'Revisit this distinction.'} ${item.why}`}/> : <p className="exercise-stage-guidance">{state.answers[state.case]!==undefined ? `Selected: ${item.options[Number(state.answers[state.case])]}` : 'Inspect the chart and compare the visible evidence with each explanation before choosing.'}</p>}
  {passed && <p className="exercise-stage-hint">All understanding checks passed. You can revisit any example.</p>}
  <ExerciseContinuation position={casePosition} total={unit.cases.length} onNextExample={()=>moveCase(casePosition+1)} onNextLesson={onNext} nextSet={nextSet}/>
 </ExerciseStage>;
 return <article className="learn-panel university-module mx-auto max-w-5xl space-y-4">
  {practice&&<button onClick={onReturn}>Return to lesson: {unit.title}</button>}
  <p className="text-xs uppercase tracking-wider text-sky-300">URSORA University · Stage {unit.stage} · {unit.assessment?(practice?'Capstone assessment':'Capstone preparation'):(practice?'Focused practice':'Guided lesson')}</p><h1 className="text-xl">{unit.title}</h1>
  {!practice?<>
   <p className="learn-activity-context">Learn one idea at a time. Read the explanation, inspect the chart, then apply it to three examples. New technical terms appear with their plain-language meaning.</p>
   <section className="university-card space-y-3" aria-label="Lesson explanation"><p>Explanation {state.card+1} of {unit.cards.length}</p><h2>{card.title}</h2><p>{card.text}</p><div className="flex flex-wrap justify-between gap-2"><button disabled={state.card===0} onClick={()=>setState(v=>({...v,card:v.card-1}))}>Previous explanation</button>{state.card<unit.cards.length-1?<button onClick={()=>setState(v=>({...v,card:v.card+1}))}>Next explanation</button>:<button onClick={onPractice}>Start lesson exercise</button>}</div></section>
   {unit.worksheet?<BrokerageWorksheet/>:unit.tour?<URSORAWorkflow onOpenFeature={onOpenFeature}/>:usesChart?<MarketClassChart key={unit.id} bars={bars} title="See the concept on a candlestick chart" allowed={unit.studies} initial={unit.studies.length>2?unit.studies.slice(0,1):unit.studies} persistKey={unit.id+':study'} drawing={unit.drawing}/>:<LessonReference unit={unit}/>}
   <button onClick={onPractice}>Open focused practice</button>
  </>:<>
   {unit.assessment?<PaperAssessment id={unit.assessment} onPass={onPass} onOpenLesson={onOpenLesson}/>:unit.worksheet?<BrokerageWorksheet/>:unit.tour?<URSORAWorkflow onOpenFeature={onOpenFeature}/>:unit.cumulative?<CumulativeSession key={unit.id} unit={unit}/>:usesChart?<MarketClassChart key={`${unit.id}:${state.case}`} bars={bars} title={`Practice example ${state.case+1} · ${scenario}`} allowed={unit.studies} initial={unit.studies.length>2?unit.studies.slice(0,1):unit.studies} drawing={unit.drawing} persistKey={`${unit.id}:case:${state.case}`}/>:<LessonReference unit={unit}/>}
   {unit.cumulative ? <section className="university-card space-y-3"><h2>Check your understanding</h2><p>Keep the chart and one concept question together in a focused exercise.</p><button onClick={()=>setShowConceptChecks(true)}>Open chart and understanding check</button></section> : unit.assessment ? <details className="assessment-reference university-card"><summary>Optional knowledge recap · {unit.cases.length} quick questions</summary><div className="space-y-3"><p>These concept checks are supplementary. The assessment result comes from the session review above.</p><p>Understanding check {casePosition+1} of {unit.cases.length}</p><label>{item.prompt}<select value={state.answers[state.case]??''} onChange={event=>setState(v=>({...v,answers:{...v.answers,[v.case]:event.target.value},checked:{...v.checked,[v.case]:false}}))}><option value="" disabled>Choose an explanation…</option>{options.map(option=><option key={option.value} value={option.value}>{option.text}</option>)}</select></label><button disabled={state.answers[state.case]===undefined} onClick={()=>setState(v=>({...v,checked:{...v.checked,[v.case]:true}}))}>Check explanation</button>{state.checked[state.case]&&<ExerciseFeedback correct={Number(state.answers[state.case])===item.correct} text={item.why}/>}<div className="exercise-stage-actions"><button disabled={casePosition===0} onClick={()=>moveCase(casePosition-1)}>Previous question</button>{casePosition<unit.cases.length-1&&<button onClick={()=>moveCase(casePosition+1)}>Next question</button>}</div></div></details> : <section className="university-card space-y-3">{unit.assessment&&<p>Optional knowledge recap. Your simulation review determines capstone completion.</p>}<p>Understanding check {casePosition+1} of {unit.cases.length}</p><label>{item.prompt}<select value={state.answers[state.case]??''} onChange={event=>setState(v=>({...v,answers:{...v.answers,[v.case]:event.target.value},checked:{...v.checked,[v.case]:false}}))}><option value="" disabled>Choose an explanation…</option>{options.map(option=><option key={option.value} value={option.value}>{option.text}</option>)}</select></label><button disabled={state.answers[state.case]===undefined} onClick={()=>setState(v=>({...v,checked:{...v.checked,[v.case]:true}}))}>Check explanation</button>{state.checked[state.case]&&<ExerciseFeedback correct={Number(state.answers[state.case])===item.correct} text={`${Number(state.answers[state.case])===item.correct?'Correct.':'Revisit this distinction.'} ${item.why}`}/>}<div className="flex flex-wrap justify-between gap-2"><button disabled={casePosition===0} onClick={()=>moveCase(casePosition-1)}>Previous example</button>{casePosition<unit.cases.length-1?<button onClick={()=>moveCase(casePosition+1)}>Next example</button>:<button onClick={onReturn}>Return to lesson: {unit.title}</button>}</div>{passed&&!unit.assessment&&<p className="learn-feedback-correct">All three understanding checks passed. Revisit these examples whenever useful; this is practice completion, not a live-trading qualification.</p>}</section>}
  </>}
  <LessonDepth id={unit.id} onOpenSkill={id=>onOpenLesson(`skill:${id}`)}/>
  <details><summary>Sources and further learning</summary><p>Original explanations and synthetic illustrations, checked against the references below. Last reviewed October 19, 2026. Recheck current broker and regulator requirements before using account rules.</p>{unit.source.map(s=><a className="university-source" href={s.url} key={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}</details>
  <div className="flex flex-wrap justify-between gap-2">{practice?<button onClick={onReturn}>Review the explanation</button>:<button onClick={onPractice}>Practice this lesson</button>}<button onClick={onNext}>Next lesson</button></div>
 </article>;
}
function LessonReference({unit}:{unit:Unit}){
 const depth=lessonDepth(unit.id),worked=unit.cards.find(c=>c.title.startsWith('Worked'));
 return <section className="university-card space-y-3"><p className="text-xs uppercase tracking-wider">Worked reference · fictional examples</p><h2>Apply the idea to the stated facts</h2><p>{depth?.worked??worked?.text??unit.cards[0].text}</p><p className="text-sm">This reference supports guided practice. The separate skill demonstration uses independent checks without answer feedback until submission.</p></section>;
}
type Decision={scenario:Scenario;invalidation:string;clock:number;action:string;reason:string;price:number;quantity:number;observedClose:number;rsi:number|null;macd:number|null};
type SessionState={checkpointSeen:boolean;scenario:Scenario;clock:number;speed:number;quantity:number;reason:string;invalidation:string;cash:number;position:number;decisions:Decision[]};
function CumulativeSession({unit}:{unit:Unit}){
 const [state,setState]=useLearnState<SessionState>(`university-session-v1:${unit.id}`,{checkpointSeen:false,scenario:'rebound',clock:80*60,speed:10,quantity:10,reason:'',invalidation:'',cash:10000,position:0,decisions:[]});
 const [playing,setPlaying]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!playing)return;const timer=window.setInterval(()=>setState(v=>({...v,clock:Math.min((v.checkpointSeen?130:108)*60,v.clock+v.speed/5)})),200);return()=>window.clearInterval(timer);},[playing,setState]);
 useEffect(()=>{if(!state.checkpointSeen&&state.clock>=108*60){setPlaying(false);setState(v=>({...v,checkpointSeen:true}));}else if(state.clock>=130*60)setPlaying(false);},[state.clock,state.checkpointSeen,setState]);
 useEffect(()=>{const pause=()=>setPlaying(false);window.addEventListener(PREPARE_UPDATE_EVENT,pause);return()=>window.removeEventListener(PREPARE_UPDATE_EVENT,pause);},[]);
 const all=trainingSession(state.scenario),count=Math.floor(state.clock/60),elapsed=state.clock%60,closed=all.slice(0,count),next=all[count];
 let forming:StudyBar|undefined;
 if(next&&elapsed>0){const path=[next.open,next.low,next.high,next.close],fraction=elapsed/60,stage=Math.min(2,Math.floor(fraction*3)),p=fraction*3-stage,current=path[stage]+(path[stage+1]-path[stage])*p,seen=[...path.slice(0,stage+1),current];forming={...next,close:current,high:Math.max(...seen),low:Math.min(...seen),volume:Math.floor(next.volume*fraction)};}
 const price=forming?.close??closed.at(-1)!.close,studies=indicators(closed),last=count-1;
 const latest=closed.at(-1)!,prior=closed.at(-2)!;
 const bullishEngulf=prior.close<prior.open&&latest.close>latest.open&&latest.open<=prior.close&&latest.close>=prior.open;
 const bearishEngulf=prior.close>prior.open&&latest.close<latest.open&&latest.open>=prior.close&&latest.close<=prior.open;
 const act=(action:'wait'|'pass'|'buy'|'sell')=>{
  setPlaying(false);if(!state.reason){setMessage('Choose the evidence behind your decision first.');return;}
  if(!Number.isInteger(state.quantity)||state.quantity<1){setMessage('Choose a positive whole-share quantity.');return;}
  if(action==='buy'&&(!state.invalidation||Number(state.invalidation)>=price||Number(state.invalidation)<=0)){setMessage('For this long-share exercise, record an invalidation price below the current price.');return;}
  const quote=price+(action==='buy'?.02:action==='sell'?-.02:0);
  if(action==='buy'&&state.quantity*quote>state.cash){setMessage('This quantity exceeds available training cash.');return;}
  if(action==='sell'&&state.quantity>state.position){setMessage('You cannot sell more shares than the current position.');return;}
  setState(v=>({...v,cash:v.cash+(action==='sell'?v.quantity*quote:action==='buy'?-v.quantity*quote:0),position:v.position+(action==='buy'?v.quantity:action==='sell'?-v.quantity:0),decisions:[...v.decisions,{scenario:v.scenario,invalidation:v.invalidation,clock:v.clock,action,reason:v.reason,price:quote,quantity:action==='buy'||action==='sell'?v.quantity:0,observedClose:closed.at(-1)!.close,rsi:studies.rsi[last],macd:studies.macd[last]}]}));
  setMessage('Decision recorded with the visible evidence. Review whether your reason matches structure, location, timing and risk; this check does not predict the outcome.');
 };
 return <section className="space-y-4" aria-label="Cumulative market session">
  <h2>Read the session as it unfolds</h2><p>Original SIM shares · 1-minute candles · Only observed candles and completed-candle indicators. The replay starts with 80 minutes of context pauses at minute 108 for an evidence check, then can continue to minute 130. Pause any time to make a decision. No candles advance on a click.</p>
  <label>Session example<select value={state.scenario} disabled={state.position>0} onChange={event=>{setPlaying(false);setState(v=>({...v,scenario:event.target.value as Scenario,clock:80*60,checkpointSeen:false,cash:10000,position:0,reason:'',invalidation:''}));setMessage('New example selected. Earlier decisions remain in the review log.');}}><option value="rebound">Rebound inside earlier weakness</option><option value="trend">Persistent upward movement</option><option value="chop">Conflicting signals in a range</option><option value="selloff">Accelerating selling pressure</option></select></label>
  <div className="flex flex-wrap items-center gap-3"><button onClick={()=>setPlaying(!playing)} disabled={count>=130}>{playing?'Pause session':'Play session'}</button><label>Replay pace<select value={state.speed} onChange={event=>setState(v=>({...v,speed:Number(event.target.value)}))}><option value={10}>10× · 6 seconds per candle</option><option value={30}>30× · 2 seconds per candle</option><option value={60}>60× · 1 second per candle</option></select></label><span>{playing?'Playing':'Paused'} · {Math.floor(state.clock/60)} complete minutes since 09:30</span></div>
  <div className="university-quicktrade"><span>Bid ${(price-.02).toFixed(2)} · Ask ${(price+.02).toFixed(2)} · {state.position} shares</span><button onClick={()=>act('buy')}>Quick buy / add</button><button disabled={!state.position} onClick={()=>act('sell')}>Quick sell / trim</button></div>
  <div className="university-live-layout"><div className="min-w-0 space-y-4"><MarketClassChart compactTools key={state.scenario} bars={closed} forming={forming} title="Cumulative decision chart" allowed={unit.studies} initial={['vwap']} drawing="line" persistKey={`${unit.id}:session:${state.scenario}`}/>
  <section className="learn-coach space-y-2" aria-label="Visible evidence map"><h3>Compare the evidence before choosing</h3><p>Latest closed pair: {bullishEngulf?'bullish body engulfing':bearishEngulf?'bearish body engulfing':'no body-engulfing formation in this pair'}. Candle color describes that interval, not a guaranteed next move.</p><p>Closed price is {latest.close>=studies.vwap[last]?'above':'below'} session VWAP and {latest.close>=(studies.sma[last]??latest.close)?'above':'below'} SMA 20. MACD is {(studies.macd[last]??0)>=0?'above':'below'} zero; RSI is {studies.rsi[last]?.toFixed(1)}.</p><p>{bullishEngulf&&(studies.macd[last]??0)<0?'A bullish local pattern coexists with negative MACD. Check whether this is a rebound within earlier weakness; the candle does not erase the larger decline.':(studies.rsi[last]??0)>70?'Momentum is high. That can persist during a trend; do not assume an automatic top.':'Compare location, prior swings and the next completed response. Waiting for a defined condition remains valid.'}</p></section>
  </div><aside className="university-live-station"><section className="university-card space-y-3"><h3>Decision station · fictional shares</h3><p>Bid ${(price-.02).toFixed(2)} · Ask ${(price+.02).toFixed(2)} · Cash ${state.cash.toFixed(2)} · Position {state.position} shares · Equity ${(state.cash+state.position*(price-.02)).toFixed(2)}</p><p className="text-sm">Simplified fills at displayed bid/ask, no fees, partial fills or short selling. Decisions pause playback. A recorded invalidation is a plan condition, not an automatic stop order.</p><label>What does the visible evidence support?<select value={state.reason} onChange={e=>setState(v=>({...v,reason:e.target.value}))}><option value="">Choose the evidence…</option><option>Short-term improvement within broader weakness; I still need a structure break</option><option>Continuation is conditional on a pullback holding and a closed trigger</option><option>Repeated crossings and weak progress support waiting or passing</option><option>The recorded invalidation has occurred; reassess or exit</option></select></label><div className="learn-exercise-inputs"><label>Shares<input type="number" min="1" step="1" value={state.quantity} onChange={e=>setState(v=>({...v,quantity:Number(e.target.value)}))}/></label><label>Long-thesis invalidation price<input type="number" step="0.01" value={state.invalidation} onChange={e=>setState(v=>({...v,invalidation:e.target.value}))}/></label></div><div className="flex flex-wrap gap-2"><button onClick={()=>act('wait')}>Record wait</button><button onClick={()=>act('pass')}>Record pass</button><button onClick={()=>act('buy')}>Buy / add simulated shares</button><button disabled={!state.position} onClick={()=>act('sell')}>Sell / trim simulated shares</button></div>{message&&<p role="status" className="learn-coach">{message}</p>}</section></aside></div>
  <details><summary>Review {state.decisions.length} recorded decisions</summary>{state.decisions.slice().reverse().map((d,i)=><p key={i} className="university-decision">{d.scenario} · Minute {Math.floor(d.clock/60)} · {d.action} {d.quantity||''} · ${d.price.toFixed(2)} · Last closed price {d.observedClose.toFixed(2)} · RSI {d.rsi?.toFixed(1)??'warming'} · MACD {d.macd?.toFixed(2)??'warming'} · Invalidation {d.invalidation||'not recorded'}<br/>{d.reason}</p>)}</details>
 </section>;
}

function URSORAWorkflow({onOpenFeature}:{onOpenFeature?: (feature:LearnFeature)=>void}){
 const features:{id:LearnFeature;title:string;text:string}[]=[
 {id:'command',title:'Market Overview',text:'Start with the broader session context before choosing a candidate.'},
 {id:'opportunities',title:'Opportunities',text:'Inspect the thesis and its evidence. Write your own entry condition, invalidation and remaining room before deciding.'},
 {id:'profile',title:'MyURSORA',text:'Set a process goal based on what your practice showed needs work.'},
 {id:'trades',title:'Positions & TradeCycles',text:'Review connected trading activity and the developing trade lifecycle when data is available.'},
 {id:'history',title:'Activity',text:'Use the calendar and timeline to revisit what you actually executed.'},
 {id:'backtest',title:'Historical Evidence',text:'Compare evidence available at entry with what happened later. Keep those two views separate.'},
 {id:'trader',title:'Patterns',text:'Look for recurring process and behavior across trades. This differs from the candle-pattern library you studied.'}
 ];
 return <section className="space-y-4" aria-label="URSORA feature workflow"><h2>Turn learning into a repeatable workflow</h2><p>Your lesson position saves as you explore. Use the Return to lesson button at the top of each destination to come back here. Connected features may require account activity before they can show meaningful evidence.</p>{features.map(f=><section className="learn-coach space-y-2" key={f.id}><h3>{f.title}</h3><p>{f.text}</p><button disabled={!onOpenFeature} onClick={()=>onOpenFeature?.(f.id)}>Open {f.title}</button></section>)}<p>Live execution through supported brokerage connections is planned. Orders in URSORA University remain simulated; no availability date is promised here.</p></section>;
}
