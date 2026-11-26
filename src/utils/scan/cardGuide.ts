export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A Magic card is 63mm x 88mm. */
export const CARD_ASPECT_RATIO = 63 / 88;

/**
 * Where on the title bar the name sits, as fractions of the card. The real
 * title box runs from about 4% to 10% of the card's height; we take a bit
 * more on each side because the card is never lined up perfectly.
 */
export const TITLE_STRIP = {
  left: 0.04,
  top: 0.025,
  width: 0.92,
  height: 0.1,
} as const;

/**
 * The card-shaped guide we draw over the camera feed, centered in the frame
 * and filling `fill` of whichever side runs out first.
 */
export function cardGuideRect(frameWidth: number, frameHeight: number, fill = 0.85): Rect {
  let height = frameHeight * fill;
  let width = height * CARD_ASPECT_RATIO;

  if (width > frameWidth * fill) {
    width = frameWidth * fill;
    height = width / CARD_ASPECT_RATIO;
  }

  return {
    x: (frameWidth - width) / 2,
    y: (frameHeight - height) / 2,
    width,
    height,
  };
}

/** The title strip inside a card rectangle. */
export function titleStripRect(card: Rect): Rect {
  return {
    x: card.x + card.width * TITLE_STRIP.left,
    y: card.y + card.height * TITLE_STRIP.top,
    width: card.width * TITLE_STRIP.width,
    height: card.height * TITLE_STRIP.height,
  };
}
