export * from './api';

import {
  callEdge,
  EDGE_FUNCTIONS,
  type EdgeFunctionSlug,
  type FreshAnalysisResult,
} from './api';

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
 * v5.9 keeps the established evidence-enrichment pipeline intact, but routes the
 * final analysis stage through run-analysis-v5-9. That adapter reuses the existing
 * evidence engine and applies the 1–5 day swing-specific decision layer before
 * contract selection runs.
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
