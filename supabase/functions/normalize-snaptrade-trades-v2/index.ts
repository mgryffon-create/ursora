// SNAPTRADE_EPISODE_NORMALIZER_V1 — derives actual trade episodes from synced brokerage activities.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase runtime credentials are missing.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireUser(req: Request) {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) throw new AuthError('Authentication required.', 401);
  const token = header.slice(7).trim();
  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new AuthError('Invalid or expired session.', 401);
  return { user, db };
}

type Row = Record<string, any>;

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function etDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function activitySide(row: Row): 1 | -1 | 0 {
  const text = [row.option_action, row.activity_type, row.description]
    .filter(Boolean).join(' ').toUpperCase();
  if (/BUY|BOT/.test(text)) return 1;
  if (/SELL|SOLD/.test(text)) return -1;
  return 0;
}

function directionFor(assetType: string, optionType: string | null, side: 1 | -1): string {
  const option = String(optionType ?? '').toLowerCase();
  if (assetType === 'option') {
    if (option === 'call') return side > 0 ? 'bullish' : 'bearish';
    if (option === 'put') return side > 0 ? 'bearish' : 'bullish';
    return 'neutral';
  }
  return side > 0 ? 'bullish' : 'bearish';
}

interface EpisodeBuild {
  account_id: string;
  symbol: string;
  option_symbol: string | null;
  asset_type: string;
  option_type: string | null;
  strike: number | null;
  expiration: string | null;
  side: 1 | -1;
  net: number;
  quantityOpened: number;
  entryQty: number;
  entryNotional: number;
  exitQty: number;
  exitNotional: number;
  fees: number;
  opened_at: string;
  closed_at: string | null;
  entryIds: string[];
  exitIds: string[];
  firstActivityId: string;
}

function toRow(userId: string, ep: EpisodeBuild, syncedAt: string) {
  const entry = ep.entryQty > 0 ? ep.entryNotional / ep.entryQty : null;
  const exit = ep.exitQty > 0 ? ep.exitNotional / ep.exitQty : null;
  const closed = Math.abs(ep.net) < 1e-9;
  const multiplier = ep.asset_type === 'option' ? 100 : 1;
  const realized = closed && entry !== null && exit !== null
    ? ((exit - entry) * ep.quantityOpened * multiplier * ep.side) - ep.fees
    : null;
  const returnPct = closed && entry !== null && exit !== null && entry > 0
    ? ((exit - entry) / entry) * 100 * ep.side
    : null;

  const instrumentKey = ep.option_symbol ?? ep.symbol;
  return {
    user_id: userId,
    account_id: ep.account_id,
    external_episode_key: `${ep.account_id}:${instrumentKey}:${ep.firstActivityId}`,
    symbol: ep.symbol,
    option_symbol: ep.option_symbol,
    asset_type: ep.asset_type,
    option_type: ep.option_type,
    strike: ep.strike,
    expiration: ep.expiration,
    status: closed ? 'closed' : 'open',
    exposure_side: ep.side > 0 ? 'long' : 'short',
    direction: directionFor(ep.asset_type, ep.option_type, ep.side),
    quantity: ep.quantityOpened,
    average_entry_price: entry,
    average_exit_price: exit,
    opened_at: ep.opened_at,
    closed_at: closed ? ep.closed_at : null,
    session_date: etDate(ep.opened_at),
    realized_pl: realized,
    realized_return_pct: returnPct,
    entry_activity_ids: ep.entryIds,
    exit_activity_ids: ep.exitIds,
    timestamp_precision: 'provider',
    raw_summary: {
      source: 'snaptrade_activities',
      instrument_key: instrumentKey,
      fees: ep.fees,
      closing_quantity: ep.exitQty,
    },
    synced_at: syncedAt,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const { data: activities, error } = await db
      .from('snaptrade_activities')
      .select('*')
      .eq('user_id', user.id)
      .order('trade_date', { ascending: true })
      .limit(10000);
    if (error) throw error;

    const executable = (activities ?? []).filter((row: Row) => {
      const side = activitySide(row);
      const qty = Math.abs(n(row.units) ?? 0);
      return side !== 0 && qty > 0 && Boolean(row.symbol || row.option_symbol) && Boolean(row.trade_date);
    });

    const groups = new Map<string, Row[]>();
    for (const row of executable) {
      const instrument = String(row.option_symbol ?? row.symbol ?? '').toUpperCase();
      const key = `${row.account_id}|${instrument}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const built: ReturnType<typeof toRow>[] = [];
    const syncedAt = new Date().toISOString();

    for (const rows of groups.values()) {
      rows.sort((a, b) => +new Date(a.trade_date) - +new Date(b.trade_date));
      let current: EpisodeBuild | null = null;

      const start = (row: Row, side: 1 | -1, qty: number): EpisodeBuild => ({
        account_id: String(row.account_id),
        symbol: String(row.symbol ?? '').toUpperCase(),
        option_symbol: row.option_symbol ? String(row.option_symbol) : null,
        asset_type: row.option_symbol ? 'option' : 'equity',
        option_type: row.option_type ? String(row.option_type).toLowerCase() : null,
        strike: n(row.strike),
        expiration: row.expiration ?? null,
        side,
        net: side * qty,
        quantityOpened: qty,
        entryQty: qty,
        entryNotional: (n(row.price) ?? 0) * qty,
        exitQty: 0,
        exitNotional: 0,
        fees: Math.abs(n(row.fee) ?? 0),
        opened_at: row.trade_date,
        closed_at: null,
        entryIds: [String(row.id)],
        exitIds: [],
        firstActivityId: String(row.id),
      });

      for (const row of rows) {
        const side = activitySide(row);
        const qty = Math.abs(n(row.units) ?? 0);
        const price = n(row.price) ?? 0;
        if (!side || qty <= 0) continue;

        if (!current) {
          current = start(row, side, qty);
          continue;
        }

        const currentSign = current.net >= 0 ? 1 : -1;
        if (side === currentSign) {
          current.net += side * qty;
          current.quantityOpened += qty;
          current.entryQty += qty;
          current.entryNotional += price * qty;
          current.entryIds.push(String(row.id));
          current.fees += Math.abs(n(row.fee) ?? 0);
          continue;
        }

        const closeQty = Math.min(Math.abs(current.net), qty);
        current.exitQty += closeQty;
        current.exitNotional += price * closeQty;
        current.exitIds.push(String(row.id));
        current.fees += Math.abs(n(row.fee) ?? 0);
        const nextNet = current.net + side * qty;
        current.closed_at = row.trade_date;

        if (Math.abs(nextNet) < 1e-9) {
          current.net = 0;
          built.push(toRow(user.id, current, syncedAt));
          current = null;
          continue;
        }

        if (Math.sign(nextNet) === Math.sign(current.net)) {
          current.net = nextNet;
          continue;
        }

        current.net = 0;
        built.push(toRow(user.id, current, syncedAt));
        const residual = Math.abs(nextNet);
        current = start(row, side, residual);
      }

      if (current) built.push(toRow(user.id, current, syncedAt));
    }

    if (built.length) {
      const { error: upsertError } = await db
        .from('snaptrade_trade_episodes')
        .upsert(built, { onConflict: 'user_id,external_episode_key' });
      if (upsertError) throw upsertError;
    }

    return json({
      success: true,
      activities_considered: executable.length,
      episodes: built.length,
      closed: built.filter((row) => row.status === 'closed').length,
      open: built.filter((row) => row.status === 'open').length,
      synced_at: syncedAt,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
