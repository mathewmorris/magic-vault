import { normalizeName } from "./cleanOcrText";

/** Classic Levenshtein edit distance (insert, delete, substitute all cost 1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep the shorter string in the inner loop so the rows stay small.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let previous = Array.from({ length: short.length + 1 }, (_, i) => i);

  for (let i = 1; i <= long.length; i++) {
    const current = [i];
    for (let j = 1; j <= short.length; j++) {
      const cost = long[i - 1] === short[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1, // insertion
        previous[j]! + 1, // deletion
        previous[j - 1]! + cost, // substitution
      );
    }
    previous = current;
  }

  return previous[short.length]!;
}

/**
 * Similarity between two names from 0 (nothing alike) to 1 (same name),
 * ignoring case, accents and punctuation. Empty input scores 0.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left.length === 0 || right.length === 0) return 0;

  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

/**
 * Score how well OCR text matches a card name. Split and double-faced cards
 * are stored as "Front // Back" but only one face's title is printed where we
 * crop, so each face is scored on its own and the best score wins.
 */
export function scoreCardName(ocrText: string, cardName: string): number {
  const faces = cardName.split("//").map((face) => face.trim());
  return Math.max(
    nameSimilarity(ocrText, cardName),
    ...faces.map((face) => nameSimilarity(ocrText, face)),
  );
}

export interface RankedMatch<T> {
  candidate: T;
  name: string;
  score: number;
}

export interface RankOptions {
  /** How many matches to return. Defaults to 5. */
  limit?: number;
  /** Drop anything scoring below this (0 to 1). Defaults to 0.5. */
  minScore?: number;
  /**
   * Keep only the first candidate per card name. The card table has one row
   * per printing, so without this the top 5 can be five "Lightning Bolt"s.
   * Defaults to true.
   */
  uniqueNames?: boolean;
}

/**
 * Rank candidate cards by how closely their name matches the OCR text,
 * best first.
 */
export function rankCandidates<T>(
  ocrText: string,
  candidates: readonly T[],
  getName: (candidate: T) => string,
  options: RankOptions = {},
): RankedMatch<T>[] {
  const { limit = 5, minScore = 0.5, uniqueNames = true } = options;

  const seen = new Set<string>();
  const scored: RankedMatch<T>[] = [];

  for (const candidate of candidates) {
    const name = getName(candidate);
    const key = normalizeName(name);
    if (uniqueNames) {
      if (seen.has(key)) continue;
      seen.add(key);
    }

    const score = scoreCardName(ocrText, name);
    if (score >= minScore) {
      scored.push({ candidate, name, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return scored.slice(0, limit);
}
