import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/lib/config';

/**
 * URSORA browser client.
 *
 * Supabase's native browser storage is intentionally used here. With
 * persistSession + autoRefreshToken enabled, a remembered login survives tab/browser
 * closure using the refresh token in localStorage. AuthContext handles the optional
 * "session only" behavior when Remember me is turned off.
 */
export const db = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default db;
