/**
 * The rules behind the AI scanner's hands-free loop: when a scan is sure
 * enough to add the card by itself, how many looks it takes at a card it
 * isn't sure about before asking, and how big a camera frame has to be for
 * the models to read the card.
 *
 * Pure, so the numbers are unit tested and live in one place.
 */

import { CONFIDENT_SIMILARITY, type RecognitionCandidate, type RecognitionResult } from "./fuse";
import type { Quad } from "./geometry";
import { CARD_HEIGHT } from "./model";

/**
 * Auto add threshold. A scan adds its top match to the collection by itself
 * only when fuse.ts calls the ranking `confident` (nothing contradicts the
 * pick, and it leads the runner-up with two of image, name and collector
 * agreeing, or it's the exact printing the collector line names and the name
 * agrees) AND the top pick's fused score is at least this.
 *
 * `confident` is the real decision. The score floor is a backstop that
 * almost never bites: a confident pick normally scores well over it (an
 * image match alone needs 0.8 similarity to be confident, and the name and
 * collector bonuses add on top). It's here so there's one knob to turn if
 * real scans show confident picks that are wrong.
 */
export const AUTO_ADD_MIN_SCORE = CONFIDENT_SIMILARITY;

/**
 * Looks at one card before giving up on being sure: the first scan plus up
 * to two more bursts while it sits there. After that the matches list is
 * shown for a manual pick.
 */
export const MAX_SCAN_ATTEMPTS = 3;

/** The top pick if this result is sure enough to add on its own, else null. */
export function sureMatch(result: RecognitionResult | null): RecognitionCandidate | null {
  const top = result?.candidates[0];
  if (!result?.confident || !top) return null;
  return top.score >= AUTO_ADD_MIN_SCORE ? top : null;
}

/**
 * Of several unsure looks at the same card, the one to show: the one whose
 * top pick scored best. Results with no candidates lose to any with some.
 */
export function bestOf<T extends { result: RecognitionResult | null }>(a: T | null, b: T): T {
  const score = (entry: T | null) => entry?.result?.candidates[0]?.score ?? -Infinity;
  return a && score(a) >= score(b) ? a : b;
}

/**
 * Longest side capture frames are scaled to when no card is in view (the
 * Scan now fallback) or the card is small in the frame. About what a 720p
 * camera gives; a card filling half the frame is then about 640 px tall,
 * which the warp only has to stretch a little to CARD_HEIGHT.
 */
export const CAPTURE_MAX_SIDE = 1280;

/**
 * Never go below this: the corner model looks at a 640x640 input, so a
 * smaller frame would only be upscaled again before detection.
 */
export const CAPTURE_MIN_SIDE = 640;

/**
 * How much bigger than the flattened card (CARD_HEIGHT, 680 px) the card
 * should be in the frame. Some room for the card moving a little closer or
 * further between the live frame and the burst, and for the warp's bilinear
 * sampling, which reads small text best when it isn't shrinking much.
 */
export const CAPTURE_CARD_HEADROOM = 1.25;

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The longest side to scale a capture frame to, given where the card was in
 * the last live frame (in that frame's pixels).
 *
 * Everything the models see comes from the card warped to 488x680: the
 * embedder squashes that to 320x448, and OCR reads the title and collector
 * line off it (upscaling those strips 2 to 3 times). Frame pixels past what
 * puts the card at about CARD_HEIGHT * CAPTURE_CARD_HEADROOM tall add
 * nothing to the warp, and since the warp doesn't filter when it shrinks,
 * a much bigger card actually reads worse. So a card held close is captured
 * from a smaller frame, and a small card keeps the full CAPTURE_MAX_SIDE.
 * The collector line's tiny print never gets fewer pixels than the warp
 * keeps anyway.
 */
export function captureMaxSide(quad: Quad | null, frameWidth: number, frameHeight: number): number {
  const longSide = Math.max(frameWidth, frameHeight);
  if (!quad || longSide <= 0) return CAPTURE_MAX_SIDE;
  const [tl, tr, br, bl] = quad;
  const across = (distance(tl, tr) + distance(bl, br)) / 2;
  const down = (distance(tl, bl) + distance(tr, br)) / 2;
  const cardLong = Math.max(across, down);
  if (!(cardLong > 0)) return CAPTURE_MAX_SIDE;
  const wanted = Math.ceil((longSide * CARD_HEIGHT * CAPTURE_CARD_HEADROOM) / cardLong);
  return Math.min(CAPTURE_MAX_SIDE, Math.max(CAPTURE_MIN_SIDE, wanted));
}
