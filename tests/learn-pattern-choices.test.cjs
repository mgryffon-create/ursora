const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const exportsForTest = {};
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/learn/pattern-choices.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exportsForTest);
const { remainingPatternChoices } = exportsForTest;
const catalog = [{id:'hammer',name:'Hammer'},{id:'doji',name:'Doji'},{id:'star',name:'Star'}];
test('only checked correct matches disappear and original answer indices remain stable',()=>{
 const progress = {answers:{'hammer:0':'0','doji:0':'2'},checked:{hammer:true,doji:true}};
 assert.deepEqual(remainingPatternChoices(catalog,progress,'star').map(p=>p.index),[1,2]);
 assert.equal(remainingPatternChoices(catalog,{...progress,checked:{}},'star').length,3);
});
test('matched patterns remain removed after another response changes, but are available in their own review',()=>{
 const progress = {answers:{},checked:{},matchedPatterns:{hammer:true,doji:true,star:true}};
 assert.deepEqual(remainingPatternChoices(catalog,progress,'doji').map(p=>p.index),[1]);
});
test('empty saved answers do not count as the first option',()=>{
 assert.equal(remainingPatternChoices(catalog,{answers:{'hammer:0':''},checked:{hammer:true}},'star').length,3);
});
