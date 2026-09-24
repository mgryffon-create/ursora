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

    const { data: existing, error: existingError } = await db
      .from('snaptrade_credentials')
      .select('snaptrade_user_id, created_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      return json({
        success: true,
        registered: true,
        created: false,
        snaptrade_user_id: existing.snaptrade_user_id,
        created_at: existing.created_at,
      });
    }

    const snaptradeUserId = `ursora-${user.id}`;
    const registered = await snapTradeRequest<{ userId?: string; userSecret?: string }>({
      method: 'POST',
      path: '/snapTrade/registerUser',
      body: { userId: snaptradeUserId },
    });

    const userSecret = String(registered?.userSecret ?? '').trim();
    if (!userSecret) throw new Error('SnapTrade registered the user but did not return a userSecret.');

    const { error: saveError } = await db.from('snaptrade_credentials').insert({
      user_id: user.id,
      snaptrade_user_id: String(registered.userId ?? snaptradeUserId),
      user_secret: userSecret,
      updated_at: new Date().toISOString(),
    });
    if (saveError) throw saveError;

    return json({
      success: true,
      registered: true,
      created: true,
      snaptrade_user_id: String(registered.userId ?? snaptradeUserId),
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
