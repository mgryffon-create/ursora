import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { prepareBrokerageBootstrap, startBrokerageDailyRefresh } from '@/lib/brokerage-bootstrap';

const CURRENT_BUILD_ID = import.meta.env.VITE_BUILD_ID;

async function checkForNewDeployment() {
  if (!import.meta.env.PROD || !CURRENT_BUILD_ID) return;

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;

    const payload = await response.json() as { buildId?: string };
    if (payload.buildId && payload.buildId !== CURRENT_BUILD_ID) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('__ursora_build', payload.buildId.slice(0, 12));
      // Always change the URL on a build mismatch. If a browser reuses stale HTML
      // once, a build-only query can become identical on the next check and fail to
      // force another network navigation.
      nextUrl.searchParams.set('__ursora_reload', String(Date.now()));
      window.location.replace(nextUrl.toString());
    }
  } catch {
    // A failed version check should never interrupt the application.
  }
}

if (import.meta.env.PROD) {
  void checkForNewDeployment();

  window.setInterval(() => {
    void checkForNewDeployment();
  }, 15_000);

  window.addEventListener('focus', () => {
    void checkForNewDeployment();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForNewDeployment();
  });

  // Chrome may restore an old document from the back/forward cache without doing
  // a network navigation. Re-check immediately whenever a page is shown again.
  window.addEventListener('pageshow', () => {
    void checkForNewDeployment();
  });
}

const root = createRoot(document.getElementById('root')!);

void prepareBrokerageBootstrap().finally(() => {
  root.render(<App />);
  startBrokerageDailyRefresh();
});
