import { describe, expect, it } from "@jest/globals";

import { type RgbaImage } from "../../utils/recognition/preprocess";
import {
  addGlare,
  augmentCard,
  boxBlur,
  brightnessContrast,
  jitterCorners,
  seededRng,
  warpQuad,
  type Quad,
} from "./augment";

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 255) / (width - 1);
      data[i + 1] = (y * 255) / (height - 1);
      data[i + 2] = 100;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const pixel = (img: RgbaImage, x: number, y: number) =>
  Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe("seededRng", () => {
  it("repeats for a seed and stays in [0, 1)", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});

describe("warpQuad", () => {
  it("is the identity for the image's own corners", () => {
    const src = gradient(9, 7);
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
      { x: 0, y: 6 },
    ];
    expect(Array.from(warpQuad(src, quad).data)).toEqual(Array.from(src.data));
  });

  it("fills points outside the source", () => {
    const src = gradient(4, 4);
    const quad: Quad = [
      { x: -10, y: -10 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(pixel(warpQuad(src, quad, 4, 4, [1, 2, 3]), 0, 0)).toEqual([1, 2, 3, 255]);
  });
});

describe("jitterCorners", () => {
  it("moves each corner by at most the given fraction", () => {
    const rng = seededRng(3);
    for (let n = 0; n < 50; n++) {
      const [tl, tr, br, bl] = jitterCorners(488, 680, rng, 0.04);
      const limitX = 0.04 * 488;
      const limitY = 0.04 * 680;
      for (const [p, x, y] of [
        [tl, 0, 0],
        [tr, 487, 0],
        [br, 487, 679],
        [bl, 0, 679],
      ] as const) {
        expect(Math.abs(p.x - x)).toBeLessThanOrEqual(limitX);
        expect(Math.abs(p.y - y)).toBeLessThanOrEqual(limitY);
      }
    }
  });
});

describe("brightnessContrast", () => {
  it("shifts, scales around mid-gray and clamps, leaving alpha alone", () => {
    const src: RgbaImage = { data: new Uint8ClampedArray([128, 200, 10, 77]), width: 1, height: 1 };
    expect(Array.from(brightnessContrast(src, 10, 1).data)).toEqual([138, 210, 20, 77]);
    expect(Array.from(brightnessContrast(src, 0, 2).data)).toEqual([128, 255, 0, 77]);
  });
});

describe("addGlare", () => {
  it("whitens the middle most and leaves outside the ellipse untouched", () => {
    const src: RgbaImage = { data: new Uint8ClampedArray(21 * 21 * 4).fill(50), width: 21, height: 21 };
    const out = addGlare(src, { cx: 10, cy: 10, rx: 6, ry: 4, strength: 0.8 });
    expect(pixel(out, 10, 10)[0]).toBe(Math.round(50 * 0.2 + 255 * 0.8));
    expect(pixel(out, 10, 10)[0]!).toBeGreaterThan(pixel(out, 13, 10)[0]!);
    expect(pixel(out, 0, 0)).toEqual([50, 50, 50, 50]);
    expect(pixel(out, 10, 15)).toEqual([50, 50, 50, 50]);
  });
});

describe("boxBlur", () => {
  it("keeps a solid image solid and softens an edge", () => {
    const solid: RgbaImage = { data: new Uint8ClampedArray(5 * 5 * 4).fill(90), width: 5, height: 5 };
    expect(Array.from(boxBlur(solid, 1).data).every((v) => v === 90)).toBe(true);

    const edge: RgbaImage = { data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]), width: 2, height: 1 };
    const out = boxBlur(edge, 1);
    expect(pixel(out, 0, 0)[0]).toBe(85);
    expect(pixel(out, 1, 0)[0]).toBe(170);
  });
});

describe("augmentCard", () => {
  it("keeps the size, changes pixels and repeats for a seed", () => {
    const src = gradient(48, 68);
    const a = augmentCard(src, seededRng(9));
    const b = augmentCard(src, seededRng(9));
    expect([a.width, a.height]).toEqual([48, 68]);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(src.data));
  });
});
