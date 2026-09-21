import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/lib/config';

/**
 * Backend client for URSORA.
 *
 * The project is intentionally backend-agnostic at build time. Point these
 * environment variables at a Supabase project you control; no platform-owned
 * endpoint or credential is embedded in the source tree.
 */
export const db = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey);
export default db;
