/**
 * URSORA — error serialisation and data-state classification.
 *
 * PHASE C1: the application previously rendered "[object Object]" when a
 * non-Error value reached a template. Nothing in the UI may interpolate a raw
 * caught value again: everything goes through `errorMessage` (safe, customer
 * facing) and `errorDetail` (verbose, logs / admin diagnostics only).
 *
 * PHASE C3: a missing value is not one condition. `classifyState` separates the
 * eight failure states the product must distinguish so the UI can say which one
 * it is instead of collapsing everything to DATA UNAVAILABLE.
 */

/* -------------------------------------------------------------------------- */
/*  Error serialisation                                                       */
/* -------------------------------------------------------------------------- */

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|rk)_[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
  /\beyJ[A-Za-z0-9._-]{20,}/g, // JWTs
  /\b[A-Za-z0-9_-]{32,}\b(?=.*(?:key|token|secret))/gi,
  /(api[_-]?key|apikey|access[_-]?token|secret|password)\s*[:=]\s*\S+/gi,
];

/** Strip anything that looks like a credential before a string reaches a user. */
export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, '[redacted]'), text);
}

interface ShapedError {
  message?: unknown;
  error?: unknown;
  error_description?: unknown;
  details?: unknown;
  hint?: unknown;
  msg?: unknown;
  statusText?: unknown;
  status?: unknown;
  code?: unknown;
}

/**
 * Turn ANY caught value into a single readable sentence.
 * Never returns an empty string and never returns "[object Object]".
 */
export function errorMessage(err: unknown, fallback = 'Something went wrong and the reason was not reported.'): string {
  const out = extract(err, 0);
  const clean = redact((out ?? '').trim());
  if (!clean || clean === '[object Object]' || clean === '{}') return fallback;
  return clean.length > 400 ? `${clean.slice(0, 397)}…` : clean;
}

function extract(err: unknown, depth: number): string | null {
  if (depth > 4) return null;
  if (err === null || err === undefined) return null;
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeText = cause ? extract(cause, depth + 1) : null;
    return causeText && causeText !== err.message ? `${err.message} (${causeText})` : err.message;
  }
  if (Array.isArray(err)) {
    const parts = err.map((e) => extract(e, depth + 1)).filter(Boolean);
    return parts.length ? parts.join('; ') : null;
  }
  if (typeof err === 'object') {
    const o = err as ShapedError;
    // Ordered by how specific the field usually is.
    for (const key of ['message', 'error_description', 'details', 'msg', 'hint', 'statusText'] as const) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) return v;
    }
    if (o.error !== undefined && typeof o.error !== 'object') return extract(o.error, depth + 1);
    if (o.error && typeof o.error === 'object') {
      const nested = extract(o.error, depth + 1);
      if (nested) return nested;
    }
    const status = typeof o.status === 'number' ? o.status : null;
    const code = typeof o.code === 'string' ? o.code : null;
    if (status || code) return `Request failed${status ? ` with status ${status}` : ''}${code ? ` (${code})` : ''}.`;
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') return json.length > 300 ? `${json.slice(0, 297)}…` : json;
    } catch {
      /* circular — fall through */
    }
  }
  return null;
}

/** Verbose form for logs and the admin inspector. Never rendered to customers. */
export function errorDetail(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}\n${err.stack ?? '(no stack)'}`;
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(Object(err)), 2);
  } catch {
    return String(err);
  }
}

/** Log verbosely, return a safe customer-facing sentence. */
export function reportError(scope: string, err: unknown, fallback?: string): string {
  // eslint-disable-next-line no-console
  console.error(`[URSORA:${scope}]`, errorDetail(err));
  return errorMessage(err, fallback);
}

/* -------------------------------------------------------------------------- */
/*  Data state classification (PHASE C3)                                      */
/* -------------------------------------------------------------------------- */

export type DataStateKind =
  | 'OK'
  | 'NO_DATA'
  | 'STALE_DATA'
  | 'PROVIDER_ERROR'
  | 'ANALYSIS_FAILED'
  | 'AUTHORIZATION_ERROR'
  | 'RATE_LIMITED'
  | 'MARKET_CLOSED'
  | 'NO_PRIOR_ANALYSIS';

export interface DataState {
  kind: DataStateKind;
  label: string;
  explanation: string;
  /** What the person looking at the screen can actually do about it. */
  remedy: string | null;
  tone: 'ok' | 'neutral' | 'warn' | 'error';
}

const STATES: Record<DataStateKind, Omit<DataState, 'kind'>> = {
  OK: { label: 'CURRENT', explanation: 'Stored values are present and within the freshness window.', remedy: null, tone: 'ok' },
  NO_DATA: {
    label: 'NO DATA',
    explanation: 'Nothing has ever been stored for this field. URSORA does not estimate a value it has not received.',
    remedy: 'Run an analysis, or connect a live provider in Data Sources.',
    tone: 'neutral',
  },
  STALE_DATA: {
    label: 'STALE DATA',
    explanation: 'A value exists but it is older than the freshness window for this field, so it may no longer describe the market.',
    remedy: 'Refresh the analysis run to pull current values.',
    tone: 'warn',
  },
  PROVIDER_ERROR: {
    label: 'PROVIDER ERROR',
    explanation: 'The upstream data provider returned an error, so no value was written. The previous value was not overwritten.',
    remedy: 'Check provider status in Data Sources, then retry.',
    tone: 'error',
  },
  ANALYSIS_FAILED: {
    label: 'ANALYSIS FAILED',
    explanation: 'The provider returned data but the analysis run did not complete, so no output was produced for this field.',
    remedy: 'Open Data Sources and re-run the analysis; the run log records where it stopped.',
    tone: 'error',
  },
  AUTHORIZATION_ERROR: {
    label: 'AUTHORIZATION ERROR',
    explanation: 'This data belongs to a signed-in account and the current session is not authorised to read it.',
    remedy: 'Sign in to the account that owns this record.',
    tone: 'error',
  },
  RATE_LIMITED: {
    label: 'RATE LIMITED',
    explanation: 'The provider rejected the request for exceeding its rate limit. No partial or guessed value was stored.',
    remedy: 'Wait for the limit window to reset, then retry.',
    tone: 'warn',
  },
  MARKET_CLOSED: {
    label: 'MARKET CLOSED',
    explanation: 'The US equity session is closed, so intraday values are not updating. The last session close is shown where stored.',
    remedy: null,
    tone: 'neutral',
  },
  NO_PRIOR_ANALYSIS: {
    label: 'NO PRIOR ANALYSIS',
    explanation: 'No analysis run has been recorded yet for this account, so there is no previous result to compare against.',
    remedy: 'Run the first analysis from Data Sources to create a baseline.',
    tone: 'neutral',
  },
};

export const dataState = (kind: DataStateKind): DataState => ({ kind, ...STATES[kind] });

/** Map a caught error onto the correct failure state instead of a blanket message. */
export function classifyError(err: unknown): DataState {
  const msg = errorMessage(err, '').toLowerCase();
  const status = (err as { status?: number } | null)?.status;
  if (status === 401 || status === 403 || /jwt|unauthor|forbidden|row-level security|permission denied/.test(msg)) {
    return dataState('AUTHORIZATION_ERROR');
  }
  if (status === 429 || /rate limit|too many requests|quota/.test(msg)) return dataState('RATE_LIMITED');
  if (/provider|upstream|fetch failed|network|econnrefused|timeout|gateway/.test(msg)) return dataState('PROVIDER_ERROR');
  if (/analysis|run failed|engine/.test(msg)) return dataState('ANALYSIS_FAILED');
  return dataState('PROVIDER_ERROR');
}

/**
 * Classify a stored value by presence and age.
 * `maxAgeMinutes` is the freshness window for that specific field.
 */
export function classifyFreshness(
  value: unknown,
  asOf: string | null | undefined,
  maxAgeMinutes: number,
  opts: { marketOpen?: boolean } = {},
): DataState {
  if (value === null || value === undefined || value === '') return dataState('NO_DATA');
  if (!asOf) return dataState('OK');
  const t = new Date(asOf).getTime();
  if (Number.isNaN(t)) return dataState('OK');
  const ageMin = (Date.now() - t) / 60000;
  if (ageMin <= maxAgeMinutes) return dataState('OK');
  if (opts.marketOpen === false) return dataState('MARKET_CLOSED');
  return dataState('STALE_DATA');
}
