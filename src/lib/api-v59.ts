export * from './api';

import {
  callEdge,
  EDGE_FUNCTIONS,
  fetchSignal as fetchSignalBase,
  type EdgeFunctionSlug,
  type FreshAnalysisResult,
} from './api';
import type { Signal } from './types';

const ENGINE_VERSION = 'tradecycle-5.9.0';

const describe = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
};

const warning = (label: string, error: unknown) => {
  const detail = describe(error).replace(/\s+/g, ' ').trim().slice(0, 220);
  return `${label}: refresh did not complete${detail ? ` — ${detail}` : '.'}`;
};

/**
 * Re-apply the current swing decision layer to a stored analysis without refreshing
 * Massive, Alpha Vantage, market context, or options data. This is used when an old
 * 5.8 signal is opened after the 5.9 decision model has been deployed.
 */
export async function reclassifyStoredAnalysis(runId: string): Promise<{
  run_id?: string;
  updates?: number;
  engine_version?: string;
  mode?: string;
}> {
  return callEdge('run-analysis-v5-9' as EdgeFunctionSlug, {
    run_id: runId,
    mode: 'reclassify',
  });
}

/**
 * Preserve the normal fetchSignal API, but migrate stale stored analyses through the
 * current 5.9 decision layer the first time they are read. The second read returns
 * the updated row. A reclassification failure does not make the historical signal
 * unreadable; the original row is returned and the UI can still display it.
 */
export async function fetchSignal(id: number): Promise<Signal | null> {
  const signal = await fetchSignalBase(id);
  if (!signal) return null;

  const engineVersion = String((signal as Signal & { engine_version?: string }).engine_version ?? '');
  const runId = String((signal as Signal & { run_id?: string }).run_id ?? '').trim();
  if (engineVersion === ENGINE_VERSION || !runId) return signal;

  try {
    await reclassifyStoredAnalysis(runId);
    return (await fetchSignalBase(id)) ?? signal;
  } catch (error) {
    console.warn('URSORA stored-analysis reclassification did not complete:', error);
    return signal;
  }
}

/**
 * Fresh analysis still performs the full evidence-enrichment pipeline. The final
 * decision stage is always run-analysis-v5-9. That function delegates evidence
 * production to the established engine, then applies the 1–5 day swing gate.
 */
export async function runFreshAnalysis(
  body: Record<string, unknown> = { kind: 'manual' },
): Promise<FreshAnalysisResult> {
  const warnings: string[] = [];
  const selectedSymbols = Array.isArray(body.symbols)
    ? [...new Set(body.symbols.map((value) => String(value).trim().toUpperCase()).filter(Boolean))]
    : [];
  const selectedPayload = selectedSymbols.length ? { symbols: selectedSymbols } : {};
  const marketSymbols = selectedSymbols.length
    ? [...new Set([...selectedSymbols, 'SPY', 'QQQ', 'IWM'])]
    : [];
  const marketPayload = marketSymbols.length ? { symbols: marketSymbols } : {};

  const stages: Array<{ label: string; slug: EdgeFunctionSlug; payload: Record<string, unknown> }> = [
    { label: 'Massive market quotes and historical data', slug: EDGE_FUNCTIONS.marketSync, payload: marketPayload },
    { label: 'Massive options chain', slug: EDGE_FUNCTIONS.optionsSync, payload: selectedPayload },
    { label: 'market context', slug: EDGE_FUNCTIONS.marketContextSync, payload: { force: true } },
    { label: 'verified news and sentiment', slug: EDGE_FUNCTIONS.alphaNewsSync, payload: selectedPayload },
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
