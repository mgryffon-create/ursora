// Keep every word available when feedback needs more than one small-screen card.
export function feedbackPages(text: string, limit = 120): string[] {
  const pages: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (!pages.length || pages[pages.length-1].length + word.length + 1 > limit) pages.push(word);
    else pages[pages.length-1] += ` ${word}`;
  }
  return pages.length ? pages : [''];
}
