import React from 'react';
import { useLearnState } from './LearnProgress';
import { contracts, quote, type Tick } from '@/lib/learn/market';
import { responseComplete } from '@/lib/learn/sentence-prompts';
import SentenceResponse from './SentenceResponse';
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export type TicketRequest = { side: 'buy' | 'sell'; contract: number; quantity: number; id: number };
export type TicketValues = { side: 'buy' | 'sell'; contract: number; quantity: number; limit: number | null; reason: string };
export default function OrderTicket({ draftKey, request, ticks, second, available, error, onPlace, onCancel }: { draftKey: string; request: TicketRequest; ticks: Tick[]; second: number; available: number; error: string; onPlace: (ticket: TicketValues) => void; onCancel: () => void }) {
  const [step, setStep] = useLearnState(`${draftKey}:step`, 0), [quantity, setQuantity] = useLearnState(`${draftKey}:quantity`, request.quantity), [type, setType] = useLearnState(`${draftKey}:type`, 'market'), [limit, setLimit] = useLearnState(`${draftKey}:limit`, ''), [reason, setReason] = useLearnState(`${draftKey}:reason`, '');
  const q = quote(ticks, second, request.contract);
  const price = type === 'limit' ? Number(limit) : request.side === 'buy' ? q.ask : q.bid;
  const valid = Number.isInteger(quantity) && quantity > 0 && Number.isFinite(price) && price > 0 && (request.side === 'buy' || quantity <= available);
  const premium = valid ? price * 100 * quantity : 0, fees = valid ? quantity * .65 : 0;
  return <div className="space-y-3">
    <h2>{request.side === 'buy' ? 'Buy to open / add' : 'Sell to reduce / close'}</h2>
    <p className="text-sm">{contracts[request.contract].label} · Strike ${contracts[request.contract].strike} · Training expiry: fifth simulated session</p>
    <p className="text-xs text-zinc-400">Step {step + 1} of 3 · {['Order details', 'Your decision', 'Review and submit'][step]} · No real order</p>
    <div className="learn-quote-pair"><span>Bid {money(q.bid)}<small>Sell reference</small></span><span>Ask {money(q.ask)}<small>Buy reference</small></span></div>
    {step === 0 && <><div className="grid grid-cols-2 gap-3"><label>Number of contracts<input type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))}/></label><label>Order type<select value={type} onChange={e => setType(e.target.value)}><option value="market">Market</option><option value="limit">Limit</option></select></label></div>
      <p className="text-xs text-zinc-400">{request.side === 'sell' ? `${available} contracts available to sell. Selling some is a trim; selling all closes the position.` : 'Buying creates a position or adds to an existing one.'}</p>
      <p className="text-sm">{type === 'market' ? 'Market: execute at the current simulated ask when buying, or bid when selling. The price can change before you submit.' : 'Limit: choose your maximum buy price or minimum sell price. The order waits if that price is unavailable; a fill is not guaranteed.'}</p>
      {type === 'limit' && <label>Limit price ($ per share)<input type="number" min=".01" step=".01" value={limit} onChange={e => setLimit(e.target.value)}/></label>}
    </>}
    {step === 1 && <SentenceResponse kind={request.side} value={reason} onChange={setReason}/>}
    {step === 2 && <><dl className="learn-order-breakdown"><div><dt>Action</dt><dd>{request.side} {quantity} contract{quantity === 1 ? '' : 's'}</dd></div><div><dt>{type === 'limit' ? 'Limit premium' : 'Current premium'}</dt><dd>{money(price)} per share</dd></div><div><dt>Premium × 100 × quantity</dt><dd>{money(premium)}</dd></div><div><dt>Fees ($0.65 × quantity)</dt><dd>{money(fees)}</dd></div></dl><p className="text-sm">{reason}</p></>}
    <p className="learn-total">{request.side === 'buy' ? 'Estimated cash needed' : 'Estimated cash received'} <strong>{valid ? money(request.side === 'buy' ? premium + fees : premium - fees) : 'Enter valid order details'}</strong></p>
    <p className="text-xs text-zinc-400">One contract represents 100 shares: a $0.60 quote means $60 per contract before fees. Quotes and fills are educational approximations.</p>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <div className="flex flex-wrap gap-2">{step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}{step < 2 ? <button disabled={!valid || (step === 1 && !responseComplete(reason))} onClick={() => setStep(step + 1)}>{step === 0 ? 'Next: decision reason' : 'Review order'}</button> : <button disabled={!valid || !responseComplete(reason)} onClick={() => onPlace({ side: request.side, contract: request.contract, quantity, limit: type === 'limit' ? price : null, reason })}>Submit simulated {request.side}</button>}<button onClick={onCancel}>Cancel ticket</button></div>
  </div>;
}
