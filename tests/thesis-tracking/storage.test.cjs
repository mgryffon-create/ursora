const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { thesis, policy, baseline, bar, contextAt } = require('./fixtures.cjs');
const load = require('./load.cjs');
const { runReplay } = load('replay');
const { PostgresReplayRepository } = load('postgres-repository');
const modulePath = process.env.THESIS_TEST_PGLITE;

test('proposed Postgres schema: immutability, tenant boundaries, idempotency and atomic rollback', { skip: !modulePath }, async () => {
  const { PGlite } = require(modulePath);
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users (id uuid primary key);');
    await db.exec(fs.readFileSync('docs/thesis-tracking/schema.proposed.sql', 'utf8'));
    const adapter = { transaction: (work) => db.transaction((tx) => work({ query: (query, params) => tx.query(query, [...params]) })) };
    const repository = new PostgresReplayRepository(adapter);
    const report = runReplay({ runId: 'db-fixture', mode: 'offline_replay', thesis, policy, observations: [bar(1, 98), bar(2, 98)], news: [], baselines: [baseline], contextAt });
    await db.query('insert into auth.users(id) values ($1)', [thesis.ownerId]);
    await db.exec('set role service_role');
    assert.equal(await repository.saveReport(report), 'inserted');
    assert.equal(await repository.saveReport(report), 'already_saved');
    assert.deepEqual(await repository.getReport(thesis.ownerId, report.runId), report);
    assert.equal(await repository.getReport('00000000-0000-4000-8000-000000000002', report.runId), null);
    await assert.rejects(() => repository.saveReport({ ...report, summary: { ...report.summary, observations: 200 } }), /different immutable content/);
    await assert.rejects(() => repository.saveReport({ ...report, runId: 'changed-entry', thesis: { ...report.thesis, supportBoundary: 98 } }), /cannot be revised/);
    await assert.rejects(() => db.exec("update thesis_tracking.entry_snapshots set snapshot = '{}'"), /permission denied|immutable/);
    await db.exec('reset role');
    await assert.rejects(() => db.exec("update thesis_tracking.entry_snapshots set snapshot = snapshot"), /immutable/);
    await assert.rejects(() => db.exec("delete from thesis_tracking.replay_runs"), /immutable/);
    await assert.rejects(() => db.query('insert into thesis_tracking.replay_runs(owner_id,run_id,thesis_id,policy_version,report) values ($1,$2,$3,$4,$5)', [thesis.ownerId, 'missing-flags', thesis.id, policy.version, '{}']), /check constraint/);
    const failed = { ...report, runId: 'rollback-fixture', evaluations: [{ ...report.evaluations[0], asOf: 'bad-timestamp' }] };
    await assert.rejects(() => repository.saveReport(failed));
    assert.equal(await repository.getReport(thesis.ownerId, failed.runId), null);
    const count = await db.query('select count(*)::int as count from thesis_tracking.evaluations');
    assert.equal(count.rows[0].count, 2);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => db.exec('select * from thesis_tracking.replay_runs'), /permission denied/);
      await db.exec('reset role');
    }
    const tables = await db.query("select relname,relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='thesis_tracking' and relkind='r'");
    assert.equal(tables.rows.length, 3); assert(tables.rows.every((r) => r.relrowsecurity));
  } finally { await db.close(); }
});
