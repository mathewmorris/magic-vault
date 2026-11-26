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
