/**
 * Runs the real OpenCV.js (it works in Node too) on synthetic frames, so the
 * OpenCV calls in the detector are exercised, not just the pure picker.
 */
import { beforeAll, describe, expect, it } from "@jest/globals";

import { applyHomography, homography, rectToQuad, type Quad } from "../geometry";
import type { RgbaImage } from "../preprocess";
import { opencvDetect } from "./detector";
import { loadOpenCv, type Cv } from "./opencv";

const W = 960;
const H = 720;

/** A card with a dark border on a mottled background, through a perspective quad. */
function scene(quad: Quad | null, background = 90): RgbaImage {
  const toCard = quad && homography(quad, rectToQuad({ x: 0, y: 0, width: 63, height: 88 }));
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = background + ((x * 7 + y * 3) % 11);
      if (toCard) {
        const p = applyHomography(toCard, { x: x + 0.5, y: y + 0.5 });
        if (p.x >= 0 && p.y >= 0 && p.x < 63 && p.y < 88) {
          v = p.x < 3 || p.x > 60 || p.y < 3 || p.y > 85 ? 20 : 200;
        }
      }
      data.set([v, v, v, 255], (y * W + x) * 4);
    }
  }
  return { data, width: W, height: H };
}

let cv: Cv;
beforeAll(async () => {
  cv = (await loadOpenCv()).cv;
}, 120_000);

describe("opencvDetect", () => {
  it("finds a tilted card's corners", () => {
    const quad: Quad = [
      { x: 350, y: 120 },
      { x: 640, y: 160 },
      { x: 600, y: 600 },
      { x: 300, y: 560 },
    ];
    const found = opencvDetect(cv, scene(quad));
    expect(found?.source).toBe("opencv");
    found!.quad.forEach((p, i) => {
      expect(Math.abs(p.x - quad[i]!.x)).toBeLessThan(8);
      expect(Math.abs(p.y - quad[i]!.y)).toBeLessThan(8);
    });
  });

  it("returns a portrait quad for a card lying sideways", () => {
    const quad: Quad = [
      { x: 200, y: 200 },
      { x: 720, y: 200 },
      { x: 720, y: 570 },
      { x: 200, y: 570 },
    ];
    const found = opencvDetect(cv, scene(quad));
    expect(found).not.toBeNull();
    const [tl, tr, , bl] = found!.quad;
    expect(Math.hypot(tl.x - bl.x, tl.y - bl.y)).toBeGreaterThan(Math.hypot(tl.x - tr.x, tl.y - tr.y));
  });

  it("returns null with no card in view", () => {
    expect(opencvDetect(cv, scene(null))).toBeNull();
  });
});
