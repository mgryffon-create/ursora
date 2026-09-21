/**
 * URSORA formatting helpers.
 * RULE: a missing value is never estimated or zero-filled — it renders as
 * DATA UNAVAILABLE through the <Unavailable /> primitive. These helpers return
 * null for missing inputs so callers must handle that case explicitly.
 *
 * PHASE C2: no raw ISO timestamp may ever reach the customer UI. The exact
 * instant is preserved in the database; these are the only display forms.
 */


export const DATA_UNAVAILABLE = 'DATA UNAVAILABLE';

export const isMissing = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) || v === '';

export function num(v: number | null | undefined, digits = 2): string | null {
  if (isMissing(v)) return null;
  return Number(v).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function money(v: number | null | undefined, digits = 2): string | null {
  const n = num(v, digits);
  return n === null ? null : `$${n}`;
}

export function pct(v: number | null | undefined, digits = 2): string | null {
  if (isMissing(v)) return null;
  return `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(digits)}%`;
}

export function ivPct(v: number | null | undefined): string | null {
  if (isMissing(v)) return null;
  return `${(Number(v) * 100).toFixed(1)}%`;
}

export function compact(v: number | null | undefined): string | null {
  if (isMissing(v)) return null;
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

export function clockET(iso: string | null | undefined): string | null {
  if (isMissing(iso)) return null;
  const d = new Date(iso as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

export function stampET(iso: string | null | undefined): string | null {
  if (isMissing(iso)) return null;
  const d = new Date(iso as string);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'America/New_York',
  })} ${d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/New_York',
  })} ET`;
}

export function dayET(iso: string | null | undefined): string | null {
  if (isMissing(iso)) return null;
  const d = new Date(iso as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

export function ago(iso: string | null | undefined): string | null {
  if (isMissing(iso)) return null;
  const t = new Date(iso as string).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function dte(dateIso: string | null | undefined): number | null {
  if (isMissing(dateIso)) return null;
  const t = new Date(`${(dateIso as string).slice(0, 10)}T21:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((t - Date.now()) / 86400000));
}

/** Is the US equity market open right now (regular session, ET)? */
export function marketStatus(): { open: boolean; label: string } {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  if (day === 0 || day === 6) return { open: false, label: 'MARKET CLOSED — WEEKEND' };
  if (mins >= 570 && mins < 960) return { open: true, label: 'MARKET OPEN' };
  if (mins >= 240 && mins < 570) return { open: false, label: 'PREMARKET' };
  if (mins >= 960 && mins < 1200) return { open: false, label: 'AFTER HOURS' };
  return { open: false, label: 'MARKET CLOSED' };
}

export const directionColor = (d: string | null | undefined) =>
  d === 'bullish' ? 'text-emerald-400' : d === 'bearish' ? 'text-red-400' : 'text-sky-400';

export const changeColor = (v: number | null | undefined) =>
  isMissing(v) ? 'text-zinc-400' : Number(v) > 0 ? 'text-emerald-400' : Number(v) < 0 ? 'text-red-400' : 'text-zinc-300';

export const riskColor = (r: string | null | undefined) =>
  r === 'Low'
    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : r === 'Moderate'
      ? 'text-sky-300 border-sky-500/30 bg-sky-500/10'
      : r === 'High'
        ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
        : 'text-red-300 border-red-500/30 bg-red-500/10';

export const scoreColor = (n: number | null | undefined) =>
  isMissing(n) ? 'text-zinc-500' : Number(n) >= 75 ? 'text-emerald-400' : Number(n) >= 60 ? 'text-sky-300' : Number(n) >= 45 ? 'text-amber-300' : 'text-red-300';

/* -------------------------------------------------------------------------- */
/*  PHASE C2 — HUMAN-READABLE DATES                                           */
/*  No component may print a raw ISO string. These are the display forms.      */
/* -------------------------------------------------------------------------- */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const etParts = (iso: string | null | undefined) => {
  if (isMissing(iso)) return null;
  const d = new Date(iso as string);
  if (Number.isNaN(d.getTime())) return null;
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { d, et };
};

/** "SEP 25, 2026" — the canonical date form. Never an ISO string. */
export function dateLabel(iso: string | null | undefined): string | null {
  const p = etParts(iso);
  if (!p) return null;
  return `${MONTHS[p.et.getMonth()]} ${String(p.et.getDate()).padStart(2, '0')}, ${p.et.getFullYear()}`;
}

/** "10:07 AM ET" — the canonical time form. */
export function timeLabel(iso: string | null | undefined): string | null {
  const p = etParts(iso);
  if (!p) return null;
  return `${p.d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
  })} ET`;
}

/** "SEP 25, 2026 · 10:07 AM ET" — date and time together. */
export function dateTimeLabel(iso: string | null | undefined): string | null {
  const d = dateLabel(iso);
  const t = timeLabel(iso);
  return d && t ? `${d} · ${t}` : d ?? t;
}

/** "SEP 25, 2026 · 10 DTE" — an expiration with its days-to-expiry attached. */
export function expiryLabel(iso: string | null | undefined): string | null {
  const d = dateLabel(iso);
  if (!d) return null;
  const days = dte(iso);
  return days === null ? d : `${d} · ${days} DTE`;
}

/** "SEP 25, 2026 · 10:07 AM ET · 3h ago" — for anything where staleness matters. */
export function stampLabel(iso: string | null | undefined): string | null {
  const dt = dateTimeLabel(iso);
  if (!dt) return null;
  const rel = ago(iso);
  return rel ? `${dt} · ${rel}` : dt;
}

/** "SEP 25" — compact axis / table form. */
export function shortDate(iso: string | null | undefined): string | null {
  const p = etParts(iso);
  if (!p) return null;
  return `${MONTHS[p.et.getMonth()]} ${String(p.et.getDate()).padStart(2, '0')}`;
}

/** Duration between two instants, in words: "2h 14m", "6 days", "18m". */
export function durationLabel(fromIso: string | null | undefined, toIso: string | null | undefined): string | null {
  if (isMissing(fromIso) || isMissing(toIso)) return null;
  const a = new Date(fromIso as string).getTime();
  const b = new Date(toIso as string).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return minutesLabel(Math.max(0, Math.round((b - a) / 60000)));
}

/** Minutes as words. Used across the behavioural engines for holding times. */
export function minutesLabel(mins: number | null | undefined): string | null {
  if (isMissing(mins)) return null;
  const m = Math.max(0, Math.round(Number(mins)));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const days = Math.round(h / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/** The ET session date ("2026-09-25") an instant belongs to. Internal key, not display. */
export function sessionDateKey(iso: string | null | undefined): string | null {
  const p = etParts(iso);
  if (!p) return null;
  return `${p.et.getFullYear()}-${String(p.et.getMonth() + 1).padStart(2, '0')}-${String(p.et.getDate()).padStart(2, '0')}`;
}

/** Signed money with an explicit sign, for P/L figures: "+$420.00" / "-$185.50". */
export function signedMoney(v: number | null | undefined, digits = 2): string | null {
  if (isMissing(v)) return null;
  const n = Number(v);
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 ? '-' : '+'}$${abs}`;
}

/** A multiple of a baseline: "2.1×". */
export function multiple(v: number | null | undefined, digits = 1): string | null {
  if (isMissing(v)) return null;
  return `${Number(v).toFixed(digits)}×`;
}
