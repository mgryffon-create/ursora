import React, { useEffect } from 'react';
import { exercises, type Exercise, type ExerciseQuestion } from '@/lib/learn/exercises';
import { patterns, patternBars } from '@/lib/learn/patterns';
import { useLearnState } from './LearnProgress';
import StudyChart from './StudyChart';
type State = { index: number; answers: Record<string,string>; checked: Record<string,boolean>; average: boolean; position: number; quantity: number; side: 'buy' | 'sell'; order: 'market' | 'limit' };
type Props = { lesson: {id:string;title:string}; onReturn:()=>void; onNext:()=>void; onPass?:()=>void };
export default function LessonPractice({lesson,onReturn,onNext,onPass}:Props) {
 const [state,setState] = useLearnState<State>(`lesson-exercise-v1:${lesson.id}`,{index:0,answers:{},checked:{},average:false,position:4,quantity:2,side:'buy',order:'market'});
 const group = lesson.id === 'candle-patterns' ? 'candle' : lesson.id === 'chart-patterns' ? 'chart' : null;
 const catalog = group ? patterns.filter(pattern=>pattern.group === group) : [];
 const scenes = exercises[lesson.id] ?? [];
 const count = catalog.length || scenes.length;
 const completed = catalog.length ? catalog.every((pattern,i)=>state.checked[pattern.id] && Number(state.answers[`${pattern.id}:0`])===i && Number(state.answers[`${pattern.id}:1`])===1) : scenes.length>0 && scenes.every((scene,i)=>state.checked[String(i)] && scene.questions.every((q,j)=>Number(state.answers[`${i}:${j}`])===q.correct));
 useEffect(()=>{if(completed)onPass?.();},[completed,onPass]);
 const index = Math.min(state.index,count-1), pattern = catalog[index];
 const scene: Exercise = pattern ? {
  title:'Recognize the formation and read its context',why:'Naming a shape is only the first step. Its location and subsequent evidence determine what you can reasonably claim.',task:`Context: ${pattern.context}. Inspect the displayed formation, choose its name, then select the cautious interpretation.`,
  ...(pattern.bars ? patternBars(pattern) : {points:pattern.points}),
  questions:[{prompt:'This formation is best described as',options:catalog.map(item=>item.name),correct:index,explanation:`${pattern.name}: ${pattern.shape} Context: ${pattern.context}.`},
   {prompt:'What can I reasonably infer?',options:['The next move is guaranteed',pattern.suggests,'The pattern removes the need for invalidation'],correct:1,explanation:pattern.boundary}],
 } : scenes[index];
 if(!scene) return <section className="learn-panel"><button onClick={onReturn}>Return to lesson: {lesson.title}</button><p>Choose a lesson exercise from the module menu.</p></section>;
 const key = pattern?.id ?? String(index);
 const answerKey = (i:number)=>`${key}:${i}`;
 const answered = scene.questions.every((_,i)=>state.answers[answerKey(i)] !== undefined);
 const correct = (question:ExerciseQuestion,i:number)=>Number(state.answers[answerKey(i)])===question.correct;
 const allCorrect = scene.questions.every(correct);
 const checked = state.checked[key];
 const progressKeys = catalog.length ? catalog.map(item=>item.id) : scenes.map((_,i)=>String(i));
 const checkedCount = progressKeys.filter(id=>state.checked[id]).length;
 const move = (next:number)=>{setState(value=>({...value,index:next}));window.scrollTo({top:0,behavior:'smooth'});};
 return <article className="learn-panel learn-exercise mx-auto w-full max-w-4xl space-y-5">
  <button onClick={onReturn}>Return to lesson: {lesson.title}</button>
  <p className="text-xs uppercase tracking-wider text-sky-300">Lesson practice · {lesson.title}</p>
  <h1 className="text-xl">{scene.title}</h1>
  <p className="learn-activity-context"><strong>Why you’re doing this:</strong> {scene.why}</p>
  <label>Exercise {index+1} of {count}<select value={index} onChange={event=>move(Number(event.target.value))}>{Array.from({length:count},(_,i)=><option key={i} value={i}>{i+1} · {pattern ? `Pattern case ${i+1}` : scenes[i].title}{state.checked[progressKeys[i]] ? ' · checked' : ''}</option>)}</select></label>
  <p>{scene.task}</p>
  {(scene.bars || scene.points) && <StudyChart key={`${lesson.id}:${index}`} bars={scene.bars} points={scene.points} focus={pattern?.bars ? 3 : -1} title={pattern ? pattern.bars ? 'Identify this original formation · earlier candles faded' : 'Identify this formation across the displayed swings' : scene.title} levels={scene.levels} average={scene.tool==='average' && state.average}/>}
  {scene.tool==='average' && <button aria-pressed={state.average} onClick={()=>setState(value=>({...value,average:!value.average}))}>{state.average ? 'Hide VWAP comparison' : 'Show VWAP comparison'}</button>}
  {scene.tool==='position' && <section className="learn-coach space-y-3" aria-label="Position exercise"><h2>Original position: 4 contracts</h2><label>Contracts remaining<input type="range" min="0" max="8" value={state.position} onChange={event=>setState(value=>({...value,position:Number(event.target.value)}))}/></label><div className="learn-position-blocks" aria-hidden="true">{Array.from({length:8},(_,i)=><span className={i < state.position ? 'filled' : ''}>{i+1}</span>)}</div><p role="status">{state.position===0 ? 'Close: sell all 4. No contracts remain.' : state.position<4 ? `Trim: sell ${4-state.position}. ${state.position} remain.` : state.position===4 ? 'Hold: all 4 remain.' : `Add: buy ${state.position-4}. ${state.position} remain.`} Position size: {state.position/4*100}% of the original. This is quantity, not a forecast of gain or loss.</p></section>}
  {scene.tool==='ticket' && <section className="learn-coach space-y-3" aria-label="Contract ticket exercise"><h2>Illustrative SIM 100 Call · No order is submitted</h2><p>Strike $100 · Training expiry in 5 sessions · Bid $0.54 · Ask $0.60 · Multiplier 100</p><div className="learn-exercise-inputs"><label>Action<select value={state.side} onChange={event=>setState(value=>({...value,side:event.target.value as State['side']}))}><option value="buy">Buy at ask</option><option value="sell">Sell existing contracts at bid</option></select></label><label>Contracts<select value={state.quantity} onChange={event=>setState(value=>({...value,quantity:Number(event.target.value)}))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Order type<select value={state.order} onChange={event=>setState(value=>({...value,order:event.target.value as State['order']}))}><option value="market">Market</option><option value="limit">Limit at $0.55</option></select></label></div><p role="status">{state.side==='buy' ? 'Premium cost' : 'Gross proceeds'}: ${((state.side==='buy' ? .60 : .54)*100*state.quantity).toFixed(2)}. Fees: ${(state.quantity*.65).toFixed(2)}. {state.side==='buy' ? 'Total debit' : 'Net credit'}: ${(((state.side==='buy' ? .60 : .54)*100+(state.side==='buy' ? .65 : -.65))*state.quantity).toFixed(2)}.</p><p>{state.order==='market' ? 'In this simplified exercise, a market order uses the displayed quote.' : state.side==='buy' ? 'Buy limit $0.55: waiting while ask is $0.60. Totals above are a comparison at the displayed ask, not a fill.' : 'Sell limit $0.55: waiting while bid is $0.54. Totals above are a comparison at the displayed bid, not a fill.'} Actual brokerages and execution conditions vary.</p></section>}
  <fieldset className="space-y-4"><legend className="mb-3">Complete the explanation</legend>{scene.questions.map((question,i)=><div key={answerKey(i)}><label>{question.prompt}<select value={state.answers[answerKey(i)] ?? ''} onChange={event=>setState(value=>({...value,answers:{...value.answers,[answerKey(i)]:event.target.value},checked:{...value.checked,[key]:false}}))}><option value="" disabled>Choose an explanation…</option>{question.options.map((option,j)=><option key={option} value={j}>{option}</option>)}</select></label>{checked && <p role="status" className={correct(question,i) ? 'learn-feedback-correct mt-2' : 'learn-feedback-incorrect mt-2'}>{correct(question,i) ? 'Correct. ' : 'Try again. '}{question.explanation}</p>}</div>)}<button className="learn-primary" disabled={!answered} onClick={()=>setState(value=>({...value,checked:{...value.checked,[key]:true}}))}>Check exercise</button></fieldset>
  {checked && <p className={allCorrect ? 'learn-feedback-correct' : 'learn-feedback-incorrect'}>{allCorrect ? 'You connected the observation to its meaning. Try the next example.' : 'Use the explanation to revise your choices. You can also return to the lesson.'}</p>}
  <p className="text-sm">{checkedCount} of {count} examples checked. Your choices and exercise position save with your Learn progress. These guided checks are practice, not a competency certification.</p>
  <div className="flex flex-wrap justify-between gap-3"><button disabled={index===0} onClick={()=>move(index-1)}>Previous exercise</button>{index<count-1 ? <button onClick={()=>move(index+1)}>Next exercise</button> : <button onClick={onReturn}>Finish practice & return to lesson</button>}</div>
  <button onClick={onNext}>Next lesson</button>
 </article>;
}
