/**
 * Where the text we OCR sits on a flattened card (CARD_WIDTH x CARD_HEIGHT,
 * the same 488x680 proportions as Scryfall's "normal" image).
 *
 * Every region is a fraction of the card's width and height so it works at
 * any scale. The card is warped from a photo, so corners are never perfect;
 * each region runs a few percent past the text on every side.
 *
 * Measured against the M15 frame (2015 onward), which is what nearly every
 * card printed since then uses:
 *  - Title: the name sits on the title bar from about 4.5% to 9.5% of the
 *    height, starting about 7% in from the left. The mana cost is on the same
 *    line at the right; extractCardName drops it.
 *  - Collector info: two lines of small print under the text box, bottom
 *    left, from about 90% to 96% of the height:
 *      "0157/280 R" / "M21 • EN  <brush> Artist"   (2015 to 2022)
 *      "R 0157"     / "MKM • EN  <brush> Artist"   (2023 onward)
 *    The right half of those lines is the copyright line and the P/T box, so
 *    the region stops at about the middle of the card.
 *  - Old frame (before 8th Edition): the title bar sits a little lower and
 *    looser, so its rect is taller and wider.
 *
 * Colour cues (colourCues.ts) read two more places:
 *  - Border: the printed border is about 3 mm on a 63x88 mm card, about 22
 *    px on all four sides at 488x680. The strips sit from about 5 to 15 px
 *    in from each edge: past the outermost pixels, where a slightly off warp
 *    shows the table, and short of the frame that starts at about 18 px.
 *    They skip the first and last 8% of each side so the rounded corners
 *    (about 3 mm radius) stay out.
 *  - Set symbol: right end of the type line, M15 frame. The type line bar
 *    runs from about 55.5% to 60% of the height; the symbol is about 20 to
 *    35 px wide and 20 to 24 px tall, right-aligned at about 92% of the
 *    width. The rect runs from 80% to 95.5% across and 53.5% to 62.5% down,
 *    a few percent past the symbol on every side for warp error. It also
 *    fits the 2003 frame (8th Edition to M14). Pre-2003 frames put the
 *    symbol elsewhere or print none.
 *  These two are worked out from the frame's printed proportions, not yet
 *  measured on Scryfall's images like the title and collector rects; the
 *  set symbol rect is generous to cover the difference.
 */

import type { Rect } from "~/utils/scan/cardGuide";

/** A rectangle as fractions (0 to 1) of the card's width and height. */
export type CardRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const CARD_REGIONS = {
  /** The name on the title bar, M15 and later frames. */
  title: { left: 0.05, top: 0.032, width: 0.9, height: 0.078 },
  /** The name on a pre-8th Edition frame, which sits lower and less exactly. */
  titleOldFrame: { left: 0.04, top: 0.03, width: 0.92, height: 0.1 },
  /** The two-line collector info block, bottom left. */
  collector: { left: 0.025, top: 0.885, width: 0.5, height: 0.095 },
  /** The printed border, four thin strips inside the outer edge, corners left out. */
  borderTop: { left: 0.08, top: 0.008, width: 0.84, height: 0.014 },
  borderBottom: { left: 0.08, top: 0.978, width: 0.84, height: 0.014 },
  borderLeft: { left: 0.01, top: 0.08, width: 0.02, height: 0.84 },
  borderRight: { left: 0.97, top: 0.08, width: 0.02, height: 0.84 },
  /** The set symbol at the right end of the type line, M15 and 2003 frames. */
  setSymbol: { left: 0.8, top: 0.535, width: 0.155, height: 0.09 },
} as const satisfies Record<string, CardRegion>;

/**
 * Wider bands for the loose crop (the card warped with its quad grown by
 * LOOSE_SCALE, see browser/pipeline.ts), as fractions of that crop. The card
 * itself sits from about 11.5% to 88.5% of it each way. These bands cover where
 * the name and the collector lines land even when a detected corner was off
 * by several percent, which the tight rects above can't.
 */
export const LOOSE_REGIONS = {
  /** The top of the card: the title bar and some of the art under it. */
  title: { left: 0.06, top: 0.02, width: 0.88, height: 0.2 },
  /** The bottom left: both collector lines and a little of the text box. */
  collector: { left: 0.06, top: 0.76, width: 0.48, height: 0.2 },
} as const satisfies Record<string, CardRegion>;

export type CardRegionName = keyof typeof CARD_REGIONS;

/**
 * A region in pixels for an image of the given size, rounded outward to
 * whole pixels and clamped to the image.
 */
export function regionRect(region: CardRegion, width: number, height: number): Rect {
  const x0 = Math.max(0, Math.floor(region.left * width));
  const y0 = Math.max(0, Math.floor(region.top * height));
  const x1 = Math.min(width, Math.ceil((region.left + region.width) * width));
  const y1 = Math.min(height, Math.ceil((region.top + region.height) * height));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}
