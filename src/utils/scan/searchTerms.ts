/**
 * card.search does a case-insensitive "name contains" lookup, so a single
 * misread letter in the full name finds nothing. To give the fuzzy matcher
 * something to rank, we also search on the longest individual words, which
 * are the most likely to have survived OCR intact and the most specific.
 *
 * Returns the full name first, then up to `maxTerms - 1` words of at least
 * `minWordLength` letters, longest first, with duplicates removed.
 */
export function buildSearchTerms(
  cardName: string,
  { maxTerms = 4, minWordLength = 4 }: { maxTerms?: number; minWordLength?: number } = {},
): string[] {
  const full = cardName.replace(/\s+/g, " ").trim();
  if (full.length < 2) return [];

  const terms = [full];
  const seen = new Set([full.toLowerCase()]);

  const words = full
    .split(" ")
    .map((word) => word.replace(/^[^A-Za-zÀ-ɏ]+|[^A-Za-zÀ-ɏ]+$/g, ""))
    .filter((word) => word.length >= minWordLength)
    .sort((a, b) => b.length - a.length);

  for (const word of words) {
    if (terms.length >= maxTerms) break;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(word);
  }

  return terms;
}
