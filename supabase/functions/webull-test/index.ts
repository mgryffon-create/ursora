import { AuthError, requireUser } from '../_shared/auth.ts';
import { handleOptions, json } from '../_shared/http.ts';
import { summarizeWebullError, webullConfig, webullGet } from '../_shared/webull.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    await requireUser(req);
    const config = webullConfig();
    const tests: Record<string, unknown> = {};

    try {
      const accounts = await webullGet('/trading/accounts/list');
      const list = Array.isArray(accounts) ? accounts : (accounts as any)?.data ?? [];
      tests.trading = {
        ok: true,
        account_count: Array.isArray(list) ? list.length : null,
        accounts: Array.isArray(list)
          ? list.map((a: any) => ({ account_id: a?.account_id ?? null, account_type: a?.account_type ?? null }))
          : [],
      };
    } catch (error) {
      tests.trading = { ok: false, ...summarizeWebullError(error) };
    }

    // The legacy snapshot path remains documented in Webull's Data API examples.
    // It is useful as a credential/quotes permission smoke test in sandbox.
    try {
      const snapshot = await webullGet('/openapi/market-data/stock/snapshot', {
        symbols: 'AAPL',
        category: 'US_STOCK',
        extend_hour_required: false,
        overnight_required: false,
      });
      tests.quotes = { ok: true, sample: Array.isArray(snapshot) ? snapshot.slice(0, 1) : snapshot };
    } catch (legacyError) {
      // Current v3 reference uses /market-data/stocks/snapshots/list. Try it as a
      // fallback with the same query vocabulary so the response tells us which
      // entitlement or request shape this PaperTrade key expects.
      try {
        const snapshot = await webullGet('/market-data/stocks/snapshots/list', {
          symbols: 'AAPL',
          category: 'US_STOCK',
          extend_hour_required: false,
          overnight_required: false,
        });
        tests.quotes = { ok: true, sample: Array.isArray(snapshot) ? snapshot.slice(0, 1) : snapshot, endpoint: 'v3' };
      } catch (v3Error) {
        tests.quotes = {
          ok: false,
          legacy: summarizeWebullError(legacyError),
          v3: summarizeWebullError(v3Error),
        };
      }
    }

    return json({
      success: Boolean((tests.trading as any)?.ok || (tests.quotes as any)?.ok),
      environment: config.environment,
      host: config.host,
      tests,
    });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
