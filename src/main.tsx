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
      window.location.reload();
    }
  } catch {
    // A failed version check should never interrupt the application.
  }
}

if (import.meta.env.PROD) {
  void checkForNewDeployment();

  window.setInterval(() => {
    void checkForNewDeployment();
  }, 60_000);

  window.addEventListener('focus', () => {
    void checkForNewDeployment();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForNewDeployment();
  });
}

const root = createRoot(document.getElementById('root')!);

void prepareBrokerageBootstrap().finally(() => {
  root.render(<App />);
  startBrokerageDailyRefresh();
});
