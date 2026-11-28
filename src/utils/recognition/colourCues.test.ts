import { CARD_HEIGHT, CARD_WIDTH } from "./model";
import { classifyBorderColour, sampleBorder, sampleRarityColour } from "./colourCues";
import { resizeBilinear, type RgbaImage } from "./preprocess";

type Rgb = [number, number, number];

// Synthetic M15-ish card at 488x680, laid out like Scryfall's "normal" image:
// a 22 px border, a dark frame, title bar, art box, type line bar with the
// set symbol at its right end, and a parchment text box. Art is random 4x4
// blocks of colour so the card has texture to be sharp (or blurred).

const BORDER = 22;
const TYPE_LINE = { x0: 34, x1: 454, y0: 377, y1: 410 };
const SYMBOL = { cx: 432, cy: 393, rx: 13, ry: 11 };

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

type Canvas = RgbaImage & { data: Uint8ClampedArray };

function blank(): Canvas {
  return { data: new Uint8ClampedArray(CARD_WIDTH * CARD_HEIGHT * 4).fill(255), width: CARD_WIDTH, height: CARD_HEIGHT };
}

function set(img: Canvas, x: number, y: number, [r, g, b]: Rgb) {
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = 255;
}

function fillRect(img: Canvas, x0: number, y0: number, x1: number, y1: number, colour: (x: number, y: number) => Rgb) {
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x++) set(img, x, y, colour(x, y));
  }
}

/** Random colourful 4x4 blocks, the same for the same seed. */
function art(seed: number): (x: number, y: number) => Rgb {
  const random = rng(seed);
  const blocks = new Map<number, Rgb>();
  return (x, y) => {
    const key = Math.floor(y / 4) * 1000 + Math.floor(x / 4);
    let c = blocks.get(key);
    if (!c) {
      c = [30 + random() * 200, 30 + random() * 200, 30 + random() * 200].map(Math.round) as Rgb;
      blocks.set(key, c);
    }
    return c;
  };
}

/** A flat colour with a little print/camera noise. */
function flat(colour: Rgb, seed: number, amount = 4): (x: number, y: number) => Rgb {
  const random = rng(seed);
  return () => colour.map((v) => Math.round(v + (random() - 0.5) * 2 * amount)) as Rgb;
}

type SymbolSpec = { fill: Rgb; shade?: Rgb; outline?: Rgb };

type CardOptions = {
  /** Border colour, or "art" for a borderless card whose art runs to the edge. */
  border?: Rgb | "art";
  typeLine?: Rgb;
  /** null for a type line with no symbol. */
  symbol?: SymbolSpec | null;
  seed?: number;
};

const drawn = new Map<string, Canvas>();

/** A fresh copy of the card, drawn once per set of options (drawing is the slow part). */
function makeCard(options: CardOptions = {}): Canvas {
  const key = JSON.stringify(options);
  let card = drawn.get(key);
  if (!card) {
    card = drawCard(options);
    drawn.set(key, card);
  }
  return { ...card, data: new Uint8ClampedArray(card.data) };
}

function drawCard({ border = [18, 18, 20], typeLine = [125, 150, 105], symbol, seed = 7 }: CardOptions): Canvas {
  const img = blank();
  const w = img.width;
  const h = img.height;
  const artColour = art(seed);
  fillRect(img, 0, 0, w, h, artColour);
  if (border !== "art") {
    const edge = flat(border, seed + 1);
    fillRect(img, 0, 0, w, BORDER, edge);
    fillRect(img, 0, h - BORDER, w, h, edge);
    fillRect(img, 0, 0, BORDER, h, edge);
    fillRect(img, w - BORDER, 0, w, h, edge);
    // The frame inside the border.
    fillRect(img, BORDER, BORDER, w - BORDER, h - BORDER, flat([70, 60, 52], seed + 2, 6));
  } else {
    // Borderless: the frame is thinner and the art shows all around it.
    fillRect(img, 30, 26, w - 30, 70, flat([70, 60, 52], seed + 2, 6));
    fillRect(img, 30, 372, w - 30, 600, flat([70, 60, 52], seed + 2, 6));
  }
  fillRect(img, 30, 26, w - 30, 68, flat([220, 215, 200], seed + 3)); // title bar
  if (border !== "art") fillRect(img, 40, 75, w - 40, 372, artColour); // art box
  fillRect(img, TYPE_LINE.x0, TYPE_LINE.y0, TYPE_LINE.x1, TYPE_LINE.y1, flat(typeLine, seed + 4, 3));
  // A few dark letters on the type line, well left of the symbol.
  for (let x = 44; x < 220; x += 12) fillRect(img, x, 386, x + 7, 401, flat([20, 20, 20], seed + 5, 2));
  fillRect(img, 40, 415, w - 40, 600, flat([235, 228, 210], seed + 6)); // text box
  for (let y = 430; y < 590; y += 18) fillRect(img, 50, y, 420, y + 6, flat([30, 30, 30], seed + 7, 2));

  if (symbol) {
    const outline = symbol.outline ?? [14, 14, 14];
    const shade = symbol.shade ?? symbol.fill;
    const { cx, cy, rx, ry } = SYMBOL;
    for (let y = cy - ry - 1; y <= cy + ry + 1; y++) {
      for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 1) continue;
        const inner = ((x - cx) / (rx - 2)) ** 2 + ((y - cy) / (ry - 2)) ** 2;
        if (inner > 1) {
          set(img, x, y, outline);
        } else {
          // Metallic gradient from fill at the top to shade at the bottom.
          const t = (y - (cy - ry)) / (2 * ry);
          set(img, x, y, symbol.fill.map((v, c) => Math.round(v + (shade[c]! - v) * t)) as Rgb);
        }
      }
    }
  }
  return img;
}

function scaleColours(img: Canvas, factors: Rgb): Canvas {
  const out = { ...img, data: new Uint8ClampedArray(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    for (let c = 0; c < 3; c++) out.data[i + c] = img.data[i + c]! * factors[c]!;
  }
  return out;
}

function blur(img: Canvas, radius: number): Canvas {
  const { width: w, height: h } = img;
  const pass = (src: Uint8ClampedArray, dx: number, dy: number) => {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sum = [0, 0, 0];
        let count = 0;
        for (let k = -radius; k <= radius; k++) {
          const sx = x + k * dx;
          const sy = y + k * dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const i = (sy * w + sx) * 4;
          sum[0] += src[i]!;
          sum[1] += src[i + 1]!;
          sum[2] += src[i + 2]!;
          count++;
        }
        const o = (y * w + x) * 4;
        out[o] = sum[0]! / count;
        out[o + 1] = sum[1]! / count;
        out[o + 2] = sum[2]! / count;
        out[o + 3] = 255;
      }
    }
    return out;
  };
  return { ...img, data: pass(pass(img.data, 1, 0), 0, 1) };
}

const BLOWN: Rgb = [255, 255, 255];

describe("classifyBorderColour", () => {
  test.each([
    [[18, 18, 20], "black"],
    [[240, 238, 235], "white"],
    [[170, 170, 172], "silver"],
    [[210, 175, 100], "gold"],
    [[250, 220, 40], "yellow"],
    [[40, 90, 200], "borderless"],
  ] as [Rgb, string][])("%j is %s", (colour, value) => {
    expect(classifyBorderColour(colour).value).toBe(value);
  });
});

describe("sampleBorder", () => {
  test.each([
    ["black", [18, 18, 20]],
    ["white", [238, 236, 232]],
    ["silver", [168, 168, 170]],
    ["gold", [200, 165, 90]],
    ["yellow", [245, 215, 35]],
  ] as [string, Rgb][])("reads a %s border", (value, colour) => {
    const cue = sampleBorder(makeCard({ border: colour }));
    expect(cue?.value).toBe(value);
    expect(cue!.quality).toBeGreaterThan(0.6);
  });

  test("reads a borderless card whose art runs to the edge", () => {
    const cue = sampleBorder(makeCard({ border: "art" }));
    expect(cue?.value).toBe("borderless");
    expect(cue!.quality).toBeGreaterThan(0.5);
  });

  test("reads art that's a different flat colour on each side as borderless", () => {
    const img = makeCard({ border: "art" });
    fillRect(img, 0, 0, img.width, 40, flat([90, 150, 220], 1)); // sky
    fillRect(img, 0, img.height - 40, img.width, img.height, flat([25, 20, 18], 2)); // dark ground
    fillRect(img, 0, 40, 30, img.height - 40, flat([60, 140, 70], 3));
    fillRect(img, img.width - 30, 40, img.width, img.height - 40, flat([60, 140, 70], 3));
    expect(sampleBorder(img)?.value).toBe("borderless");
  });

  test("reads black on two sides and white on the other two as borderless", () => {
    const img = makeCard({ border: "art" });
    const { width: w, height: h } = img;
    fillRect(img, 0, 0, w, 24, flat([240, 238, 235], 1));
    fillRect(img, 0, 0, 30, h, flat([240, 238, 235], 1));
    fillRect(img, 0, h - 24, w, h, flat([15, 15, 15], 2));
    fillRect(img, w - 30, 0, w, h, flat([15, 15, 15], 2));
    expect(sampleBorder(img)?.value).toBe("borderless");
  });

  test("a shadow over part of a white border still reads white, less sure", () => {
    const clean = sampleBorder(makeCard({ border: [238, 236, 232] }))!;
    const img = makeCard({ border: [238, 236, 232] });
    // Shadow over the bottom and right: those sides read silver.
    fillRect(img, 0, img.height - BORDER, img.width, img.height, flat([175, 174, 171], 3));
    fillRect(img, img.width - BORDER, 0, img.width, img.height, flat([175, 174, 171], 3));
    const shaded = sampleBorder(img);
    expect(["white", "silver"]).toContain(shaded?.value);
    expect(shaded!.quality).toBeLessThan(clean.quality);
  });

  test("a warm lamp doesn't turn a white border gold", () => {
    const warm = scaleColours(makeCard({ border: [238, 236, 232] }), [1, 0.9, 0.72]);
    expect(sampleBorder(warm)?.value).toBe("white");
  });

  test("a dim photo of a white border still reads white, with lower quality", () => {
    const bright = sampleBorder(makeCard({ border: [238, 236, 232] }))!;
    const dim = sampleBorder(scaleColours(makeCard({ border: [238, 236, 232] }), [0.3, 0.3, 0.3]));
    expect(dim?.value).toBe("white");
    expect(dim!.quality).toBeLessThan(bright.quality);
  });

  test("glare on part of the border lowers quality but keeps the colour", () => {
    const clean = sampleBorder(makeCard())!;
    const img = makeCard();
    fillRect(img, 60, 0, 260, BORDER, () => BLOWN);
    fillRect(img, 0, 100, BORDER, 260, () => BLOWN);
    const glared = sampleBorder(img);
    expect(glared?.value).toBe("black");
    expect(glared!.quality).toBeLessThan(clean.quality - 0.1);
  });

  test("a blurry photo lowers quality", () => {
    const sharp = sampleBorder(makeCard())!;
    const blurry = sampleBorder(blur(makeCard(), 6));
    expect(blurry?.value).toBe("black");
    expect(blurry!.quality).toBeLessThan(sharp.quality);
  });

  test("returns null when glare covers most of every side", () => {
    const img = makeCard();
    const { width: w, height: h } = img;
    fillRect(img, 0, 0, Math.round(w * 0.7), BORDER, () => BLOWN);
    fillRect(img, 0, h - BORDER, Math.round(w * 0.7), h, () => BLOWN);
    fillRect(img, 0, 0, BORDER, Math.round(h * 0.7), () => BLOWN);
    fillRect(img, w - BORDER, 0, w, Math.round(h * 0.7), () => BLOWN);
    expect(sampleBorder(img)).toBeNull();
  });

  test("returns null for an image that's too dark or too small", () => {
    expect(sampleBorder(scaleColours(makeCard(), [0.03, 0.03, 0.03]))).toBeNull();
    expect(sampleBorder({ data: new Uint8ClampedArray(50 * 70 * 4), width: 50, height: 70 })).toBeNull();
  });

  test("works at other sizes with the same proportions", () => {
    const big = resizeBilinear(makeCard({ border: [238, 236, 232] }), CARD_WIDTH * 2, CARD_HEIGHT * 2);
    expect(sampleBorder(big)?.value).toBe("white");
  });
});

describe("sampleRarityColour", () => {
  const SYMBOLS: [string, SymbolSpec][] = [
    ["common", { fill: [18, 18, 18] }],
    ["uncommon", { fill: [200, 203, 208], shade: [120, 123, 128] }],
    ["rare", { fill: [225, 185, 80], shade: [165, 125, 45] }],
    ["mythic", { fill: [235, 110, 35], shade: [190, 45, 25] }],
  ];

  test.each(SYMBOLS)("reads a %s symbol", (value, symbol) => {
    const cue = sampleRarityColour(makeCard({ symbol }));
    expect(cue?.value).toBe(value);
    expect(cue!.quality).toBeGreaterThan(0.5);
  });

  test.each(SYMBOLS)("reads a %s symbol on a gold (multicolour) type line", (value, symbol) => {
    expect(sampleRarityColour(makeCard({ symbol, typeLine: [210, 185, 115] }))?.value).toBe(value);
  });

  test.each(SYMBOLS)("reads a %s symbol on a grey (artifact) type line", (value, symbol) => {
    expect(sampleRarityColour(makeCard({ symbol, typeLine: [175, 175, 180] }))?.value).toBe(value);
  });

  test("reads a symbol on a white-bordered card", () => {
    const cue = sampleRarityColour(makeCard({ border: [238, 236, 232], symbol: SYMBOLS[2]![1] }));
    expect(cue?.value).toBe("rare");
  });

  test("a warm lamp doesn't turn a silver symbol gold", () => {
    const warm = scaleColours(makeCard({ symbol: SYMBOLS[1]![1] }), [1, 0.9, 0.72]);
    expect(sampleRarityColour(warm)?.value).toBe("uncommon");
  });

  test("glare on the symbol lowers quality", () => {
    const clean = sampleRarityColour(makeCard({ symbol: SYMBOLS[2]![1] }))!;
    const img = makeCard({ symbol: SYMBOLS[2]![1] });
    fillRect(img, SYMBOL.cx - 6, SYMBOL.cy - 9, SYMBOL.cx + 5, SYMBOL.cy + 1, () => BLOWN);
    const glared = sampleRarityColour(img);
    expect(glared?.value).toBe("rare");
    expect(glared!.quality).toBeLessThan(clean.quality - 0.1);
  });

  test("a blurry photo lowers quality", () => {
    const sharp = sampleRarityColour(makeCard({ symbol: SYMBOLS[3]![1] }))!;
    const blurry = sampleRarityColour(blur(makeCard({ symbol: SYMBOLS[3]![1] }), 2));
    expect(blurry?.value).toBe("mythic");
    expect(blurry!.quality).toBeLessThan(sharp.quality);
  });

  test("returns null when the type line has no symbol", () => {
    expect(sampleRarityColour(makeCard({ symbol: null }))).toBeNull();
  });

  test("returns null when art fills the symbol's spot, as on older frames", () => {
    const img = makeCard({ symbol: SYMBOLS[2]![1] });
    fillRect(img, 380, 355, 470, 430, art(99));
    expect(sampleRarityColour(img)).toBeNull();
  });

  test("returns null when the symbol sits lower than the M15 type line", () => {
    const img = makeCard({ symbol: null });
    // An older frame's symbol, below the region.
    fillRect(img, 420, 440, 446, 462, flat([225, 185, 80], 4));
    expect(sampleRarityColour(img)).toBeNull();
  });

  test("works at other sizes with the same proportions", () => {
    const big = resizeBilinear(makeCard({ symbol: SYMBOLS[3]![1] }), CARD_WIDTH * 2, CARD_HEIGHT * 2);
    expect(sampleRarityColour(big)?.value).toBe("mythic");
  });

  test("returns null for a symbol colour none of the rarities use", () => {
    expect(sampleRarityColour(makeCard({ symbol: { fill: [140, 60, 175] } }))).toBeNull();
  });

  test("returns null when glare covers the symbol", () => {
    const img = makeCard({ symbol: SYMBOLS[2]![1] });
    fillRect(img, SYMBOL.cx - 12, SYMBOL.cy - 10, SYMBOL.cx + 12, SYMBOL.cy + 10, () => BLOWN);
    expect(sampleRarityColour(img)).toBeNull();
  });

  test("returns null for an image that's too dark or too small", () => {
    expect(sampleRarityColour(scaleColours(makeCard({ symbol: SYMBOLS[2]![1] }), [0.03, 0.03, 0.03]))).toBeNull();
    expect(sampleRarityColour({ data: new Uint8ClampedArray(50 * 70 * 4), width: 50, height: 70 })).toBeNull();
  });
});

