/**
 * Plane geometry for finding and flattening a card in a camera frame.
 * Pure TypeScript on RgbaImage (see ./preprocess), no DOM, so it runs in the
 * browser, in a worker and under Jest alike.
 *
 * Coordinates are image pixels with y pointing down. A point (x, y) is a
 * continuous position: pixel (i, j) covers [i, i + 1) x [j, j + 1) and its
 * center is (i + 0.5, j + 0.5).
 */

import type { RgbaImage } from "./preprocess";

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL

const DEG = Math.PI / 180;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Shoelace area, always positive. */
export function quadArea(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Average lengths of the quad's top/bottom and left/right sides. */
export function quadSides(quad: Quad): { horizontal: number; vertical: number } {
  const [tl, tr, br, bl] = quad;
  return {
    horizontal: (distance(tl, tr) + distance(bl, br)) / 2,
    vertical: (distance(tl, bl) + distance(tr, br)) / 2,
  };
}

/**
 * Put 4 corners, given in any order, into TL, TR, BR, BL order (clockwise on
 * screen).
 *
 * The points are sorted by angle around their centroid, then the one whose
 * direction from the centroid is closest to "up and to the left" becomes TL.
 * That holds for a card rotated up to about 45 degrees either way.
 *
 * The result is always portrait: if the top edge comes out longer than the
 * left edge (a card held sideways), the order is turned a quarter so the long
 * sides are left and right. The new top is the quad's old left edge, i.e. a
 * sideways card is assumed to have its top on the left of the screen (turned
 * a quarter counter-clockwise).
 *
 * What this can't know: which way up the card is. A card held upside down (or
 * sideways the other way) comes out rotated 180 degrees. Callers that care
 * should try both the warp and `rotate180` of it; `isSideways` tells them the
 * quad was turned, and ../orientation.ts picks which turns of the warp to try.
 */
export function orderCorners(points: Point[]): Quad {
  if (points.length !== 4) throw new Error(`Expected 4 corners, got ${points.length}`);
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error("Corner is not finite");
  }
  const cx = points.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / 4;

  // atan2 with y down increases clockwise on screen.
  const sorted = points
    .map((p) => ({ p, angle: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((a, b) => a.angle - b.angle);

  const upLeft = -135 * DEG;
  let start = 0;
  let bestDiff = Infinity;
  sorted.forEach(({ angle }, i) => {
    let diff = Math.abs(angle - upLeft);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      start = i;
    }
  });

  const ordered = [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]!.p);
  let quad: Quad = [ordered[0]!, ordered[1]!, ordered[2]!, ordered[3]!];

  const { horizontal, vertical } = quadSides(quad);
  if (horizontal > vertical) {
    // Old left edge (BL -> TL) becomes the new top edge.
    quad = [quad[3], quad[0], quad[1], quad[2]];
  }
  return quad;
}

/** Interior angles of a convex quad in degrees, at TL, TR, BR, BL. */
function interiorAngles(quad: Quad): number[] {
  return quad.map((p, i) => {
    const prev = quad[(i + 3) % 4]!;
    const next = quad[(i + 1) % 4]!;
    const ax = prev.x - p.x;
    const ay = prev.y - p.y;
    const bx = next.x - p.x;
    const by = next.y - p.y;
    const denom = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (denom === 0) return 0;
    const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / denom));
    return Math.acos(cos) / DEG;
  });
}

export function isConvexQuad(quad: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(quad[i]!, quad[(i + 1) % 4]!, quad[(i + 2) % 4]!);
    if (!Number.isFinite(c) || c === 0) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export const PLAUSIBLE_CARD = {
  minAreaFraction: 0.06,
  minSideRatio: 1.15,
  maxSideRatio: 1.75,
  minAngleDegrees: 55,
} as const;

/**
 * Could this quad be a card seen by the camera? Convex, at least 6% of the
 * frame, long/short side ratio (opposite sides averaged) between 1.15 and
 * 1.75 (a flat card is 88/63 = 1.40; perspective stretches it), and no corner
 * sharper than 55 degrees.
 */
export function isPlausibleCardQuad(quad: Quad, frameWidth: number, frameHeight: number): boolean {
  if (!isConvexQuad(quad)) return false;
  if (quadArea(quad) < PLAUSIBLE_CARD.minAreaFraction * frameWidth * frameHeight) return false;
  const { horizontal, vertical } = quadSides(quad);
  const short = Math.min(horizontal, vertical);
  if (short <= 0) return false;
  const ratio = Math.max(horizontal, vertical) / short;
  if (ratio < PLAUSIBLE_CARD.minSideRatio || ratio > PLAUSIBLE_CARD.maxSideRatio) return false;
  return interiorAngles(quad).every((angle) => angle >= PLAUSIBLE_CARD.minAngleDegrees);
}

/** Solve A x = b in place with Gaussian elimination and partial pivoting. */
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) throw new Error("Homography is degenerate");
    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot]!, a[col]!];
      [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    }
    const rowCol = a[col]!;
    for (let row = col + 1; row < n; row++) {
      const r = a[row]!;
      const factor = r[col]! / rowCol[col]!;
      if (factor === 0) continue;
      for (let k = col; k < n; k++) r[k]! -= factor * rowCol[k]!;
      b[row]! -= factor * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row]!;
    for (let k = row + 1; k < n; k++) sum -= a[row]![k]! * x[k]!;
    x[row] = sum / a[row]![row]!;
  }
  return x;
}

/**
 * The 3x3 homography (row-major, h[8] = 1) that maps each src corner onto
 * the matching dst corner.
 */
export function homography(src: Quad, dst: Quad): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solveLinear(a, b), 1];
}

export function applyHomography(h: number[], p: Point): Point {
  const w = h[6]! * p.x + h[7]! * p.y + h[8]!;
  return {
    x: (h[0]! * p.x + h[1]! * p.y + h[2]!) / w,
    y: (h[3]! * p.x + h[4]! * p.y + h[5]!) / w,
  };
}

/**
 * Flatten the part of `image` inside `quad` into an outWidth x outHeight
 * image. quad[0] lands in the output's top-left corner, and so on clockwise.
 * Inverse mapping with bilinear sampling; samples past the image edge repeat
 * the edge pixel.
 */
export function warpQuad(image: RgbaImage, quad: Quad, outWidth: number, outHeight: number): RgbaImage {
  const { width: sw, height: sh, data: src } = image;
  if (sw <= 0 || sh <= 0) throw new Error("Image is empty");
  if (src.length < sw * sh * 4) throw new Error("Image data is too short");
  const rect: Quad = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];
  const h = homography(rect, quad);
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);

  for (let y = 0; y < outHeight; y++) {
    const oy = y + 0.5;
    for (let x = 0; x < outWidth; x++) {
      const ox = x + 0.5;
      const w = h[6]! * ox + h[7]! * oy + h[8]!;
      // Back to pixel-index space for sampling (centers at integers).
      const sx = Math.min(Math.max((h[0]! * ox + h[1]! * oy + h[2]!) / w - 0.5, 0), sw - 1);
      const sy = Math.min(Math.max((h[3]! * ox + h[4]! * oy + h[5]!) / w - 0.5, 0), sh - 1);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i01 = (y0 * sw + x1) * 4;
      const i10 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * outWidth + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c]! * (1 - fx) + src[i01 + c]! * fx;
        const bottom = src[i10 + c]! * (1 - fx) + src[i11 + c]! * fx;
        out[o + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return { data: out, width: outWidth, height: outHeight };
}

/**
 * Did this card lie sideways in the photo? True when the quad's long sides
 * (left and right after orderCorners) run more across the screen than up and
 * down. Works on a quad in any corner order: it looks at the longer pair of
 * opposite sides.
 */
export function isSideways(quad: Quad): boolean {
  const [tl, tr, br, bl] = quad;
  const { horizontal, vertical } = quadSides(quad);
  // The long pair: left/right (TL->BL, TR->BR) or top/bottom (TL->TR, BL->BR).
  const [a0, a1, b0, b1] = vertical >= horizontal ? [tl, bl, tr, br] : [tl, tr, bl, br];
  const dx = Math.abs(a1.x - a0.x) + Math.abs(b1.x - b0.x);
  const dy = Math.abs(a1.y - a0.y) + Math.abs(b1.y - b0.y);
  return dx > dy;
}

/** A clockwise quarter turn, in degrees. */
export type Orientation = 0 | 90 | 180 | 270;

/**
 * Turn an image clockwise by a multiple of 90 degrees. 90 and 270 swap the
 * width and height. 0 returns the same image object.
 */
export function rotateImage(image: RgbaImage, degrees: Orientation): RgbaImage {
  if (degrees === 0) return image;
  if (degrees === 180) return rotate180(image);
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(width * height * 4);
  // Output is height x width. Clockwise: source (x, y) lands at
  // (height - 1 - y, x); counter-clockwise (270): at (y, width - 1 - x).
  const outWidth = height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ox = degrees === 90 ? height - 1 - y : y;
      const oy = degrees === 90 ? x : width - 1 - x;
      const s = (y * width + x) * 4;
      const o = (oy * outWidth + ox) * 4;
      out[o] = data[s]!;
      out[o + 1] = data[s + 1]!;
      out[o + 2] = data[s + 2]!;
      out[o + 3] = data[s + 3]!;
    }
  }
  return { data: out, width: outWidth, height: width };
}

export function rotate180(image: RgbaImage): RgbaImage {
  const { width, height, data } = image;
  const pixels = width * height;
  const out = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const j = (pixels - 1 - i) * 4;
    out[i * 4] = data[j]!;
    out[i * 4 + 1] = data[j + 1]!;
    out[i * 4 + 2] = data[j + 2]!;
    out[i * 4 + 3] = data[j + 3]!;
  }
  return { data: out, width, height };
}

/**
 * Variance of the 3x3 Laplacian of luminance (0-255 scale). Higher is
 * sharper; use it to pick the best frame of a burst. Only compare images of
 * the same size and subject (e.g. warped crops of the same card).
 */
export function sharpness(image: RgbaImage): number {
  const { width, height, data } = image;
  if (width < 3 || height < 3) return 0;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    luma[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = luma[i - width]! + luma[i + width]! + luma[i - 1]! + luma[i + 1]! - 4 * luma[i]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * How far two detections of the same card moved: mean corner distance as a
 * fraction of the frame diagonal. 0 is identical; under ~0.02 is steady.
 */
export function quadStability(a: Quad, b: Quad, frameDiagonal: number): number {
  let total = 0;
  for (let i = 0; i < 4; i++) total += distance(a[i]!, b[i]!);
  return total / 4 / frameDiagonal;
}

/**
 * The quad grown (or shrunk) by `factor` about its centroid, corners in the
 * same order. 1.15 adds 7.5% of each side's length on every side.
 */
export function scaleQuad(quad: Quad, factor: number): Quad {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  return quad.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor })) as unknown as Quad;
}

/** An axis-aligned rectangle as a TL, TR, BR, BL quad. */
export function rectToQuad(rect: { x: number; y: number; width: number; height: number }): Quad {
  const { x, y, width, height } = rect;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}
