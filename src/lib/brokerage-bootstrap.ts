import db from '@/lib/db';
import { APP_CONFIG } from '@/lib/config';

const BROKERAGE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BROKERAGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let brokerageSyncInFlight: Promise<boolean> | null = null;
let intervalStarted = false;

const edgePost = async (
  slug: 'sync-snaptrade-accounts-v2' | 'normalize-snaptrade-trades-v2',
  token: string,
  body: Record<string, unknown>,
) => {
  const response = await fetch(`${APP_CONFIG.edgeBaseUrl}/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: APP_CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

  if (!response.ok) {
    const error = parsed && typeof parsed === 'object' && 'error' in parsed
      ? String((parsed as { error?: unknown }).error)
      : `${slug} failed with HTTP ${response.status}`;
    throw new Error(error);
  }

  return parsed;
};

const linkedAccounts = async (userId: string) => {
  const { data, error } = await db
    .from('snaptrade_accounts')
    .select('id,synced_at')
    .eq('user_id', userId)
    .order('synced_at', { ascending: true });

  if (error) throw error;
  return (data as Array<{ id: string; synced_at: string | null }> | null) ?? [];
};

const oldestSyncMs = (accounts: Array<{ synced_at: string | null }>) => {
  const timestamps = accounts
    .map((account) => account.synced_at ? new Date(account.synced_at).getTime() : 0)
    .filter(Number.isFinite);
  return timestamps.length ? Math.min(...timestamps) : 0;
};

export async function hydrateBrokerageData(force = false): Promise<boolean> {
  if (brokerageSyncInFlight) return brokerageSyncInFlight;

  brokerageSyncInFlight = (async () => {
    try {
      const { data, error } = await db.auth.getSession();
      if (error || !data.session?.user?.id || !data.session.access_token) return false;

      const userId = data.session.user.id;
      const accounts = await linkedAccounts(userId);

      // Local rows can be missing even when the signed-in SnapTrade registration
      // already has a live brokerage authorization (for example after an auth/account
      // migration). Probe SnapTrade once when no local accounts exist so the account
      // table can self-heal instead of permanently treating "no rows" as "not linked".
      if (!accounts.length) {
        try {
          const hydrated = await edgePost(
            'sync-snaptrade-accounts-v2',
            data.session.access_token,
            { include_activities: true },
          ) as { accounts?: number };
          if ((hydrated?.accounts ?? 0) > 0) {
            await edgePost('normalize-snaptrade-trades-v2', data.session.access_token, {});
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('ursora-brokerage-refreshed', {
                detail: { userId, synced: true, discovered: hydrated.accounts ?? 0 },
              }));
            }
            return true;
          }
        } catch (error) {
          // A user with no SnapTrade registration gets a fast 409 here. That is not
          // an application error and should not block startup.
          console.info('URSORA brokerage discovery found no linked account for this registration.');
        }
        return false;
      }

      const lastSync = oldestSyncMs(accounts);
      const stale = !lastSync || Date.now() - lastSync >= BROKERAGE_SYNC_INTERVAL_MS;

      if (force || stale) {
        await edgePost('sync-snaptrade-accounts-v2', data.session.access_token, {
          include_activities: true,
        });
        await edgePost('normalize-snaptrade-trades-v2', data.session.access_token, {});
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ursora-brokerage-refreshed', {
          detail: { userId, synced: force || stale },
        }));
      }

      return true;
    } catch (error) {
      console.warn('URSORA brokerage bootstrap did not complete:', error);
      return false;
    } finally {
      brokerageSyncInFlight = null;
    }
  })();

  return brokerageSyncInFlight;
}

export async function prepareBrokerageBootstrap(): Promise<void> {
  await hydrateBrokerageData(false);
}

export function startBrokerageDailyRefresh(): void {
  if (intervalStarted || typeof window === 'undefined') return;
  intervalStarted = true;

  window.setInterval(() => {
    void hydrateBrokerageData(false);
  }, BROKERAGE_CHECK_INTERVAL_MS);

  window.addEventListener('focus', () => {
    void hydrateBrokerageData(false);
  });
}
