import { replayThesis, assessThesisEntry, type ThesisBar } from '../../../supabase/functions/_shared/thesis-lifecycle';

export const VERSION = 'learn-sim-1';
export const DURATION = 3600;
export type Tick = { second: number; price: number; volume: number };
export type Candle = ThesisBar & { second: number; volume: number; complete: boolean };
export type Plan = { thesis: string; trigger: number; invalidation: number; target: number; budget: number };
export type Fill = { second: number; side: 'buy' | 'sell'; contract: number; quantity: number; price: number; fee: number; reason: string; evidence: ReturnType<typeof evidence>; plan: Plan };
export type Order = { id: number; side: 'buy' | 'sell'; contract: number; quantity: number; limit: number | null; reason: string; plan?: Plan };
export type Account = { cash: number; realized: number; fees: number; positions: Record<number, { quantity: number; average: number }>; fills: Fill[]; orders: Order[] };
export const initialAccount = (): Account => ({ cash: 10000, realized: 0, fees: 0, positions: {}, fills: [], orders: [] });
const at = (second: number) => new Date(Date.UTC(2026, 0, 15, 14, 30) + second * 1000).toISOString();
export const clock = (second: number) => `${String(9 + Math.floor((30 * 60 + second) / 3600)).padStart(2, '0')}:${String(Math.floor(second / 60 + 30) % 60).padStart(2, '0')}:${String(Math.floor(second) % 60).padStart(2, '0')}`;
const round = (x: number) => Math.round(x * 100) / 100;

/** Original authored paths, never transformed provider data. Seed controls fine noise.
 * Variants share their first 20 minutes. No variant metadata enters evidence(). */
export function generateSession(seed: number): Tick[] {
  let randomState = seed >>> 0;
  const random = () => { randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0; return randomState / 4294967296; };
  const common = [101.1, 101.55, 101.9, 101.45, 101.2];
  const endings = [[101.5, 101.9, 102.2, 102, 102.6, 102.4, 102.8, 102.55], [101.5, 101.8, 101.3, 101.75, 101.25, 101.7, 101.4, 101.55], [101.5, 101.8, 101.25, 100.8, 100.3, 100.65, 100.1, 99.8]];
  const anchors = [...common, ...endings[Math.abs(seed) % 3]];
  return Array.from({ length: DURATION + 1 }, (_, second) => {
    const index = Math.min(anchors.length - 2, Math.floor(second / 300));
    const fraction = (second - index * 300) / 300;
    const base = anchors[index] + (anchors[index + 1] - anchors[index]) * fraction;
    const noise = Math.sin(fraction * Math.PI) * (Math.sin(second * .07) * .065 + (random() - .5) * .035);
    return { second, price: round(base + noise), volume: 40 + Math.floor(random() * 150) };
  });
}
export const priorBars: Candle[] = [
  [99.4, 100, 99.2, 99.8], [99.8, 102.8, 99.6, 100], [100, 100.6, 99.9, 100.5], [100.5, 101, 100.3, 100.9], [100.9, 101.3, 100.7, 101.1],
].map(([open, high, low, close], i) => ({ bar_time: at(-64800 + i * 300), available_at: at(-64500 + i * 300), second: -64800 + i * 300, open, high, low, close, volume: 25000, complete: true }));
export function candles(ticks: Tick[], second: number): Candle[] {
  const rows: Candle[] = [];
  for (const tick of ticks) {
    if (tick.second > second) break;
    const start = Math.floor(tick.second / 300) * 300;
    let bar = rows[rows.length - 1];
    if (!bar || bar.second !== start) {
      bar = { second: start, bar_time: at(start), available_at: at(start + 300), open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 0, complete: start + 300 <= second };
      rows.push(bar);
    }
    bar.high = Math.max(bar.high, tick.price); bar.low = Math.min(bar.low, tick.price); bar.close = tick.price; bar.volume += tick.volume;
  }
  return rows;
}
/** Uses production ancestry/entry geometry, with an explicit training detector.
 * Full production regime/direction detection is not represented by this adapter. */
export function evidence(ticks: Tick[], second: number) {
  const closed = [...priorBars, ...candles(ticks, second).filter(b => b.complete)];
  const anchor = replayThesis(closed, prefix => ({ direction: 'bullish', confirmed: prefix.length >= 4 && prefix.at(-1)!.close >= 100.9, confirmation: prefix.at(-1)!.close ?? null, invalidation: 100.3 }));
  const price = ticks[Math.min(Math.floor(second), ticks.length - 1)].price;
  const entry = assessThesisEntry(anchor, closed, at(second), price);
  const today = closed.filter(b => b.second >= 0);
  const vwap = today.length ? today.reduce((sum, b) => sum + (b.high + b.low + b.close) / 3 * b.volume, 0) / today.reduce((sum, b) => sum + b.volume, 0) : null;
  return { entry, price, vwap, closedCount: today.length, confirmed: today.length >= 2 && today.slice(-2).every(b => b.close >= 101.5) };
}
export const contracts = [{ strike: 100, label: 'SIM 100 Call' }, { strike: 102, label: 'SIM 102 Call' }];
/** Illustrative call valuation: intrinsic plus decaying, volatility-sensitive time
 * value. Not calibrated to an exchange or suitable for valuing real contracts. */
export function quote(ticks: Tick[], second: number, contract: number) {
  const price = ticks[Math.floor(second)].price;
  const strike = contracts[contract].strike;
  const recent = ticks.slice(Math.max(1, Math.floor(second) - 60), Math.floor(second) + 1);
  const movement = recent.length ? recent.reduce((sum, t) => sum + Math.abs(t.price - ticks[t.second - 1].price), 0) / recent.length : 0;
  const timeValue = (.55 + movement * 5) * Math.sqrt(Math.max(.05, (5 * 23400 - second) / (5 * 23400))) * Math.exp(-Math.abs(price - strike) / 5);
  const mid = Math.max(.05, price - strike) + timeValue;
  return { bid: round(Math.max(.01, mid - .04)), ask: round(mid + .04) };
}
export function submit(account: Account, order: Order, ticks: Tick[], second: number, plan: Plan): Account {
  if (!order.reason.trim() || !Number.isInteger(order.quantity) || order.quantity < 1 || !contracts[order.contract] || (order.limit !== null && (!Number.isFinite(order.limit) || order.limit <= 0))) throw new Error('Enter a valid quantity, price and decision reason.');
  const position = account.positions[order.contract]?.quantity ?? 0;
  const reservedSells = account.orders.filter(o => o.side === 'sell' && o.contract === order.contract).reduce((sum, o) => sum + o.quantity, 0);
  if (order.side === 'sell' && order.quantity > position - reservedSells) throw new Error('This quantity is not available to sell.');
  const q = quote(ticks, second, order.contract);
  const reserve = (o: Order) => o.quantity * ((o.limit ?? quote(ticks, second, o.contract).ask) * 100 + .65);
  const reserved = account.orders.filter(o => o.side === 'buy').reduce((s, o) => s + reserve(o), 0);
  const cost = reserve(order);
  const invested = Object.values(account.positions).reduce((s, p) => s + p.quantity * p.average * 100, 0);
  if (order.side === 'buy' && (cost + reserved > account.cash || cost + reserved + invested > plan.budget)) throw new Error('Order exceeds available cash or your total premium budget, including fees.');
  const executable = order.limit === null || (order.side === 'buy' ? q.ask <= order.limit : q.bid >= order.limit);
  if (!executable) return { ...account, orders: [...account.orders, { ...order, plan: { ...(order.plan ?? plan) } }] };
  const price = order.side === 'buy' ? q.ask : q.bid;
  const old = account.positions[order.contract] ?? { quantity: 0, average: 0 };
  const quantity = old.quantity + (order.side === 'buy' ? order.quantity : -order.quantity);
  const fee = round(order.quantity * .65);
  const average = order.side === 'buy' ? (old.quantity * old.average + order.quantity * price) / quantity : old.average;
  return { ...account, cash: round(account.cash + (order.side === 'buy' ? -1 : 1) * price * 100 * order.quantity - fee), fees: round(account.fees + fee), realized: round(account.realized + (order.side === 'sell' ? (price - old.average) * order.quantity * 100 : 0)), positions: { ...account.positions, [order.contract]: { quantity, average: quantity ? average : 0 } }, fills: [...account.fills, { second, side: order.side, quantity: order.quantity, contract: order.contract, price, fee, reason: order.reason, evidence: evidence(ticks, second), plan: { ...(order.plan ?? plan) } }] };
}
export function settleOrders(account: Account, ticks: Tick[], second: number, plan: Plan): Account {
  let next = account;
  for (const order of account.orders) {
    const q = quote(ticks, second, order.contract);
    if (order.limit === null || (order.side === 'buy' ? q.ask <= order.limit : q.bid >= order.limit)) {
      next = { ...next, orders: next.orders.filter(o => o.id !== order.id) };
      try { next = submit(next, order, ticks, second, plan); } catch { /* Cancel when resources no longer cover execution. */ }
    }
  }
  return next;
}
export function equity(account: Account, ticks: Tick[], second: number) {
  return account.cash + Object.entries(account.positions).reduce((sum, [id, p]) => sum + p.quantity * quote(ticks, second, Number(id)).bid * 100, 0);
}
