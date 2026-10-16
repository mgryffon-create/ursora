import React from 'react';
import { newQuizSeed, shuffleQuiz } from '@/lib/learn/quiz-order';
import { improveQuestion } from '@/lib/learn/question-quality';
import LessonVisual from './LessonVisual';
import { useLearnState } from './LearnProgress';
const questions = [
  { prompt: 'A candle opened at $100 and is currently at $101. Before it closes, what can happen?', answers: ['It must close above $100', 'Its body and wicks can still change', 'The next candle must rise'], correct: 1, recap: 'A candle summarizes a time window. Its body connects the open and current price; wicks show the highest and lowest prices so far. It remains unfinished until the window ends.' },
  { prompt: 'Price retreats during an upward trend. What does that establish?', answers: ['The trend has ended', 'A profitable entry is guaranteed', 'A pullback needs context before calling it a reversal'], correct: 2, recap: 'A pullback is a move against the recent direction. Compare its depth and follow-through with earlier swings before deciding the trend has changed.' },
  { prompt: 'What should your trade thesis include?', answers: ['Evidence, an entry condition, and what would prove it wrong', 'Only a price prediction', 'A reason to hold until profitable'], correct: 0, recap: 'A thesis is a testable explanation of what you expect and why. Invalidation is the observable condition that would make that explanation no longer hold.' },
  { prompt: 'A sound plan lost money. What follows?', answers: ['The process must have been wrong', 'Judge the decision using evidence available at entry', 'Double the next position to recover'], correct: 1, recap: 'A good decision can lose. Review evidence, position size and adherence to your plan separately from the financial outcome.' },
];
type State = { order?: number[]; level: string; answers: number[]; result: boolean; recap: number };
export default function Placement({ onComplete }: { onComplete: (path: 'foundations' | 'practice') => void }) {
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
 const current=improveQuestion('placement',questionId,{...questions[questionId],options:questions[questionId].answers});
 const answerChoices=shuffleQuiz(current.options.map((answer,i)=>({answer,value:i})),randomization.seed,`answer:${questionId}`);
 const needsFoundation = level === 'novice' || order.some((id, i) => answers[i] !== questions[id].correct);
 return <div className="learn-focus-stage"><section className="learn-panel w-full max-w-2xl space-y-5" aria-label="Learning placement card">
  <p className="text-xs uppercase tracking-widest text-sky-300">{result && needsFoundation ? `Foundation recap · Card ${recap + 1} of 4` : 'Learning placement · Quick assessment'}</p>
  <h1 className="text-2xl">{!level ? 'Find your starting point' : !result ? `Question ${answers.length + 1} of ${questions.length}` : needsFoundation ? concepts[recap].title : 'Foundations screening passed'}</h1>
  {!level ? <><p>Choose your experience, then demonstrate the basics. We’ll save your place as you go.</p><div className="grid gap-3">{['novice', 'intermediate', 'experienced'].map(v => <button key={v} className="text-left capitalize" onClick={() => setState(s => ({ ...s, level: v, result: v === 'novice' }))}>{v === 'novice' ? 'Novice — start from the beginning' : v}</button>)}</div></>
   : !result ? <><h2>{current.prompt}</h2><div className="grid gap-3">{answerChoices.map(({answer,value}) => <button key={value} className="text-left" onClick={() => setState(s => ({ ...s, answers: [...s.answers, value], result: s.answers.length === questions.length - 1 }))}>{answer}</button>)}</div><button onClick={() => setState(s => s.answers.length ? { ...s, answers: s.answers.slice(0, -1) } : { ...s, level: '' })}>Back</button></>
   : needsFoundation ? <><p className="learn-activity-context">What you’re doing: reviewing one foundational concept before applying it in practice.</p><LessonVisual topic={concepts[recap].topic}/><h2>What it means</h2><p className="text-lg leading-relaxed">{questions[recap].recap}</p><h2>Why this matters</h2><p>{concepts[recap].why}</p><div className="flex flex-wrap justify-between gap-3"><button onClick={() => setState(s => s.recap ? { ...s, recap: s.recap - 1 } : { ...s, level: '', result: false, answers: [] })}>Back</button><button onClick={() => recap < 3 ? setState(s => ({ ...s, recap: s.recap + 1 })) : onComplete('foundations')}>{recap < 3 ? 'Next foundation' : 'Begin guided practice'}</button></div></>
   : <><p>Your next step is to apply these ideas in a guided or independent session.</p><button onClick={() => onComplete('practice')}>Open practice</button></>}
  <p className="text-xs text-zinc-400">This introductory screening routes learning. It is not a full competency assessment or a live-trading readiness test.</p>
 </section></div>;
}
