/** Stable account document independent of scenario/build versions. Never reset on a failed load. */
export type ProgressDocument = { schema: 'learn-progress-1'; slices: Record<string, unknown> };
export type ProgressRow = { payload: ProgressDocument; revision: number };
export type ProgressStatus = 'loading' | 'saving' | 'saved' | 'local' | 'error' | 'conflict';
export type ProgressSnapshot = { ready: boolean; document: ProgressDocument; status: ProgressStatus; message: string };
export type ProgressBackend = { read: () => Promise<ProgressRow | null>; save: (revision: number, document: ProgressDocument) => Promise<number | null> };
type Cache = ProgressRow & { dirty: boolean };
const empty = (): ProgressDocument => ({ schema: 'learn-progress-1', slices: {} });
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export const validDocument = (value: unknown): value is ProgressDocument => Boolean(value && typeof value === 'object' && (value as ProgressDocument).schema === 'learn-progress-1' && (value as ProgressDocument).slices && typeof (value as ProgressDocument).slices === 'object');
export class ProgressStore {
 private snapshot: ProgressSnapshot = { ready: false, document: empty(), status: 'loading', message: 'Loading your saved Learn progress…' };
 private listeners = new Set<() => void>();
 private revision = 0; private dirty = false; private loaded = false; private busy = false; private loadBusy = false;
 private counter = 0; private timer?: ReturnType<typeof setTimeout>; private remoteConflict: ProgressRow | null = null; private localCorrupt = false; private cacheAvailable = true;
 readonly key: string;
 constructor(readonly userId: string, private storage: Pick<Storage, 'getItem' | 'setItem'>, private backend: ProgressBackend) { this.key = `ursora:learn-progress:${userId}`; }
 getSnapshot = () => this.snapshot;
 subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
 private emit(patch: Partial<ProgressSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
 private cache() { try { this.storage.setItem(this.key, JSON.stringify({ payload: this.snapshot.document, revision: this.revision, dirty: this.dirty })); this.cacheAvailable = true; return true; } catch { this.cacheAvailable = false; return false; } }
 private readCache(): Cache | null {
  let raw: string | null;
  try { raw = this.storage.getItem(this.key); } catch { this.cacheAvailable = false; return null; }
  try { if (!raw) return null; const value = JSON.parse(raw); if (!validDocument(value.payload) || !Number.isInteger(value.revision)) throw Error('Unreadable save'); return value; }
  catch { this.localCorrupt = true; try { this.storage.setItem(`${this.key}:unreadable:${Date.now()}`, raw!); } catch { /* Preserve original in place. */ } return null; }
 }
 private legacy(): ProgressDocument | null {
  try {
   const raw = this.storage.getItem(`ursora:learn-sim-1:${this.userId}`);
   const path = this.storage.getItem(`ursora_learn_path_${this.userId}`);
   const slices: Record<string, unknown> = {};
   if (raw) { const workspace = JSON.parse(raw); if (workspace.version !== 'learn-sim-1' || !Number.isInteger(workspace.second) || !workspace.account?.fills || !workspace.plan) throw Error('Unreadable prior attempt'); slices.workspace = workspace; if (workspace.path) slices.enrollment = { path: workspace.path, page: 'practice', answers: {}, checked: {} }; }
   if (!slices.enrollment && ['foundations','practice'].includes(path ?? '')) slices.enrollment = { path, page: path === 'foundations' ? 'candles' : 'practice', answers: {}, checked: {} };
   return Object.keys(slices).length ? { schema: 'learn-progress-1', slices } : null;
  } catch { this.localCorrupt = true; return null; }
 }
 async load() {
  if (this.loadBusy || this.busy) return; this.loadBusy = true;
  let cached = this.snapshot.ready ? { payload: this.snapshot.document, revision: this.revision, dirty: this.dirty } : this.readCache();
  const imported = !cached && !this.snapshot.ready ? this.legacy() : null;
  try {
   const remote = await this.backend.read();
   if (remote && !validDocument(remote.payload)) throw Error('The account save could not be read. It has not been replaced.');
   if (this.snapshot.ready) cached = { payload: this.snapshot.document, revision: this.revision, dirty: this.dirty };
   this.loaded = true;
   if (remote && cached?.dirty && cached.revision !== remote.revision) {
    this.revision = cached.revision; this.dirty = true; this.remoteConflict = remote;
    this.emit({ ready: true, document: cached.payload, status: 'conflict', message: 'Another tab or device saved a different revision. Both copies are preserved. Choose which to resume.' });
    return;
   }
   if (remote) { this.revision = remote.revision; this.dirty = Boolean(cached?.dirty); this.emit({ ready: true, document: cached?.dirty ? cached.payload : remote.payload, status: this.dirty ? 'saving' : 'saved', message: this.dirty ? 'Syncing browser changes…' : 'Saved to your account' }); }
   else if (cached || imported) { this.revision = 0; this.dirty = true; this.emit({ ready: true, document: cached?.payload ?? imported!, status: 'saving', message: 'Recovering existing browser progress into your account…' }); }
   else if (this.localCorrupt) { this.emit({ ready: false, status: 'error', message: 'The prior browser save cannot be read and no account save was found. It has not been overwritten. Retry or contact support before starting a new attempt.' }); return; }
   else { this.emit({ ready: true, document: empty(), status: 'saved', message: 'Ready. Your progress will save to your account.' }); }
   this.cache(); if (this.dirty) this.schedule(0);
  } catch (error) {
   if (cached || imported) { this.revision = cached?.revision ?? 0; this.dirty = Boolean(cached?.dirty ?? imported); this.emit({ ready: true, document: cached?.payload ?? imported!, status: 'local', message: 'Account unavailable. Restored browser progress; account sync needs retry.' }); }
   else this.emit({ ready: false, status: 'error', message: 'Could not load your saved progress. We will not start over or overwrite it. Retry when connected.' });
  } finally { this.loadBusy = false; }
 }
 update<T>(name: string, value: T | ((previous: T) => T), initial: T) {
  if (!this.snapshot.ready || this.snapshot.status === 'conflict') return;
  const previous = (this.snapshot.document.slices[name] ?? initial) as T;
  const next = typeof value === 'function' ? (value as (p: T) => T)(previous) : value;
  if (name === 'workspace' && (previous as { seed?: number })?.seed !== undefined && (previous as { seed?: number }).seed !== (next as { seed?: number })?.seed) {
   try { this.storage.setItem(`${this.key}:attempt:${Date.now()}`, JSON.stringify(this.snapshot.document)); }
   catch { this.emit({ status: 'local', message: 'Could not back up the previous attempt. Keep this session open.' }); return; }
  }
  this.counter++; this.dirty = true;
  this.emit({ document: { schema: 'learn-progress-1', slices: { ...this.snapshot.document.slices, [name]: copy(next) } }, status: 'saving', message: 'Saving progress…' });
  const localOK = this.cache();
  if (!localOK) this.emit({ status: 'local', message: 'Browser backup unavailable. Keep this tab open until account save is confirmed.' });
  this.schedule(name === 'workspace' || name.startsWith('university-session-v1:') ? 1000 : 200);
 }
 private schedule(delay: number) { if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, delay); }
 async flush() {
  if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
  if (this.busy || !this.dirty || this.snapshot.status === 'conflict') return;
  if (!this.loaded) { await this.load(); return; }
  this.busy = true; const counter = this.counter; const document = copy(this.snapshot.document);
  try {
   const revision = await this.backend.save(this.revision, document);
   if (revision === null) { const remote = await this.backend.read(); if (!remote) throw Error('Account checkpoint changed. Retry loading.'); this.remoteConflict = remote; this.emit({ status: 'conflict', message: 'A newer account revision exists. Your browser copy is preserved; choose which copy to resume.' }); return; }
   this.revision = revision;
   this.dirty = this.counter !== counter;
   this.cache(); this.emit({ status: this.dirty ? 'saving' : 'saved', message: this.dirty ? 'Saving latest changes…' : 'Saved to your account' });
  } catch { this.emit({ status: 'local', message: this.cacheAvailable ? 'Account save failed. Browser backup retained; retry sync before switching devices.' : 'Account save failed and browser backup is unavailable. Keep this tab open and retry.' }); }
  finally { this.busy = false; if (this.dirty && this.snapshot.status === 'saving') this.schedule(1000); }
 }
 async resolveConflict(useBrowser: boolean) {
  const remote = this.remoteConflict; if (!remote) return;
  try { this.storage.setItem(`${this.key}:recovery:${Date.now()}`, JSON.stringify({ browser: this.snapshot.document, account: remote })); } catch { this.emit({ message: 'Could not back up both copies. Keep this tab open and retry.' }); return; }
  this.revision = remote.revision; this.remoteConflict = null; this.dirty = useBrowser;
  this.emit({ ready: true, document: useBrowser ? this.snapshot.document : remote.payload, status: useBrowser ? 'saving' : 'saved', message: useBrowser ? 'Saving chosen browser copy…' : 'Resumed account copy; browser copy backed up.' }); this.cache(); if (useBrowser) await this.flush();
 }
}
