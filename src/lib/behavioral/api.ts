/**
 * URSORA — TRADER INTELLIGENCE data access.
 *
 * Strict per-user isolation is enforced by row-level security in the database;
 * these helpers never widen a query beyond the signed-in account. Behavioural
 * observations are append-only: nothing here updates or deletes one.
 */

import db from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { MODEL_VERSION, type AlertCategory, type Sensitivity } from '@/lib/behavioral/config';
import type { LitConstruct, LitLink, LitStudy, Observation, TradeCycleThesisEvent, TradeModification, TradePlan, TradeRecord } from '@/lib/behavioral/types';

const list = <T,>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : []);

export interface BehavioralPrefs {
  onboarded: boolean;
  consented: boolean;
  categories: Record<string, boolean>;
  sensitivity: Sensitivity;
  entitlement: string;
}

export const DEFAULT_BEHAVIORAL_PREFS: BehavioralPrefs = {
  onboarded: false,
  consented: false,
  categories: {},
  sensitivity: 'STANDARD',
  entitlement: 'trader_intelligence_beta',
};

type SnapActivityRow = {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string | null;
  option_symbol: string | null;
  option_type: string | null;
  strike: number | null;
  expiration: string | null;
  activity_type: string | null;
  option_action: string | null;
  units: number | null;
  price: number | null;
  fee: number | null;
  trade_date: string | null;
  description: string | null;
};

function snapActivitySide(row: SnapActivityRow): 1 | -1 | 0 {
  const units = Number(row.units);
  const text = [row.option_action, row.activity_type, row.description]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  if (/BUY|BOT|BTO|BUY_TO_OPEN|BUY TO OPEN|BUY_TO_CLOSE|BUY TO CLOSE/.test(text)) return 1;
  if (/SELL|SOLD|STC|SELL_TO_CLOSE|SELL TO CLOSE|SELL_TO_OPEN|SELL TO OPEN/.test(text)) return -1;

  // SnapTrade documents BUY units as positive and SELL units as negative. Use that
  // signed quantity as a provider-grounded fallback when brokerage labels vary.
  if (Number.isFinite(units) && units > 0) return 1;
  if (Number.isFinite(units) && units < 0) return -1;
  return 0;
}

function sessionDateET(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function brokerageActivitiesToTrades(rows: SnapActivityRow[], userId: string): TradeRecord[] {
  const groups = new Map<string, SnapActivityRow[]>();
  for (const row of rows) {
    if (!row.trade_date || !(row.symbol || row.option_symbol)) continue;
    const side = snapActivitySide(row);
    const qty = Math.abs(Number(row.units));
    if (!side || !Number.isFinite(qty) || qty <= 0) continue;
    const instrument = String(row.option_symbol ?? row.symbol ?? '').toUpperCase();
    const key = `${row.account_id}|${instrument}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const out: TradeRecord[] = [];
  let syntheticId = -1000000;

  for (const activityRows of groups.values()) {
    activityRows.sort((a, b) => +new Date(a.trade_date ?? 0) - +new Date(b.trade_date ?? 0));

    let net = 0;
    let exposureSide: 1 | -1 | 0 = 0;
    let openedAt: string | null = null;
    let entryQty = 0;
    let entryNotional = 0;
    let exitQty = 0;
    let exitNotional = 0;
    let fees = 0;
    let first: SnapActivityRow | null = null;

    const flush = (closedAt: string | null) => {
      if (!first || !openedAt || entryQty <= 0 || exposureSide === 0) return;
      const entryPrice = entryNotional / entryQty;
      const exitPrice = exitQty > 0 ? exitNotional / exitQty : null;
      const option = Boolean(first.option_symbol);
      const multiplier = option ? 100 : 1;
      const closed = closedAt !== null && Math.abs(net) < 1e-9;
      const realizedPl = closed && exitPrice !== null
        ? ((exitPrice - entryPrice) * entryQty * multiplier * exposureSide) - fees
        : null;
      const returnPct = closed && exitPrice !== null && entryPrice > 0
        ? ((exitPrice - entryPrice) / entryPrice) * 100 * exposureSide
        : null;
      const optionType = first.option_type?.toLowerCase() ?? null;
      const direction =
        optionType === 'call' ? (exposureSide > 0 ? 'bullish' : 'bearish')
          : optionType === 'put' ? (exposureSide > 0 ? 'bearish' : 'bullish')
            : exposureSide > 0 ? 'bullish' : 'bearish';

      out.push({
        id: syntheticId--,
        user_id: userId,
        signal_id: null,
        symbol: String(first.symbol ?? '').toUpperCase(),
        direction,
        strategy: option ? `Brokerage ${optionType ?? 'option'}` : 'Brokerage equity',
        setup: null,
        option_type: optionType,
        strike: first.strike === null ? null : Number(first.strike),
        expiration: first.expiration,
        option_symbol: first.option_symbol,
        asset_type: option ? 'option' : 'equity',
        broker: 'SnapTrade',
        account_label: first.account_id,
        contracts: option ? entryQty : null,
        position_size: entryPrice * entryQty * multiplier,
        entry_at: openedAt,
        entry_price: entryPrice,
        exit_at: closedAt,
        exit_price: exitPrice,
        fees,
        realized_pl: realizedPl,
        unrealized_pl: null,
        origin: 'OTHER',
        regime: null,
        opportunity_score: null,
        confidence_score: null,
        risk_level: null,
        thesis_id: null,
        trade_plan_id: null,
        intended_invalidation: null,
        intended_target: null,
        max_favorable_excursion: null,
        max_adverse_excursion: null,
        return_pct: returnPct,
        result: closed
          ? (realizedPl ?? 0) > 0 ? 'win' : (realizedPl ?? 0) < 0 ? 'loss' : 'scratch'
          : 'open',
        closed_at: closedAt,
        session_date: sessionDateET(openedAt),
        was_planned: null,
        process_adherence: null,
        is_synthetic: false,
        synthetic_profile: null,
        is_demo: false,
        notes: 'SnapTrade activity-derived brokerage episode',
        thesis_mode: closed ? 'review' : 'monitoring',
        inferred_thesis_direction: direction,
        thesis_inference_basis: 'Brokerage position structure',
        thesis_status: null,
        thesis_support: null,
        thesis_agreement: null,
        thesis_last_checked_at: null,
        thesis_review_status: null,
        thesis_review_summary: null,
        created_at: openedAt,
      });
    };

    for (const row of activityRows) {
      const side = snapActivitySide(row);
      const qty = Math.abs(Number(row.units));
      const price = Number(row.price ?? 0);
      if (!side || !Number.isFinite(qty) || qty <= 0) continue;

      if (!first || exposureSide === 0) {
        first = row;
        exposureSide = side;
        net = side * qty;
        openedAt = row.trade_date;
        entryQty = qty;
        entryNotional = price * qty;
        exitQty = 0;
        exitNotional = 0;
        fees = Math.abs(Number(row.fee ?? 0));
        continue;
      }

      const sign = net >= 0 ? 1 : -1;
      if (side === sign) {
        net += side * qty;
        entryQty += qty;
        entryNotional += price * qty;
        fees += Math.abs(Number(row.fee ?? 0));
        continue;
      }

      const closeQty = Math.min(Math.abs(net), qty);
      exitQty += closeQty;
      exitNotional += price * closeQty;
      fees += Math.abs(Number(row.fee ?? 0));
      const nextNet = net + side * qty;

      if (Math.abs(nextNet) < 1e-9) {
        net = 0;
        flush(row.trade_date);
        first = null;
        exposureSide = 0;
        openedAt = null;
        entryQty = 0;
        entryNotional = 0;
        exitQty = 0;
        exitNotional = 0;
        fees = 0;
        continue;
      }

      if (Math.sign(nextNet) === Math.sign(net)) {
        net = nextNet;
        continue;
      }

      net = 0;
      flush(row.trade_date);

      const residual = Math.abs(nextNet);
      first = row;
      exposureSide = side;
      net = side * residual;
      openedAt = row.trade_date;
      entryQty = residual;
      entryNotional = price * residual;
      exitQty = 0;
      exitNotional = 0;
      fees = 0;
    }

    if (first && openedAt && Math.abs(net) > 1e-9) flush(null);
  }

  return out;
}

export async function fetchBrokerageTradeRecords(userId: string | null): Promise<TradeRecord[]> {
  if (!userId) return [];

  const { data: episodeRows, error: episodeError } = await db
    .from('snaptrade_trade_episodes')
    .select('*')
    .eq('user_id', userId)
    .order('opened_at', { ascending: false })
    .limit(2000);

  let brokerage: TradeRecord[] = episodeError
    ? []
    : list<Record<string, any>>(episodeRows).map<TradeRecord>((row) => {
        const quantity = Number(row.quantity);
        const entry = row.average_entry_price === null ? null : Number(row.average_entry_price);
        const multiplier = row.asset_type === 'option' ? 100 : 1;
        const positionSize = Number.isFinite(quantity) && entry !== null && Number.isFinite(entry)
          ? quantity * entry * multiplier
          : null;

        return {
          id: -Math.abs(Number(row.id)),
          user_id: row.user_id ?? userId,
          signal_id: null,
          symbol: String(row.symbol ?? '').toUpperCase(),
          direction: row.direction ?? null,
          strategy: row.asset_type === 'option'
            ? `Brokerage ${String(row.option_type ?? 'option')}`
            : 'Brokerage equity',
          setup: null,
          option_type: row.option_type ?? null,
          strike: row.strike === null ? null : Number(row.strike),
          expiration: row.expiration ?? null,
          option_symbol: row.option_symbol ?? null,
          asset_type: row.asset_type ?? null,
          broker: 'SnapTrade',
          account_label: row.account_id ?? null,
          contracts: row.asset_type === 'option' && Number.isFinite(quantity) ? quantity : null,
          position_size: positionSize,
          entry_at: row.opened_at ?? null,
          entry_price: entry,
          exit_at: row.closed_at ?? null,
          exit_price: row.average_exit_price === null ? null : Number(row.average_exit_price),
          fees: row.raw_summary?.fees === undefined ? null : Number(row.raw_summary.fees),
          realized_pl: row.realized_pl === null ? null : Number(row.realized_pl),
          unrealized_pl: null,
          origin: 'OTHER',
          regime: null,
          opportunity_score: null,
          confidence_score: null,
          risk_level: null,
          thesis_id: null,
          trade_plan_id: null,
          intended_invalidation: null,
          intended_target: null,
          max_favorable_excursion: null,
          max_adverse_excursion: null,
          return_pct: row.realized_return_pct === null ? null : Number(row.realized_return_pct),
          result: row.status === 'closed'
            ? Number(row.realized_pl) > 0 ? 'win' : Number(row.realized_pl) < 0 ? 'loss' : 'scratch'
            : 'open',
          closed_at: row.closed_at ?? null,
          session_date: row.session_date ?? null,
          was_planned: null,
          process_adherence: null,
          is_synthetic: false,
          synthetic_profile: null,
          is_demo: false,
          notes: `SnapTrade brokerage episode · ${row.exposure_side ?? 'position'} · source activities ${Array.isArray(row.entry_activity_ids) ? row.entry_activity_ids.length : 0} open / ${Array.isArray(row.exit_activity_ids) ? row.exit_activity_ids.length : 0} close`,
          thesis_mode: row.status === 'open' ? 'monitoring' : 'review',
          inferred_thesis_direction: row.direction ?? null,
          thesis_inference_basis: 'Brokerage position structure',
          thesis_status: null,
          thesis_support: null,
          thesis_agreement: null,
          thesis_last_checked_at: null,
          thesis_review_status: null,
          thesis_review_summary: null,
          created_at: row.opened_at ?? new Date().toISOString(),
        };
      });

  // If normalized episodes have not landed yet, reconstruct only from SnapTrade
  // activities. This keeps trader-facing history brokerage-grounded and never
  // falls back to analysis-generated/paper rows.
  if (brokerage.length === 0) {
    const { data: rawActivities, error: rawActivityError } = await db
      .from('snaptrade_activities')
      .select('id,user_id,account_id,symbol,option_symbol,option_type,strike,expiration,activity_type,option_action,units,price,fee,trade_date,description')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true })
      .limit(10000);

    if (!rawActivityError) {
      brokerage = brokerageActivitiesToTrades(list<SnapActivityRow>(rawActivities), userId);
    }
  }

  return brokerage.sort(
    (a, b) => +new Date(b.entry_at ?? b.created_at) - +new Date(a.entry_at ?? a.created_at),
  );
}

export async function fetchTradeRecords(userId: string | null): Promise<TradeRecord[]> {
  let paperQuery = db.from('paper_trades').select('*').order('created_at', { ascending: false }).limit(1000);
  if (userId) paperQuery = paperQuery.eq('user_id', userId);

  const paperPromise = paperQuery;
  const brokeragePromise = userId
    ? db
        .from('snaptrade_trade_episodes')
        .select('*')
        .eq('user_id', userId)
        .order('opened_at', { ascending: false })
        .limit(2000)
    : Promise.resolve({ data: [], error: null });

  const [paperResult, brokerageResult] = await Promise.all([paperPromise, brokeragePromise]);

  if (paperResult.error) throw new Error(errorMessage(paperResult.error, 'Trade history could not be read.'));

  const paper = list<TradeRecord>(paperResult.data);
  let brokerage = brokerageResult.error
    ? []
    : list<Record<string, any>>(brokerageResult.data).map<TradeRecord>((row) => {
        const quantity = Number(row.quantity);
        const entry = row.average_entry_price === null ? null : Number(row.average_entry_price);
        const multiplier = row.asset_type === 'option' ? 100 : 1;
        const positionSize = Number.isFinite(quantity) && entry !== null && Number.isFinite(entry)
          ? quantity * entry * multiplier
          : null;

        return {
          id: -Math.abs(Number(row.id)),
          user_id: row.user_id ?? userId,
          signal_id: null,
          symbol: String(row.symbol ?? '').toUpperCase(),
          direction: row.direction ?? null,
          strategy: row.asset_type === 'option'
            ? `Brokerage ${String(row.option_type ?? 'option')}`
            : 'Brokerage equity',
          setup: null,
          option_type: row.option_type ?? null,
          strike: row.strike === null ? null : Number(row.strike),
          expiration: row.expiration ?? null,
          option_symbol: row.option_symbol ?? null,
          asset_type: row.asset_type ?? null,
          broker: 'SnapTrade',
          account_label: row.account_id ?? null,
          contracts: row.asset_type === 'option' && Number.isFinite(quantity) ? quantity : null,
          position_size: positionSize,
          entry_at: row.opened_at ?? null,
          entry_price: entry,
          exit_at: row.closed_at ?? null,
          exit_price: row.average_exit_price === null ? null : Number(row.average_exit_price),
          fees: row.raw_summary?.fees === undefined ? null : Number(row.raw_summary.fees),
          realized_pl: row.realized_pl === null ? null : Number(row.realized_pl),
          unrealized_pl: null,
          origin: 'OTHER',
          regime: null,
          opportunity_score: null,
          confidence_score: null,
          risk_level: null,
          thesis_id: null,
          trade_plan_id: null,
          intended_invalidation: null,
          intended_target: null,
          max_favorable_excursion: null,
          max_adverse_excursion: null,
          return_pct: row.realized_return_pct === null ? null : Number(row.realized_return_pct),
          result: row.status === 'closed'
            ? Number(row.realized_pl) > 0 ? 'win' : Number(row.realized_pl) < 0 ? 'loss' : 'scratch'
            : 'open',
          closed_at: row.closed_at ?? null,
          session_date: row.session_date ?? null,
          was_planned: null,
          process_adherence: null,
          is_synthetic: false,
          synthetic_profile: null,
          is_demo: false,
          notes: `SnapTrade brokerage episode · ${row.exposure_side ?? 'position'} · source activities ${Array.isArray(row.entry_activity_ids) ? row.entry_activity_ids.length : 0} open / ${Array.isArray(row.exit_activity_ids) ? row.exit_activity_ids.length : 0} close`,
          thesis_mode: row.status === 'open' ? 'monitoring' : 'review',
          inferred_thesis_direction: row.direction ?? null,
          thesis_inference_basis: 'Brokerage position structure',
          thesis_status: null,
          thesis_support: null,
          thesis_agreement: null,
          thesis_last_checked_at: null,
          thesis_review_status: null,
          thesis_review_summary: null,
          created_at: row.opened_at ?? new Date().toISOString(),
        };
      });

  // If the server-side episode normalizer has not produced rows yet, do not hide
  // brokerage history. Reconstruct episodes deterministically from the user's raw,
  // RLS-protected SnapTrade activities so Activity/Patterns can still use real trades.
  if (userId && brokerage.length === 0) {
    const { data: rawActivities, error: rawActivityError } = await db
      .from('snaptrade_activities')
      .select('id,user_id,account_id,symbol,option_symbol,option_type,strike,expiration,activity_type,option_action,units,price,fee,trade_date,description')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true })
      .limit(10000);

    if (!rawActivityError) {
      brokerage = brokerageActivitiesToTrades(list<SnapActivityRow>(rawActivities), userId);
    }
  }

  return [...brokerage, ...paper].sort(
    (a, b) => +new Date(b.entry_at ?? b.created_at) - +new Date(a.entry_at ?? a.created_at),
  );
}


export async function fetchTradeCycleThesisEvents(userId: string | null, tradeId?: number): Promise<TradeCycleThesisEvent[]> {
  if (!userId) return [];
  let q = db
    .from('tradecycle_thesis_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (tradeId !== undefined) q = q.eq('trade_id', tradeId);
  const { data, error } = await q;
  if (error) throw new Error(errorMessage(error, 'TradeCycle thesis events could not be read.'));
  return list<TradeCycleThesisEvent>(data);
}

export async function fetchTradePlans(userId: string | null): Promise<TradePlan[]> {
  if (!userId) return [];
  const { data, error } = await db.from('trade_plans').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(errorMessage(error, 'Trade plans could not be read.'));
  return list<TradePlan>(data);
}

export async function fetchModifications(userId: string | null): Promise<TradeModification[]> {
  if (!userId) return [];
  const { data, error } = await db.from('trade_modifications').select('*').order('occurred_at', { ascending: false }).limit(500);
  if (error) throw new Error(errorMessage(error, 'Modification log could not be read.'));
  return list<TradeModification>(data);
}

export async function fetchStoredObservations(userId: string | null): Promise<Observation[]> {
  if (!userId) return [];
  const { data, error } = await db.from('behavioral_observations').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(errorMessage(error, 'Behavioural observations could not be read.'));
  return list<Record<string, unknown>>(data).map((r) => ({
    id: r.id as number,
    observation_type: r.observation_type as string,
    category: (r.category as string) ?? 'general',
    statement: (r.statement as string) ?? '',
    baseline_value: (r.baseline_value as number) ?? null,
    current_value: (r.current_value as number) ?? null,
    deviation_pct: (r.deviation_pct as number) ?? null,
    unit: (r.unit as string) ?? '',
    sample_size: (r.sample_size as number) ?? 0,
    observation_period: (r.observation_period as string) ?? '',
    confidence_label: (r.confidence_label as Observation['confidence_label']) ?? 'INSUFFICIENT DATA',
    construct_key: (r.construct_key as string) ?? null,
    evidence_trade_ids: Array.isArray((r.evidence_trade_ids as { items?: number[] })?.items)
      ? ((r.evidence_trade_ids as { items: number[] }).items)
      : Array.isArray(r.evidence_trade_ids) ? (r.evidence_trade_ids as number[]) : [],
    severity: (r.severity as Observation['severity']) ?? 'LOW',
    model_version: (r.model_version as string) ?? MODEL_VERSION,
    session_date: (r.session_date as string) ?? null,
    trade_id: (r.trade_id as number) ?? null,
    formula: '(stored observation — formula recorded at calculation time)',
  }));
}

/**
 * Append an observation. Historical rows are never recomputed in place: a new
 * calculation writes a new row carrying its own model version.
 */
export async function persistObservations(userId: string, obs: Observation[]): Promise<number> {
  if (!userId || !obs.length) return 0;
  const payload = obs.map((o) => ({
    user_id: userId,
    session_date: o.session_date ?? null,
    trade_id: o.trade_id ?? null,
    observation_type: o.observation_type,
    category: o.category,
    baseline_value: o.baseline_value,
    current_value: o.current_value,
    deviation_pct: o.deviation_pct,
    unit: o.unit,
    sample_size: o.sample_size,
    observation_period: o.observation_period,
    confidence_label: o.confidence_label,
    construct_key: o.construct_key,
    evidence_trade_ids: { items: o.evidence_trade_ids.slice(0, 200) },
    severity: o.severity,
    statement: o.statement,
    model_version: o.model_version,
  }));
  const { error } = await db.from('behavioral_observations').insert(payload);
  if (error) throw new Error(errorMessage(error, 'Observations could not be recorded.'));
  return payload.length;
}

export async function fetchBehavioralPrefs(userId: string | null): Promise<BehavioralPrefs> {
  if (!userId) return DEFAULT_BEHAVIORAL_PREFS;
  const { data, error } = await db.from('behavioral_prefs').select('*').eq('user_id', userId).limit(1);
  if (error) return DEFAULT_BEHAVIORAL_PREFS;
  const row = list<Record<string, unknown>>(data)[0];
  if (!row) return DEFAULT_BEHAVIORAL_PREFS;
  return {
    onboarded: Boolean(row.onboarded),
    consented: Boolean(row.consented),
    categories: (row.categories as Record<string, boolean>) ?? {},
    sensitivity: (row.sensitivity as Sensitivity) ?? 'STANDARD',
    entitlement: (row.entitlement as string) ?? 'trader_intelligence_beta',
  };
}

export async function saveBehavioralPrefs(userId: string, patch: Partial<BehavioralPrefs>): Promise<void> {
  const existing = await fetchBehavioralPrefs(userId);
  const next = { ...existing, ...patch };
  const row = {
    user_id: userId,
    onboarded: next.onboarded,
    consented: next.consented,
    categories: next.categories,
    sensitivity: next.sensitivity,
    entitlement: next.entitlement,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('behavioral_prefs').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(errorMessage(error, 'Alert preferences could not be saved.'));
}

/** A category is on unless the user explicitly turned it off. */
export function enabledCategories(prefs: BehavioralPrefs, all: readonly { key: AlertCategory }[]): Set<string> {
  return new Set(all.filter((c) => prefs.categories[c.key] !== false).map((c) => c.key));
}

/* ------------------------------ trade plans -------------------------------- */

export async function createTradePlan(userId: string, plan: Partial<TradePlan> & { symbol: string }): Promise<number | null> {
  const { data, error } = await db.from('trade_plans').insert({ ...plan, user_id: userId, engine_version: MODEL_VERSION }).select('id');
  if (error) throw new Error(errorMessage(error, 'The pre-entry plan could not be stored.'));
  return list<{ id: number }>(data)[0]?.id ?? null;
}

export async function logModification(userId: string, mod: Partial<TradeModification> & { modification_type: string }): Promise<void> {
  const { error } = await db.from('trade_modifications').insert({ ...mod, user_id: userId, engine_version: MODEL_VERSION });
  if (error) throw new Error(errorMessage(error, 'The modification could not be recorded.'));
}

export async function setTradeOrigin(tradeId: number, origin: string): Promise<void> {
  const { error } = await db.from('paper_trades').update({ origin }).eq('id', tradeId);
  if (error) throw new Error(errorMessage(error, 'The trade origin could not be updated.'));
}

/* ----------------------------- literature layer ---------------------------- */

export async function fetchLiterature(): Promise<{ constructs: LitConstruct[]; studies: LitStudy[]; links: LitLink[] }> {
  const [c, s, l] = await Promise.all([
    db.from('lit_constructs').select('*').order('name', { ascending: true }),
    db.from('lit_studies').select('*').order('year', { ascending: true }),
    db.from('lit_construct_studies').select('*'),
  ]);
  if (c.error) throw new Error(errorMessage(c.error, 'The research library could not be read.'));
  return {
    constructs: list<LitConstruct>(c.data),
    studies: list<LitStudy>(s.data),
    links: list<LitLink>(l.data),
  };
}

/** Per-user cost tracking hook (PHASE D9). Never blocks the calling action. */
export async function recordCost(userId: string | null, costType: string, units: number, detail?: string): Promise<void> {
  if (!userId) return;
  try {
    await db.from('usage_costs').insert({ user_id: userId, cost_type: costType, units, detail: detail ?? null });
  } catch {
    /* cost telemetry must never break a user action */
  }
}
