export type SkillId='market'|'price'|'indicators'|'thesis'|'risk'|'execution'|'options'|'behavior'|'validation';
export const skills:{id:SkillId;title:string;lesson:string;requires:SkillId[];outcome:string}[]=[
 {id:'market',title:'Quotes, costs and account mechanics',lesson:'account-mechanics',requires:[],outcome:'Calculate executable costs and identify account constraints.'},
 {id:'price',title:'Price structure and uncertainty',lesson:'structure',requires:['market'],outcome:'Distinguish pullbacks, failed breaks and conflicting timeframes.'},
 {id:'indicators',title:'Indicators in price context',lesson:'confluence',requires:['price'],outcome:'Interpret momentum and volatility without double-counting evidence.'},
 {id:'thesis',title:'Conditional plans and event risk',lesson:'event-risk',requires:['indicators'],outcome:'Define a trigger, contradiction, invalidation and a reason to pass.'},
 {id:'risk',title:'Sizing and combined exposure',lesson:'portfolio-risk',requires:['market'],outcome:'Calculate position size, recovery requirements and aggregate exposure.'},
 {id:'execution',title:'Orders and position management',lesson:'execution-friction',requires:['risk','thesis'],outcome:'Reconcile fills, working orders, cancellations and remaining exposure.'},
 {id:'options',title:'Contract selection and option risk',lesson:'option-contracts',requires:['execution'],outcome:'Calculate payoffs and compare time, volatility and settlement risks.'},
 {id:'behavior',title:'Decisions under pressure',lesson:'behavioral-discipline',requires:['risk'],outcome:'Apply stopping rules and judge process separately from profit.'},
 {id:'validation',title:'Strategy evaluation and uncertainty',lesson:'validation-lab',requires:['risk','behavior'],outcome:'Evaluate net expectancy, leakage, sample selection and uncertainty.'},
];
export type SkillEvidence={version:2;passedAt:number;reviewAt:number;attempt:number;seed:number;score:number;total:number};
export type Competencies={evidence:Partial<Record<SkillId,SkillEvidence>>};
export const emptyCompetencies:Competencies={evidence:{}};
export function demonstrated(progress:Competencies,id:SkillId){const r=progress.evidence[id];return r?.version===2&&r.score===r.total&&r.total>=4;}
export function missingSkills(progress:Competencies,ids:SkillId[]){return ids.filter(id=>!demonstrated(progress,id));}
export function dueSkills(progress:Competencies,now=Date.now()){return skills.filter(s=>demonstrated(progress,s.id)&&progress.evidence[s.id]!.reviewAt<=now);}
export function recordSkill(progress:Competencies,id:SkillId,attempt:number,seed:number,score:number,total:number,now=Date.now()):Competencies{
 if(score!==total||total<4)return progress;
 const prior=progress.evidence[id];
 // Early practice cannot postpone a scheduled delayed-retrieval check.
 if(prior&&prior.reviewAt>now)return progress;
 return {evidence:{...progress.evidence,[id]:{version:2,passedAt:now,reviewAt:now+(prior?14:3)*86400000,attempt,seed,score,total}}};
}
export const assessmentPrerequisites:Record<string,SkillId[]>={
 'price-assessment':['market','price'],'indicator-assessment':['price','indicators','thesis'],
 'execution-assessment':['risk','execution'],'final-assessment':skills.map(s=>s.id),
};
export const lessonSkills:Record<string,SkillId>={};
const groups:Record<SkillId,string[]>={
 market:['market-basics','market-participants','quotes-liquidity','trading-costs','account-mechanics'],
 price:['candles','movement','volume-pressure','candle-patterns','structure','drawing-lines','chart-patterns','cup-steps','wedges','timeframes','price-assessment'],
 indicators:['indicators','sma-ema','vwap','rsi','macd','bollinger','atr','confluence','indicator-assessment'],
 thesis:['scan-news','market-macro','thesis-conflicts','plan','event-risk'],risk:['risk-sizing','drawdown-exposure','portfolio-risk'],
 execution:['execution','management','execution-friction','execution-assessment'],options:['options','options-foundations','option-greeks','option-contracts','option-payoffs','option-lifecycle'],
 behavior:['behavioral-discipline'],validation:['journal-testing','strategy-validation','validation-lab','capstone','brokerage-choice','ursora-workflow'],
};
for(const [skill,ids] of Object.entries(groups))for(const id of ids)lessonSkills[id]=skill as SkillId;
