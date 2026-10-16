import React, { useEffect, useState } from 'react';
import { feedbackPages } from '@/lib/learn/feedback-pages';
const query = '(max-width: 480px) and (max-height: 740px)';
export default function ExerciseFeedback({ text, correct }: { text: string; correct: boolean }) {
  const [compact,setCompact] = useState(() => window.matchMedia(query).matches);
  const [reading,setReading] = useState({text,page:0});
  useEffect(() => { const media=window.matchMedia(query);const update=()=>setCompact(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update); },[]);
  const pages=compact?feedbackPages(text,100):[text],page=Math.min(reading.text===text?reading.page:0,pages.length-1);
  return <div className={correct?'learn-feedback-correct exercise-feedback':'learn-feedback-incorrect exercise-feedback'}><p role="status">{pages[page]}</p>{pages.length>1 && <div className="exercise-feedback-pages"><button aria-label="Previous feedback detail" disabled={page===0} onClick={()=>setReading({text,page:page-1})}>Previous detail</button><span>{page+1}/{pages.length}</span><button aria-label="Next feedback detail" disabled={page===pages.length-1} onClick={()=>setReading({text,page:page+1})}>Next detail</button></div>}</div>;
}
