/**
 * Picking between several embeddings of one capture (the card turned
 * different ways, see ./orientation.ts). No dependencies, so the server's
 * scan.match uses the same rule as the browser.
 */

/** The best similarity among one variant's matches, or null with none. */
export function topSimilarity(matches: readonly { similarity: number }[]): number | null {
  let best: number | null = null;
  for (const { similarity } of matches) {
    if (best === null || similarity > best) best = similarity;
  }
  return best;
}

/**
 * Which variant won: the one whose best match is most similar. Ties go to
 * the earlier variant, so upright wins a tie. A variant with no matches never
 * wins unless none has any (then 0). Used by the server too.
 */
export function bestVariantIndex(topSimilarities: readonly (number | null)[]): number {
  let best = 0;
  let bestValue = -Infinity;
  topSimilarities.forEach((value, index) => {
    if (value !== null && value > bestValue) {
      best = index;
      bestValue = value;
    }
  });
  return best;
}
