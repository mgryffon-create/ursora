# URSORA

URSORA is a Vite + React + TypeScript options research and trader-intelligence
application.

## Independent baseline

This copy has been detached from its original hosted-builder infrastructure.
Backend endpoints and public client credentials are supplied only through
environment variables, and original platform analytics/CDN references have been
removed.

### Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` to a Supabase
project you control. See `docs/INDEPENDENT_HOSTING.md` for migration and hosting
notes.

### Build

```bash
npm run build
```

The production output is written to `dist/`.

## Independent backend

URSORA now ships with its own Supabase schema, RLS policies, seed configuration and Edge Functions under `supabase/`. See `docs/INDEPENDENT_BACKEND.md` for deployment instructions. The codebase contains no required SuperCool runtime dependency.
