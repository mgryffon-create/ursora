/**
 * URSORA — SYNTHETIC BEHAVIOURAL TEST DATA (PHASE M).
 *
 * These profiles exist so the deterministic engines can be exercised against
 * known-shape inputs. Every generated record carries `is_synthetic: true` and a
 * `synthetic_profile` tag. Synthetic records are generated in memory for the
 * dev harness and are NEVER written into a real user's trade history.
 *
 * The generator is seeded and fully deterministic, so a test that passes once
 * passes every time.
 */

import type { TradeRecord } from '@/lib/behavioral/types';
import type { TradeOrigin } from '@/lib/behavioral/config';

export type ProfileKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'NEW';

export const PROFILES: { key: ProfileKey; name: string; expectation: string }[] = [
  { key: 'A', name: 'Profile A — structured, consistent sizing', expectation: 'No sizing, frequency or giveback warnings. Adherence high.' },
  { key: 'B', name: 'Profile B — profitable early, late-session giveback', expectation: 'Session high-water giveback detected; sizing clean.' },
  { key: 'C', name: 'Profile C — size escalation after wins', expectation: 'Post-win median size materially above baseline.' },
  { key: 'D', name: 'Profile D — rapid re-entry after losses', expectation: 'Rapid re-entry count elevated; short gaps after losing trades.' },
  { key: 'E', name: 'Profile E — better on external signals than spontaneous', expectation: 'Expectancy by origin separates the two categories.' },
  { key: 'F', name: 'Profile F — no meaningful pattern', expectation: 'NO RELIABLE DEVIATION DETECTED across all engines.' },
  { key: 'NEW', name: 'New user — no history', expectation: 'INSUFFICIENT DATA everywhere; no personalised claims.' },
];

/** Deterministic pseudo-random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMD', 'SPY', 'QQQ', 'META'];
const STRATEGIES = ['Momentum continuation', 'Mean reversion', 'Catalyst breakout'];
const REGIMES = ['Risk-On', 'Neutral', 'Risk-Off'];

interface Draft {
  dayOffset: number;
  minuteOfDay: number;
  size: number;
  pl: number;
  origin: TradeOrigin;
  planned: boolean;
  adherence: number;
  score: number;
  holdMinutes: number;
}

function toRecord(d: Draft, i: number, profile: ProfileKey, rand: () => number): TradeRecord {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const day = new Date(base.getTime() - d.dayOffset * 86400000);
  // ET entry time: minuteOfDay is minutes from ET midnight → UTC is +4/5h; use 4h.
  const entry = new Date(day.getTime() + (d.minuteOfDay + 240) * 60000);
  const exit = new Date(entry.getTime() + d.holdMinutes * 60000);
  const contracts = Math.max(1, Math.round(d.size / 500));
  const entryPrice = Math.round((d.size / (contracts * 100)) * 100) / 100;
  const exitPrice = Math.round((entryPrice + d.pl / (contracts * 100)) * 100) / 100;
  const sym = SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
  const et = new Date(entry.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const sessionDate = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
  return {
    id: i + 1,
    user_id: null,
    signal_id: null,
    symbol: sym,
    direction: rand() > 0.5 ? 'bullish' : 'bearish',
    strategy: STRATEGIES[Math.floor(rand() * STRATEGIES.length)],
    setup: STRATEGIES[Math.floor(rand() * STRATEGIES.length)],
    option_type: rand() > 0.5 ? 'call' : 'put',
    strike: Math.round(100 + rand() * 300),
    expiration: new Date(entry.getTime() + 14 * 86400000).toISOString().slice(0, 10),
    option_symbol: null,
    asset_type: 'option',
    broker: null,
    account_label: 'SYNTHETIC',
    contracts,
    position_size: Math.round(d.size),
    entry_at: entry.toISOString(),
    entry_price: entryPrice,
    exit_at: exit.toISOString(),
    exit_price: exitPrice,
    fees: 0,
    realized_pl: Math.round(d.pl * 100) / 100,
    unrealized_pl: null,
    origin: d.origin,
    regime: REGIMES[Math.floor(rand() * REGIMES.length)],
    opportunity_score: d.score,
    confidence_score: Math.max(30, Math.min(95, d.score - 4)),
    risk_level: d.score > 70 ? 'Moderate' : 'High',
    thesis_id: null,
    trade_plan_id: d.planned ? i + 1 : null,
    intended_invalidation: Math.round(entryPrice * 0.7 * 100) / 100,
    intended_target: Math.round(entryPrice * 1.6 * 100) / 100,
    max_favorable_excursion: Math.round(Math.abs(d.pl) * 1.3),
    max_adverse_excursion: -Math.round(Math.abs(d.pl) * 0.6),
    return_pct: entryPrice > 0 ? Math.round(((exitPrice - entryPrice) / entryPrice) * 10000) / 100 : null,
    result: d.pl > 0 ? 'win' : d.pl < 0 ? 'loss' : 'scratch',
    closed_at: exit.toISOString(),
    session_date: sessionDate,
    was_planned: d.planned,
    process_adherence: d.adherence,
    is_synthetic: true,
    synthetic_profile: `PROFILE_${profile}`,
    is_demo: true,
    notes: null,
    created_at: entry.toISOString(),
  };
}

export function generateProfile(profile: ProfileKey, sessions = 14, seed = 42): TradeRecord[] {
  if (profile === 'NEW') return [];
  const rand = rng(seed + profile.charCodeAt(0));
  const drafts: Draft[] = [];

  for (let s = 0; s < sessions; s += 1) {
    const dayOffset = sessions - s;
    const perSession = profile === 'B' ? 7 : profile === 'D' ? 6 : 4;
    let lastPl = 0;
    let cursor = 585; // 09:45 ET
    for (let n = 0; n < perSession; n += 1) {
      let size = 900;
      let pl = 0;
      let planned = true;
      let adherence = 86;
      let score = 74;
      let origin: TradeOrigin = 'MATADOR_SUPPORTED';
      let hold = 45;
      let gap = 40;

      switch (profile) {
        case 'A': // structured, consistent
          size = 900 + Math.round((rand() - 0.5) * 80);
          pl = (rand() > 0.44 ? 1 : -1) * (120 + rand() * 90);
          adherence = 88 + Math.round(rand() * 8);
          break;
        case 'B': // profitable early, gives it back late
          size = 900 + Math.round((rand() - 0.5) * 100);
          pl = n < 3 ? 210 + rand() * 90 : -(150 + rand() * 120);
          adherence = n < 3 ? 88 : 54;
          cursor = n < 3 ? 585 + n * 35 : 830 + (n - 3) * 30;
          break;
        case 'C': // escalates size after a win
          size = lastPl > 0 ? 900 * (1.9 + rand() * 0.5) : 900 + Math.round((rand() - 0.5) * 90);
          pl = (rand() > 0.5 ? 1 : -1) * (140 + rand() * 160);
          adherence = lastPl > 0 ? 58 : 84;
          break;
        case 'D': // rapid re-entry after losses
          size = 900 + Math.round((rand() - 0.5) * 100);
          pl = (rand() > 0.55 ? 1 : -1) * (130 + rand() * 110);
          gap = lastPl < 0 ? 3 : 45;
          adherence = lastPl < 0 ? 52 : 85;
          break;
        case 'E': { // external signals outperform spontaneous entries
          const external = n % 2 === 0;
          origin = external ? 'EXTERNAL_SIGNAL' : 'SPONTANEOUS';
          planned = external;
          size = 900 + Math.round((rand() - 0.5) * 120);
          pl = external ? 180 + rand() * 120 : -(90 + rand() * 140);
          score = external ? 78 : 52;
          adherence = external ? 84 : 44;
          break;
        }
        case 'F': // deliberately structureless — must yield no reliable pattern
        default:
          size = 850 + Math.round(rand() * 160);
          pl = (rand() > 0.5 ? 1 : -1) * (100 + rand() * 120);
          adherence = 70 + Math.round(rand() * 16);
          score = 62 + Math.round(rand() * 16);
          hold = 30 + Math.round(rand() * 50);
          break;
      }

      if (profile !== 'B') cursor += gap + hold;
      drafts.push({
        dayOffset, minuteOfDay: Math.min(955, cursor), size, pl,
        origin, planned, adherence, score, holdMinutes: hold,
      });
      lastPl = pl;
    }
  }

  return drafts.map((d, i) => toRecord(d, i, profile, rand));
}
