/**
 * Combine the three things a scan tells us about a card into one ranked list:
 *
 *  1. Image embedding matches from the server (scan.match): what the card
 *     looks like. Good at telling cards apart, bad at telling apart reprints
 *     that share art, since those look identical.
 *  2. The name OCR read off the title bar. Often right, sometimes garbage.
 *  3. The collector info OCR read off the bottom left (set code + collector
 *     number). When it reads cleanly it names the exact printing, which is
 *     the one thing the image can't do for reprints.
 *
 * Score for each candidate printing:
 *
 *   score = similarity                    (cosine, 0..1, from the embedding)
 *         + NAME_WEIGHT * nameAgreement   (0..1, from the OCR'd name)
 *         + EXACT_PRINTING_BONUS          (set AND number match the OCR)
 *      or + SET_BONUS                     (only the set matches)
 *         + LANG_BONUS                    (OCR'd language matches the row)
 *
 * nameAgreement ramps linearly from 0 at NAME_FLOOR to 1 at a perfect read,
 * so a half-right OCR name adds nothing and can't drag a wrong card up. A bad
 * OCR read never subtracts: OCR misses far more often than the embedding.
 *
 * The exact printing bonus is large on purpose: two printings with the same
 * art differ by a hair in similarity, and a clean collector read is the only
 * real signal between them. It can't promote an unrelated card on its own
 * because the server's printing lookup is only added when its name agrees
 * with the top image match or the OCR'd name (see below).
 *
 * The constants are first guesses, picked by reasoning about the ranges
 * each signal takes, not tuned on real scans yet. They're exported so the
 * tests pin the behavior that matters (who wins) rather than exact numbers.
 */

import type { ScanCard } from "~/server/api/routers/scan";
import { normalizeName } from "~/utils/scan/cleanOcrText";
import { nameSimilarity, scoreCardName } from "~/utils/scan/fuzzyMatch";
import type { CollectorInfo } from "./collectorLine";

export const NAME_WEIGHT = 0.15;
/** OCR name similarity at or below this adds nothing. */
export const NAME_FLOOR = 0.6;
/** OCR name similarity that counts as "the OCR read this card's name". */
export const NAME_AGREES = 0.8;
export const EXACT_PRINTING_BONUS = 0.25;
export const SET_BONUS = 0.05;
export const LANG_BONUS = 0.02;
/**
 * Similarity assumed for the server's printing lookup when the image search
 * didn't return that printing and no same-named printing was returned either.
 */
export const PRINTING_ONLY_SIMILARITY = 0.4;
/** Confident when the top score leads the next by this much... */
export const CONFIDENT_MARGIN = 0.06;
/** ...and the image itself is at least this similar. */
export const CONFIDENT_SIMILARITY = 0.55;
/** How many candidates to return. */
export const MAX_CANDIDATES = 10;

export type EmbeddingMatch = { card: ScanCard; face: number; similarity: number };

export type RecognitionCandidate = {
  card: ScanCard;
  /** Which face matched (0 for single-faced cards). */
  face: number;
  /** Cosine similarity of the image, or null when only the printing lookup found it. */
  similarity: number | null;
  /** How well the OCR'd name matches, or null when there was no name. */
  nameScore: number | null;
  score: number;
  reasons: string[];
};

export type RecognitionResult = {
  candidates: RecognitionCandidate[];
  confident: boolean;
};

export type RecognitionInput = {
  matches: EmbeddingMatch[];
  printing: ScanCard | null;
  ocrName: string | null;
  collector: CollectorInfo | null;
};

type Face = { name?: string };

/** The printed name of one face, falling back to the card name. */
export function faceName(card: Pick<ScanCard, "name" | "card_faces">, face: number): string {
  const faces = card.card_faces as Face[] | null | undefined;
  return (Array.isArray(faces) ? faces[face]?.name : undefined) ?? card.name;
}

/** Same card by name, ignoring case and punctuation. */
function sameName(a: ScanCard, b: ScanCard): boolean {
  return normalizeName(a.name) === normalizeName(b.name);
}

function ocrNameScore(ocrName: string, card: ScanCard, face: number): number {
  return Math.max(scoreCardName(ocrName, card.name), nameSimilarity(ocrName, faceName(card, face)));
}

/** "0157" and "157" are the same collector number. */
function normalizeNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase().replace(/^0+(?=\d)/, "");
  return trimmed || null;
}

function sameCode(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isExactPrinting(card: ScanCard, collector: CollectorInfo | null): boolean {
  if (!collector?.setCode || !collector.collectorNumber) return false;
  return (
    sameCode(card.set, collector.setCode) &&
    normalizeNumber(card.collector_number) === normalizeNumber(collector.collectorNumber)
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function rankRecognition(input: RecognitionInput): RecognitionResult {
  const { printing, collector } = input;
  const ocrName = input.ocrName?.trim() ? input.ocrName.trim() : null;

  // One entry per printing; a DFC can match on both faces, keep the better.
  const byId = new Map<string, { card: ScanCard; face: number; similarity: number | null }>();
  for (const match of input.matches) {
    const existing = byId.get(match.card.id);
    if (!existing || (existing.similarity ?? -1) < match.similarity) {
      byId.set(match.card.id, { card: match.card, face: match.face, similarity: match.similarity });
    }
  }

  const topMatch = [...input.matches].sort((a, b) => b.similarity - a.similarity)[0] ?? null;

  // The server's printing lookup (set + number from OCR) only joins when it
  // agrees with something else, so a misread number can't add a random card.
  if (printing && !byId.has(printing.id)) {
    const agreesWithImage = topMatch !== null && sameName(topMatch.card, printing);
    const agreesWithName =
      ocrName !== null &&
      [0, 1].some((face) => ocrNameScore(ocrName, printing, face) >= NAME_AGREES);
    if (agreesWithImage || agreesWithName) {
      byId.set(printing.id, { card: printing, face: 0, similarity: null });
    }
  }

  const candidates: RecognitionCandidate[] = [];
  for (const { card, face, similarity } of byId.values()) {
    const reasons: string[] = [];

    let base: number;
    if (similarity !== null) {
      base = similarity;
      reasons.push(`image ${Math.round(similarity * 100)}%`);
    } else {
      // A reprint the image search didn't return looks like the ones it did.
      const sibling = input.matches
        .filter((match) => sameName(match.card, card))
        .reduce<number | null>((best, match) => Math.max(best ?? -1, match.similarity), null);
      base = sibling ?? PRINTING_ONLY_SIMILARITY;
      reasons.push("found by set and number");
    }

    let nameScore: number | null = null;
    let nameBonus = 0;
    if (ocrName) {
      nameScore = ocrNameScore(ocrName, card, face);
      const agreement = Math.min(1, Math.max(0, (nameScore - NAME_FLOOR) / (1 - NAME_FLOOR)));
      nameBonus = NAME_WEIGHT * agreement;
      if (nameScore >= NAME_AGREES) reasons.push(`name read ${Math.round(nameScore * 100)}%`);
    }

    let printingBonus = 0;
    if (isExactPrinting(card, collector)) {
      printingBonus = EXACT_PRINTING_BONUS;
      reasons.push("set and number match");
    } else if (collector?.setCode && sameCode(card.set, collector.setCode)) {
      printingBonus = SET_BONUS;
      reasons.push("set matches");
    }
    if (collector?.lang && sameCode(card.lang, collector.lang)) {
      printingBonus += LANG_BONUS;
    }

    if (face > 0) reasons.push("back face");

    candidates.push({
      card,
      face,
      similarity,
      nameScore: nameScore === null ? null : round(nameScore),
      score: round(base + nameBonus + printingBonus),
      reasons,
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      (b.similarity ?? -1) - (a.similarity ?? -1) ||
      a.card.name.localeCompare(b.card.name),
  );

  const top = candidates[0];
  const runnerUp = candidates[1];
  let confident = false;
  if (top) {
    const margin = runnerUp ? top.score - runnerUp.score : Infinity;
    const imageSure =
      margin >= CONFIDENT_MARGIN && (top.similarity ?? 0) >= CONFIDENT_SIMILARITY;
    const nameAgrees =
      (top.nameScore ?? 0) >= NAME_AGREES || (topMatch !== null && sameName(topMatch.card, top.card));
    const printingSure = isExactPrinting(top.card, collector) && nameAgrees;
    confident = imageSure || printingSure;
  }

  return { candidates: candidates.slice(0, MAX_CANDIDATES), confident };
}
