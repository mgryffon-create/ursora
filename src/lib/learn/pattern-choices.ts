type PatternChoice = { id: string; name: string };
type Progress = { answers: Record<string, string>; checked: Record<string, boolean>; matchedPatterns?: Record<string, boolean> };

// Preserve catalog indices: saved answers use these values, not filtered positions.
export function remainingPatternChoices(catalog: PatternChoice[], progress: Progress, currentId: string) {
  return catalog.map((pattern, index) => ({ ...pattern, index })).filter(pattern => {
    const answer = progress.answers[`${pattern.id}:0`];
    const matched = progress.matchedPatterns?.[pattern.id] ||
      (progress.checked[pattern.id] && answer !== undefined && answer !== '' && Number(answer) === pattern.index);
    return pattern.id === currentId || !matched;
  });
}
