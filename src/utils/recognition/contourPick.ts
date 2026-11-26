/**
 * Choose the card among polygons that OpenCV's contour search found. Pure so
 * it's testable without OpenCV; browser/detector.ts does the OpenCV calls.
 */

import { isPlausibleCardQuad, orderCorners, quadArea, quadSides, type Point, type Quad } from "./geometry";

export type ContourCandidate = {
  points: Point[];
  /**
   * "poly": approxPolyDP of a contour came out with 4 corners (best).
   * "minAreaRect": the rotated bounding box of a contour, a second chance
   * when the outline is too ragged to simplify to 4 corners.
   */
  kind: "poly" | "minAreaRect";
  /** The contour's own area, to check how well a bounding box fits it. */
  contourArea?: number;
};

const CARD_RATIO = 88 / 63;
/** A minAreaRect must be at least this full of its contour to count. */
export const MIN_RECT_FILL = 0.75;

/** 1 for an exact card ratio, falling to 0 half a ratio away. */
function ratioFit(quad: Quad): number {
  const { horizontal, vertical } = quadSides(quad);
  const ratio = Math.max(horizontal, vertical) / Math.min(horizontal, vertical);
  return Math.max(0, 1 - Math.abs(ratio - CARD_RATIO) / 0.5);
}

/**
 * The largest plausible 4-corner polygon, falling back to the largest
 * plausible bounding box. Score is a rough confidence in (0, 1): polygons
 * up to 0.7, bounding boxes up to 0.5, scaled by how card-shaped they are.
 */
export function pickCardQuad(
  candidates: ContourCandidate[],
  frameWidth: number,
  frameHeight: number,
): { quad: Quad; score: number; kind: ContourCandidate["kind"] } | null {
  let best: { quad: Quad; score: number; kind: ContourCandidate["kind"]; area: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.points.length !== 4) continue;
    let quad: Quad;
    try {
      quad = orderCorners(candidate.points);
    } catch {
      continue;
    }
    if (!isPlausibleCardQuad(quad, frameWidth, frameHeight)) continue;
    const area = quadArea(quad);
    if (candidate.kind === "minAreaRect" && candidate.contourArea !== undefined) {
      if (candidate.contourArea / area < MIN_RECT_FILL) continue;
    }
    const score = (candidate.kind === "poly" ? 0.7 : 0.5) * (0.5 + 0.5 * ratioFit(quad));
    const better =
      !best ||
      (candidate.kind === "poly" && best.kind !== "poly") ||
      (candidate.kind === best.kind && area > best.area);
    if (better) best = { quad, score, kind: candidate.kind, area };
  }
  return best && { quad: best.quad, score: best.score, kind: best.kind };
}

/** The 4 corners of an OpenCV RotatedRect (angle in degrees), in no particular order. */
export function rotatedRectPoints(rect: {
  center: { x: number; y: number };
  size: { width: number; height: number };
  angle: number;
}): Point[] {
  const t = (rect.angle * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const hw = rect.size.width / 2;
  const hh = rect.size.height / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([dx, dy]) => ({
    x: rect.center.x + dx! * cos - dy! * sin,
    y: rect.center.y + dx! * sin + dy! * cos,
  }));
}
