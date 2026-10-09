export * from './api';

import {
  callEdge,
  EDGE_FUNCTIONS,
  fetchSignal as fetchSignalBase,
  marketCacheState,
  type EdgeFunctionSlug,
  type FreshAnalysisResult,
} from './api';
import type { Signal } from './types';

const ENGINE_VERSION = 'tradecycle-5.9.0';

type ReclassifyResult = {
  run_id?: string;
  source_run_id?: string;
  updates?: number;
  engine_version?: string;
  mode?: string;
  signal_map?: Array<{ source_id: number; derived_id: number; symbol: string }>;
};

const describe = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
};

const warning = (label: string, error: unknown) => {
  const detail = describe(error).replace(/\s+/g, ' ').trim().slice(0, 220);
  return `${label}: refresh did not complete${detail ? ` — ${detail}` : '.'}`;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

function normalizeV59Signal(signal: Signal): Signal {
  const engineVersion = String((signal as Signal & { engine_version?: string }).engine_version ?? '');
  if (engineVersion !== ENGINE_VERSION) return signal;

  const typed = signal as Signal & {
    strategy?: string;
    direction?: string;
    score_breakdown?: Record<string, unknown>;
    weights?: Record<string, unknown>;
  };
  const score = asRecord(typed.score_breakdown);
  const raw = asRecord(score.raw);
  const decision = asRecord(score.v59_decision);

  const thesisState = String(score.thesis_state ?? 'Insufficient Evidence');
  const contractState = String(score.contract_selection_state ?? 'not_applicable');
  const supported = thesisState === 'Supported' || thesisState === 'Strongly Supported';
  const strategy = supported
    ? contractState === 'available' ? 'Directional Option' : 'Supported Swing'
    : typed.strategy ?? 'No Trade';

  const setup = String(raw.swing_setup ?? score.swing_setup ?? 'unclassified').replaceAll('_', ' ');
  const priceBand = String(raw.swing_price_band ?? decision.price_band ?? 'Insufficient');
  const momentumBand = String(raw.swing_momentum_band ?? decision.momentum_band ?? 'Insufficient');
  const direction = String(decision.price_direction ?? typed.direction ?? 'neutral');
  const momentumAgrees = raw.swing_momentum_confirmed === true || decision.momentum_agrees === true;
  const frameValid = raw.swing_tactical_frame_valid === true || decision.tactical_frame_valid === true;
  const rrRaw = Number(raw.swing_reward_risk_ratio);
  const rr = Number.isFinite(rrRaw) ? rrRaw : null;
  const contextRaw = Number(decision.context_confirmation_count);
  const contextCount = Number.isFinite(contextRaw) ? contextRaw : 0;

  const decisions = [
    `TradeCycle 5.9 thesis classification: ${thesisState}.`,
    `Swing setup: ${setup}; price ${priceBand.toLowerCase()} ${direction}; momentum ${momentumBand.toLowerCase()}${momentumAgrees ? ' and aligned' : ' and not yet aligned at the required strength'}.`,
    `1–5 day tactical frame: ${frameValid ? 'usable' : 'not currently usable'}${rr !== null ? ` · ${rr.toFixed(2)} R:R` : ''}.`,
    `Secondary context confirmations: ${contextCount}. Participation, broader market, options context and verified catalysts can change conviction, but they do not create the swing thesis.`,
    contractState === 'available'
      ? 'Contract selection: executable option pricing is available for position construction.'
      : contractState === 'pending_live_execution_data'
        ? 'Contract selection: pending live execution data. The supported underlying swing thesis remains separate from contract availability.'
        : 'Contract selection: not applicable until the underlying swing setup is supported.',
  ];

  return {
    ...signal,
    strategy,
    weights: {
      ...asRecord(typed.weights),
      decisions,
    },
  } as Signal;
}

/**
 * Re-apply the current swing decision layer to stored immutable evidence.
 * 5.9 creates new derived signal rows rather than mutating the source signals.
 */
export async function reclassifyStoredAnalysis(runId: string): Promise<ReclassifyResult> {
  return callEdge<ReclassifyResult>('run-analysis-v5-9' as EdgeFunctionSlug, {
    run_id: runId,
    mode: 'reclassify',
  });
}

/**
 * Old signal IDs remain valid historical evidence. When one is opened, derive its
 * current 5.9 classification and follow the source->derived signal mapping returned
 * by the edge function instead of attempting to mutate the original row.
 */
export async function fetchSignal(id: number): Promise<Signal | null> {
  const signal = await fetchSignalBase(id);
  if (!signal) return null;

  const engineVersion = String((signal as Signal & { engine_version?: string }).engine_version ?? '');
  const runId = String((signal as Signal & { run_id?: string }).run_id ?? '').trim();
  if (engineVersion === ENGINE_VERSION || !runId) return normalizeV59Signal(signal);

  try {
    const result = await reclassifyStoredAnalysis(runId);
    const mapped = result.signal_map?.find((entry) => Number(entry.source_id) === Number(id));
    if (mapped?.derived_id) {
      const derived = (await fetchSignalBase(mapped.derived_id)) ?? signal;
      return normalizeV59Signal(derived);
    }
    return signal;
  } catch (error) {
    console.warn('URSORA stored-analysis reclassification did not complete:', error);
    return signal;
  }
}

/**
 * Fresh analysis refreshes evidence first. run-analysis-v5-9 then asks the existing
 * evidence engine for its immutable evidence run and appends a separate 5.9 decision
 * run derived from that evidence. Contract selection receives the 5.9 run ID.
 */
export async function runFreshAnalysis(
  body: Record<string, unknown> = { kind: 'manual' },
): Promise<FreshAnalysisResult> {
  const warnings: string[] = [];
  const selectedSymbols = Array.isArray(body.symbols)
    ? [...new Set(body.symbols.map((value) => String(value).trim().toUpperCase()).filter(Boolean))]
    : [];
  const selectedPayload = selectedSymbols.length ? { symbols: selectedSymbols } : {};
  // Refresh only the symbols the user explicitly selected. SPY/QQQ/IWM market
  // context is derived from their already-stored quote rows by sync-market-context;
  // refetching their daily history here wastes Massive requests and can trigger 429s.
  const marketPayload = selectedSymbols.length ? { symbols: selectedSymbols } : {};

  let marketNeedsRefresh = selectedSymbols.length === 0;
  if (selectedSymbols.length) {
    try {
      marketNeedsRefresh = !(await marketCacheState(selectedSymbols)).fresh;
    } catch (error) {
      // A cache check failure should fall back to attempting the provider refresh.
      marketNeedsRefresh = true;
      console.warn('URSORA market cache freshness check failed:', error);
    }
  }

  if (marketNeedsRefresh) {
    try {
      await callEdge(EDGE_FUNCTIONS.marketSync, marketPayload);
    } catch (error) {
      warnings.push(warning('Massive market quotes and historical data', error));
    }
  }

  const stages: Array<{ label: string; slug: EdgeFunctionSlug; payload: Record<string, unknown> }> = [
    { label: 'Massive options chain', slug: EDGE_FUNCTIONS.optionsSync, payload: selectedPayload },
    { label: 'market context', slug: EDGE_FUNCTIONS.marketContextSync, payload: { force: false } },
    { label: 'verified news and sentiment', slug: EDGE_FUNCTIONS.marketauxNewsSync, payload: selectedPayload },
    { label: 'earnings calendar', slug: EDGE_FUNCTIONS.alphaEarningsSync, payload: selectedPayload },
  ];

  for (const stage of stages) {
    try {
      await callEdge(stage.slug, stage.payload);
    } catch (error) {
      warnings.push(warning(stage.label, error));
    }
  }

  const analysis = await callEdge<{
    signals?: number;
    updates?: number;
    run_id?: string;
    engine_version?: string;
  }>('run-analysis-v5-9' as EdgeFunctionSlug, body);

  if (analysis.run_id) {
    try {
      await callEdge(EDGE_FUNCTIONS.tradeStructure, { run_id: analysis.run_id });
    } catch (error) {
      warnings.push(`contract selection and risk assessment: ${describe(error)}`);
    }

    try {
      await callEdge('build-indicative-contracts-v59' as EdgeFunctionSlug, { run_id: analysis.run_id });
    } catch (error) {
      warnings.push(`indicative contract research: ${describe(error)}`);
    }

    try {
      await callEdge(EDGE_FUNCTIONS.tradeLifecycle, {});
    } catch (error) {
      warnings.push(warning('trade monitoring and review', error));
    }
  }

  return {
    signals: analysis.signals ?? 0,
    updates: analysis.updates ?? 0,
    run_id: analysis.run_id,
    engine_version: analysis.engine_version,
    warnings,
  };
}
