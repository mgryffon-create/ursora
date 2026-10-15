const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 }}).outputText;
const lifecycle = {exports:{}};
new Function('exports', compile('supabase/functions/_shared/thesis-lifecycle.ts'))(lifecycle.exports);
const {replayThesis, assessThesisEntry} = lifecycle.exports;
const bar = (at, close, extra={}) => ({bar_time:at,open:close-0.1,high:close+0.2,low:close-0.2,close,...extra});
const rows = [bar('2026-09-10T14:00:00Z',100,{high:110,low:99}),bar('2026-09-10T14:30:00Z',102,{high:103,low:101}),bar('2026-09-11T14:00:00Z',108,{high:109,low:107})];
const detector = prefix => ({confirmed:prefix.length>=2,direction:'bullish',confirmation:prefix.at(-1).close,invalidation:98});

test('reconfirmation preserves prior-day ancestry and original target',()=>{
 const a=replayThesis(rows,detector);
 assert.equal(a.established_at,rows[1].bar_time);
 assert.equal(a.confirmation_price,102);
 assert.equal(a.target_price,110);
 const e=assessThesisEntry(a,rows,'2026-09-11T14:05:00Z',108);
 assert.equal(e.prior_sessions,1);
 assert.equal(e.move_before_entry,6);
 assert.equal(e.move_consumed_pct,75);
 assert.equal(e.entry_quality_label,'late_confirmed_move');
});
test('expired original target is not moved forward to make entry look fresh',()=>{
 const a=replayThesis(rows,detector);
 const e=assessThesisEntry(a,rows,'2026-09-11T14:05:00Z',112);
 assert.equal(e.move_consumed_pct,125);
 assert.equal(e.entry_quality_label,'late_extended');
 assert.ok(e.remaining_reward_risk<0);
});
test('bar completion timestamp sets confirmation availability',()=>{
 const data=rows.map(b=>({...b,available_at:new Date(+new Date(b.bar_time)+30*60000).toISOString()}));
 const a=replayThesis(data,detector);
 assert.equal(a.established_at,'2026-09-10T15:00:00.000Z');
 assert.equal(assessThesisEntry(a,data,'2026-09-10T14:35:00Z',102),null);
});
test('future prices cannot alter entry evaluation or pullback state',()=>{
 const a=replayThesis(rows.slice(0,2),detector), at='2026-09-10T14:40:00Z';
 assert.deepEqual(assessThesisEntry(a,rows,at,102),assessThesisEntry(a,[...rows,bar('2026-09-12T14:00:00Z',1)],at,102));
});
test('failed thesis breaks ancestry; renewed confirmation starts a new move',()=>{
 const data=[...rows,bar('2026-09-11T14:30:00Z',97),bar('2026-09-11T15:00:00Z',103)];
 const a=replayThesis(data,detector);
 assert.equal(a.established_at,data[4].bar_time);
});
test('bearish move geometry mirrors bullish, without sign inversion',()=>{
 const a={...replayThesis(rows,detector),direction:'bearish',confirmation_price:102,target_price:94,invalidation_price:110};
 const e=assessThesisEntry(a,[],'2026-09-11T14:05:00Z',96);
 assert.equal(e.move_before_entry,6); assert.equal(e.move_consumed_pct,75); assert.ok(e.remaining_reward_risk>0);
});
test('no target means unknown consumption, never an invented projected target',()=>{
 const a={...replayThesis(rows,detector),target_price:null};
 const e=assessThesisEntry(a,rows,'2026-09-11T14:05:00Z',108);
 assert.equal(e.move_consumed_pct,null); assert.equal(e.remaining_reward_risk,null);
});
test('pullback requires a later closed candle to demonstrate a hold',()=>{
 const a={...replayThesis(rows,detector),move_unit:2};
 const data=[bar('2026-09-10T15:00:00Z',106),bar('2026-09-10T15:05:00Z',104,{open:106}),bar('2026-09-10T15:10:00Z',105.5,{open:104})];
 assert.equal(assessThesisEntry(a,data,'2026-09-10T15:06:00Z',104).pullback_status,'developing');
 assert.equal(assessThesisEntry(a,data,'2026-09-10T15:11:00Z',105.5).pullback_status,'held');
});
test('historical review excludes the candle opening at entry and all later results',()=>{
 const context={exports:{}, require:n=>n.includes('thesis-lifecycle')?lifecycle.exports:n.startsWith('npm:')?{createClient:()=>({})}:{historicalMarketSymbol:s=>s},Deno:{env:{get:()=>''},serve:()=>{}},Intl,console};
 vm.runInNewContext(compile('supabase/functions/reconstruct-historical-trades/index.ts'),context);
 const data=Array.from({length:78},(_,i)=>bar(new Date(Date.UTC(2026,8,10,13,30+i*5)).toISOString(),100+i*.05));
 data.push(bar('2026-09-11T13:30:00Z',104));
 data.push(bar('2026-09-11T13:35:00Z',150));
 const episode={id:1,user_id:'test',symbol:'AAPL',direction:'bullish',opened_at:'2026-09-11T13:35:00Z',closed_at:'2026-09-11T15:00:00Z'};
 const a=context.reviewEpisode(episode,data);
 assert.equal(a.entry_underlying_price,104);
 assert.ok(a.evidence.thesis_entry, 'prior-day ancestry must be reconstructed');
 assert.ok(a.context_confirmation_at.startsWith('2026-09-10'));
 assert.equal(a.evidence.thesis_entry.prior_sessions,1);
 const b=context.reviewEpisode(episode,data.map(r=>+new Date(r.bar_time)>=+new Date(episode.opened_at)?{...r,close:1,high:200,low:.5}:r));
 assert.equal(a.entry_quality_label,b.entry_quality_label);
 assert.equal(a.guidance_summary,b.guidance_summary);
 assert.equal(JSON.stringify(a.evidence.thesis_entry),JSON.stringify(b.evidence.thesis_entry));
});
