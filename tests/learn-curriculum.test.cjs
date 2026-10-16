const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load(path,dependencies={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>dependencies[name]??load(require('node:path').resolve(require('node:path').dirname(path),name+'.ts')));return exports;}
const patternData=load('src/lib/learn/patterns.ts');const {patterns,patternBars}=patternData;
const units=load('src/lib/learn/university.ts');const {lessons}=load('src/lib/learn/lessons.ts',{'./university':units});const {exercises}=load('src/lib/learn/exercises.ts',{'./patterns':patternData});
test('every curriculum lesson has focused exercises and patterns follow their prerequisites',()=>{
 assert.ok(lessons.findIndex(l=>l.id==='candle-patterns')>lessons.findIndex(l=>l.id==='candles'));
 assert.ok(lessons.findIndex(l=>l.id==='chart-patterns')>lessons.findIndex(l=>l.id==='structure'));
 for(const lesson of lessons.filter(l=>!l.unit&&!l.id.endsWith('-patterns')))assert.ok(exercises[lesson.id]?.length>=3,lesson.id);
});
test('educational candles use coherent OHLC and context changes the meaning of identical shapes',()=>{
 const all=[...patterns.filter(p=>p.bars).flatMap(p=>patternBars(p).bars),...Object.values(exercises).flat().flatMap(s=>s.bars??[])];
 for(const b of all){assert.ok(b.high>=Math.max(b.open,b.close));assert.ok(b.low<=Math.min(b.open,b.close));assert.ok(b.volume>0);}
 const hammer=patterns.find(p=>p.id==='hammer'),hanging=patterns.find(p=>p.id==='hanging-man');assert.deepEqual(hammer.bars,hanging.bars);assert.notEqual(hammer.trend,hanging.trend);
 const b=hammer.bars[0];assert.ok(Math.min(b.open,b.close)-b.low>=2*Math.abs(b.close-b.open));
 const engulf=patterns.find(p=>p.id==='bull-engulf').bars;assert.ok(engulf[1].open<engulf[0].close&&engulf[1].close>engulf[0].open);
 const inside=patterns.find(p=>p.id==='inside-bar').bars;assert.ok(inside[1].high<inside[0].high&&inside[1].low>inside[0].low);
});
test('worked VWAP example agrees with authored candles and each question has a valid answer',()=>{
 const bars=exercises.indicators[2].bars;const volume=bars.reduce((sum,b)=>sum+b.volume,0);const vwap=bars.reduce((sum,b)=>sum+(b.high+b.low+b.close)/3*b.volume,0)/volume;assert.equal(Math.round(vwap*100),10360);
 for(const scene of Object.values(exercises).flat())for(const q of scene.questions){assert.ok(q.options[q.correct]);assert.ok(q.explanation.length>20);}
 const failed=patterns.find(p=>p.id==='failed-breakout').points;assert.ok(Math.max(...failed)>103&&failed.at(-1)<103);
});
