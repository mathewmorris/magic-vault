import { describe, expect, it } from "@jest/globals";

import {
  applyHomography,
  homography,
  isConvexQuad,
  isPlausibleCardQuad,
  isSideways,
  orderCorners,
  quadArea,
  quadStability,
  rectToQuad,
  rotate180,
  rotateImage,
  scaleQuad,
  sharpness,
  warpQuad,
  type Point,
  type Quad,
} from "./geometry";
import type { RgbaImage } from "./preprocess";

const CARD_RATIO = 88 / 63;

/** A portrait card-shaped quad centered at (cx, cy), rotated by `degrees` clockwise. */
function cardQuad(cx: number, cy: number, width: number, degrees: number, ratio = CARD_RATIO): Quad {
  const height = width * ratio;
  const t = (degrees * Math.PI) / 180;
  const corners: Point[] = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];
  const rotated = corners.map(({ x, y }) => ({
    x: cx + x * Math.cos(t) - y * Math.sin(t),
    y: cy + x * Math.sin(t) + y * Math.cos(t),
  }));
  return [rotated[0]!, rotated[1]!, rotated[2]!, rotated[3]!];
}

function expectQuadClose(actual: Quad, expected: Quad, digits = 6) {
  actual.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i]!.x, digits);
    expect(p.y).toBeCloseTo(expected[i]!.y, digits);
  });
}

function shuffle<T>(items: T[], order: number[]): T[] {
  return order.map((i) => items[i]!);
}

function makeImage(width: number, height: number, fn: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

function pixel(image: RgbaImage, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4;
  return Array.from(image.data.slice(i, i + 4));
}

describe("orderCorners", () => {
  const orders = [
    [0, 1, 2, 3],
    [3, 2, 1, 0],
    [2, 0, 3, 1],
    [1, 3, 0, 2],
  ];

  it.each([0, 10, -10, 30, -30, 40, -40])("orders a portrait card rotated %d degrees", (degrees) => {
    const quad = cardQuad(500, 400, 200, degrees);
    for (const order of orders) {
      expectQuadClose(orderCorners(shuffle(quad, order)), quad);
    }
  });

  it("turns a landscape card so the result is portrait", () => {
    // A card lying sideways: top edge longer than left edge.
    const landscape: Quad = [
      { x: 100, y: 100 },
      { x: 380, y: 100 },
      { x: 380, y: 300 },
      { x: 100, y: 300 },
    ];
    const ordered = orderCorners(shuffle(landscape, [2, 0, 1, 3]));
    // New TL is the old BL; the long sides are now left and right.
    expect(ordered).toEqual([landscape[3], landscape[0], landscape[1], landscape[2]]);
    const left = Math.hypot(ordered[0].x - ordered[3].x, ordered[0].y - ordered[3].y);
    const top = Math.hypot(ordered[0].x - ordered[1].x, ordered[0].y - ordered[1].y);
    expect(left).toBeGreaterThan(top);
  });

  it("handles a sideways card that is also tilted", () => {
    const quad = cardQuad(400, 400, 150, 90 + 20);
    const ordered = orderCorners(quad);
    const left = Math.hypot(ordered[0].x - ordered[3].x, ordered[0].y - ordered[3].y);
    const top = Math.hypot(ordered[0].x - ordered[1].x, ordered[0].y - ordered[1].y);
    expect(left).toBeGreaterThan(top);
    expect(isConvexQuad(ordered)).toBe(true);
  });

  it("always returns a clockwise quad", () => {
    const ordered = orderCorners(shuffle(cardQuad(0, 0, 50, 25), [3, 1, 0, 2]));
    // Positive signed area with y down means clockwise on screen.
    let signed = 0;
    for (let i = 0; i < 4; i++) {
      const a = ordered[i]!;
      const b = ordered[(i + 1) % 4]!;
      signed += a.x * b.y - b.x * a.y;
    }
    expect(signed).toBeGreaterThan(0);
  });

  it("rejects the wrong number of points or non-finite points", () => {
    expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow();
    expect(() =>
      orderCorners([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: NaN },
        { x: 0, y: 1 },
      ]),
    ).toThrow();
  });
});

describe("isPlausibleCardQuad", () => {
  const W = 1000;
  const H = 800;

  it("accepts a card-shaped quad", () => {
    expect(isPlausibleCardQuad(cardQuad(500, 400, 300, 0), W, H)).toBe(true);
    expect(isPlausibleCardQuad(cardQuad(500, 400, 300, 20), W, H)).toBe(true);
  });

  it("rejects a quad that's too small", () => {
    // 6% of 800000 = 48000. 150 x 209 = 31400.
    expect(isPlausibleCardQuad(cardQuad(500, 400, 150, 0), W, H)).toBe(false);
    // 200 x 279 = 55800.
    expect(isPlausibleCardQuad(cardQuad(500, 400, 200, 0), W, H)).toBe(true);
  });

  it("rejects squares and very long rectangles", () => {
    expect(isPlausibleCardQuad(cardQuad(500, 400, 300, 0, 1.05), W, H)).toBe(false);
    expect(isPlausibleCardQuad(cardQuad(500, 300, 250, 0, 2.2), W, H)).toBe(false);
    expect(isPlausibleCardQuad(cardQuad(500, 400, 300, 0, 1.2), W, H)).toBe(true);
    expect(isPlausibleCardQuad(cardQuad(500, 400, 250, 0, 1.7), W, H)).toBe(true);
  });

  it("rejects non-convex and self-crossing quads", () => {
    const dart: Quad = [
      { x: 300, y: 100 },
      { x: 700, y: 100 },
      { x: 500, y: 300 },
      { x: 300, y: 700 },
    ];
    expect(isConvexQuad(dart)).toBe(false);
    expect(isPlausibleCardQuad(dart, W, H)).toBe(false);
    const bowtie: Quad = [
      { x: 300, y: 100 },
      { x: 600, y: 700 },
      { x: 600, y: 100 },
      { x: 300, y: 700 },
    ];
    expect(isPlausibleCardQuad(bowtie, W, H)).toBe(false);
  });

  it("rejects a quad with a very sharp corner", () => {
    // A strongly sheared parallelogram: angles of about 45 and 135 degrees.
    const sheared: Quad = [
      { x: 300, y: 100 },
      { x: 600, y: 100 },
      { x: 1000, y: 500 },
      { x: 700, y: 500 },
    ];
    expect(isConvexQuad(sheared)).toBe(true);
    expect(isPlausibleCardQuad(sheared, 2000, 1000)).toBe(false);
  });

  it("accepts mild perspective (a trapezoid)", () => {
    const trapezoid: Quad = [
      { x: 380, y: 150 },
      { x: 620, y: 150 },
      { x: 660, y: 600 },
      { x: 340, y: 600 },
    ];
    expect(isPlausibleCardQuad(trapezoid, W, H)).toBe(true);
  });
});

describe("homography", () => {
  it("maps each source corner onto its destination", () => {
    const src: Quad = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    const dst: Quad = [
      { x: 13, y: 7 },
      { x: 52, y: 15 },
      { x: 47, y: 90 },
      { x: 5, y: 70 },
    ];
    const h = homography(src, dst);
    expect(h).toHaveLength(9);
    src.forEach((p, i) => {
      const mapped = applyHomography(h, p);
      expect(mapped.x).toBeCloseTo(dst[i]!.x, 8);
      expect(mapped.y).toBeCloseTo(dst[i]!.y, 8);
    });
  });

  it("is the identity for identical quads", () => {
    const quad = cardQuad(30, 40, 20, 15);
    const h = homography(quad, quad);
    const expected = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    h.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 8));
  });

  it("throws on a degenerate quad", () => {
    const line: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(() => homography(line, cardQuad(0, 0, 1, 0))).toThrow();
  });
});

describe("warpQuad", () => {
  it("crops an axis-aligned rectangle exactly", () => {
    const image = makeImage(20, 10, (x, y) => [x * 10, y * 20, 0]);
    const out = warpQuad(image, rectToQuad({ x: 4, y: 2, width: 6, height: 5 }), 6, 5);
    expect(out.width).toBe(6);
    expect(out.height).toBe(5);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 6; x++) {
        expect(pixel(out, x, y)).toEqual([(x + 4) * 10, (y + 2) * 20, 0, 255]);
      }
    }
  });

  it("undoes a known perspective warp", () => {
    // Paint a flat "card" with a pattern, then render it into a frame through a
    // known homography. Warping the frame back should recover the pattern.
    const cardW = 40;
    const cardH = 56;
    const color = (u: number, v: number): [number, number, number] => [
      Math.floor(u / 10) % 2 ? 230 : 20,
      Math.floor(v / 14) % 2 ? 200 : 40,
      u < cardW / 2 ? 255 : 0,
    ];
    const quad: Quad = [
      { x: 30, y: 20 },
      { x: 95, y: 30 },
      { x: 100, y: 120 },
      { x: 20, y: 110 },
    ];
    const toCard = homography(quad, rectToQuad({ x: 0, y: 0, width: cardW, height: cardH }));
    const frame = makeImage(130, 140, (x, y) => {
      const { x: u, y: v } = applyHomography(toCard, { x: x + 0.5, y: y + 0.5 });
      if (u < 0 || v < 0 || u >= cardW || v >= cardH) return [128, 128, 128];
      return color(u, v);
    });

    const flat = warpQuad(frame, quad, cardW, cardH);
    let matches = 0;
    let total = 0;
    // Skip pixels next to pattern edges, where bilinear sampling blends colors.
    for (let v = 0; v < cardH; v++) {
      for (let u = 0; u < cardW; u++) {
        if (u % 10 === 0 || u % 10 === 9 || v % 14 === 0 || v % 14 === 13) continue;
        if (u === cardW / 2 || u === cardW / 2 - 1) continue;
        if (u === 0 || v === 0 || u === cardW - 1 || v === cardH - 1) continue;
        total++;
        const [r, g, b] = pixel(flat, u, v);
        const [er, eg, eb] = color(u + 0.5, v + 0.5);
        if (Math.abs(r! - er) < 40 && Math.abs(g! - eg) < 40 && Math.abs(b! - eb) < 40) matches++;
      }
    }
    expect(matches / total).toBeGreaterThan(0.97);
  });

  it("puts quad[0] at the output's top-left", () => {
    const image = makeImage(10, 10, (x, y) => (x < 5 && y < 5 ? [255, 0, 0] : [0, 0, 255]));
    // Quad starting at the bottom-right: the red corner should end up bottom-right.
    const quad: Quad = [
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const out = warpQuad(image, quad, 10, 10);
    expect(pixel(out, 8, 8)).toEqual([255, 0, 0, 255]);
    expect(pixel(out, 1, 1)).toEqual([0, 0, 255, 255]);
  });

  it("repeats edge pixels outside the image", () => {
    const image = makeImage(4, 4, () => [9, 8, 7]);
    const out = warpQuad(image, rectToQuad({ x: -10, y: -10, width: 30, height: 30 }), 5, 5);
    expect(pixel(out, 0, 0)).toEqual([9, 8, 7, 255]);
    expect(pixel(out, 4, 4)).toEqual([9, 8, 7, 255]);
  });
});

describe("rotate180", () => {
  it("reverses pixel order and is its own inverse", () => {
    const image = makeImage(3, 2, (x, y) => [x, y, x + y * 3]);
    const turned = rotate180(image);
    expect(pixel(turned, 0, 0)).toEqual(pixel(image, 2, 1));
    expect(pixel(turned, 2, 1)).toEqual(pixel(image, 0, 0));
    expect(pixel(turned, 1, 0)).toEqual(pixel(image, 1, 1));
    expect(Array.from(rotate180(turned).data)).toEqual(Array.from(image.data));
  });
});

describe("rotateImage", () => {
  // 3 wide, 2 tall; each pixel's red is its index, so moves are easy to read.
  const image = makeImage(3, 2, (x, y) => [x + y * 3, 0, 0]);
  const reds = (img: RgbaImage) => {
    const rows: number[][] = [];
    for (let y = 0; y < img.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < img.width; x++) row.push(pixel(img, x, y)[0]!);
      rows.push(row);
    }
    return rows;
  };

  it("leaves 0 alone and matches rotate180 at 180", () => {
    expect(rotateImage(image, 0)).toBe(image);
    expect(Array.from(rotateImage(image, 180).data)).toEqual(Array.from(rotate180(image).data));
  });

  it("turns clockwise at 90 and counter-clockwise at 270, swapping the size", () => {
    // [0 1 2]
    // [3 4 5]
    const cw = rotateImage(image, 90);
    expect([cw.width, cw.height]).toEqual([2, 3]);
    expect(reds(cw)).toEqual([
      [3, 0],
      [4, 1],
      [5, 2],
    ]);
    const ccw = rotateImage(image, 270);
    expect([ccw.width, ccw.height]).toEqual([2, 3]);
    expect(reds(ccw)).toEqual([
      [2, 5],
      [1, 4],
      [0, 3],
    ]);
  });

  it("composes: 90 then 270 is the original, 90 twice is 180", () => {
    expect(Array.from(rotateImage(rotateImage(image, 90), 270).data)).toEqual(Array.from(image.data));
    expect(Array.from(rotateImage(rotateImage(image, 90), 90).data)).toEqual(Array.from(rotate180(image).data));
  });
});

describe("isSideways", () => {
  it.each([0, 20, -20, 180, 160])("is false for a portrait card at %d degrees", (degrees) => {
    expect(isSideways(orderCorners(cardQuad(400, 400, 150, degrees)))).toBe(false);
  });

  it.each([90, 70, 110, -90, 270])("is true for a card lying sideways at %d degrees", (degrees) => {
    expect(isSideways(orderCorners(cardQuad(400, 400, 150, degrees)))).toBe(true);
  });

  it("doesn't depend on orderCorners having turned the quad", () => {
    const landscape = rectToQuad({ x: 100, y: 100, width: 280, height: 200 });
    expect(isSideways(landscape)).toBe(true);
    expect(isSideways(orderCorners(landscape))).toBe(true);
    expect(isSideways(rectToQuad({ x: 100, y: 100, width: 200, height: 280 }))).toBe(false);
  });
});

describe("sharpness", () => {
  it("is zero for a flat image and higher for sharper edges", () => {
    const flat = makeImage(20, 20, () => [100, 100, 100]);
    expect(sharpness(flat)).toBeCloseTo(0, 8);

    const hard = makeImage(20, 20, (x) => (x < 10 ? [0, 0, 0] : [255, 255, 255]));
    const soft = makeImage(20, 20, (x) => {
      const v = Math.min(255, Math.max(0, (x - 5) * 25));
      return [v, v, v];
    });
    expect(sharpness(hard)).toBeGreaterThan(sharpness(soft));
    expect(sharpness(soft)).toBeGreaterThan(0);
  });

  it("returns 0 for tiny images", () => {
    expect(sharpness(makeImage(2, 2, () => [0, 0, 0]))).toBe(0);
  });
});

describe("quadStability", () => {
  it("is 0 for the same quad and grows with movement", () => {
    const a = cardQuad(100, 100, 50, 0);
    expect(quadStability(a, a, 1000)).toBe(0);
    const moved = a.map((p) => ({ x: p.x + 3, y: p.y + 4 })) as Quad;
    expect(quadStability(a, moved, 1000)).toBeCloseTo(0.005, 10);
  });
});

describe("quadArea", () => {
  it("computes the area of a rectangle", () => {
    expect(quadArea(rectToQuad({ x: 1, y: 2, width: 3, height: 4 }))).toBe(12);
  });
});

describe("scaleQuad", () => {
  it("grows a quad about its centroid, keeping the corner order", () => {
    const quad = rectToQuad({ x: 10, y: 20, width: 100, height: 140 });
    expect(scaleQuad(quad, 1.5)).toEqual([
      { x: -15, y: -15 },
      { x: 135, y: -15 },
      { x: 135, y: 195 },
      { x: -15, y: 195 },
    ]);
    expect(scaleQuad(quad, 1)).toEqual(quad);
  });
});
