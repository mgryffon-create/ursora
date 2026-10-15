import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, useCallback } from 'react';
import db from '@/lib/db';
import { PREPARE_UPDATE_EVENT } from '@/lib/deployment-update';
import { useAuth } from '@/contexts/AuthContext';
import { ProgressStore, type ProgressDocument, type ProgressRow } from '@/lib/learn/progress-store';
const stores = new Map<string, ProgressStore>();
const Context = createContext<ProgressStore | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export function useLearnState<T,>(name: string, initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void] {
  const store = useContext(Context); if (!store) throw new Error('Learn progress provider is required.');
  const first = useRef<{ value: T }>();
  if (!first.current) first.current = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => { if (store.getSnapshot().document.slices[name] === undefined) store.update(name, first.current!.value, first.current!.value); }, [store, name]);
  const update = useCallback((value: T | ((previous: T) => T)) => store.update(name, value, first.current!.value), [store, name]);
  return [(snapshot.document.slices[name] ?? first.current.value) as T, update];
}
export default function LearnProgress({ children }: { children: React.ReactNode }) {
 const { user } = useAuth();
 const userId = user!.id;
 const store = useMemo(() => {
  if (stores.has(userId)) return stores.get(userId)!;
  const created = new ProgressStore(userId, { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }, {
  read: async () => { const { data, error } = await db.from('learn_progress').select('payload,revision').eq('user_id', userId).maybeSingle(); if (error) throw error; return data as ProgressRow | null; },
  save: async (revision: number, document: ProgressDocument) => { const { data, error } = await db.rpc('save_learn_progress', { owner_id: userId, expected_revision: revision, next_payload: document }); if (error) throw error; return data as number | null; },
 });
  stores.set(userId, created);
  return created;
 }, [userId]);
 const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
 useEffect(() => {
  void store.load();
  const flush = () => { void store.flush(); };
  const reconnect = () => { void store.load().then(() => store.flush()); };
  const beforeUpdate = (event: Event) => (event as CustomEvent<{ waitUntil: (promise: Promise<unknown>) => void }>).detail.waitUntil((async () => {
   // Let the replay's pause handler commit, then drain any in-flight checkpoint.
   await new Promise(resolve => window.setTimeout(resolve, 0));
   for (let attempt = 0; attempt < 100; attempt++) {
    await store.flush();
    const status = store.getSnapshot().status;
    if (status === 'saved') return;
    if (['error', 'local', 'conflict'].includes(status)) throw new Error('Account save is not confirmed.');
    await new Promise(resolve => window.setTimeout(resolve, 50));
   }
   throw new Error('Account save timed out.');
  })());
  window.addEventListener(PREPARE_UPDATE_EVENT, beforeUpdate);
  window.addEventListener('online', reconnect); window.addEventListener('pagehide', flush);
  const visibility = () => { if (document.hidden) flush(); };
  document.addEventListener('visibilitychange', visibility);
  return () => { flush(); window.removeEventListener(PREPARE_UPDATE_EVENT, beforeUpdate); window.removeEventListener('online', reconnect); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility); };
 }, [store]);
 return <Context.Provider value={store}><div className="learn-workspace mb-4 flex flex-wrap items-center justify-between gap-2 text-xs"><span role="status" aria-live="polite">{snapshot.message}</span>{['error','local'].includes(snapshot.status) && <button onClick={() => void store.load().then(() => store.flush())}>Retry account sync</button>}</div>{snapshot.status === 'conflict' ? <section className="learn-workspace learn-panel mx-auto max-w-2xl space-y-3"><h1 className="text-lg text-sky-200">Choose your saved session</h1><p>A different tab or device has a newer save. We paused this screen to prevent one copy from silently replacing the other. Both copies will be backed up before your choice is applied.</p><button onClick={() => void store.resolveConflict(false)}>Resume account copy</button><button onClick={() => void store.resolveConflict(true)}>Keep this browser’s attempt</button></section> : snapshot.ready ? children : <div className="learn-workspace learn-focus-stage"><section className="learn-panel space-y-3"><h1 className="text-xl">Your Learn progress</h1><p>{snapshot.message}</p>{snapshot.status === 'error' && <button onClick={() => void store.load()}>Retry loading saved progress</button>}</section></div>}</Context.Provider>;
}
