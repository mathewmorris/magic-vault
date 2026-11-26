/**
 * A burst of camera frames -> flattened card crops, ready to embed and OCR.
 */

import { CARD_HEIGHT, CARD_WIDTH } from "../model";
import type { RgbaImage } from "../preprocess";
import { isPlausibleCardQuad, quadStability, sharpness, warpQuad } from "../geometry";
import { guideDetection, type CardDetector, type Detection } from "./detector";

export type CardCapture = { detection: Detection; cards: RgbaImage[]; best: RgbaImage };

/**
 * Detections that move more than this (mean corner distance / frame
 * diagonal) from the sharpest frame's are treated as misdetections and left
 * out of the burst.
 */
export const MAX_BURST_DRIFT = 0.08;

type Warped = { detection: Detection; card: RgbaImage; sharpness: number; diagonal: number };

/**
 * Detect the card in each frame, warp every plausible detection to
 * CARD_WIDTH x CARD_HEIGHT, and pick the sharpest as `best`. `cards` holds
 * the crops consistent with the best one, in frame order. Returns null when
 * no frame had a card, unless allowGuideFallback is set, in which case the
 * on-screen guide rectangle is warped instead (source "guide").
 */
export async function captureCard(
  frames: RgbaImage[],
  detector: CardDetector,
  opts: { allowGuideFallback?: boolean } = {},
): Promise<CardCapture | null> {
  if (frames.length === 0) return null;

  const warped: Warped[] = [];
  for (const frame of frames) {
    let detection: Detection | null = null;
    try {
      detection = await detector.detect(frame);
    } catch (error) {
      console.warn("Card detection failed on a frame:", error);
    }
    if (!detection || !isPlausibleCardQuad(detection.quad, frame.width, frame.height)) continue;
    const card = warpQuad(frame, detection.quad, CARD_WIDTH, CARD_HEIGHT);
    warped.push({ detection, card, sharpness: sharpness(card), diagonal: Math.hypot(frame.width, frame.height) });
  }

  if (warped.length === 0) {
    if (!opts.allowGuideFallback) return null;
    for (const frame of frames) {
      const detection = guideDetection(frame.width, frame.height);
      const card = warpQuad(frame, detection.quad, CARD_WIDTH, CARD_HEIGHT);
      warped.push({ detection, card, sharpness: sharpness(card), diagonal: Math.hypot(frame.width, frame.height) });
    }
  }

  const best = warped.reduce((a, b) => (b.sharpness > a.sharpness ? b : a));
  const consistent = warped.filter(
    (w) => w === best || quadStability(w.detection.quad, best.detection.quad, best.diagonal) <= MAX_BURST_DRIFT,
  );
  return { detection: best.detection, cards: consistent.map((w) => w.card), best: best.card };
}
