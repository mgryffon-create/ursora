import React from 'react';

type Props={
  position:number;
  total:number;
  onNextExample:()=>void;
  onNextLesson:()=>void;
  nextSet?:{title:string;onNext:()=>void};
  noun?:'example'|'exercise';
};

/** Shared continuation for URSORA U practice. Never show next lesson beside next example. */
export default function ExerciseContinuation({position,total,onNextExample,onNextLesson,nextSet,noun='example'}:Props){
  const hasNext=position<total-1;
  return <div className="exercise-stage-continue" aria-label="Continue learning">
    {hasNext
      ? <button type="button" className="learn-primary" onClick={onNextExample}>Next {noun} →</button>
      : nextSet ? <button type="button" className="learn-primary" onClick={nextSet.onNext}>Next set of terms: {nextSet.title} →</button> : <button type="button" className="learn-primary exercise-stage-next-lesson" onClick={onNextLesson}>Next lesson →</button>}
  </div>;
}
