import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/lib/config';

const authStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;

    const remember = window.localStorage.getItem('ursora_remember_login') !== 'false';
    const primary = remember ? window.localStorage : window.sessionStorage;
    const secondary = remember ? window.sessionStorage : window.localStorage;

    const value = primary.getItem(key);
    if (value !== null) return value;

    // One-time compatibility bridge for sessions created before the storage adapter
    // existed. Migrate the existing Supabase token into the selected storage.
    const legacy = secondary.getItem(key);
    if (legacy !== null) {
      primary.setItem(key, legacy);
      secondary.removeItem(key);
      return legacy;
    }
    return null;
  },

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;

    const remember = window.localStorage.getItem('ursora_remember_login') !== 'false';
    const target = remember ? window.localStorage : window.sessionStorage;
    const other = remember ? window.sessionStorage : window.localStorage;

    target.setItem(key, value);
    other.removeItem(key);
  },

  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

/**
 * URSORA browser client.
 *
 * Authentication uses a storage adapter so "Remember me" has real storage
 * semantics instead of signing a valid Supabase session out on the next page load:
 * - Remember me ON  -> Supabase refresh token lives in localStorage.
 * - Remember me OFF -> Supabase refresh token lives in sessionStorage.
 */
export const db = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
});

export default db;
