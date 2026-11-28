/**
 * Two colour cues a person uses to tell printings of the same card apart,
 * read off the flattened card (CARD_WIDTH x CARD_HEIGHT, see model.ts):
 *
 *  - sampleBorder: the printed border's colour. Separates white-bordered
 *    core set and early reprints from the black-bordered originals, silver
 *    and gold bordered oddities, and borderless printings. Compare with
 *    Scryfall's border_color.
 *  - sampleRarityColour: the set symbol's colour on the type line (black,
 *    silver, gold, orange-red). Separates reprints at different rarities.
 *    Compare with Scryfall's rarity, only for candidates whose frame is 2003
 *    or later (see below).
 *
 * Both are pure functions on RGBA bytes, like preprocess.ts. Each returns a
 * value and a quality from 0 to 1, or null when it can't tell. Quality is
 * how far to trust the reading, not a probability: it drops with glare
 * (blown highlights), a strip or symbol that isn't one clean colour, a
 * dark image and a blurry one. A caller should treat a low quality reading
 * as weak evidence and null as no evidence.
 *
 * Shared steps:
 *  - White balance: colours are scaled by the brightest 2% of the card per
 *    channel (the text box or a white border), within limits, so a warm
 *    lamp doesn't turn a white border gold or a silver symbol gold.
 *  - Exposure: how bright that white point was before scaling. Too dark and
 *    both cues give up.
 *  - Sharpness: RMS of the luminance Laplacian over the middle of the card.
 *
 * The thresholds were set on synthetic images built from typical printed
 * colours (black border about 20/255, white about 235, silver about 165
 * grey, gold about 200/165/90, yellow about 245/215/35; symbols black,
 * silver grey, gold about 215/175/70, mythic orange-red about 220/90/30),
 * not calibrated on real photos yet. The sharpness reference in particular
 * is a guess.
 *
 * Known failure modes:
 *  - Foil glare and sleeves: a glossy sleeve or a foil adds broad highlights
 *    that aren't fully blown, which can wash a gold symbol out to silver or
 *    break up a border. Blown pixels are left out and lower the quality, the
 *    rest is only caught through lower uniformity.
 *  - A borderless card whose art is dark at all four edges reads as black.
 *  - A loose crop (the warp includes table past the card edge) can make a
 *    bordered card look borderless.
 *  - Pre-Exodus cards print every symbol black, and pre-2003 frames put the
 *    symbol in other places; the reading means nothing there. Only use the
 *    rarity cue for candidates whose Scryfall frame is "2003" or later.
 *  - Special rarities (timeshifted purple, "bonus") aren't read: a symbol
 *    that's neither black, silver, gold nor orange-red gives null.
 */

import { CARD_REGIONS, regionRect, type CardRegion } from "./cardRegions";
import type { RgbaImage } from "./preprocess";

/** Scryfall's border_color values. */
export type BorderColour = "black" | "white" | "borderless" | "silver" | "gold" | "yellow";
/** The four rarities a set symbol's colour tells apart. */
export type RarityColour = "common" | "uncommon" | "rare" | "mythic";
export type ColourCue<T extends string> = { value: T; quality: number };

type Rgb = [number, number, number];

/** Below this size there aren't enough pixels in the strips or the symbol. */
const MIN_WIDTH = 120;
const MIN_HEIGHT = 160;
/** A channel at or above this is a blown highlight (glare). */
const BLOWN = 250;
/** White point luminance (0..1) below which the image is too dark to read. */
const TOO_DARK = 0.12;
/** White point luminance at which exposure stops lowering quality. */
const WELL_EXPOSED = 0.45;
/** RMS Laplacian (0..1 luminance) treated as fully sharp. A guess; see checkImage. */
const SHARP_REFERENCE = 0.05;
/** Readings below this quality come back as null. */
const MIN_QUALITY = 0.05;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const luminance = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** Hue in degrees (0..360), saturation and value (0..1). */
function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (max === min) return [0, s, v];
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, v];
}

/** Value at the given fraction (0..1) of a 256-bin histogram of `count` samples. */
function histogramPercentile(hist: Uint32Array, count: number, fraction: number): number {
  const target = Math.max(1, Math.ceil(count * fraction));
  let seen = 0;
  for (let i = 0; i < 256; i++) {
    seen += hist[i]!;
    if (seen >= target) return i;
  }
  return 255;
}

type ImageCheck = {
  /** Per-channel white balance gain. */
  scale: Rgb;
  /** 0..1, how well exposed the card is. */
  exposure: number;
  /** 0..1, how sharp the card is. */
  sharpness: number;
};

/**
 * White point, exposure and sharpness of the whole card. Null when the image
 * is too small or too dark to read anything off.
 */
function checkImage(img: RgbaImage): ImageCheck | null {
  const { width, height, data } = img;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
  if (data.length < width * height * 4) return null;

  const hists = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let count = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      hists[0]![data[i]!]++;
      hists[1]![data[i + 1]!]++;
      hists[2]![data[i + 2]!]++;
      count++;
    }
  }
  const white = hists.map((h) => Math.max(1, histogramPercentile(h, count, 0.98))) as Rgb;
  const whiteLum = luminance(...white);
  if (whiteLum < TOO_DARK) return null;

  // Gain that takes the white point to 255, capped at 4x overall, with each
  // channel allowed to differ from the others by only so much: enough to
  // undo a lamp's warmth, not enough to make a gold border neutral.
  const raw = white.map((v) => 255 / v);
  const mean = (raw[0]! + raw[1]! + raw[2]!) / 3;
  const gain = Math.min(4, Math.max(1, mean));
  const scale = raw.map((r) => gain * Math.min(1.18, Math.max(0.85, r / mean))) as Rgb;

  // Sharpness: RMS of the luminance Laplacian over the middle 80% of the
  // card. Plain gradients barely drop with blur (an edge spread over more
  // pixels keeps its total rise); the second derivative does. Every third
  // pixel, an odd stride so it doesn't line up with any pattern.
  const lumAt = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return luminance(data[i]!, data[i + 1]!, data[i + 2]!);
  };
  let energy = 0;
  let samples = 0;
  for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y += 3) {
    for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += 3) {
      const laplacian = 4 * lumAt(x, y) - lumAt(x - 1, y) - lumAt(x + 1, y) - lumAt(x, y - 1) - lumAt(x, y + 1);
      energy += laplacian * laplacian;
      samples++;
    }
  }
  const sharpness = clamp01(samples ? Math.sqrt(energy / samples) / SHARP_REFERENCE : 0);
  const exposure = clamp01((whiteLum - TOO_DARK) / (WELL_EXPOSED - TOO_DARK));
  return { scale, exposure, sharpness };
}

/** Pixels of a region: white balanced colour, and whether the raw pixel was blown. */
function readRegion(img: RgbaImage, region: CardRegion, scale: Rgb) {
  const rect = regionRect(region, img.width, img.height);
  const n = rect.width * rect.height;
  const rgb = new Float32Array(n * 3);
  const blown = new Uint8Array(n);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const i = ((rect.y + y) * img.width + rect.x + x) * 4;
      const k = y * rect.width + x;
      const r = img.data[i]!;
      const g = img.data[i + 1]!;
      const b = img.data[i + 2]!;
      blown[k] = Math.min(r, g, b) >= BLOWN ? 1 : 0;
      rgb[k * 3] = Math.min(255, r * scale[0]);
      rgb[k * 3 + 1] = Math.min(255, g * scale[1]);
      rgb[k * 3 + 2] = Math.min(255, b * scale[2]);
    }
  }
  return { rect, rgb, blown, n };
}

/** Per-channel median of the pixels whose index passes `keep`. */
function medianColour(rgb: Float32Array, n: number, keep: (k: number) => boolean): Rgb | null {
  const hists = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let count = 0;
  for (let k = 0; k < n; k++) {
    if (!keep(k)) continue;
    for (let c = 0; c < 3; c++) hists[c]![Math.round(rgb[k * 3 + c]!)]++;
    count++;
  }
  if (count === 0) return null;
  return hists.map((h) => histogramPercentile(h, count, 0.5)) as Rgb;
}

const distance = (rgb: Float32Array, k: number, c: Rgb) =>
  Math.hypot(rgb[k * 3]! - c[0], rgb[k * 3 + 1]! - c[1], rgb[k * 3 + 2]! - c[2]);

// ---------------------------------------------------------------------------
// Border
// ---------------------------------------------------------------------------

/** A border pixel this close (RGB distance) to its side's median counts as uniform. */
const UNIFORM_DISTANCE = 36;
/** A side whose pixels are less uniform than this is art, not a frame. */
const MIN_UNIFORMITY = 0.55;

type FrameColour = Exclude<BorderColour, "borderless">;

/**
 * The frame colour closest to a white balanced colour, or "borderless" for
 * a colour no border is printed in, with how far it sits from the nearest
 * threshold (0 on a threshold, 1 well clear of it).
 */
export function classifyBorderColour([r, g, b]: Rgb): { value: BorderColour; margin: number } {
  const [h, s, v] = hsv(r, g, b);
  const lum = luminance(r, g, b);
  if (v < 0.3) return { value: "black", margin: clamp01((0.3 - v) / 0.12) };
  if (s < 0.2) {
    const neutral = (0.2 - s) / 0.08;
    // White balance puts a white border near 1; silver prints at about
    // two thirds of that.
    if (lum >= 0.82) return { value: "white", margin: clamp01(Math.min(neutral, (lum - 0.82) / 0.08)) };
    if (lum >= 0.4) {
      return { value: "silver", margin: clamp01(Math.min(neutral, (lum - 0.4) / 0.08, (0.82 - lum) / 0.08)) };
    }
    return { value: "black", margin: clamp01(Math.min(neutral, (0.4 - lum) / 0.08)) };
  }
  const saturated = (s - 0.2) / 0.08;
  if (h >= 28 && h <= 65) {
    const hueMargin = Math.min(h - 28, 65 - h) / 8;
    if (s >= 0.62 && v >= 0.72) {
      return { value: "yellow", margin: clamp01(Math.min(hueMargin, (s - 0.62) / 0.08, (v - 0.72) / 0.08)) };
    }
    const fromYellow = Math.max(0.62 - s, 0.72 - v) / 0.08;
    return { value: "gold", margin: clamp01(Math.min(hueMargin, saturated, fromYellow)) };
  }
  // Blue, green, red, purple: no border is printed in these, so it's art.
  return { value: "borderless", margin: clamp01((s - 0.2) / 0.25) };
}

type SideReading =
  | { usable: false }
  | { usable: true; value: BorderColour; confidence: number; glare: number; colour: Rgb };

function readSide(img: RgbaImage, region: CardRegion, scale: Rgb): SideReading {
  const { rgb, blown, n } = readRegion(img, region, scale);
  if (n === 0) return { usable: false };
  let blownCount = 0;
  for (let k = 0; k < n; k++) blownCount += blown[k]!;
  const blownFraction = blownCount / n;
  const notBlown = (k: number) => blown[k] === 0;

  if (blownFraction >= 0.5) {
    // Mostly blown: an overexposed white border, or glare over most of the
    // side. Tell them apart by what the unblown rest looks like.
    const rest = medianColour(rgb, n, notBlown);
    if (rest && blownFraction < 0.85 && luminance(...rest) < 0.75) return { usable: false };
    return { usable: true, value: "white", confidence: 0.8 * blownFraction, glare: 0, colour: [255, 255, 255] };
  }

  const colour = medianColour(rgb, n, notBlown)!;
  let near = 0;
  for (let k = 0; k < n; k++) if (notBlown(k) && distance(rgb, k, colour) <= UNIFORM_DISTANCE) near++;
  const uniformity = near / (n - blownCount);
  if (uniformity < MIN_UNIFORMITY) {
    // Art runs through the strip. The less uniform, the surer.
    return {
      usable: true,
      value: "borderless",
      confidence: clamp01(0.4 + (MIN_UNIFORMITY - uniformity) / 0.35),
      glare: blownFraction,
      colour,
    };
  }
  const { value, margin } = classifyBorderColour(colour);
  const uniform = clamp01((uniformity - MIN_UNIFORMITY) / 0.35);
  return {
    usable: true,
    value,
    confidence: (0.4 + 0.6 * margin) * (0.3 + 0.7 * uniform),
    glare: blownFraction,
    colour,
  };
}

/**
 * Frame colours that light alone can turn into each other. Black and white
 * aren't neighbours: one side black and another white is art, not shadow.
 */
const NEIGHBOURS: FrameColour[][] = [
  ["black", "silver"],
  ["silver", "white"],
  ["gold", "yellow"],
];

const SIDES = ["borderTop", "borderRight", "borderBottom", "borderLeft"] as const;

/**
 * The printed border's colour, from the strips just inside the card's four
 * edges. "borderless" when the strips aren't one uniform frame colour, or are
 * a colour no border is printed in (the art runs to the edge). Null when the
 * image is too small or dark, or glare covers most of the border.
 */
export function sampleBorder(img: RgbaImage): ColourCue<BorderColour> | null {
  const check = checkImage(img);
  if (!check) return null;
  const sides = SIDES.map((name) => readSide(img, CARD_REGIONS[name], check.scale)).filter(
    (side): side is Extract<SideReading, { usable: true }> => side.usable,
  );
  if (sides.length < 2) return null;

  const imageFactor = check.exposure * (0.7 + 0.3 * check.sharpness) * (0.5 + (0.5 * sides.length) / SIDES.length);
  const glare = sides.reduce((sum, side) => sum + side.glare, 0) / sides.length;
  const glareFactor = clamp01(1 - 2 * glare);
  const finish = (value: BorderColour, quality: number) => {
    const q = clamp01(quality * imageFactor * glareFactor);
    return q < MIN_QUALITY ? null : { value, quality: q };
  };
  const mean = (list: typeof sides) => list.reduce((sum, side) => sum + side.confidence, 0) / list.length;

  const borderless = sides.filter((side) => side.value === "borderless");
  if (borderless.length * 2 >= sides.length) {
    return finish("borderless", mean(borderless) * (borderless.length / sides.length));
  }

  const framed = sides.filter((side) => side.value !== "borderless");
  const agreement = framed.length / sides.length;
  const values = new Set(framed.map((side) => side.value));
  if (values.size === 1) return finish(framed[0]!.value, mean(framed) * agreement);

  // The sides disagree. Within one family (a shadow over half a white border
  // reads silver), go by the colour of all sides together, less sure.
  const family = NEIGHBOURS.find((group) => [...values].every((v) => group.includes(v as FrameColour)));
  if (family) {
    const pooled = [0, 1, 2].map((c) => {
      const channel = framed.map((side) => side.colour[c]!).sort((a, b) => a - b);
      return channel[Math.floor(channel.length / 2)]!;
    }) as Rgb;
    const { value, margin } = classifyBorderColour(pooled);
    if (family.includes(value as FrameColour)) {
      return finish(value, 0.6 * (0.4 + 0.6 * margin) * agreement);
    }
  }
  // Unrelated colours on different sides (dark at the bottom, sky at the
  // top): art to the edge.
  return finish("borderless", 0.4);
}

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------

/** Neighbouring pixels closer than this (RGB distance) are the same surface... */
const FLOOD_DISTANCE = 30;
/** ...as long as they stay this close to the edge pixel the fill started from. */
const SEED_DISTANCE = 60;
/** Symbol pixels darker than this (HSV value) are its outline or a common symbol. */
const DARK_VALUE = 0.3;
/** A symbol whose unblown pixels are at least this dark is a common one. */
const COMMON_DARK_FRACTION = 0.72;
/** Highlights at or above this (every channel) are glare on the symbol. */
const SYMBOL_GLARE = 245;

type Component = {
  pixels: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  touchesSide: boolean;
  touchesTopOrBottom: boolean;
};

/**
 * Split a region into the background (everything reachable from its edge
 * without crossing a sharp colour change or drifting far from the colour it
 * started at, so a blurred edge doesn't let it creep in) and the blobs left
 * over. The set symbol has a black outline, so its inside is never reached
 * even when it's the same colour as the type line around it.
 */
function findBlobs(rgb: Float32Array, w: number, h: number): { blobs: Component[]; background: number } {
  const n = w * h;
  const isBackground = new Uint8Array(n);
  const origin = new Int32Array(n);
  const stack: number[] = [];
  const seed = (k: number, from = k) => {
    if (!isBackground[k]) {
      isBackground[k] = 1;
      origin[k] = from;
      stack.push(k);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  const apart = (a: number, b: number) =>
    Math.hypot(rgb[a * 3]! - rgb[b * 3]!, rgb[a * 3 + 1]! - rgb[b * 3 + 1]!, rgb[a * 3 + 2]! - rgb[b * 3 + 2]!);
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % w;
    const y = (k - x) / w;
    const neighbours = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
    for (const m of neighbours) {
      if (m >= 0 && !isBackground[m] && apart(k, m) < FLOOD_DISTANCE && apart(origin[k]!, m) < SEED_DISTANCE) {
        seed(m, origin[k]);
      }
    }
  }

  let background = 0;
  for (let k = 0; k < n; k++) background += isBackground[k]!;

  const seen = new Uint8Array(n);
  const blobs: Component[] = [];
  for (let start = 0; start < n; start++) {
    if (isBackground[start] === 1 || seen[start] === 1) continue;
    const blob: Component = {
      pixels: [],
      minX: w,
      maxX: 0,
      minY: h,
      maxY: 0,
      touchesSide: false,
      touchesTopOrBottom: false,
    };
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % w;
      const y = (k - x) / w;
      blob.pixels.push(k);
      blob.minX = Math.min(blob.minX, x);
      blob.maxX = Math.max(blob.maxX, x);
      blob.minY = Math.min(blob.minY, y);
      blob.maxY = Math.max(blob.maxY, y);
      if (x === 0 || x === w - 1) blob.touchesSide = true;
      if (y === 0 || y === h - 1) blob.touchesTopOrBottom = true;
      const neighbours = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      for (const m of neighbours) {
        if (m >= 0 && !isBackground[m] && !seen[m]) {
          seen[m] = 1;
          stack.push(m);
        }
      }
    }
    blobs.push(blob);
  }
  return { blobs, background };
}

const RARITY_BY_COLOUR = { silver: "uncommon", gold: "rare", orange: "mythic" } as const;

/** Which symbol colour one white balanced, not dark pixel is. */
function symbolPixelColour(r: number, g: number, b: number): keyof typeof RARITY_BY_COLOUR | "other" {
  const [h, s] = hsv(r, g, b);
  if (s < 0.18) return "silver";
  if (h >= 31 && h <= 65) return "gold";
  if ((h < 31 || h >= 340) && s >= 0.35) return "orange";
  return "other";
}

/**
 * The set symbol's rarity colour, from the right end of the type line (M15
 * and 2003 frames): black for common, silver for uncommon, gold for rare,
 * orange-red for mythic. Null when no symbol-shaped blob is there (pre-2003
 * frames, cards with no symbol, art in that spot), when the symbol is a
 * colour none of those are, or when the image is too small or dark.
 */
export function sampleRarityColour(img: RgbaImage): ColourCue<RarityColour> | null {
  const check = checkImage(img);
  if (!check) return null;
  const { rect, rgb, n } = readRegion(img, CARD_REGIONS.setSymbol, check.scale);
  if (n === 0) return null;
  const { blobs, background } = findBlobs(rgb, rect.width, rect.height);
  // On the type line the background is most of the region. Art or a busy
  // frame there means this isn't an M15 or 2003 type line.
  if (background < n * 0.3) return null;
  // Many separate blobs clear of the edges is texture, not one symbol.
  const loose = blobs.filter(
    (blob) => !blob.touchesSide && !blob.touchesTopOrBottom && blob.pixels.length >= n * 0.02,
  );
  if (loose.length > 4) return null;
  const significant = blobs.filter((blob) => blob.pixels.length >= n * 0.02);

  // A set symbol is 20 to 35 px wide and 20 to 24 px tall at 488x680; allow
  // for wide symbols and a warp that's a bit off.
  const minHeight = img.height * 0.018;
  const maxHeight = img.height * 0.06;
  const maxWidth = img.width * 0.1;
  const shaped = significant.filter((blob) => {
    const bw = blob.maxX - blob.minX + 1;
    const bh = blob.maxY - blob.minY + 1;
    const fill = blob.pixels.length / (bw * bh);
    return (
      !blob.touchesSide &&
      bh >= minHeight &&
      bh <= maxHeight &&
      bw <= maxWidth &&
      bw / bh >= 0.35 &&
      bw / bh <= 2.8 &&
      fill >= 0.3 &&
      blob.pixels.length >= n * 0.04 &&
      blob.pixels.length <= n * 0.6
    );
  });
  // Prefer a blob clear of the region's edges; one cut by the top or bottom
  // (warp a bit off, or art reaching in) is a weaker reading.
  const inside = shaped.filter((blob) => !blob.touchesTopOrBottom);
  const pool = inside.length ? inside : shaped;
  if (!pool.length) return null;
  const symbol = pool.reduce((best, blob) => (blob.pixels.length > best.pixels.length ? blob : best));
  const edgeFactor = symbol.touchesTopOrBottom ? 0.6 : 1;

  let glare = 0;
  let dark = 0;
  const votes = { silver: 0, gold: 0, orange: 0, other: 0 };
  for (const k of symbol.pixels) {
    const i = ((rect.y + Math.floor(k / rect.width)) * img.width + rect.x + (k % rect.width)) * 4;
    if (Math.min(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!) >= SYMBOL_GLARE) {
      glare++;
      continue;
    }
    const r = rgb[k * 3]!;
    const g = rgb[k * 3 + 1]!;
    const b = rgb[k * 3 + 2]!;
    if (Math.max(r, g, b) / 255 < DARK_VALUE) {
      dark++;
      continue;
    }
    votes[symbolPixelColour(r, g, b)]++;
  }
  const total = symbol.pixels.length;
  const unblown = total - glare;
  if (unblown < total * 0.3) return null;
  const glareFactor = clamp01(1 - 2.5 * (glare / total));
  const sizeFactor = clamp01(total / (n * 0.08));
  const imageFactor = check.exposure * (0.4 + 0.6 * check.sharpness);
  const finish = (value: RarityColour, quality: number) => {
    const q = clamp01(quality * glareFactor * sizeFactor * imageFactor * edgeFactor);
    return q < MIN_QUALITY ? null : { value, quality: q };
  };

  const darkFraction = dark / unblown;
  if (darkFraction >= COMMON_DARK_FRACTION) {
    return finish("common", 0.5 + 0.5 * clamp01((darkFraction - COMMON_DARK_FRACTION) / 0.2));
  }

  const coloured = unblown - dark;
  const [winner, count] = (Object.entries(votes) as [keyof typeof votes, number][]).reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  );
  if (winner === "other" || coloured === 0) return null;
  const agreement = count / coloured;
  // A normal symbol's outline is about a third of its pixels. Much more and
  // it could be a common symbol with a light edge.
  const darkFactor = darkFraction > 0.55 ? clamp01(1 - (darkFraction - 0.55) / 0.34) : 1;
  return finish(RARITY_BY_COLOUR[winner], agreement * darkFactor);
}
