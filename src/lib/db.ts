import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/lib/config';

/**
 * Backend client for URSORA.
 *
 * Supabase's native browser storage is intentionally used here. It persists
 * refresh tokens in localStorage reliably across browser restarts. "Remember me"
 * is enforced by AuthContext: when disabled, a session-only marker is kept in
 * sessionStorage and the persisted Supabase session is discarded on the next
 * browser session.
 */
export const db = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default db;
