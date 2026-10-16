import React, { useCallback, useEffect } from 'react';
import LearnProgress, { useLearnState } from './LearnProgress';
import Placement from './Placement';
import LessonVisual from './LessonVisual';
import LearnWorkspace from './LearnWorkspace';
import './learn.css';
import { lessons } from '@/lib/learn/lessons';
import PatternLesson from './PatternLesson';
import LessonPractice from './LessonPractice';
import UniversityModule, { type LearnFeature } from './UniversityModule';
import { stageNames } from '@/lib/learn/university';
import LearningHome from './LearningHome';
import { newQuizSeed, shuffleQuiz } from '@/lib/learn/quiz-order';
import { improveQuestion } from '@/lib/learn/question-quality';
import { learningDashboard, passedLesson } from '@/lib/learn/dashboard';
import { useState } from 'react';
type Enrollment = { path: 'foundations' | 'practice' | null; page: string; practiceLesson?: string; answers: Record<string, number>; checked: Record<string, boolean> };
export default function LearnEnvironment({ onDisable, onOpenFeature, home = false, onLocationChange }: { onDisable?: () => void; onOpenFeature?: (feature:LearnFeature)=>void; home?: boolean; onLocationChange?: (title: string) => void }) {
  return <LearnProgress><LearnContent onDisable={onDisable} onOpenFeature={onOpenFeature} home={home} onLocationChange={onLocationChange}/></LearnProgress>;
}
function LearnContent({ onDisable, onOpenFeature, home, onLocationChange }: { onDisable?: () => void; onOpenFeature?: (feature:LearnFeature)=>void; home: boolean; onLocationChange?: (title: string) => void }) {
  const [showHome, setShowHome] = useState(home);
  const [quizOrder] = useLearnState('lesson-choice-order-v1',()=>({seed:newQuizSeed()}));
  const [enrollment, setEnrollment] = useLearnState<Enrollment>('enrollment', { path: null, page: 'candles', answers: {}, checked: {} });
  const { path, page } = enrollment;
  const [course,setCourse] = useLearnState('university-course-v1',{completed:{} as Record<string,boolean>});
  const answer = enrollment.answers[page] ?? null, checked = enrollment.checked[page] ?? false;
  const navigate = (id: string) => { setShowHome(false); setEnrollment(value => ({ ...value, page: id, practiceLesson: id === 'practice' && lessons.some(item => item.id === value.page) ? value.page : value.practiceLesson })); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const exerciseId = page.startsWith('exercise:') ? page.slice(9) : null;
  const exercise = lessons.find(item => item.id === exerciseId);
  const lesson = lessons.find(l => l.id === page);
  const summaryQuestion = lesson ? improveQuestion(`summary-${lesson.id}`,0,{prompt:lesson.question,options:lesson.choices,correct:lesson.correct}) : null;
  const summaryChoices = summaryQuestion ? shuffleQuiz(summaryQuestion.options.map((choice,i)=>({choice,value:i})),quizOrder.seed,`summary:${page}`) : [];
  const index = lessons.findIndex(l => l.id === page);
  const activeLesson = exercise ?? lesson;
  const markPassed = useCallback(() => { if(activeLesson){const key=activeLesson.unit?.assessment?`assessment:${activeLesson.id}`:activeLesson.id;setCourse(value=>value.completed[key]?value:{...value,completed:{...value.completed,[key]:true}});} },[activeLesson,setCourse]);
  const isPassed = (id: string) => { const item = lessons.find((lesson) => lesson.id === id); return item ? passedLesson(item, enrollment, course.completed) : false; };
  const dashboard = learningDashboard(lessons, enrollment, course.completed);
  const recommended=lessons.find(item=>!isPassed(item.id));
  const practiceLesson = lessons.find(item => item.id === enrollment.practiceLesson);
  const items = [{ id: 'placement', title: 'Placement & foundation recap' }, ...lessons.map(l => ({ id: l.id, title: l.title, stage:l.stage })), { id: 'practice', title: 'Full trading sandbox' }, { id: 'review', title: 'Review your decisions' }];
  const currentPage = path ? exercise?.id ?? page : 'placement';
  const currentTitle = items.find(item => item.id === currentPage)?.title ?? 'Learning session';
  useEffect(() => { onLocationChange?.(showHome ? 'Learning home' : currentTitle); }, [showHome, currentTitle, onLocationChange]);
  const moduleButtons = <>{items.map((item,i) => <React.Fragment key={item.id}>{'stage' in item && (i===1 || !('stage' in items[i-1]) || (items[i-1] as typeof item).stage !== item.stage) && <h3 className="university-stage-heading">Stage {String(item.stage)} · {stageNames[Number(item.stage)]}</h3>}<button aria-current={currentPage === item.id ? 'page' : undefined} disabled={!path && item.id !== 'placement'} onClick={() => navigate(item.id)}><span>{item.title}</span>{lessons.find(l=>l.id===item.id)?.unit?.assessment&&<small>Capstone · Continuous paper session</small>}{currentPage === item.id && <small>Current activity{exercise ? ' · Practice' : ''}</small>}{isPassed(item.id) && <small>{lessons.find(l=>l.id===item.id)?.unit?.assessment?'Assessment process requirements met':'Understanding check passed'}</small>}{!path && item.id !== 'placement' && <small>After placement</small>}</button></React.Fragment>)}</>;

  if (showHome) return <LearningHome dashboard={dashboard} lessons={lessons} onStart={navigate} onOpenFeature={onOpenFeature}/>;
  return <div className="learn-workspace learn-environment">
    <nav className="learn-module-sidebar" aria-label="Learn modules"><button onClick={() => setShowHome(true)}>Learning home</button><h2>URSORA University</h2><p className="mt-1 text-xs text-zinc-400">Follow the staged path or explore a lesson. Advanced topics build on earlier examples.</p>{path && recommended && <p className="mt-3 text-xs">Suggested next: {recommended.title}</p>}<div className="learn-module-links">{moduleButtons}</div>{onDisable && <button className="mt-4" onClick={onDisable}>Leave URSORA U</button>}</nav>
    <div className="min-w-0 space-y-4"><details className="learn-mobile-modules learn-panel"><summary>Modules · {currentTitle}</summary><button onClick={() => setShowHome(true)}>Learning home</button><nav aria-label="Learn module menu" className="learn-module-links">{moduleButtons}</nav></details>
      {onDisable && <button className="learn-mobile-modules" onClick={onDisable}>Leave URSORA U</button>}
      {!path || page === 'placement' ? <Placement onComplete={value => setEnrollment(s => ({ ...s, path: value, page: value === 'foundations' ? 'market-basics' : 'candles' }))}/> : activeLesson?.unit ? <UniversityModule key={activeLesson.id} unit={activeLesson.unit} practice={!!exercise} onPractice={() => navigate('exercise:' + activeLesson.id)} onReturn={() => navigate(activeLesson.id)} onNext={() => navigate(lessons[lessons.indexOf(activeLesson)+1]?.id ?? 'practice')} onPass={markPassed} onOpenLesson={navigate} onOpenFeature={onOpenFeature}/> : exercise ? <LessonPractice key={exercise.id} lesson={exercise} onPass={markPassed} onReturn={() => navigate(exercise.id)} onNext={() => navigate(lessons[lessons.findIndex(item => item.id === exercise.id) + 1]?.id ?? 'practice')}/> : lesson ? <article className="learn-panel mx-auto w-full max-w-3xl space-y-5">
        <p className="text-xs uppercase tracking-wider text-sky-300">URSORA University · Stage {lesson.stage} · Lesson {index + 1} of {lessons.length}</p>
        <h1 className="text-xl">{lesson.title}</h1>
        {['candle-patterns', 'chart-patterns'].includes(lesson.id) ? <>
          <div className="learn-coach space-y-2"><p>{lesson.body}</p><button onClick={() => navigate('exercise:' + lesson.id)}>Start lesson exercise</button><p>{lesson.task}</p></div>
          <PatternLesson group={lesson.id === 'candle-patterns' ? 'candle' : 'chart'}/>
        </> : <>
          <p className="learn-activity-context">What you’re doing: understand the concept, inspect the illustration, then check your understanding. You can revisit this page at any time.</p>
          <LessonVisual topic={lesson.id}/><h2>What it means and why it matters</h2><p>{lesson.body}</p>
          <div className="learn-coach"><h2>Try it in practice</h2><p className="mt-2">{lesson.task}</p><button className="mt-3" onClick={() => navigate('exercise:' + lesson.id)}>Start lesson exercise</button></div>
          <fieldset className="space-y-3"><legend>{summaryQuestion?.prompt}</legend>{summaryChoices.map(({choice,value}) => <label key={value} className="learn-choice"><input type="radio" name={lesson.id} checked={answer === value} onChange={() => setEnrollment(s => ({ ...s, answers: { ...s.answers, [page]: value }, checked: { ...s.checked, [page]: false } }))}/><span>{choice}</span></label>)}
            <button disabled={answer === null} onClick={() => setEnrollment(s => ({ ...s, checked: { ...s.checked, [page]: true } }))}>Check understanding</button>
            {checked && <p role="status" className={answer === lesson.correct ? 'learn-feedback-correct' : 'learn-feedback-incorrect'}>{answer === lesson.correct ? 'That matches the explanation. ' : 'Revisit the distinction: '}{lesson.explanation}</p>}
          </fieldset>
        </>}
        <div className="flex flex-wrap justify-between gap-3"><button disabled={index === 0} onClick={() => navigate(lessons[index - 1].id)}>Previous lesson</button><button onClick={() => navigate(lessons[index + 1]?.id ?? 'practice')}>Next lesson: {lessons[index + 1]?.title ?? 'Full trading sandbox'}</button></div>
      </article>
        : <>{(page === 'practice' || page === 'review') && practiceLesson && <section className="learn-panel space-y-2" aria-label="Lesson practice exercise"><button onClick={() => navigate(practiceLesson.id)}>Return to lesson: {practiceLesson.title}</button><p>This full trading sandbox combines planning, orders and position management. Use the lesson’s dedicated exercise for focused practice.</p></section>}<LearnWorkspace key={page} placementPath={path} reviewMode={page === 'review'} onNextLesson={() => navigate(page === 'review' ? 'candles' : 'review')}/></>}
    </div>
  </div>;
}
