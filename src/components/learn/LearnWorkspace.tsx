import React, { useEffect, useMemo, useState } from 'react';
import { useLearnState } from './LearnProgress';
import { PREPARE_UPDATE_EVENT } from '@/lib/deployment-update';
import PracticeDialog from './PracticeDialog';
import Placement from './Placement';
import SentenceResponse from './SentenceResponse';
import { responseComplete } from '@/lib/learn/sentence-prompts';
import LearnChart from './LearnChart';
import PlanEditor, { type PlanChange } from './PlanEditor';
import OrderTicket, { type TicketRequest, type TicketValues } from './OrderTicket';
import { VERSION, DURATION, generateSession, evidence, initialAccount, submit, settleOrders, equity, contracts, quote, clock, type Account, type Plan } from '@/lib/learn/market';
import './learn.css';
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const defaultPlan: Plan = { thesis: '', trigger: 101.5, invalidation: 100.3, target: 102.8, budget: 600 };
type Saved = { version: string; seed: number; second: number; account: Account; plan: Plan; locked: boolean; path: 'foundations' | 'practice' | null; guided: boolean; checkpoints: number[]; decisions: { second: number; action: string; reason: string }[]; changes?: PlanChange[] };
function fresh(): Saved { return { version: VERSION, seed: Math.floor(Math.random() * 1000000), second: 0, account: initialAccount(), plan: defaultPlan, locked: false, path: null, guided: true, checkpoints: [], decisions: [], changes: [] }; }
export default function LearnWorkspace({ placementPath, reviewMode = false, onNextLesson }: { placementPath?: 'foundations' | 'practice'; reviewMode?: boolean; onNextLesson?: () => void } = {}) {
  const [state, setState] = useLearnState<Saved>('workspace', () => ({ ...fresh(), path: placementPath ?? null }));
  const [speed, setSpeed] = useLearnState('playbackSpeed', 30);
  const [playing, setPlaying] = useState(false), [review, setReview] = useState(reviewMode), [error, setError] = useState('');
  const [contract, setContract] = useLearnState('selectedContract', 0);
  const [request, setRequest] = useLearnState<TicketRequest | null>('ticketRequest', null);
  const [editingPlan, setEditingPlan] = useLearnState('editingPlan', false);
  const [decision, setDecision] = useLearnState('waitDraft', '');
  const [notice, setNotice] = useState('');
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1050px)').matches);
  useEffect(() => { const query = window.matchMedia('(min-width: 1050px)'); const update = () => setWide(query.matches); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  const ticks = useMemo(() => generateSession(state.seed), [state.seed]);
  const current = useMemo(() => evidence(ticks, state.second), [ticks, state.second]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setState(s => {
      const second = Math.min(DURATION, s.second + 1);
      let checkpoints = s.checkpoints;
      if (s.guided && [600, 1200, 2100].includes(second) && !s.checkpoints.includes(second)) { checkpoints = [...s.checkpoints, second]; setPlaying(false); }
      if (second === DURATION) setPlaying(false);
      return { ...s, second, account: s.locked ? settleOrders(s.account, ticks, second, s.plan) : s.account, checkpoints };
    }), 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, ticks, setState]);
  useEffect(() => { const pause = () => { if (document.hidden) setPlaying(false); }; document.addEventListener('visibilitychange', pause); return () => document.removeEventListener('visibilitychange', pause); }, []);
  useEffect(() => { const pause = () => setPlaying(false); window.addEventListener(PREPARE_UPDATE_EVENT, pause); return () => window.removeEventListener(PREPARE_UPDATE_EVENT, pause); }, []);
  const openTicket = (side: 'buy' | 'sell', id = contract, quantity = 1) => { setContract(id); setError(''); setNotice(''); setRequest({ side, contract: id, quantity, id: Date.now() }); };
  const place = (ticket: TicketValues) => {
    try {
      if (!state.locked) throw new Error('Record a plan before placing an order.');
      if (state.second >= DURATION || review) throw new Error('This session is finished. Start another session to trade.');
      if (!responseComplete(ticket.reason)) throw new Error('Complete the decision-reason blanks.');
      const account = submit(state.account, { ...ticket, id: Date.now() }, ticks, state.second, state.plan);
      setState({ ...state, account }); setRequest(null); setError('');
      setNotice(account.fills.length > state.account.fills.length ? 'Simulated order filled. Your position and journal are updated.' : 'Limit order is working. It will fill only if a later simulated quote meets your limit.');
    } catch (e) { setError((e as Error).message); }
  };
  if (!state.path) return <div className="learn-workspace"><Placement onComplete={path => setState(s => ({ ...s, path, guided: true }))}/></div>;
  const available = (id: number) => Math.max(0, (state.account.positions[id]?.quantity ?? 0) - state.account.orders.filter(o => o.contract === id && o.side === 'sell').reduce((sum, o) => sum + o.quantity, 0));
  const holdings = Object.entries(state.account.positions).filter(([, p]) => p.quantity > 0);
  const buys = state.account.fills.filter(f => f.side === 'buy');
  const q = quote(ticks, state.second, contract);
  const finished = state.second >= DURATION || review;
  const ticketPanel = request ? <OrderTicket key={request.id} draftKey={`ticket:${state.seed}:${request.id}`} request={request} ticks={ticks} second={state.second} available={available(request.contract)} error={error} onPlace={place} onCancel={() => { setRequest(null); setError(''); }}/> : null;
  const restart = (independent = false) => { setPlaying(false); setReview(false); setRequest(null); setError(''); setNotice(''); setState(s => ({ ...fresh(), path: independent ? 'practice' : s.path, guided: independent ? false : s.guided })); };
  return <div className="learn-workspace space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-sky-300">Learn · Private alpha · Synthetic market</p><h1 className="mt-1 text-xl">Read the pullback. Make your plan.</h1><p className="text-xs text-zinc-400">Fictional SIM · No real orders · Progress saved to your account with browser backup</p></div><button onClick={() => { setPlaying(false); setRequest(null); setReview(true); }}>Review session</button></header>
    <div className="learn-account-strip"><span>Virtual equity <strong>{money(equity(state.account, ticks, state.second))}</strong></span><span>Cash <strong>{money(state.account.cash)}</strong></span><span>Net realized <strong>{money(state.account.realized - state.account.fees)}</strong></span><span className="text-zinc-400">Fees paid {money(state.account.fees)}</span></div>
    <div className="learn-workstation">
      <section className="learn-panel min-w-0 space-y-3" aria-label="Chart and quick trade controls">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2>SIM stock · {money(current.price)}</h2><span className="font-mono text-sm">{clock(state.second)} simulated</span></div>
        <div className="learn-chart-tradebar">
          <label>Selected option<select value={contract} onChange={e => { setContract(Number(e.target.value)); setRequest(null); setError(''); }}>{contracts.map((c, i) => <option key={c.strike} value={i}>{c.label}</option>)}</select></label>
          <button disabled={!state.locked || finished || available(contract) === 0} onClick={() => openTicket('sell')}>Sell at bid <strong>{money(q.bid)}</strong></button>
          <button disabled={!state.locked || finished} onClick={() => openTicket('buy')}>Buy at ask <strong>{money(q.ask)}</strong></button>
        </div>
        <p className="text-xs text-zinc-400">Option quotes are per share. One contract costs about {money(q.ask * 100)} to buy before fees. You hold {state.account.positions[contract]?.quantity ?? 0}; {available(contract)} available to sell.</p>
        {!state.locked && <button onClick={() => { setPlaying(false); setEditingPlan(true); }}>Build plan to unlock trading</button>}
        <LearnChart ticks={ticks} second={state.second}/>
        <div className="flex flex-wrap items-center gap-3"><button disabled={finished} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button><label>Speed<select value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[1, 10, 30, 60].map(v => <option key={v} value={v}>{v}×</option>)}</select></label><span className="text-xs text-zinc-400">5-minute candles · 10 seconds each at 30×</span></div>
        {state.guided && <p className="learn-coach" aria-live="polite">{state.second < 600 ? 'Watch the forming candle. Its body, wicks and volume can still change. Hover or tap earlier candles to compare.' : state.second < 1200 ? 'The upward move began in the prior session. Compare how far it has traveled with the room remaining to your exit area.' : state.second < 2100 ? 'Look for evidence that a pullback has held. One upward tick is not a finished recovery candle.' : 'Compare new evidence with your plan before adding, trimming or closing.'}</p>}
      </section>
      <aside className="learn-panel min-w-0 space-y-3" aria-label="Practice order station">
        {request && !finished && wide ? ticketPanel
          : <><h2>Practice order station</h2><p className="text-sm text-zinc-400">Brokerage layouts vary. Here, follow this sequence: select a contract → choose buy or sell → enter quantity and order type → explain → review.</p>
            <label>1. Choose your contract<select value={contract} onChange={e => setContract(Number(e.target.value))}>{contracts.map((c, i) => <option key={c.strike} value={i}>{c.label} · ${c.strike} strike</option>)}</select></label>
            <div className="learn-quote-pair"><span>Bid {money(q.bid)}<small>Sell reference</small></span><span>Ask {money(q.ask)}<small>Buy reference</small></span></div>
            <p className="text-sm">{contracts[contract].label} · Call option · Training expiry: fifth simulated session · 100-share multiplier</p>
            <div className="grid grid-cols-2 gap-2"><button disabled={!state.locked || finished} onClick={() => openTicket('buy')}>Buy / add</button><button disabled={!state.locked || finished || available(contract) === 0} onClick={() => openTicket('sell')}>Sell / close</button></div>
            {!state.locked && <p className="text-xs text-amber-200">Record your plan first using the button beside the chart.</p>}
            {available(contract) === 0 && <p className="text-xs text-zinc-400">Selling is available after you own contracts. This exercise does not support opening short positions.</p>}
            <details><summary>Understand this contract and its prices</summary><div className="mt-2 space-y-2 text-sm text-zinc-300"><p>The stock chart shows SIM share prices. These quotes belong to an option on SIM, so the numbers are different.</p><p>Strike is the contract’s reference stock price. Expiry is when the contract ends. Both contracts in this exercise are calls with the same training expiry.</p><p>Bid is the price available to sell; ask is the price available to buy. Their difference is the spread. A displayed premium of $0.60 represents $60 for one 100-share contract, plus fees.</p><p>Market orders fill at the current simulated quote. Limit orders set a price boundary and may remain unfilled. URSORA uses simplified execution, not an exact copy of any brokerage.</p></div></details>
          </>}
        <div className="border-t border-zinc-700 pt-3"><h3 className="text-sm text-sky-200">Selected position</h3><p className="text-sm">{state.account.positions[contract]?.quantity ?? 0} contracts · {available(contract)} available</p>{(state.account.positions[contract]?.quantity ?? 0) > 0 && <><p className="text-xs text-zinc-400">Average {money(state.account.positions[contract].average)} per share · Open P/L {money((q.bid - state.account.positions[contract].average) * 100 * state.account.positions[contract].quantity)}</p><div className="mt-2 flex flex-wrap gap-2"><button disabled={finished || available(contract) < 1} onClick={() => openTicket('sell', contract, 1)}>Trim 1</button><button disabled={finished} onClick={() => openTicket('buy')}>Add 1</button><button disabled={finished || available(contract) === 0} onClick={() => openTicket('sell', contract, available(contract))}>Close available position</button></div></>}</div>
      </aside>
    </div>
    {notice && <p role="status" className="text-sm text-sky-200">{notice}</p>}
    <section className="learn-panel space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2>Your thesis and limits</h2><button onClick={() => { setPlaying(false); setEditingPlan(true); }}>{state.locked ? 'Edit recorded plan' : 'Build plan'}</button></div>
      <p className="text-sm">{state.plan.thesis || 'No thesis recorded yet. Build a plan before placing an order.'}</p>
      <div className="learn-account-strip"><span>Entry level <strong>{money(state.plan.trigger)}</strong></span><span>Invalidation <strong>{money(state.plan.invalidation)}</strong></span><span>Exit area <strong>{money(state.plan.target)}</strong></span><span>Total budget <strong>{money(state.plan.budget)}</strong></span></div><p className="text-xs text-zinc-400">Entry, invalidation and exit levels refer to the stock, not the option premium. They do not place automatic orders. Editing pauses playback and preserves earlier trade snapshots.</p>
    </section>
    <details className="learn-panel"><summary>Wait or pass · Record an observation</summary><div className="mt-3 space-y-3"><SentenceResponse kind="wait" value={decision} onChange={setDecision}/><button disabled={!responseComplete(decision)} onClick={() => { setState(s => ({ ...s, decisions: [...s.decisions, { second: s.second, action: 'wait / pass', reason: decision }] })); setDecision(''); setNotice('Wait / pass decision recorded.'); }}>Record wait / pass</button></div></details>
    <details className="learn-panel"><summary>URSORA training evidence and playback mode</summary><div className="mt-3 space-y-3"><label>Mode<select value={state.guided ? 'guided' : 'independent'} disabled={playing || state.second > 0 || state.path === 'foundations'} onChange={e => setState(s => ({ ...s, guided: e.target.value === 'guided' }))}><option value="guided">Guided</option><option value="independent">Independent</option></select></label><p className="text-sm">{current.entry ? `${current.entry.prior_sessions} prior session(s) · Move since confirmation ${current.entry.move_before_entry_pct.toFixed(2)}% · Original target distance consumed ${current.entry.move_consumed_pct?.toFixed(0) ?? 'unknown'}% · Pullback: ${current.entry.pullback_status.replace(/_/g, ' ')}` : 'No active confirmed bullish ancestry in completed evidence.'}</p><p className="text-xs text-zinc-400">Completed-candle VWAP: {current.vwap === null ? 'waiting for first close' : money(current.vwap)}. Shared production ancestry calculations with a simplified training detector. Guided mode pauses at teaching moments. Tickets do not pause playback; editing plans and leaving this tab do.</p></div></details>
    <section className="learn-panel space-y-3"><h2>All positions and working orders</h2>{!holdings.length && <p className="text-zinc-400">No open positions. Select a contract and buy to open one.</p>}{holdings.map(([id, p]) => <div key={id} className="flex flex-wrap items-center justify-between gap-2"><span>{contracts[Number(id)].label} · {p.quantity} contracts · Average {money(p.average)}</span><button onClick={() => { setContract(Number(id)); setRequest(null); }}>Select position</button></div>)}{state.account.orders.map(o => <div key={o.id} className="flex flex-wrap items-center gap-3"><span>{o.side} {o.quantity} × {contracts[o.contract].label} · Limit {money(o.limit!)} per share · working</span><button onClick={() => setState(s => ({ ...s, account: { ...s.account, orders: s.account.orders.filter(x => x.id !== o.id) } }))}>Cancel order</button></div>)}</section>
    {(review || state.second === DURATION) && <section className="learn-panel space-y-3"><h2>Process review · {state.guided ? 'Assisted practice' : 'Independent attempt'}</h2><p>{state.second < DURATION ? 'Interim review. Return to resume.' : 'Replay complete. Open positions remain marked at the last bid; they were not automatically sold.'}</p><p>Buy decisions: {buys.length}. Below the trigger recorded for that order: {buys.filter(f => f.evidence.price < f.plan.trigger).length}. At or below its invalidation: {buys.filter(f => f.evidence.price <= f.plan.invalidation).length}. Beyond its target: {buys.filter(f => f.evidence.price >= f.plan.target).length}.</p><p>Before the training confirmation rule: {buys.filter(f => !f.evidence.confirmed).length}. This rule requires two completed session candles above $101.50; alternative reasoning still needs review.</p><p className="text-sm">Net equity change {money(equity(state.account, ticks, state.second) - 10000)}. Outcome is separate from process. Selected explanations are recorded, not treated as verified observations. Plan edits do not rewrite earlier fill evidence. No competency milestones are awarded in this alpha.</p>{state.second < DURATION && <button onClick={() => setReview(false)}>Return to session</button>}<button onClick={() => restart()}>Start a fresh variation</button>{state.path === 'foundations' && <button onClick={() => restart(true)}>Try independent practice (no milestone awarded)</button>}</section>}
    <details className="learn-panel"><summary>Decision journal · {state.account.fills.length} fills · {(state.changes ?? []).length} plan changes</summary><div className="mt-3 space-y-3">{state.account.fills.map((f, i) => <p key={i} className="text-sm">{clock(f.second)} · {f.side} {f.quantity} × {contracts[f.contract].label} @ {money(f.price)} · {f.reason}<span className="block text-xs text-zinc-400">At order: entry level {money(f.plan.trigger)} · invalidation {money(f.plan.invalidation)} · target {money(f.plan.target)} · budget {money(f.plan.budget)}. Evidence at fill: {money(f.evidence.price)} stock price; {f.evidence.closedCount} completed session candles.</span></p>)}{state.decisions.map((d, i) => <p key={`d${i}`}>{clock(d.second)} · {d.action} · {d.reason}</p>)}{(state.changes ?? []).map((change, i) => <div key={`p${i}`} className="text-sm"><p>{clock(change.second)} · Plan changed · {change.reason}</p><p className="text-xs text-zinc-400">Before: {change.before.thesis} · Entry {money(change.before.trigger)}, invalidation {money(change.before.invalidation)}, target {money(change.before.target)}, budget {money(change.before.budget)}.</p><p className="text-xs text-zinc-400">After: {change.after.thesis} · Entry {money(change.after.trigger)}, invalidation {money(change.after.invalidation)}, target {money(change.after.target)}, budget {money(change.after.budget)}.</p></div>)}</div></details>
    <PracticeDialog open={Boolean(request && !finished && !wide)} onOpenChange={open => { if (!open) { setRequest(null); setError(''); } }} title="Simulated order ticket" description={`SIM stock ${money(current.price)} · ${clock(state.second)} simulated. Playback continues while this ticket is open.`}>{ticketPanel}</PracticeDialog>
    <PracticeDialog open={editingPlan} onOpenChange={setEditingPlan} title="Thesis and risk plan" description="Stock-price levels and total option budget for this simulated exercise.">{editingPlan && <PlanEditor draftKey={`plan:${state.seed}:${(state.changes ?? []).length}`} plan={state.plan} recorded={state.locked} onCancel={() => setEditingPlan(false)} onSave={(plan, reason) => { setState(s => ({ ...s, plan, locked: true, changes: s.locked ? [...(s.changes ?? []), { second: s.second, before: { ...s.plan }, after: { ...plan }, reason }] : (s.changes ?? []), account: { ...s.account, orders: s.account.orders.map(o => ({ ...o, plan: o.plan ?? { ...s.plan } })) } })); setEditingPlan(false); setNotice(state.locked ? 'Plan updated. Earlier trade evidence is unchanged.' : 'Plan recorded. Trading is now available.'); }}/>}</PracticeDialog>
    {onNextLesson && <button onClick={onNextLesson}>Next lesson: {reviewMode ? 'Candles in plain language' : 'Review your decisions'}</button>}
    <p className="text-xs text-zinc-400">Original synthetic data. Prices and execution are educational approximations; no partial fills, settlement, exercise or assignment. Practice never enters brokerage statistics. Resume your session on this account. Playback resumes paused.</p>
  </div>;
}
