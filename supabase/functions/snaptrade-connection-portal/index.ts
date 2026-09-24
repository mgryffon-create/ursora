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


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const { user, db } = await requireUser(req);
    const body = await req.json().catch(() => ({}));

    const { data: credential, error } = await db
      .from('snaptrade_credentials')
      .select('snaptrade_user_id, user_secret')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!credential) return json({ error: 'Register the SnapTrade user before opening the connection portal.' }, 409);

    const loginBody: Record<string, unknown> = {
      connectionType: 'read',
    };
    if (typeof body.broker === 'string' && body.broker.trim()) loginBody.broker = body.broker.trim();
    if (typeof body.custom_redirect === 'string' && body.custom_redirect.trim()) {
      loginBody.customRedirect = body.custom_redirect.trim();
    }

    const result = await snapTradeRequest<Record<string, unknown>>({
      method: 'POST',
      path: '/snapTrade/login',
      userId: credential.snaptrade_user_id,
      userSecret: credential.user_secret,
      body: loginBody as never,
    });

    const redirectURI = String(result.redirectURI ?? result.redirectUri ?? result.redirect_uri ?? '').trim();
    if (!redirectURI) throw new Error('SnapTrade did not return a Connection Portal URL.');

    return json({
      success: true,
      redirect_uri: redirectURI,
      expires_in_seconds: 300,
      connection_type: 'read',
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
