/** Brokerage option roots are preserved; only the underlying market request is mapped. */
export function historicalMarketSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  return ['SPXW', 'SPX', '$SPX', '^SPX'].includes(normalized) ? 'I:SPX' : normalized;
}
