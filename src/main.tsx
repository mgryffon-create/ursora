import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { announceDeployment } from '@/lib/deployment-update';
import './index.css';
import { prepareBrokerageBootstrap, startBrokerageDailyRefresh } from '@/lib/brokerage-bootstrap';

const CURRENT_BUILD_ID = import.meta.env.VITE_BUILD_ID;

function showFatalBrowserError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : (() => { try { return JSON.stringify(error); } catch { return 'Unknown browser error'; } })();
  const stack = error instanceof Error && error.stack ? error.stack : '';

  let panel = document.getElementById('ursora-fatal-browser-error');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'ursora-fatal-browser-error';
    panel.style.position = 'fixed';
    panel.style.inset = '16px';
    panel.style.zIndex = '2147483647';
    panel.style.background = '#0b0d10';
    panel.style.border = '1px solid rgba(239,68,68,.6)';
    panel.style.borderRadius = '8px';
    panel.style.padding = '16px';
    panel.style.color = '#e4e4e7';
    panel.style.fontFamily = 'monospace';
    panel.style.whiteSpace = 'pre-wrap';
    panel.style.overflow = 'auto';
    document.body.appendChild(panel);
  }
  panel.textContent = `URSORA browser error\n\n${message}${stack ? `\n\n${stack}` : ''}`;
}

window.addEventListener('error', (event) => {
  showFatalBrowserError(event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  showFatalBrowserError(event.reason);
});

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
      // A deployment must never navigate away from an active learning/form session.
      announceDeployment(payload.buildId);
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
