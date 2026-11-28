import { describe, expect, it } from "@jest/globals";

import { applyHomography, homography, rectToQuad, type Quad } from "./geometry";
import type { RgbaImage } from "./preprocess";
import { refineQuad } from "./refineQuad";

const W = 1280;
const H = 720;

/**
 * A card like the browser check's: a thin dark border just darker than the
 * table, a bright frame and busy art inside, so the card's outline is the
 * weakest edge on it.
 */
function scene(quad: Quad | null, table = 42): RgbaImage {
  const toCard = quad && homography(quad, rectToQuad({ x: 0, y: 0, width: 63, height: 88 }));
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = table;
      if (toCard) {
        const p = applyHomography(toCard, { x: x + 0.5, y: y + 0.5 });
        if (p.x >= 0 && p.y >= 0 && p.x < 63 && p.y < 88) {
          if (p.x < 2 || p.x > 61 || p.y < 2 || p.y > 86) v = 20; // border
          else if (p.x < 3 || p.x > 60 || p.y < 3 || p.y > 85) v = 200; // frame
          else v = ((Math.floor(p.x * 3) + Math.floor(p.y * 3)) % 2) * 180 + 30; // art
        }
      }
      data.set([v, v, v, 255], (y * W + x) * 4);
    }
  }
  return { data, width: W, height: H };
}

const card: Quad = [
  { x: 424, y: 60 },
  { x: 855, y: 60 },
  { x: 855, y: 660 },
  { x: 424, y: 660 },
];

function expectClose(actual: Quad, expected: Quad, tolerance: number) {
  actual.forEach((p, i) => {
    expect(Math.abs(p.x - expected[i]!.x)).toBeLessThan(tolerance);
    expect(Math.abs(p.y - expected[i]!.y)).toBeLessThan(tolerance);
  });
}

describe("refineQuad", () => {
  it("snaps corners that are off by a few percent onto the card's outline", () => {
    // What the corner model gave in the browser check: top-left well inside.
    const rough: Quad = [
      { x: 433, y: 104 },
      { x: 854, y: 63 },
      { x: 871, y: 653 },
      { x: 420, y: 650 },
    ];
    expectClose(refineQuad(scene(card), rough), card, 2);
  });

  it("follows a tilted card", () => {
    const tilted: Quad = [
      { x: 500, y: 80 },
      { x: 860, y: 130 },
      { x: 790, y: 650 },
      { x: 430, y: 600 },
    ];
    const rough: Quad = [
      { x: 510, y: 100 },
      { x: 850, y: 125 },
      { x: 800, y: 640 },
      { x: 440, y: 610 },
    ];
    expectClose(refineQuad(scene(tilted), rough), tilted, 3);
  });

  it("keeps the quad when there's no card to snap to", () => {
    const rough: Quad = [
      { x: 433, y: 104 },
      { x: 854, y: 63 },
      { x: 871, y: 653 },
      { x: 420, y: 650 },
    ];
    expect(refineQuad(scene(null), rough)).toBe(rough);
  });

  it("keeps the quad when the edges it finds would move a corner too far", () => {
    const rough: Quad = [
      { x: 433, y: 104 },
      { x: 854, y: 63 },
      { x: 871, y: 653 },
      { x: 420, y: 650 },
    ];
    expect(refineQuad(scene(card), rough, { maxMoveFraction: 0.02 })).toBe(rough);
  });
});
