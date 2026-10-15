import React, { useEffect, useState } from 'react';
import { PENDING_BUILD_KEY, PREPARE_UPDATE_EVENT, UPDATE_EVENT } from '@/lib/deployment-update';
export default function DeploymentUpdateNotice() {
 const [build, setBuild] = useState<string | null>(() => { try { return sessionStorage.getItem(PENDING_BUILD_KEY); } catch { return null; } });
 const [dismissed, setDismissed] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
 useEffect(() => { const update = (event: Event) => setBuild((event as CustomEvent<string>).detail); window.addEventListener(UPDATE_EVENT, update); return () => window.removeEventListener(UPDATE_EVENT, update); }, []);
 if (!build || build === import.meta.env.VITE_BUILD_ID || build === dismissed) return null;
 const apply = async () => {
  setBusy(true); setError('');
  try {
   const pending: Promise<unknown>[] = [];
   window.dispatchEvent(new CustomEvent(PREPARE_UPDATE_EVENT, { detail: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } }));
   await Promise.all(pending);
   const next = new URL(window.location.href); next.searchParams.set('__ursora_build', build.slice(0, 12)); next.searchParams.set('__ursora_reload', String(Date.now())); window.location.replace(next.toString());
  } catch { setError('Could not confirm the account save. Your session has not been refreshed. Retry after saving succeeds.'); setBusy(false); }
 };
 return <aside aria-label="Application update" className="border-b border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3"><p className="mr-auto">An update is available. Your session will stay open until you choose to update.</p><button disabled={busy} className="rounded border border-blue-700 px-3 py-2" onClick={() => void apply()}>{busy ? 'Confirming save…' : 'Save & update'}</button><button className="rounded px-3 py-2" onClick={() => setDismissed(build)}>Later</button>{error && <p role="alert" className="w-full text-red-800">{error}</p>}</div></aside>;
}
