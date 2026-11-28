/**
 * Snap a roughly right card quad onto the card's real edges.
 *
 * The corner model gets close but not exact: in the browser check its
 * top-left corner lands about 7% inside the card, which tilts and clips the
 * name in the flattened card so OCR can't read it. Each side of the card is a
 * straight edge, so this looks along each side of the quad for the card's
 * outline and fits a line to it, then takes the corners where the four lines
 * meet.
 *
 * For each side it samples brightness along short lines across the side
 * (perpendicular to it), finds where brightness steps, and keeps the
 * outermost clear step: a card's outline is its outermost edge, while the
 * frame, the title bar and the art make more edges further in. A line is
 * fitted through those points, ignoring stragglers. When a side has too few
 * points, or the result isn't a plausible card, the input quad is returned
 * unchanged, so this can only help.
 *
 * Pure TypeScript on RgbaImage, so it runs anywhere and is unit tested.
 */

import { isPlausibleCardQuad, type Point, type Quad } from "./geometry";
import type { RgbaImage } from "./preprocess";

export type RefineOptions = {
  /** How far either side of each quad side to look, as a fraction of the card's short side. */
  searchFraction?: number;
  /** Samples along each side. */
  samples?: number;
  /** A step counts when it's at least this fraction of the strongest step on its line... */
  relativeThreshold?: number;
  /** ...and at least this many brightness levels (0 to 255) per pixel. */
  minStep?: number;
  /** Largest move allowed for any corner, as a fraction of the card's short side. */
  maxMoveFraction?: number;
};

const DEFAULTS: Required<RefineOptions> = {
  searchFraction: 0.12,
  samples: 31,
  relativeThreshold: 0.08,
  minStep: 7,
  maxMoveFraction: 0.15,
};

type Line = { point: Point; dir: Point };

/** Brightness (0 to 255) at a continuous position, bilinear, clamped to the image. */
function luma(image: RgbaImage, x: number, y: number): number {
  const { width, height, data } = image;
  const sx = Math.min(Math.max(x - 0.5, 0), width - 1);
  const sy = Math.min(Math.max(y - 0.5, 0), height - 1);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = sx - x0;
  const fy = sy - y0;
  const at = (px: number, py: number) => {
    const i = (py * width + px) * 4;
    return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  };
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Offset (along `normal`, outward positive) of the outermost clear brightness
 * step on a line across the side at `p`, or null when there is none.
 */
function outermostStep(
  image: RgbaImage,
  p: Point,
  normal: Point,
  tangent: Point,
  range: number,
  opts: Required<RefineOptions>,
): number | null {
  const n = Math.ceil(range);
  const profile: number[] = [];
  for (let s = -n; s <= n; s++) {
    // Average three parallel lines a pixel apart to calm noise and texture.
    let sum = 0;
    for (const t of [-1, 0, 1]) {
      sum += luma(image, p.x + normal.x * s + tangent.x * t, p.y + normal.y * s + tangent.y * t);
    }
    profile.push(sum / 3);
  }
  const steps: number[] = new Array<number>(profile.length).fill(0);
  let strongest = 0;
  for (let i = 1; i < profile.length - 1; i++) {
    steps[i] = Math.abs(profile[i + 1]! - profile[i - 1]!) / 2;
    strongest = Math.max(strongest, steps[i]!);
  }
  const threshold = Math.max(opts.minStep, strongest * opts.relativeThreshold);
  for (let i = profile.length - 2; i >= 1; i--) {
    const g = steps[i]!;
    if (g >= threshold && g >= steps[i - 1]! && g >= steps[i + 1]!) return i - n;
  }
  return null;
}

/** Least-squares line through points (total least squares, so any angle works). */
function fitLine(points: Point[]): Line {
  const cx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const cy = points.reduce((a, p) => a + p.y, 0) / points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - cx) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
    syy += (p.y - cy) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { point: { x: cx, y: cy }, dir: { x: Math.cos(angle), y: Math.sin(angle) } };
}

function distanceToLine(p: Point, line: Line): number {
  return Math.abs((p.x - line.point.x) * line.dir.y - (p.y - line.point.y) * line.dir.x);
}

/** A line through the side's edge points, dropping ones well off the first fit. */
function robustLine(points: Point[]): Line {
  let line = fitLine(points);
  for (const tolerance of [4, 2]) {
    const kept = points.filter((p) => distanceToLine(p, line) <= tolerance);
    if (kept.length < Math.max(4, points.length / 2)) break;
    line = fitLine(kept);
  }
  return line;
}

function intersect(a: Line, b: Line): Point | null {
  const det = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((b.point.x - a.point.x) * b.dir.y - (b.point.y - a.point.y) * b.dir.x) / det;
  return { x: a.point.x + a.dir.x * t, y: a.point.y + a.dir.y * t };
}

/**
 * The card's quad snapped to its edges in `frame`, or `quad` itself when the
 * edges can't be found with confidence. Corner order is kept (TL, TR, BR, BL).
 */
export function refineQuad(frame: RgbaImage, quad: Quad, options: RefineOptions = {}): Quad {
  const opts = { ...DEFAULTS, ...options };
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const sideLength = (i: number) => Math.hypot(quad[(i + 1) % 4]!.x - quad[i]!.x, quad[(i + 1) % 4]!.y - quad[i]!.y);
  const shortSide = Math.min(
    (sideLength(0) + sideLength(2)) / 2,
    (sideLength(1) + sideLength(3)) / 2,
  );
  if (!(shortSide > 0)) return quad;
  const range = shortSide * opts.searchFraction;

  const lines: Line[] = [];
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    let normal = { x: -tangent.y, y: tangent.x };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Outward: away from the quad's centre.
    if ((mid.x - cx) * normal.x + (mid.y - cy) * normal.y < 0) normal = { x: -normal.x, y: -normal.y };

    const points: Point[] = [];
    for (let k = 0; k < opts.samples; k++) {
      // Keep away from the corners, which may be well off and are rounded.
      const t = 0.12 + (0.76 * k) / (opts.samples - 1);
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const s = outermostStep(frame, p, normal, tangent, range, opts);
      if (s !== null) points.push({ x: p.x + normal.x * s, y: p.y + normal.y * s });
    }
    if (points.length < Math.max(6, opts.samples / 3)) return quad;
    lines.push(robustLine(points));
  }

  const corners: Point[] = [];
  for (let i = 0; i < 4; i++) {
    // Corner i is where side i-1 (into it) meets side i (out of it).
    const corner = intersect(lines[(i + 3) % 4]!, lines[i]!);
    if (!corner || !Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return quad;
    if (Math.hypot(corner.x - quad[i]!.x, corner.y - quad[i]!.y) > shortSide * opts.maxMoveFraction) return quad;
    corners.push(corner);
  }
  const refined = corners as Quad;
  return isPlausibleCardQuad(refined, frame.width, frame.height) ? refined : quad;
}
