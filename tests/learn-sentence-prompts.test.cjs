const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const prompts={};new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/learn/sentence-prompts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(prompts);
test('sentence dropdowns preserve choices and reject incomplete responses',()=>{
 for(const [kind,config] of Object.entries(prompts.sentencePrompts)){
   const empty=prompts.buildSentence(kind,[]);assert.equal(prompts.responseComplete(empty),false);
   const selected=config.blanks.map(b=>b.choices.at(-1).text);const sentence=prompts.buildSentence(kind,selected);
   assert.equal(prompts.responseComplete(sentence),true);assert.deepEqual(prompts.sentenceSelections(kind,sentence),selected);
   assert.equal(prompts.responseComplete(prompts.buildSentence(kind,selected.map(()=>''))),false);
 }
});
test('original recorded explanations remain valid and prompts never preselect an answer',()=>{assert.equal(prompts.responseComplete('Original saved thesis about the pullback.'),true);assert.equal(prompts.responseComplete(''),false);assert.deepEqual(prompts.sentenceSelections('thesis',''),['','','']);});
