import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/lib/config';

const REMEMBER_LOGIN_KEY = 'ursora_remember_login';

const authStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    const remember = window.localStorage.getItem(REMEMBER_LOGIN_KEY) !== 'false';
    return remember
      ? window.localStorage.getItem(key)
      : window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    const remember = window.localStorage.getItem(REMEMBER_LOGIN_KEY) !== 'false';
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
 * Backend client for URSORA.
 *
 * Authentication is persisted in localStorage when "Remember me" is enabled,
 * and only in sessionStorage when it is disabled.
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
