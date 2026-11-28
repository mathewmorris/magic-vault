/**
 * Which way round is the card? The scanner flattens every detection into a
 * portrait CARD_WIDTH x CARD_HEIGHT crop (see orderCorners in ./geometry),
 * which is upright only if the card was. This module tries turns of that crop
 * and keeps the one the image index likes best.
 *
 * Orientation numbers are clockwise quarter turns applied to the flattened
 * portrait crop (`rotateImage(capture.best, orientation)`), not to the photo:
 *
 *  - 0: the crop as warped. Upright for a card held upright, and for a card
 *    lying sideways with its top on the left of the screen.
 *  - 180: the crop upside down. A card held upside down, or sideways with
 *    its top on the right.
 *  - 270 and 90: the crop turned to landscape (680x488). Only tried when the
 *    card lay sideways in the photo. 270 gives back the card as the camera saw
 *    it, 90 the same upside down. These are for cards whose index image is
 *    landscape content: a battle's front, a Planechase plane, and split cards
 *    if their index image turns out to be landscape. The embedder squashes a
 *    landscape crop into its portrait input, exactly as the indexer squashes a
 *    landscape Scryfall image, so the two still compare.
 *
 * Cost (see docs/card-recognition.md): every scan embeds the burst upright and
 * calls the server once, as before. Only when that result isn't confident and
 * its best image match is weak does it embed the other orientations (the
 * sharpest frame only, one embed each) and ask the server again with all of
 * them in one call. A third call happens only when a turned orientation wins
 * and OCR on that turn reads a set and number to look up.
 */

import type { ScanMatch, ScanMatchResult } from "~/server/api/routers/scan";
import { sampleBorder, sampleRarityColour } from "./colourCues";
import { rankRecognition, type RecognitionResult } from "./fuse";
import { isSideways, rotateImage, type Orientation, type Quad } from "./geometry";
import type { CardOcrResult } from "./ocr";
import type { RgbaImage } from "./preprocess";
import { topSimilarity } from "./variants";

export type { Orientation } from "./geometry";
export { bestVariantIndex, topSimilarity } from "./variants";

/** Upright, plus at most 3 alternates (scan.match takes at most 3). */
export const MAX_ORIENTATION_VARIANTS = 4;
export const MAX_ALTERNATES = MAX_ORIENTATION_VARIANTS - 1;

/**
 * When the upright scan's best image match is at least this similar, the card
 * is upright even if the ranking isn't confident (two reprints with the same
 * art, say), so the other orientations aren't tried. A guess like the
 * constants in ./fuse: wrong-way-up crops of a card should score far below
 * this against the right card, and right-way-up ones above it.
 */
export const UPRIGHT_SURE_SIMILARITY = 0.7;

/**
 * The orientations to try for a detection, most likely first, never more
 * than MAX_ORIENTATION_VARIANTS. Always upright and upside down; the two
 * landscape turns only when the card lay sideways in the photo, since a user
 * lays a landscape card (battle front, plane) landscape to read it.
 *
 * Not covered: a battle held portrait with its front's text running sideways.
 */
export function orientationCandidates(quad: Quad): Orientation[] {
  const candidates: Orientation[] = isSideways(quad) ? [0, 180, 270, 90] : [0, 180];
  return candidates.slice(0, MAX_ORIENTATION_VARIANTS);
}

/** Should the scanner try the other orientations after the upright result? */
export function needsOrientationRetry(result: RecognitionResult, matches: readonly ScanMatch[]): boolean {
  if (result.confident) return false;
  return (topSimilarity(matches) ?? 0) < UPRIGHT_SURE_SIMILARITY;
}

/**
 * Layouts whose name isn't on an M15-style title bar across the top of the
 * portrait card, so the title OCR region (./cardRegions) reads the wrong
 * thing on them:
 *  - split: two halves side by side, each with its title running along the
 *    card's long edge. The top strip of the portrait crop is frame and art.
 *  - aftermath: the top half is upright but its title bar is a half-height
 *    card's, and the bottom half runs sideways; the card's name is both.
 *  - battle: the front is landscape, title along what is the long edge of the
 *    portrait card. Its back face is an ordinary portrait card, see below.
 *  - planar: Planechase planes and phenomena are landscape too.
 */
export const UNRELIABLE_NAME_LAYOUTS: ReadonlySet<string> = new Set(["split", "aftermath", "battle", "planar"]);

/**
 * The OCR'd name to give the ranking, or null to leave the name signal out.
 *
 * fuse.ts scores the name the same for every candidate, so "down-weight for
 * this layout" can't be done per candidate from out here. Instead the name is
 * dropped when it can't have come from a title bar:
 *  - a landscape orientation (90 or 270) won: the crop has no M15 title bar
 *    where the title region looks;
 *  - the winning orientation's best image match has one of
 *    UNRELIABLE_NAME_LAYOUTS, except a battle matched on its back face
 *    (face 1), which is a normal portrait frame.
 * A dropped name never hurts a candidate (fuse never subtracts for a bad
 * read); it only stops a misread from lifting a wrong one. The collector
 * line is still used: the printing it names only joins the ranking when it
 * agrees with the image (see fuse.ts).
 */
export function trustedOcrName(
  ocrName: string | null | undefined,
  matches: readonly ScanMatch[],
  orientation: Orientation,
): string | null {
  if (!ocrName) return null;
  if (orientation === 90 || orientation === 270) return null;
  const top = [...matches].sort((a, b) => b.similarity - a.similarity)[0];
  const layout = top?.card.layout;
  if (layout && UNRELIABLE_NAME_LAYOUTS.has(layout)) {
    const battleBack = layout === "battle" && top.face > 0;
    if (!battleBack) return null;
  }
  return ocrName;
}

export type PrintingQuery = { set: string; collectorNumber: string; name?: string };

export function printingQuery(ocr: CardOcrResult | null): PrintingQuery | undefined {
  const collector = ocr?.collector ?? null;
  if (!collector?.setCode || !collector.collectorNumber) return undefined;
  const name = ocr?.name?.trim();
  return {
    set: collector.setCode,
    collectorNumber: collector.collectorNumber,
    ...(name ? { name: name.slice(0, 200) } : {}),
  };
}

export type OrientedMatchInput = {
  embedding: number[];
  alternates?: number[][];
  printing?: PrintingQuery;
};

export type OrientedRecognitionDeps = {
  /** Embed every crop of the burst and average them. */
  embedBurst(cards: RgbaImage[]): Promise<number[]>;
  /** Embed one crop. */
  embed(card: RgbaImage): Promise<number[]>;
  /**
   * OCR one crop, `orientation` being how far it was turned from the
   * capture; null when OCR isn't loaded or failed.
   */
  ocr(card: RgbaImage, orientation: Orientation): Promise<CardOcrResult | null>;
  /** scan.match (the caller adds the model id and limit). */
  match(input: OrientedMatchInput): Promise<ScanMatchResult>;
};

export type OrientedRecognition = {
  /** The orientation the result came from. */
  orientation: Orientation;
  /** Every orientation embedded for this scan, in variant order (index = server variant). */
  orientationsTried: Orientation[];
  /** The sharpest crop turned to `orientation`: what OCR read. */
  card: RgbaImage;
  ocr: CardOcrResult | null;
  server: ScanMatchResult;
  result: RecognitionResult;
};

/**
 * The colour cues read regions laid out for a portrait card (border strips,
 * the set symbol at the right end of the type line), so they're only read
 * for 0 and 180. A landscape turn gets no colour evidence rather than wrong
 * evidence.
 */
export function readColourCues(card: RgbaImage, orientation: Orientation) {
  if (orientation === 90 || orientation === 270) return { border: null, rarityColour: null };
  return { border: sampleBorder(card), rarityColour: sampleRarityColour(card) };
}

function rank(
  server: ScanMatchResult,
  ocr: CardOcrResult | null,
  orientation: Orientation,
  card: RgbaImage,
): RecognitionResult {
  return rankRecognition({
    matches: server.matches,
    printing: server.printing,
    ocrName: trustedOcrName(ocr?.name, server.matches, orientation),
    collector: ocr?.collector ?? null,
    ...readColourCues(card, orientation),
  });
}

function samePrinting(a: PrintingQuery | undefined, b: PrintingQuery | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.set.trim().toLowerCase() === b.set.trim().toLowerCase() &&
    a.collectorNumber.trim() === b.collectorNumber.trim() &&
    (a.name ?? "").trim().toLowerCase() === (b.name ?? "").trim().toLowerCase()
  );
}

/**
 * Did the image index score the orientations at all? With no card pictures
 * indexed (or nothing indexed for this card) every variant comes back null,
 * and "variant 0" only means nothing won.
 */
export function imageCanTellOrientation(server: ScanMatchResult): boolean {
  return (server.variantSimilarities ?? []).some((s) => typeof s === "number");
}

/** How much the OCR on one orientation found: a printing beats a set and number beats a name. */
export function textEvidence(ocr: CardOcrResult | null, server: ScanMatchResult): number {
  let score = 0;
  if (server.printing) score += 4;
  if (ocr?.collector?.setCode && ocr.collector.collectorNumber) score += 2;
  if (ocr?.name) score += 1;
  return score;
}

/**
 * Without image scores, read the card upside down too and keep that read
 * when it's sure, or when it found more on the card than the upright read.
 * A card held upside down reads as noise the right way up and cleanly
 * turned. Ties keep upright. Null when there's no 180 turn to try.
 */
async function readUpsideDown(
  capture: { best: RgbaImage },
  deps: OrientedRecognitionDeps,
  ctx: {
    upright: OrientedRecognition;
    server: ScanMatchResult;
    turns: Orientation[];
    turned: RgbaImage[];
    alternates: number[][];
  },
): Promise<OrientedRecognition | null> {
  const index = ctx.turns.indexOf(180);
  if (index < 0) return null;
  const orientationsTried: Orientation[] = [0, ...ctx.turns];
  const card = ctx.turned[index] ?? rotateImage(capture.best, 180);
  const ocr = await deps.ocr(card, 180);
  const printing = printingQuery(ocr);
  const variant = index + 1;
  const flipped: ScanMatchResult = printing
    ? {
        ...(await deps.match({ embedding: ctx.alternates[index]!, printing })),
        variant,
        variantSimilarities: ctx.server.variantSimilarities,
      }
    : { ...ctx.server, printing: null, variant };
  const result = rank(flipped, ocr, 180, card);
  const upright = { ...ctx.upright, orientationsTried, server: ctx.server };

  if (upright.result.confident) return upright;
  if (result.confident) return { orientation: 180, orientationsTried, card, ocr, server: flipped, result };
  const uprightEvidence = textEvidence(upright.ocr, ctx.upright.server);
  return textEvidence(ocr, flipped) > uprightEvidence
    ? { orientation: 180, orientationsTried, card, ocr, server: flipped, result }
    : upright;
}

/**
 * One capture (the burst's crops, the sharpest of them, and the detection's
 * quad) -> embedding, OCR, server match and ranking, in the orientation that
 * matched best. See the top of this file for when the other orientations are
 * tried.
 */
export async function recognizeOriented(
  capture: { cards: RgbaImage[]; best: RgbaImage; quad: Quad },
  deps: OrientedRecognitionDeps,
): Promise<OrientedRecognition> {
  const candidates = orientationCandidates(capture.quad);

  // Upright: the whole burst, OCR alongside, one server call.
  const [embedding, uprightOcr] = await Promise.all([deps.embedBurst(capture.cards), deps.ocr(capture.best, 0)]);
  const uprightPrinting = printingQuery(uprightOcr);
  const uprightServer = await deps.match({ embedding, printing: uprightPrinting });
  const uprightResult = rank(uprightServer, uprightOcr, 0, capture.best);
  const upright: OrientedRecognition = {
    orientation: 0,
    orientationsTried: [0],
    card: capture.best,
    ocr: uprightOcr,
    server: uprightServer,
    result: uprightResult,
  };
  const turns = candidates.filter((o) => o !== 0).slice(0, MAX_ALTERNATES);
  if (turns.length === 0 || !needsOrientationRetry(uprightResult, uprightServer.matches)) return upright;

  // Not sure: embed the sharpest frame in each other orientation, one call.
  // One at a time: ORT web sessions don't run concurrently.
  const turned: RgbaImage[] = [];
  const alternates: number[][] = [];
  for (const orientation of turns) {
    const card = rotateImage(capture.best, orientation);
    turned.push(card);
    alternates.push(await deps.embed(card));
  }
  const orientationsTried: Orientation[] = [0, ...turns];
  const server = await deps.match({ embedding, alternates, printing: uprightPrinting });
  if (!imageCanTellOrientation(server)) {
    // No card pictures to compare against (or none close): let the text decide.
    return (await readUpsideDown(capture, deps, { upright, server, turns, turned, alternates })) ?? {
      ...upright,
      orientationsTried,
      server,
    };
  }
  const variant = server.variant ?? 0;
  // Upright still wins: same matches as before, now with the variant scores.
  if (variant <= 0 || variant > turns.length) return { ...upright, orientationsTried, server };

  const orientation = turns[variant - 1]!;
  const card = turned[variant - 1]!;
  // The upright OCR read the card the wrong way round; read it again this way.
  const ocr = await deps.ocr(card, orientation);
  const printing = printingQuery(ocr);
  let final: ScanMatchResult = { ...server, printing: null };
  if (printing) {
    final = samePrinting(printing, uprightPrinting)
      ? server
      : {
          ...(await deps.match({ embedding: alternates[variant - 1]!, printing })),
          variant,
          variantSimilarities: server.variantSimilarities,
        };
  }
  return { orientation, orientationsTried, card, ocr, server: final, result: rank(final, ocr, orientation, card) };
}
