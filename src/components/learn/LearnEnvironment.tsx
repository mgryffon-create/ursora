import React, { useCallback } from 'react';
import LearnProgress, { useLearnState } from './LearnProgress';
import Placement from './Placement';
import LessonVisual from './LessonVisual';
import LearnWorkspace from './LearnWorkspace';
import './learn.css';
import { lessons } from '@/lib/learn/lessons';
import PatternLesson from './PatternLesson';
import LessonPractice from './LessonPractice';
import UniversityModule from './UniversityModule';
import { stageNames } from '@/lib/learn/university';
type Enrollment = { path: 'foundations' | 'practice' | null; page: string; practiceLesson?: string; answers: Record<string, number>; checked: Record<string, boolean> };
export default function LearnEnvironment({ onDisable }: { onDisable?: () => void }) {
  return <LearnProgress><LearnContent onDisable={onDisable}/></LearnProgress>;
}
function LearnContent({ onDisable }: { onDisable?: () => void }) {
  const [enrollment, setEnrollment] = useLearnState<Enrollment>('enrollment', { path: null, page: 'candles', answers: {}, checked: {} });
  const { path, page } = enrollment;
  const [course,setCourse] = useLearnState('university-course-v1',{completed:{} as Record<string,boolean>});
  const answer = enrollment.answers[page] ?? null, checked = enrollment.checked[page] ?? false;
  const navigate = (id: string) => { setEnrollment(value => ({ ...value, page: id, practiceLesson: id === 'practice' && lessons.some(item => item.id === value.page) ? value.page : value.practiceLesson })); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const exerciseId = page.startsWith('exercise:') ? page.slice(9) : null;
  const exercise = lessons.find(item => item.id === exerciseId);
  const lesson = lessons.find(l => l.id === page);
  const index = lessons.findIndex(l => l.id === page);
  const activeLesson = exercise ?? lesson;
  const markPassed = useCallback(() => { if(activeLesson) setCourse(value=>value.completed[activeLesson.id]?value:{...value,completed:{...value.completed,[activeLesson.id]:true}}); },[activeLesson,setCourse]);
  const isPassed=(id:string)=>course.completed[id] || (enrollment.checked[id] && enrollment.answers[id]===lessons.find(l=>l.id===id)?.correct);
  const recommended=lessons.find(item=>!isPassed(item.id));
  const practiceLesson = lessons.find(item => item.id === enrollment.practiceLesson);
  const items = [{ id: 'placement', title: 'Placement & foundation recap' }, ...lessons.map(l => ({ id: l.id, title: l.title, stage:l.stage })), { id: 'practice', title: 'Full trading sandbox' }, { id: 'review', title: 'Review your decisions' }];
  const currentPage = path ? exercise?.id ?? page : 'placement';
  const currentTitle = items.find(item => item.id === currentPage)?.title ?? 'Learning session';
  const moduleButtons = <>{items.map((item,i) => <React.Fragment key={item.id}>{'stage' in item && (i===1 || !('stage' in items[i-1]) || (items[i-1] as typeof item).stage !== item.stage) && <h3 className="university-stage-heading">Stage {String(item.stage)} · {stageNames[Number(item.stage)]}</h3>}<button aria-current={currentPage === item.id ? 'page' : undefined} disabled={!path && item.id !== 'placement'} onClick={() => navigate(item.id)}><span>{item.title}</span>{currentPage === item.id && <small>Current activity{exercise ? ' · Practice' : ''}</small>}{isPassed(item.id) && <small>Understanding check passed</small>}{!path && item.id !== 'placement' && <small>After placement</small>}</button></React.Fragment>)}</>;

  return <div className="learn-workspace learn-environment">
    <nav className="learn-module-sidebar" aria-label="Learn modules"><h2>URSORA University</h2><p className="mt-1 text-xs text-zinc-400">Follow the staged path or explore a lesson. Advanced topics build on earlier examples.</p>{path && recommended && <p className="mt-3 text-xs">Suggested next: {recommended.title}</p>}<div className="learn-module-links">{moduleButtons}</div>{onDisable && <button className="mt-4" onClick={onDisable}>Disable Learn</button>}</nav>
    <div className="min-w-0 space-y-4"><details className="learn-mobile-modules learn-panel"><summary>Modules · {currentTitle}</summary><nav aria-label="Learn module menu" className="learn-module-links">{moduleButtons}</nav></details>
      {onDisable && <button className="learn-mobile-modules" onClick={onDisable}>Disable Learn</button>}
      {!path || page === 'placement' ? <Placement onComplete={value => setEnrollment(s => ({ ...s, path: value, page: value === 'foundations' ? 'market-basics' : 'candles' }))}/> : activeLesson?.unit ? <UniversityModule key={activeLesson.id} unit={activeLesson.unit} practice={!!exercise} onPractice={() => navigate('exercise:' + activeLesson.id)} onReturn={() => navigate(activeLesson.id)} onNext={() => navigate(lessons[lessons.indexOf(activeLesson)+1]?.id ?? 'practice')} onPass={markPassed}/> : exercise ? <LessonPractice key={exercise.id} lesson={exercise} onPass={markPassed} onReturn={() => navigate(exercise.id)} onNext={() => navigate(lessons[lessons.findIndex(item => item.id === exercise.id) + 1]?.id ?? 'practice')}/> : lesson ? <article className="learn-panel mx-auto w-full max-w-3xl space-y-5">
        <p className="text-xs uppercase tracking-wider text-sky-300">URSORA University · Stage {lesson.stage} · Lesson {index + 1} of {lessons.length}</p>
        <h1 className="text-xl">{lesson.title}</h1>
        {['candle-patterns', 'chart-patterns'].includes(lesson.id) ? <>
          <div className="learn-coach space-y-2"><p>{lesson.body}</p><button onClick={() => navigate('exercise:' + lesson.id)}>Start lesson exercise</button><p>{lesson.task}</p></div>
          <PatternLesson group={lesson.id === 'candle-patterns' ? 'candle' : 'chart'}/>
        </> : <>
          <p className="learn-activity-context">What you’re doing: understand the concept, inspect the illustration, then check your understanding. You can revisit this page at any time.</p>
          <LessonVisual topic={lesson.id}/><h2>What it means and why it matters</h2><p>{lesson.body}</p>
          <div className="learn-coach"><h2>Try it in practice</h2><p className="mt-2">{lesson.task}</p><button className="mt-3" onClick={() => navigate('exercise:' + lesson.id)}>Start lesson exercise</button></div>
          <fieldset className="space-y-3"><legend>{lesson.question}</legend>{lesson.choices.map((choice, i) => <label key={choice} className="learn-choice"><input type="radio" name={lesson.id} checked={answer === i} onChange={() => setEnrollment(s => ({ ...s, answers: { ...s.answers, [page]: i }, checked: { ...s.checked, [page]: false } }))}/><span>{choice}</span></label>)}
            <button disabled={answer === null} onClick={() => setEnrollment(s => ({ ...s, checked: { ...s.checked, [page]: true } }))}>Check understanding</button>
            {checked && <p role="status" className={answer === lesson.correct ? 'learn-feedback-correct' : 'learn-feedback-incorrect'}>{answer === lesson.correct ? 'That matches the explanation. ' : 'Revisit the distinction: '}{lesson.explanation}</p>}
          </fieldset>
        </>}
        <div className="flex flex-wrap justify-between gap-3"><button disabled={index === 0} onClick={() => navigate(lessons[index - 1].id)}>Previous lesson</button><button onClick={() => navigate(lessons[index + 1]?.id ?? 'practice')}>Next lesson: {lessons[index + 1]?.title ?? 'Full trading sandbox'}</button></div>
      </article>
        : <>{page === 'practice' && practiceLesson && <section className="learn-panel space-y-2" aria-label="Lesson practice exercise"><button onClick={() => navigate(practiceLesson.id)}>Return to lesson: {practiceLesson.title}</button><p>This full trading sandbox combines planning, orders and position management. Use the lesson’s dedicated exercise for focused practice.</p></section>}<LearnWorkspace key={page} placementPath={path} reviewMode={page === 'review'} onNextLesson={() => navigate(page === 'review' ? 'candles' : 'review')}/></>}
    </div>
  </div>;
}
