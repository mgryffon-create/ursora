import React from 'react';
import { newQuizSeed, shuffleQuiz } from '@/lib/learn/quiz-order';
import LessonVisual from './LessonVisual';
import { useLearnState } from './LearnProgress';
import {diagnosticQuestions as questions,diagnosticGaps} from '@/lib/learn/placement-questions';
import {skills} from '@/lib/learn/competencies';
type State = { priorScreening?:{order:number[];answers:number[]}; order?: number[]; level: string; answers: number[]; result: boolean; recap: number };
export default function Placement({ onComplete }: { onComplete: (path: 'foundations' | 'practice',start?:string) => void }) {
 const [randomization] = useLearnState('placement-order-v1',()=>({seed:newQuizSeed()}));
 const [state, setState] = useLearnState<State>('placement', () => ({ order:shuffleQuiz(questions.map((_,i)=>i),randomization.seed,'cases'), level: '', answers: [], result: false, recap: 0 }));
 const { level, answers, result, recap } = state;
 const concepts = [
  { title: 'Reading a candle', topic: 'candles', why: 'You need to distinguish a finished observation from movement that can still change.' },
  { title: 'Recognizing a pullback', topic: 'movement', why: 'This helps you avoid treating every retreat as either a reversal or an automatic entry.' },
  { title: 'Building a testable thesis', topic: 'plan', why: 'A clear idea and invalidation condition give you a way to reassess before emotions take over.' },
  { title: 'Reviewing decision quality', topic: 'outcome', why: 'Separating process from profit helps you learn from both winning and losing trades.' },
 ];
 const order=state.order??questions.map((_,i)=>i);
 const questionId=order[Math.min(answers.length,questions.length-1)];
 const current={...questions[questionId],options:questions[questionId].answers};
 const answerChoices=shuffleQuiz(current.options.map((answer,i)=>({answer,value:i})),randomization.seed,`answer:${questionId}`);
 const gaps=diagnosticGaps(order,answers);
 const needsFoundation=level==='novice';
 if(level!=='novice'&&!result&&state.order&&state.order.length<questions.length)return <section className="learn-panel space-y-4"><h1>Continue with the expanded diagnostic</h1><p>Your earlier screening answers will remain saved. The expanded diagnostic checks twelve questions across more skill areas.</p><button onClick={()=>setState(s=>({...s,priorScreening:{order:s.order??[],answers:s.answers},order:shuffleQuiz(questions.map((_,i)=>i),randomization.seed,'expanded-cases'),answers:[],result:false}))}>Start expanded diagnostic</button></section>;
 return <div className="learn-focus-stage"><section className="learn-panel w-full max-w-2xl space-y-5" aria-label="Learning placement card">
  <p className="text-xs uppercase tracking-widest text-sky-300">{result && needsFoundation ? `Foundation recap · Card ${recap + 1} of 4` : 'Learning placement · Quick assessment'}</p>
  <h1 className="text-2xl">{!level ? 'Find your starting point' : !result ? `Question ${answers.length + 1} of ${questions.length}` : needsFoundation ? concepts[recap].title : 'Your learning profile'}</h1>
  {!level ? <><p>Choose your experience, then demonstrate the basics. We’ll save your place as you go.</p><div className="grid gap-3">{['novice', 'intermediate', 'experienced'].map(v => <button key={v} className="text-left capitalize" onClick={() => setState(s => ({ ...s, level: v, result: v === 'novice' }))}>{v === 'novice' ? 'Novice — start from the beginning' : v}</button>)}</div></>
   : !result ? <><h2>{current.prompt}</h2><div className="grid gap-3">{answerChoices.map(({answer,value}) => <button key={value} className="text-left" onClick={() => setState(s => ({ ...s, answers: [...s.answers, value], result: s.answers.length === questions.length - 1 }))}>{answer}</button>)}</div><button onClick={() => setState(s => s.answers.length ? { ...s, answers: s.answers.slice(0, -1) } : { ...s, level: '' })}>Back</button></>
   : needsFoundation ? <><p className="learn-activity-context">What you’re doing: reviewing one foundational concept before applying it in practice.</p><LessonVisual topic={concepts[recap].topic}/><h2>What it means</h2><p className="text-lg leading-relaxed">{questions[recap].recap}</p><h2>Why this matters</h2><p>{concepts[recap].why}</p><div className="flex flex-wrap justify-between gap-3"><button onClick={() => setState(s => s.recap ? { ...s, recap: s.recap - 1 } : { ...s, level: '', result: false, answers: [] })}>Back</button><button onClick={() => recap < 3 ? setState(s => ({ ...s, recap: s.recap + 1 })) : onComplete('foundations')}>{recap < 3 ? 'Next foundation' : 'Begin guided practice'}</button></div></>
   : <><p>{gaps.length?'These responses suggest specific areas to review. The screening recommends lessons; applied demonstrations establish skills.':'These introductory checks were correct. Applied demonstrations are still required for advanced assessment eligibility.'}</p>{skills.filter(skill=>gaps.some(q=>q.skill===skill.id)).map(skill=><section key={skill.id} className="learn-coach"><h2>{skill.title}</h2><p>{gaps.find(q=>q.skill===skill.id)!.recap}</p><button onClick={()=>onComplete('practice',gaps.find(q=>q.skill===skill.id)!.lesson)}>Start recommended lesson</button></section>)}<button onClick={()=>onComplete('practice',gaps[0]?.lesson??'candles')}>Continue my learning path</button><button onClick={()=>setState(s=>({...s,order:shuffleQuiz(questions.map((_,i)=>i),randomization.seed,'expanded-cases'),answers:[],result:false}))}>Retake expanded diagnostic</button></>}
  <p className="text-xs text-zinc-400">This introductory screening routes learning. It is not a full competency assessment or a live-trading readiness test.</p>
 </section></div>;
}
