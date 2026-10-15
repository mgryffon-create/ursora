import type { ReplayReport, ReplayRepository } from './replay';

export interface SqlConnection {
  query<T>(sql: string, parameters: readonly unknown[]): Promise<{ rows: T[] }>;
}
export interface TransactionalSql {
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
}

/** Server-only, injected DB connection. No credentials, environment reads, or auto-initialization. */
export class PostgresReplayRepository implements ReplayRepository {
  constructor(private readonly sql: TransactionalSql) {}

  async saveReport(report: ReplayReport): Promise<'inserted' | 'already_saved'> {
    if (report.liveEnabled !== false || report.notificationsEnabled !== false || report.policy.mode !== 'offline_replay') throw new Error('Only offline reports can be stored.');
    const owner = report.thesis.ownerId;
    return this.sql.transaction(async (db) => {
      const snapshot = JSON.stringify(report.thesis);
      await db.query('insert into thesis_tracking.entry_snapshots (owner_id, thesis_id, snapshot) values ($1, $2, $3::jsonb) on conflict (owner_id, thesis_id) do nothing', [owner, report.thesis.id, snapshot]);
      const entry = await db.query<{ identical: boolean }>('select snapshot = $3::jsonb as identical from thesis_tracking.entry_snapshots where owner_id = $1 and thesis_id = $2', [owner, report.thesis.id, snapshot]);
      if (!entry.rows[0]?.identical) throw new Error('An entry thesis cannot be revised by a later run.');
      const serialized = JSON.stringify(report);
      const inserted = await db.query<{ run_id: string }>(
        'insert into thesis_tracking.replay_runs (owner_id, run_id, thesis_id, policy_version, report) values ($1, $2, $3, $4, $5::jsonb) on conflict (owner_id, run_id) do nothing returning run_id',
        [owner, report.runId, report.thesis.id, report.policy.version, serialized],
      );
      if (!inserted.rows.length) {
        const same = await db.query<{ identical: boolean }>('select report = $3::jsonb as identical from thesis_tracking.replay_runs where owner_id = $1 and run_id = $2', [owner, report.runId, serialized]);
        if (!same.rows[0]?.identical) throw new Error('Replay run ID already has different immutable content.');
        return 'already_saved';
      }
      // The normalized audit log and report commit together or roll back together.
      for (let index = 0; index < report.evaluations.length; index++) {
        const evaluation = report.evaluations[index];
        await db.query('insert into thesis_tracking.evaluations (owner_id, run_id, sequence, observation_id, evaluated_at, thesis_state, data_state, evaluation) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [owner, report.runId, index, evaluation.observationId, evaluation.asOf, evaluation.next.thesisState, evaluation.dataState, JSON.stringify(evaluation)]);
      }
      return 'inserted';
    });
  }

  async getReport(ownerId: string, runId: string): Promise<ReplayReport | null> {
    return this.sql.transaction(async (db) => {
      const result = await db.query<{ report: ReplayReport }>('select report from thesis_tracking.replay_runs where owner_id = $1 and run_id = $2', [ownerId, runId]);
      return result.rows[0]?.report ?? null;
    });
  }
}
