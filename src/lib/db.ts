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
// Preserve recovery routing even if the provider falls back to the site's root URL.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery') {
  window.history.replaceState(window.history.state, '', '/account/recovery' + window.location.search + window.location.hash);
}

export const db = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default db;
