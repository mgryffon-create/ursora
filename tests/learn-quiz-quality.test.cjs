const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>load(path.resolve(path.dirname(file),name+'.ts')));return exports;}
const {shuffleQuiz}=load('src/lib/learn/quiz-order.ts');const {patternInterpretations}=load('src/lib/learn/pattern-assessment.ts');const {patterns}=load('src/lib/learn/patterns.ts');const {improveQuestion,revisedQuestionGroups}=load('src/lib/learn/question-quality.ts');const {universityUnits}=load('src/lib/learn/university.ts');const {exercises}=load('src/lib/learn/exercises.ts');
test('case and answer shuffles are stable permutations without changing canonical identifiers',()=>{
 const items=Array.from({length:37},(_,i)=>({id:i}));const original=JSON.stringify(items);
 assert.deepEqual(shuffleQuiz(items,123,'cases'),shuffleQuiz(items,123,'cases'));
 assert.notDeepEqual(shuffleQuiz(items,123,'cases'),items);
 assert.notDeepEqual(shuffleQuiz(items,123,'cases'),shuffleQuiz(items,456,'cases'));
 assert.deepEqual(shuffleQuiz(items,123,'cases').map(x=>x.id).sort((a,b)=>a-b),items.map(x=>x.id));assert.equal(JSON.stringify(items),original);
});
test('the correct answer is not tied to a visible letter across questions',()=>{
 const positions=new Set(Array.from({length:40},(_,i)=>shuffleQuiz([0,1,2],123,`answer:${i}`).indexOf(1)));
 assert.deepEqual([...positions].sort(),[0,1,2]);
});
test('each pattern interpretation competes with two real, distinct formation descriptions',()=>{
 for(const pattern of patterns){const catalog=patterns.filter(p=>p.group===pattern.group),options=patternInterpretations(pattern,catalog);
 assert.equal(options.length,3,pattern.id);assert.equal(new Set(options).size,3,pattern.id);assert.equal(options[1],`${pattern.context}: ${pattern.shape}`);
 for(const option of options)assert.ok(catalog.some(p=>option===`${p.context}: ${p.shape}`),pattern.id);
 }
 const hammer=patterns.find(p=>p.id==='hammer'),options=patternInterpretations(hammer,patterns.filter(p=>p.group==='candle'));
 assert.ok(options.some(o=>o.startsWith('After an advance:'))); // Identical shape, different prior context.
});
test('all module checks receive curated distractors while preserving saved correct slots',()=>{
 for(const unit of universityUnits){assert.ok(revisedQuestionGroups.includes(unit.id),unit.id);unit.cases.forEach((q,i)=>{const result=improveQuestion(unit.id,i,q);assert.notEqual(result,q,unit.id);assert.equal(result.correct,q.correct);assert.equal(result.options.length,3);assert.equal(new Set(result.options).size,3,`${unit.id}:${i}`);assert.equal(q.options.length,3);});}
});
test('all legacy exercise questions receive the same quality pass without rekeying answers',()=>{
 for(const [id,scenes] of Object.entries(exercises))scenes.forEach((scene,i)=>scene.questions.forEach((q,j)=>{const key=id==='candles'&&i===0&&j===1?'candle-wicks':id;const result=improveQuestion(key,i,q);assert.notEqual(result,q,`${id}:${i}:${j}`);assert.equal(result.correct,q.correct);assert.equal(new Set(result.options).size,3,`${id}:${i}:${j}`);}));
});

const {feedbackPages}=load('src/lib/learn/feedback-pages.ts');
test('small-screen feedback cards retain every word without overflowing the reading length',()=>{const text='Correct. '+Array.from({length:50},(_,i)=>`detail${i}`).join(' ');const pages=feedbackPages(text);assert.ok(pages.length>1);assert.equal(pages.join(' '),text);assert.ok(pages.every(p=>p.length<=120));});
