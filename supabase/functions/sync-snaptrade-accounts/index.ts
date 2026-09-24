// SNAPTRADE_STANDALONE_V2 — self-contained for Supabase Dashboard deployment; no ../_shared imports.
import { createClient } from 'npm:@supabase/supabase-js@2';
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize((value as Record<string, JsonValue>)[key]);
    return out;
  }
  return value;
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface SnapTradeRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  path: string;
  query?: Array<[string, string | number | boolean | null | undefined]>;
  body?: JsonValue;
  userId?: string | null;
  userSecret?: string | null;
}

export async function snapTradeRequest<T = unknown>(options: SnapTradeRequestOptions): Promise<T> {
  const clientId = env('SNAPTRADE_CLIENT_ID');
  const consumerKey = env('SNAPTRADE_CONSUMER_KEY');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params = new URLSearchParams();
  params.append('clientId', clientId);
  params.append('timestamp', timestamp);
  if (options.userId) params.append('userId', options.userId);
  if (options.userSecret) params.append('userSecret', options.userSecret);
  for (const [key, value] of options.query ?? []) {
    if (value !== null && value !== undefined && value !== '') params.append(key, String(value));
  }

  const query = params.toString();
  const content = options.body === undefined ? null : options.body;
  const payload = canonicalJson({
    content,
    path: options.path,
    query,
  } as JsonValue);
  const signature = await hmacSha256Base64(consumerKey, payload);

  const response = await fetch(`https://api.snaptrade.com${options.path}?${query}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Signature: signature,
    },
    body: content === null ? undefined : JSON.stringify(content),
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }

  if (!response.ok) {
    const detail =
      typeof parsed === 'string'
        ? parsed
        : parsed && typeof parsed === 'object'
          ? JSON.stringify(parsed)
          : raw;
    throw new Error(`SnapTrade HTTP ${response.status}: ${detail.slice(0, 700)}`);
  }

  return parsed as T;
}


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

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const includeActivities = body.include_activities !== false;

    const { data: credential, error: credentialError } = await db
      .from('snaptrade_credentials')
      .select('snaptrade_user_id, user_secret')
      .eq('user_id', user.id)
      .maybeSingle();
    if (credentialError) throw credentialError;
    if (!credential) return json({ error: 'SnapTrade user is not registered for this account.' }, 409);

    const auth = {
      userId: credential.snaptrade_user_id,
      userSecret: credential.user_secret,
    };

    const accounts = await snapTradeRequest<any[]>({
      method: 'GET',
      path: '/accounts',
      ...auth,
    });

    const syncedAt = new Date().toISOString();
    const accountRows = asArray<any>(accounts).map((account) => ({
      id: String(account.id),
      user_id: user.id,
      connection_id: account.brokerage_authorization ?? null,
      institution_name: account.institution_name ?? null,
      name: account.name ?? null,
      masked_number: account.number ?? null,
      account_category: account.account_category ?? null,
      raw_type: account.raw_type ?? null,
      status: account.status ?? null,
      is_paper: Boolean(account.is_paper),
      total_value: n(account.balance?.total?.amount),
      total_value_currency: account.balance?.total?.currency ?? null,
      transactions_initial_sync_completed: account.sync_status?.transactions?.initial_sync_completed ?? null,
      transactions_last_successful_sync: account.sync_status?.transactions?.last_successful_sync ?? null,
      holdings_initial_sync_completed: account.sync_status?.holdings?.initial_sync_completed ?? null,
      holdings_last_successful_sync: account.sync_status?.holdings?.last_successful_sync ?? null,
      holdings_unavailable: account.sync_status?.holdings?.holdings_unavailable ?? null,
      raw: account,
      synced_at: syncedAt,
    }));

    if (accountRows.length) {
      const { error } = await db.from('snaptrade_accounts').upsert(accountRows, { onConflict: 'id' });
      if (error) throw error;
    }

    let positionsWritten = 0;
    let balancesWritten = 0;
    let activitiesWritten = 0;
    const warnings: string[] = [];

    for (const account of accountRows) {
      try {
        const positionsPayload = await snapTradeRequest<Record<string, unknown>>({
          method: 'GET',
          path: `/accounts/${encodeURIComponent(account.id)}/positions/all`,
          ...auth,
        });
        const positions = asArray<any>(positionsPayload?.results);

        await db.from('snaptrade_positions').delete().eq('account_id', account.id).eq('user_id', user.id);

        if (positions.length) {
          const rows = positions.map((position) => {
            const instrument = position.instrument ?? {};
            const option = instrument.kind === 'option' ? instrument : null;
            return {
              user_id: user.id,
              account_id: account.id,
              instrument_id: instrument.id ?? null,
              instrument_kind: instrument.kind ?? null,
              symbol: option?.underlying_symbol?.symbol ?? instrument.symbol ?? instrument.raw_symbol ?? null,
              raw_symbol: option?.underlying_symbol?.raw_symbol ?? instrument.raw_symbol ?? null,
              option_symbol: option?.ticker ?? null,
              option_type: option?.option_type ?? null,
              strike: n(option?.strike_price),
              expiration: option?.expiration_date ?? null,
              units: n(position.units),
              price: n(position.price),
              cost_basis: n(position.cost_basis),
              currency: position.currency ?? null,
              cash_equivalent: position.cash_equivalent ?? null,
              raw: position,
              synced_at: syncedAt,
            };
          });
          const { error } = await db.from('snaptrade_positions').insert(rows);
          if (error) throw error;
          positionsWritten += rows.length;
        }
      } catch (error) {
        warnings.push(`${account.institution_name ?? account.id} positions: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        const balances = await snapTradeRequest<any[]>({
          method: 'GET',
          path: `/accounts/${encodeURIComponent(account.id)}/balances`,
          ...auth,
        });

        const rows = asArray<any>(balances).map((balance) => ({
          user_id: user.id,
          account_id: account.id,
          currency_code: balance.currency?.code ?? 'UNKNOWN',
          cash: n(balance.cash),
          buying_power: n(balance.buying_power),
          synced_at: syncedAt,
        }));
        if (rows.length) {
          const { error } = await db.from('snaptrade_balances').upsert(rows, { onConflict: 'account_id,currency_code' });
          if (error) throw error;
          balancesWritten += rows.length;
        }
      } catch (error) {
        warnings.push(`${account.institution_name ?? account.id} balances: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (includeActivities) {
        try {
          let offset = 0;
          let total = Infinity;
          const limit = 1000;
          const gathered: any[] = [];

          while (offset < total && gathered.length < 5000) {
            const payload = await snapTradeRequest<Record<string, any>>({
              method: 'GET',
              path: `/accounts/${encodeURIComponent(account.id)}/activities`,
              ...auth,
              query: [['offset', offset], ['limit', limit]],
            });
            const page = asArray<any>(payload.data);
            gathered.push(...page);
            total = Number(payload.pagination?.total ?? page.length);
            if (!page.length || page.length < limit) break;
            offset += page.length;
          }

          if (gathered.length) {
            const rows = gathered.map((activity) => {
              const option = activity.option_symbol ?? null;
              const underlying = option?.underlying_symbol ?? activity.symbol ?? null;
              return {
                id: String(activity.id),
                user_id: user.id,
                account_id: account.id,
                symbol: underlying?.symbol ?? underlying?.raw_symbol ?? null,
                raw_symbol: underlying?.raw_symbol ?? null,
                option_symbol: option?.ticker ?? null,
                option_type: option?.option_type ?? null,
                strike: n(option?.strike_price),
                expiration: option?.expiration_date ?? null,
                activity_type: activity.type ?? null,
                option_action: activity.option_type ?? null,
                units: n(activity.units),
                price: n(activity.price),
                amount: n(activity.amount),
                fee: n(activity.fee),
                currency: activity.currency?.code ?? null,
                trade_date: activity.trade_date ?? null,
                settlement_date: activity.settlement_date ?? null,
                institution: activity.institution ?? account.institution_name ?? null,
                external_reference_id: activity.external_reference_id ?? null,
                description: activity.description ?? null,
                raw: activity,
                synced_at: syncedAt,
              };
            });
            const { error } = await db.from('snaptrade_activities').upsert(rows, { onConflict: 'id' });
            if (error) throw error;
            activitiesWritten += rows.length;
          }
        } catch (error) {
          warnings.push(`${account.institution_name ?? account.id} activities: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return json({
      success: true,
      accounts: accountRows.length,
      positions: positionsWritten,
      balances: balancesWritten,
      activities: activitiesWritten,
      warnings,
      synced_at: syncedAt,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
