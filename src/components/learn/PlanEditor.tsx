import React, { useState } from 'react';
import { useLearnState } from './LearnProgress';
import SentenceResponse from './SentenceResponse';
import { responseComplete } from '@/lib/learn/sentence-prompts';
import type { Plan } from '@/lib/learn/market';
export type PlanChange = { second: number; before: Plan; after: Plan; reason: string };
export default function PlanEditor({ draftKey, plan, recorded, onSave, onCancel }: { draftKey: string; plan: Plan; recorded: boolean; onSave: (plan: Plan, reason: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useLearnState(draftKey, { ...plan });
  const [reason, setReason] = useLearnState(`${draftKey}:reason`, '');
  const [error, setError] = useState('');
  const [rewrite, setRewrite] = useLearnState(`${draftKey}:rewrite`, !recorded || !plan.thesis);
  const fields = [
    { key: 'trigger', label: 'Entry level ($ per stock share)', help: 'The underlying stock price your entry condition refers to. Confirmation still depends on your selected evidence.' },
    { key: 'invalidation', label: 'Invalidation level ($ per stock share)', help: 'The stock price that would prove this bullish idea wrong. This field does not place an automatic stop order.' },
    { key: 'target', label: 'Exit area ($ per stock share)', help: 'The stock price area at which you plan to reassess or exit. This is not an option premium or an automatic sell order.' },
    { key: 'budget', label: 'Maximum premium commitment ($ total)', help: 'The total cash you allow for open contracts and working buys, including new order fees. This is not the amount per contract.' },
  ] as const;
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); const p = draft; if (!responseComplete(p.thesis) || ![p.trigger, p.invalidation, p.target, p.budget].every(n => Number.isFinite(n) && n > 0) || !(p.invalidation < p.trigger && p.trigger < p.target) || p.budget > 10000 || (recorded && !reason)) { setError('Complete your thesis and use positive levels: invalidation below entry below target; budget up to $10,000. Select a reason for changing a recorded plan.'); return; } onSave({ ...draft }, reason || 'Initial plan'); }}>
    <h2>{recorded ? 'Edit recorded plan' : 'Build your practice plan'}</h2>
    <p className="text-sm text-zinc-400">Correct an input mistake or update your view. Earlier fills keep their original plan; changes take effect from this point forward.</p>
    {rewrite ? <SentenceResponse kind="thesis" value={draft.thesis} onChange={thesis => setDraft(p => ({ ...p, thesis }))}/> : <><p className="text-sm">{draft.thesis}</p><button type="button" onClick={() => setRewrite(true)}>Change thesis phrases</button></>}
    <div className="grid gap-4 sm:grid-cols-2">{fields.map(field => <label key={field.key}>{field.label}<input aria-label={field.label} type="number" step="0.01" value={draft[field.key]} onChange={e => setDraft(p => ({ ...p, [field.key]: Number(e.target.value) }))}/><span className="text-xs text-zinc-400">{field.help}</span></label>)}</div>
    {recorded && <label>Reason for this change<select aria-label="Reason for this change" value={reason} onChange={e => setReason(e.target.value)}><option value="">Choose…</option><option>Correcting an input or selection mistake</option><option>Updating my view based on new evidence</option><option>Changing my exposure limit</option></select></label>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <div className="flex flex-wrap gap-3"><button type="submit" disabled={!responseComplete(draft.thesis) || (recorded && !reason)}>{recorded ? 'Save plan changes' : 'Record plan'}</button><button type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}
