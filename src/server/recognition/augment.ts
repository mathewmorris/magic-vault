/**
 * Cheap photo-like damage for card images, used by
 * scripts/calibrate-embedder.ts to turn clean Scryfall scans into stand-ins
 * for camera crops: a slightly off crop, lighting changes, a glare spot and
 * a little blur. Pure TypeScript on RGBA bytes, seeded so runs repeat.
 */

import { type RgbaImage } from "../../utils/recognition/preprocess";

export type Rng = () => number;

/** mulberry32: small, fast, good enough for test data. Returns [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, min: number, max: number) => min + (max - min) * rng();
const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export type Point = { x: number; y: number };
/** Top-left, top-right, bottom-right, bottom-left, in source pixel coordinates. */
export type Quad = [Point, Point, Point, Point];

/** Corners of the whole image, nudged by up to `maxFraction` of its size each way. */
export function jitterCorners(width: number, height: number, rng: Rng, maxFraction = 0.04): Quad {
  const dx = () => between(rng, -maxFraction, maxFraction) * width;
  const dy = () => between(rng, -maxFraction, maxFraction) * height;
  const w = width - 1;
  const h = height - 1;
  return [
    { x: dx(), y: dy() },
    { x: w + dx(), y: dy() },
    { x: w + dx(), y: h + dy() },
    { x: dx(), y: h + dy() },
  ];
}

/**
 * Re-samples `quad` of the source into a width x height image. The mapping
 * is a bilinear blend of the four corners (not a true homography), which is
 * close enough for small jitter. Points outside the source get `fill`, like
 * a table showing past the card's edge.
 */
export function warpQuad(
  src: RgbaImage,
  quad: Quad,
  width = src.width,
  height = src.height,
  fill: [number, number, number] = [24, 24, 24],
): RgbaImage {
  const out = new Uint8ClampedArray(width * height * 4);
  const [tl, tr, br, bl] = quad;
  for (let y = 0; y < height; y++) {
    const v = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = width === 1 ? 0 : x / (width - 1);
      const sx = (1 - v) * ((1 - u) * tl.x + u * tr.x) + v * ((1 - u) * bl.x + u * br.x);
      const sy = (1 - v) * ((1 - u) * tl.y + u * tr.y) + v * ((1 - u) * bl.y + u * br.y);
      const o = (y * width + x) * 4;
      if (sx < -0.5 || sy < -0.5 || sx > src.width - 0.5 || sy > src.height - 0.5) {
        out[o] = fill[0];
        out[o + 1] = fill[1];
        out[o + 2] = fill[2];
        out[o + 3] = 255;
        continue;
      }
      const cx = Math.min(Math.max(sx, 0), src.width - 1);
      const cy = Math.min(Math.max(sy, 0), src.height - 1);
      const x0 = Math.floor(cx);
      const y0 = Math.floor(cy);
      const x1 = Math.min(x0 + 1, src.width - 1);
      const y1 = Math.min(y0 + 1, src.height - 1);
      const fx = cx - x0;
      const fy = cy - y0;
      for (let c = 0; c < 4; c++) {
        const top = src.data[(y0 * src.width + x0) * 4 + c]! * (1 - fx) + src.data[(y0 * src.width + x1) * 4 + c]! * fx;
        const bottom =
          src.data[(y1 * src.width + x0) * 4 + c]! * (1 - fx) + src.data[(y1 * src.width + x1) * 4 + c]! * fx;
        out[o + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return { data: out, width, height };
}

/** out = (in - 128) * contrast + 128 + brightness, per RGB channel. */
export function brightnessContrast(src: RgbaImage, brightness: number, contrast: number): RgbaImage {
  const out = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    for (let c = 0; c < 3; c++) out[i + c] = clampByte((src.data[i + c]! - 128) * contrast + 128 + brightness);
    out[i + 3] = src.data[i + 3]!;
  }
  return { data: out, width: src.width, height: src.height };
}

export type Glare = { cx: number; cy: number; rx: number; ry: number; strength: number };

/** Blends toward white inside an ellipse, strongest in the middle and fading smoothly to its edge. */
export function addGlare(src: RgbaImage, glare: Glare): RgbaImage {
  const out = new Uint8ClampedArray(src.data);
  const { cx, cy, rx, ry, strength } = glare;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(src.width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(src.height - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1) continue;
      const a = strength * (1 - d) ** 2;
      const i = (y * src.width + x) * 4;
      for (let c = 0; c < 3; c++) out[i + c] = clampByte(out[i + c]! * (1 - a) + 255 * a);
    }
  }
  return { data: out, width: src.width, height: src.height };
}

/** Separable box blur with edge clamping. radius 0 is a copy. */
export function boxBlur(src: RgbaImage, radius: number): RgbaImage {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height };
  const { width, height } = src;
  const pass = (input: ArrayLike<number>, horizontal: boolean) => {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const xx = horizontal ? Math.min(Math.max(x + k, 0), width - 1) : x;
            const yy = horizontal ? y : Math.min(Math.max(y + k, 0), height - 1);
            sum += input[(yy * width + xx) * 4 + c]!;
          }
          out[o + c] = sum / (2 * r + 1);
        }
      }
    }
    return out;
  };
  return { data: pass(pass(src.data, true), false), width, height };
}

export type AugmentOptions = { maxCornerJitter: number; glare: boolean; blurRadius: number };

const DEFAULT_AUGMENT: AugmentOptions = { maxCornerJitter: 0.04, glare: true, blurRadius: 1 };

/**
 * One photo-like copy of a clean card image: corner jitter (up to 4% per
 * corner), brightness +-30 and contrast 0.8-1.2, an elliptical glare spot,
 * then a mild blur.
 */
export function augmentCard(src: RgbaImage, rng: Rng, options: Partial<AugmentOptions> = {}): RgbaImage {
  const opts = { ...DEFAULT_AUGMENT, ...options };
  let img = warpQuad(src, jitterCorners(src.width, src.height, rng, opts.maxCornerJitter));
  img = brightnessContrast(img, between(rng, -30, 30), between(rng, 0.8, 1.2));
  if (opts.glare) {
    img = addGlare(img, {
      cx: between(rng, 0.15, 0.85) * img.width,
      cy: between(rng, 0.15, 0.85) * img.height,
      rx: between(rng, 0.08, 0.25) * img.width,
      ry: between(rng, 0.05, 0.18) * img.height,
      strength: between(rng, 0.5, 0.9),
    });
  }
  return boxBlur(img, opts.blurRadius);
}
