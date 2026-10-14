const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(path) {
  return ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const mapping = { exports: {} };
new Function('exports', compile('supabase/functions/_shared/historical-market-symbol.ts'))(mapping.exports);
const episode = { id: 351, user_id: 'owner', symbol: 'SPXW', asset_type: 'option', opened_at: '2025-12-02T14:41:21Z', closed_at: '2025-12-02T15:08:55Z', average_entry_price: 2.04, average_exit_price: 2.62, option_type: 'call', strike: 6870, expiration: '2025-12-02' };
const prices = Array.from({ length: 78 }, (_, i) => ({ t: Date.UTC(2025, 11, 2, 14, 30 + i * 5), o: 6800 + i, h: 6802 + i, l: 6799 + i, c: 6801 + i }));

async function playback({ results = prices, status = 200, cache = null, authorization = 'Bearer fixture' } = {}) {
  let handler;
  const requests = [], writes = [];
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from(table) {
    const query = { select() { return this; }, eq() { return this; }, async maybeSingle() {
      return { data: table === 'snaptrade_trade_episodes' ? episode : table === 'historical_trade_playback_cache' ? cache : null, error: null };
    }, async upsert(value) { writes.push(value); return { error: null }; } };
    return query;
  } };
  const context = { exports: {}, require: (name) => name.startsWith('npm:') ? { createClient: () => db } : mapping.exports, Deno: { env: { get: () => 'fixture-only' }, serve: (fn) => { handler = fn; } }, Request, Response, URL, Intl, console,
    fetch: async (url) => { requests.push(String(url)); return new Response(JSON.stringify({ results }), { status }); } };
  vm.runInNewContext(compile('supabase/functions/historical-session-playback/index.ts'), context);
  const headers = { 'Content-Type': 'application/json' };
  if (authorization) headers.Authorization = authorization;
  const response = await handler(new Request('https://fixture.test', { method: 'POST', headers, body: JSON.stringify({ trade_id: -351 }) }));
  return { status: response.status, body: await response.json(), requests, writes };
}

test('SPXW maps to the index while equity tickers remain unchanged', () => {
  for (const symbol of ['SPXW', 'SPX', '$SPX', '^SPX']) assert.equal(mapping.exports.historicalMarketSymbol(symbol), 'I:SPX');
  assert.equal(mapping.exports.historicalMarketSymbol('SPY'), 'SPY');
  assert.equal(mapping.exports.historicalMarketSymbol('aapl'), 'AAPL');
});
test('December 2025 SPXW replay fetches index bars, keeps contract metadata and caches the actual underlying', async () => {
  const result = await playback();
  assert.equal(result.status, 200);
  assert.match(result.requests[0], /ticker\/I%3ASPX\/range\/5\/minute\/2025-11-24\/2025-12-02/);
  assert.equal(result.body.symbol, 'SPXW');
  assert.equal(result.body.instrument.symbol, 'SPXW');
  assert.equal(result.body.underlying_symbol, 'I:SPX');
  assert.equal(result.body.bars.length, 78);
  assert.equal(result.writes[0].symbol, 'I:SPX');
  assert.equal(result.writes[0].user_id, 'owner');
});
test('correct index cache is reused without a provider call', async () => {
  const first = await playback();
  const result = await playback({ cache: first.writes[0] });
  assert.equal(result.requests.length, 0);
  assert.equal(result.body.bars.length, 78);
});
test('a legacy SPXW cache cannot be mistaken for I:SPX prices', async () => {
  const first = await playback();
  const result = await playback({ cache: { ...first.writes[0], symbol: 'SPXW' } });
  assert.equal(result.requests.length, 1);
  assert.equal(result.writes[0].symbol, 'I:SPX');
});
test('empty provider history is explicit and never cached as a successful replay', async () => {
  const result = await playback({ results: [] });
  assert.equal(result.body.data_availability.status, 'unavailable');
  assert.match(result.body.data_availability.message, /No historical index prices.*SPX/);
  assert.equal(result.writes.length, 0);
});
test('subscription denial is explained without disclosing the raw provider response', async () => {
  const result = await playback({ status: 403 });
  assert.match(result.body.error, /data access was denied/);
  assert.equal(result.writes.length, 0);
});
test('unauthenticated requests cannot read trades or reach the provider', async () => {
  const result = await playback({ authorization: null });
  assert.equal(result.status, 401);
  assert.equal(result.requests.length, 0);
});

test('reconstruction fallback uses the same underlying mapping as playback', async () => {
  const requests = [];
  const context = { exports: {}, require: (name) => name.startsWith('npm:') ? { createClient: () => ({}) } : mapping.exports, Deno: { env: { get: () => 'fixture-only' }, serve: () => {} }, Request, Response, URL, Intl, console,
    fetch: async (url) => { requests.push(String(url)); return new Response(JSON.stringify({ results: prices })); } };
  vm.runInNewContext(compile('supabase/functions/reconstruct-historical-trades/index.ts'), context);
  const bars = await context.massiveAggs('SPXW', '2025-11-24', '2025-12-02');
  assert.equal(bars.length, 78);
  assert.match(requests[0], /ticker\/I%3ASPX\/range\/5\/minute/);
  assert.equal(new URL(requests[0]).searchParams.has('adjusted'), false);
});
