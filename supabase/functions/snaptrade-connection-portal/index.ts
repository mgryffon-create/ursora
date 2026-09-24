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

import { snapTradeRequest } from '../_shared/snaptrade.ts';

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
