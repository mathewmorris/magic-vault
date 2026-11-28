/**
 * Judge a scanned card the way a person does: look at several independent
 * cues, weigh each by how well it could be read, and only be sure when more
 * than one of them points the same way and nothing clear points elsewhere.
 *
 * The cues ("signals"):
 *
 *  - image: embedding matches from the server (scan.match), i.e. what the
 *    card looks like. Good at telling cards apart, bad at telling apart
 *    reprints that share art, since those look identical.
 *  - name: the name OCR read off the title bar. Often right, sometimes garbage.
 *  - collector: the set code and collector number OCR read off the bottom left.
 *    When it reads cleanly it names the exact printing, which is the one thing
 *    the image can't do for reprints. Pre-2015 cards don't have one.
 *  - rarity: the rarity letter on the collector line (C/U/R/M/S) and the
 *    colour of the set symbol, each compared with the printing's rarity.
 *  - border: the border colour, compared with the printing's border_color.
 *  - foil: the star (foil) or dot (non-foil) between set code and language,
 *    compared with the finishes the printing came in.
 *
 * Each candidate printing carries one SignalEvidence per cue that was read:
 * `agreement` from -1 (contradicts this card) to 1 (agrees), and `quality`
 * from 0 to 1 for how readable the cue was. A cue that wasn't read, or a card
 * field that's missing, gives no evidence at all, never negative evidence.
 *
 * Score for each candidate printing (the ranking):
 *
 *   score = similarity                    (cosine, 0..1, from the embedding)
 *         + NAME_WEIGHT * nameAgreement   (0..1, from the OCR'd name, scaled
 *                                          down when tesseract was unsure)
 *         + EXACT_PRINTING_BONUS          (set AND number match the OCR)
 *      or + SET_BONUS                     (only the set matches)
 *         + LANG_BONUS                    (OCR'd language matches the row)
 *         + small cue bonuses/penalties   (rarity, border, foil; see below)
 *
 * nameAgreement ramps linearly from 0 at NAME_FLOOR to 1 at a perfect read,
 * so a half-right OCR name adds nothing and can't drag a wrong card up. A bad
 * OCR read never subtracts: OCR misses far more often than the embedding.
 *
 * The exact printing bonus is large on purpose: two printings with the same
 * art differ by a hair in similarity, and a clean collector read is the best
 * signal between them. It can't promote an unrelated card on its own because
 * the server's printing lookup is only added when its name agrees with the
 * top image match or the OCR'd name (see below).
 *
 * Rarity, border and foil cues each add `BONUS * agreement * quality` when
 * they agree, and subtract `PENALTY * |agreement| * quality` when they
 * contradict, but only when the cue read cleanly (quality >= SIGNAL_QUALITY).
 * They're small: enough to separate two printings that share art (a clean
 * mythic symbol beats a common on a hair of similarity), never enough to
 * overrule a clear image match of a different card.
 *
 * Confidence rule. The top candidate is confident when nothing clearly
 * contradicts it (no signal with quality >= SIGNAL_QUALITY and agreement <=
 * SIGNAL_CONTRADICTS) and either:
 *
 *   a. it leads the runner-up by CONFIDENT_MARGIN and at least
 *      CONFIDENT_SIGNALS of the independent signals (image, name, collector;
 *      COUNTED_SIGNALS) agree with it at good quality (agreement >=
 *      SIGNAL_AGREES and quality >= SIGNAL_QUALITY). The image agrees from
 *      CONFIDENT_SIMILARITY up. Rarity, border and foil only narrow things
 *      down a little, so they never count toward the two, but any of them
 *      can veto; or
 *   b. it's the exact printing the collector line names and its name agrees
 *      (OCR'd name or the top image match). That path is unchanged.
 *
 * So a strong image match alone is no longer enough: something read off the
 * card (name or collector line) has to back it up.
 *
 * The constants are first guesses, picked by reasoning about the ranges
 * each signal takes, not tuned on real scans yet. They're exported so the
 * tests pin the behavior that matters (who wins) rather than exact numbers.
 */

import type { ScanCard } from "~/server/api/routers/scan";
import { normalizeName } from "~/utils/scan/cleanOcrText";
import { nameSimilarity, scoreCardName } from "~/utils/scan/fuzzyMatch";
import type { CollectorInfo, FoilMark } from "./collectorLine";

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
/** ...and enough signals agree. The image agrees (agreement 0.5) from this similarity up. */
export const CONFIDENT_SIMILARITY = 0.55;
/** How many candidates to return. */
export const MAX_CANDIDATES = 10;

// ---- Signals ----

/** A signal agrees with a candidate at or above this agreement... */
export const SIGNAL_AGREES = 0.5;
/** ...and contradicts it at or below this one. */
export const SIGNAL_CONTRADICTS = -0.5;
/** A cue read at least this well counts: it can agree, veto, or cost points. */
export const SIGNAL_QUALITY = 0.6;
/** Independent signals that count toward confidence. */
export const COUNTED_SIGNALS: readonly SignalName[] = ["image", "name", "collector"];
/** How many of COUNTED_SIGNALS must agree for the margin path. */
export const CONFIDENT_SIGNALS = 2;

/** Image similarity that's no evidence at all; agreement ramps from here... */
export const IMAGE_ZERO = 0.3;
/** ...to 1 here. Halfway is CONFIDENT_SIMILARITY. */
export const IMAGE_FULL = 2 * CONFIDENT_SIMILARITY - IMAGE_ZERO;
/** Quality of an image score borrowed from a same-named printing with the same art. */
export const IMAGE_BORROWED_QUALITY = 0.8;

/** Quality of the OCR'd name when tesseract's confidence isn't given. */
export const NAME_DEFAULT_QUALITY = 0.8;

/** Collector read with set and number both resolved... */
export const COLLECTOR_QUALITY_FULL = 0.9;
/** ...with only the set code... */
export const COLLECTOR_QUALITY_SET = 0.7;
/** ...or a set code nothing else confirms is real (likely a misread). */
export const COLLECTOR_QUALITY_UNVERIFIED = 0.3;
/** Agreement when only the set matches (no number read). */
export const COLLECTOR_SET_AGREEMENT = 0.6;
/** Agreement when the set matches but the number read is another card's. */
export const COLLECTOR_NUMBER_MISMATCH_AGREEMENT = 0.2;
/** Agreement when the set read isn't this printing's. */
export const COLLECTOR_CONTRADICTION = -0.6;

export const RARITY_BONUS = 0.03;
export const RARITY_PENALTY = 0.04;
/** Quality of the rarity letter on the collector line. */
export const RARITY_LETTER_QUALITY = 0.7;
/** Set symbol colour one step off (common/uncommon, rare/mythic): easy to confuse. */
export const RARITY_NEAR_MISS = -0.4;

export const BORDER_BONUS = 0.02;
export const BORDER_PENALTY = 0.03;

export const FOIL_BONUS = 0.01;
export const FOIL_PENALTY = 0.03;
/** Quality of a star or dot the collector parser was willing to call. */
export const FOIL_MARK_QUALITY = 0.7;
/** Agreement when the printing comes in the finish the mark says (most do). */
export const FOIL_ALLOWED_AGREEMENT = 0.3;

// ---- Suggested finish ----

/** The printing only comes in one finish. */
export const FINISH_ONLY_OPTION_CONFIDENCE = 1;
/** The foil mark read, and the printing comes in that finish. */
export const FINISH_FROM_MARK_CONFIDENCE = 0.7;
/** The foil mark read, but we don't know the printing's finishes. */
export const FINISH_MARK_UNCHECKED_CONFIDENCE = 0.5;
/** Nothing to go on: a guess. */
export const FINISH_DEFAULT_CONFIDENCE = 0.2;

export type SignalName = "image" | "name" | "collector" | "rarity" | "border" | "foil";

export type SignalEvidence = {
  signal: SignalName;
  /** -1..1: negative contradicts this candidate, positive agrees. */
  agreement: number;
  /** 0..1: how readable the cue was. */
  quality: number;
  detail: string;
};

export type RarityValue = "common" | "uncommon" | "rare" | "mythic";
export type BorderValue = "black" | "white" | "borderless" | "silver" | "gold" | "yellow";

export type SuggestedFinish = {
  /** A Scryfall finish: "nonfoil", "foil", "etched", ... */
  finish: string;
  /** 0..1 */
  confidence: number;
  reason: string;
};

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
  /** One entry per cue that was read, in a fixed order (image first). */
  signals: SignalEvidence[];
  suggestedFinish: SuggestedFinish;
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
  /** Tesseract's confidence in the name read, 0..1. Scales the name signal's quality. */
  ocrNameConfidence?: number | null;
  /** Rarity from the set symbol's colour. */
  rarityColour?: { value: RarityValue; quality: number } | null;
  /** Border colour around the card. */
  border?: { value: BorderValue; quality: number } | null;
};

/**
 * Card fields this file reads that ScanCard may not have yet. Read through
 * this narrow type so it compiles before and after they're selected.
 */
type CueFields = { border_color?: string | null; finishes?: unknown };

type Face = { name?: string };

/** The printed name of one face, falling back to the card name. */
export function faceName(card: Pick<ScanCard, "name" | "card_faces">, face: number): string {
  const faces = card.card_faces as Face[] | null | undefined;
  return (Array.isArray(faces) ? faces[face]?.name : undefined) ?? card.name;
}

function faceCount(card: Pick<ScanCard, "card_faces">): number {
  const faces = card.card_faces as Face[] | null | undefined;
  return Array.isArray(faces) ? Math.max(1, faces.length) : 1;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function evidence(signal: SignalName, agreement: number, quality: number, detail: string): SignalEvidence {
  return { signal, agreement: round(clamp(agreement, -1, 1)), quality: round(clamp(quality, 0, 1)), detail };
}

/** Agrees at good quality. */
export function signalAgrees(e: SignalEvidence): boolean {
  return e.agreement >= SIGNAL_AGREES && e.quality >= SIGNAL_QUALITY;
}

/** Contradicts at good quality. */
export function signalContradicts(e: SignalEvidence): boolean {
  return e.agreement <= SIGNAL_CONTRADICTS && e.quality >= SIGNAL_QUALITY;
}

/** Score change from a small cue (rarity, border, foil). */
function cueAdjustment(e: SignalEvidence, bonus: number, penalty: number): number {
  if (e.agreement > 0) return bonus * e.agreement * e.quality;
  if (e.agreement < 0 && e.quality >= SIGNAL_QUALITY) return -penalty * -e.agreement * e.quality;
  return 0;
}

export function imageAgreement(similarity: number): number {
  return clamp((similarity - IMAGE_ZERO) / (IMAGE_FULL - IMAGE_ZERO), 0, 1);
}

// ---- Rarity ----

const RARITY_LADDER: readonly string[] = ["common", "uncommon", "rare", "mythic"];
const LETTER_RARITY: Partial<Record<string, string>> = {
  C: "common",
  U: "uncommon",
  R: "rare",
  M: "mythic",
  S: "special",
};

function cardRarity(card: ScanCard): string | null {
  const rarity = card.rarity?.trim().toLowerCase();
  if (!rarity) return null;
  return rarity === "bonus" ? "special" : rarity;
}

function rarityEvidence(card: ScanCard, input: RecognitionInput): SignalEvidence[] {
  const actual = cardRarity(card);
  if (!actual) return [];
  const out: SignalEvidence[] = [];

  // The letter printed on the collector line (2015+). T and L (tokens, lands)
  // aren't rarities. An S is printed on some cards Scryfall files under
  // another rarity, so a mismatched S is no evidence either way.
  const letter = input.collector?.rarity ?? null;
  const fromLetter = letter ? LETTER_RARITY[letter] : undefined;
  if (letter && fromLetter && (letter !== "S" || actual === "special")) {
    const agrees = fromLetter === actual;
    out.push(
      evidence(
        "rarity",
        agrees ? 1 : -1,
        RARITY_LETTER_QUALITY,
        `letter ${letter} ${agrees ? "matches" : "but card is"} ${actual}`,
      ),
    );
  }

  // The set symbol's colour. It can't express special/bonus, so those cards
  // get no evidence from it.
  const colour = input.rarityColour;
  if (colour && RARITY_LADDER.includes(actual)) {
    const steps = Math.abs(RARITY_LADDER.indexOf(colour.value) - RARITY_LADDER.indexOf(actual));
    const agreement = steps === 0 ? 1 : steps === 1 ? RARITY_NEAR_MISS : -1;
    out.push(
      evidence(
        "rarity",
        agreement,
        colour.quality,
        `symbol looks ${colour.value}${steps === 0 ? "" : `, card is ${actual}`}`,
      ),
    );
  }
  return out;
}

// ---- Border ----

function borderEvidence(card: ScanCard, input: RecognitionInput): SignalEvidence[] {
  const actual = (card as ScanCard & CueFields).border_color?.trim().toLowerCase();
  const read = input.border;
  if (!actual || !read) return [];
  const agrees = read.value === actual;
  return [
    evidence(
      "border",
      agrees ? 1 : -1,
      read.quality,
      `looks ${read.value}${agrees ? "" : `, card is ${actual}`}`,
    ),
  ];
}

// ---- Foil ----

/** The printing's finishes ("nonfoil", "foil", "etched"), or null when unknown. */
export function cardFinishes(card: ScanCard): string[] | null {
  const raw = (card as ScanCard & CueFields).finishes;
  if (!Array.isArray(raw)) return null;
  const finishes = raw.filter((value): value is string => typeof value === "string" && value !== "");
  return finishes.length > 0 ? finishes : null;
}

/** The printing's finish that a foil mark points to, if it comes in one. */
function finishForMark(mark: FoilMark, finishes: string[]): string | null {
  if (mark === "nonfoil") return finishes.includes("nonfoil") ? "nonfoil" : null;
  // Etched foils print the star too.
  if (finishes.includes("foil")) return "foil";
  if (finishes.includes("etched")) return "etched";
  return null;
}

function foilEvidence(card: ScanCard, collector: CollectorInfo | null): SignalEvidence[] {
  const mark = collector?.foilMark ?? null;
  const finishes = cardFinishes(card);
  if (!mark || !finishes) return [];
  const glyph = mark === "foil" ? "star" : "dot";
  const finish = finishForMark(mark, finishes);
  return finish
    ? [evidence("foil", FOIL_ALLOWED_AGREEMENT, FOIL_MARK_QUALITY, `${glyph}, comes in ${finish}`)]
    : [evidence("foil", -1, FOIL_MARK_QUALITY, `${glyph}, but only ${finishes.join("/")}`)];
}

/**
 * Which finish to suggest adding this printing as:
 *  1. the only finish it came in, if just one;
 *  2. else what the foil mark says, if the printing comes in that;
 *  3. else non-foil (or its first finish, if it has no non-foil), as a guess.
 */
export function suggestFinish(card: ScanCard, collector: CollectorInfo | null): SuggestedFinish {
  const finishes = cardFinishes(card);
  if (finishes?.length === 1) {
    return { finish: finishes[0]!, confidence: FINISH_ONLY_OPTION_CONFIDENCE, reason: "only printing" };
  }
  const mark = collector?.foilMark ?? null;
  if (mark) {
    const glyph = mark === "foil" ? "star" : "dot";
    if (!finishes) {
      return {
        finish: mark,
        confidence: FINISH_MARK_UNCHECKED_CONFIDENCE,
        reason: `${glyph} by the set code, finishes unknown`,
      };
    }
    const finish = finishForMark(mark, finishes);
    if (finish) {
      return { finish, confidence: FINISH_FROM_MARK_CONFIDENCE, reason: `${glyph} by the set code` };
    }
  }
  const fallback = !finishes || finishes.includes("nonfoil") ? "nonfoil" : finishes[0]!;
  return { finish: fallback, confidence: FINISH_DEFAULT_CONFIDENCE, reason: "guess" };
}

// ---- Collector ----

function collectorEvidence(
  card: ScanCard,
  collector: CollectorInfo | null,
  setVerified: boolean,
): SignalEvidence[] {
  if (!collector?.setCode) return [];
  const setCode = collector.setCode.toLowerCase();
  const hasNumber = !!collector.collectorNumber;
  const read = hasNumber ? `${setCode} #${normalizeNumber(collector.collectorNumber)}` : setCode;
  const lang = collector.lang && sameCode(card.lang, collector.lang) ? `, ${collector.lang}` : "";

  if (isExactPrinting(card, collector)) {
    return [evidence("collector", 1, COLLECTOR_QUALITY_FULL, `${read} matches${lang}`)];
  }
  if (sameCode(card.set, setCode)) {
    return hasNumber
      ? [
          evidence(
            "collector",
            COLLECTOR_NUMBER_MISMATCH_AGREEMENT,
            COLLECTOR_QUALITY_FULL,
            `${read}: set matches, number doesn't${lang}`,
          ),
        ]
      : [evidence("collector", COLLECTOR_SET_AGREEMENT, COLLECTOR_QUALITY_SET, `set ${read} matches${lang}`)];
  }
  // A set code nothing else confirms is more likely a misread than a
  // printing we've never heard of, so it barely counts against this card.
  const quality = !setVerified
    ? COLLECTOR_QUALITY_UNVERIFIED
    : hasNumber
      ? COLLECTOR_QUALITY_FULL
      : COLLECTOR_QUALITY_SET;
  return [evidence("collector", COLLECTOR_CONTRADICTION, quality, `read ${read}, card is ${card.set}`)];
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
    // Check every face, and remember which one the OCR'd name is.
    let nameFace: number | null = null;
    if (ocrName !== null) {
      let bestFaceScore = -1;
      for (let face = 0; face < faceCount(printing); face++) {
        if (ocrNameScore(ocrName, printing, face) < NAME_AGREES) continue;
        const own = nameSimilarity(ocrName, faceName(printing, face));
        if (own > bestFaceScore) {
          bestFaceScore = own;
          nameFace = face;
        }
      }
    }
    if (agreesWithImage || nameFace !== null) {
      const imageFace = agreesWithImage && topMatch.face < faceCount(printing) ? topMatch.face : 0;
      byId.set(printing.id, { card: printing, face: nameFace ?? imageFace, similarity: null });
    }
  }

  const entries = [...byId.values()];
  const nameScores = new Map<string, number>();
  if (ocrName) {
    for (const { card, face } of entries) nameScores.set(card.id, ocrNameScore(ocrName, card, face));
  }

  // A set code is real if the lookup resolved it or some candidate is in it.
  const setVerified =
    !!collector?.setCode &&
    ((printing !== null && sameCode(printing.set, collector.setCode)) ||
      entries.some(({ card }) => sameCode(card.set, collector.setCode)));

  const nameQuality = clamp(input.ocrNameConfidence ?? NAME_DEFAULT_QUALITY, 0, 1);
  const nameWeight = Math.min(1, nameQuality / NAME_DEFAULT_QUALITY);
  const ramp = (score: number) => clamp((score - NAME_FLOOR) / (1 - NAME_FLOOR), 0, 1);

  const candidates: RecognitionCandidate[] = [];
  for (const { card, face, similarity } of entries) {
    const reasons: string[] = [];
    const signals: SignalEvidence[] = [];

    let base: number;
    if (similarity !== null) {
      base = similarity;
      reasons.push(`image ${percent(similarity)}`);
      signals.push(evidence("image", imageAgreement(similarity), 1, `image ${percent(similarity)}`));
    } else {
      // A reprint the image search didn't return looks like the ones it did.
      const sibling = input.matches
        .filter((match) => sameName(match.card, card))
        .reduce<number | null>((best, match) => Math.max(best ?? -1, match.similarity), null);
      base = sibling ?? PRINTING_ONLY_SIMILARITY;
      reasons.push("found by set and number");
      signals.push(
        sibling === null
          ? evidence("image", 0, 0, "not in the image matches")
          : evidence(
              "image",
              imageAgreement(sibling),
              IMAGE_BORROWED_QUALITY,
              `same art as another printing, ${percent(sibling)}`,
            ),
      );
    }

    let nameScore: number | null = null;
    let nameBonus = 0;
    if (ocrName) {
      nameScore = nameScores.get(card.id) ?? 0;
      const agreement = ramp(nameScore);
      nameBonus = NAME_WEIGHT * agreement * nameWeight;
      if (nameScore >= NAME_AGREES) reasons.push(`name read ${percent(nameScore)}`);

      // The OCR clearly read some other candidate's name, and not this one's.
      const other = entries
        .filter((entry) => entry.card.id !== card.id && !sameName(entry.card, card))
        .reduce((best, entry) => Math.max(best, nameScores.get(entry.card.id) ?? 0), 0);
      if (nameScore < NAME_AGREES && other >= NAME_AGREES) {
        signals.push(evidence("name", -ramp(other), nameQuality, `"${ocrName}" is another card's name`));
      } else {
        signals.push(evidence("name", agreement, nameQuality, `"${ocrName}" ${percent(nameScore)}`));
      }
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
    signals.push(...collectorEvidence(card, collector, setVerified));

    let cueBonus = 0;
    const cues: [SignalEvidence[], number, number][] = [
      [rarityEvidence(card, input), RARITY_BONUS, RARITY_PENALTY],
      [borderEvidence(card, input), BORDER_BONUS, BORDER_PENALTY],
      [foilEvidence(card, collector), FOIL_BONUS, FOIL_PENALTY],
    ];
    for (const [found, bonus, penalty] of cues) {
      for (const e of found) {
        cueBonus += cueAdjustment(e, bonus, penalty);
        signals.push(e);
        if (signalAgrees(e)) reasons.push(`${e.signal} matches`);
        else if (signalContradicts(e)) reasons.push(`${e.signal} doesn't match`);
      }
    }

    if (face > 0) reasons.push("back face");

    candidates.push({
      card,
      face,
      similarity,
      nameScore: nameScore === null ? null : round(nameScore),
      score: round(base + nameBonus + printingBonus + cueBonus),
      reasons,
      signals,
      suggestedFinish: suggestFinish(card, collector),
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
    const contradicted = top.signals.some(signalContradicts);

    const margin = runnerUp ? top.score - runnerUp.score : Infinity;
    const agreeing = new Set(
      top.signals.filter((e) => COUNTED_SIGNALS.includes(e.signal) && signalAgrees(e)).map((e) => e.signal),
    );
    const signalsSure = margin >= CONFIDENT_MARGIN && agreeing.size >= CONFIDENT_SIGNALS;

    const nameAgrees =
      (top.nameScore ?? 0) >= NAME_AGREES || (topMatch !== null && sameName(topMatch.card, top.card));
    const printingSure = isExactPrinting(top.card, collector) && nameAgrees;

    confident = !contradicted && (signalsSure || printingSure);
  }

  return { candidates: candidates.slice(0, MAX_CANDIDATES), confident };
}
