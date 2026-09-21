const required = (name: string, value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and configure your independent backend before running URSORA.`,
    );
  }
  return trimmed;
};

export const APP_CONFIG = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required(
    'VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY',
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
  ),
  edgeBaseUrl: (
    import.meta.env.VITE_EDGE_FUNCTIONS_URL?.trim() ||
    `${required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '')}/functions/v1`
  ).replace(/\/$/, ''),
} as const;
