export function newQuizSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]; }

// Stable within a saved attempt; display order never changes answer identifiers.
export function shuffleQuiz<T>(items: readonly T[], seed: number, key: string): T[] {
  let state = seed >>> 0;
  for (const char of key) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    const j = ((value ^ (value >>> 14)) >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
