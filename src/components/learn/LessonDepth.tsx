import React from 'react';
import {lessonDepth} from '@/lib/learn/lesson-depth';
import {lessonSkills,skills,type SkillId} from '@/lib/learn/competencies';
export default function LessonDepth({id,onOpenSkill}:{id:string;onOpenSkill:(id:SkillId)=>void}){
 const depth=lessonDepth(id),skill=skills.find(s=>s.id===lessonSkills[id]);
 return <section className="university-card space-y-3" aria-label="Worked example and independent application"><h2>From explanation to decision</h2>{depth&&<><h3>Worked example</h3><p>{depth.worked}</p><details><summary>Common mistake and independent application</summary><h3>Watch for this mistake</h3><p>{depth.pitfall}</p><h3>Explain it yourself</h3><p>{depth.transfer}</p></details></>}{skill&&<><p>Applied skill: {skill.outcome}</p><button onClick={()=>onOpenSkill(skill.id)}>Demonstrate: {skill.title}</button></>}</section>;
}
