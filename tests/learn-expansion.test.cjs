const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const path=require('node:path');
function load(file,dependencies={}) {
 const exports={};
 new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText)(exports,name=>dependencies[name]??load(path.resolve(path.dirname(file),name+'.ts')));
 return exports;
}
const units=load('src/lib/learn/university.ts');
const expansion=load('src/lib/learn/expansion.ts');
const {lessons}=load('src/lib/learn/lessons.ts',{'./university':units,'./expansion':expansion});
test('expanded curriculum remains complete and ordered through twelve stages',()=>{
 assert.equal(new Set(lessons.map(l=>l.id)).size,lessons.length,'duplicate IDs lose progress identity');
 assert.deepEqual([...new Set(lessons.map(l=>l.stage))],Array.from({length:12},(_,i)=>i+1));
 assert.ok(lessons.findIndex(l=>l.id==='market-participants')<lessons.findIndex(l=>l.id==='candles'));
 assert.ok(lessons.findIndex(l=>l.id==='market-macro')<lessons.findIndex(l=>l.id==='confluence'));
 assert.ok(lessons.findIndex(l=>l.id==='drawdown-exposure')<lessons.findIndex(l=>l.id==='execution'));
 assert.ok(lessons.findIndex(l=>l.id==='behavioral-discipline')<lessons.findIndex(l=>l.id==='capstone'));
 assert.equal(lessons.at(-1).id,'ursora-workflow');
});
test('new lessons include guided steps and valid multi-choice checks',()=>{
 for(const unit of expansion.expansionUnits){
  assert.equal(unit.cases.length,3,unit.id);
  assert.ok(unit.cards.length>=3,unit.id);
  for(const q of unit.cases){
   assert.ok(q.options.length>=3,unit.id);
   assert.ok(q.correct>=0 && q.correct<q.options.length,unit.id);
   assert.ok(q.why.length>15,unit.id);
  }
 }
});
test('prior learner lesson keys are retained',()=>{
 const required=['market-basics','quotes-liquidity','candles','structure','candle-patterns','confluence','risk-sizing','option-greeks','capstone','brokerage-choice','ursora-workflow'];
 for(const id of required)assert.ok(lessons.some(l=>l.id===id),id);
});
