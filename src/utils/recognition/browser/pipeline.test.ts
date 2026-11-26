import { describe, expect, it, jest } from "@jest/globals";

import { CARD_HEIGHT, CARD_WIDTH } from "../model";
import type { RgbaImage } from "../preprocess";
import { rectToQuad, type Quad } from "../geometry";
import type { CardDetector, Detection } from "./detector";
import { captureCard } from "./pipeline";

const FW = 320;
const FH = 240;
const CARD_RECT = { x: 100, y: 20, width: 140, height: 196 };

/** A frame with a checkered "card" at CARD_RECT; blurry frames get a flat card. */
function frame(sharp: boolean): RgbaImage {
  const data = new Uint8ClampedArray(FW * FH * 4);
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const inCard =
        x >= CARD_RECT.x && x < CARD_RECT.x + CARD_RECT.width && y >= CARD_RECT.y && y < CARD_RECT.y + CARD_RECT.height;
      let v = 30;
      if (inCard) v = sharp ? (((x >> 2) + (y >> 2)) % 2 ? 240 : 10) : 128;
      data.set([v, v, v, 255], (y * FW + x) * 4);
    }
  }
  return { data, width: FW, height: FH };
}

function fakeDetector(results: (Detection | null | Error)[]): CardDetector & { calls: number } {
  let i = 0;
  const detector = {
    kinds: ["opencv" as const],
    calls: 0,
    detect: () => {
      detector.calls++;
      const r = results[i++] ?? null;
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
    dispose: () => undefined,
  };
  return detector;
}

const cardQuad = rectToQuad(CARD_RECT);
const det = (quad: Quad = cardQuad, score = 0.9): Detection => ({ quad, score, source: "pose" });

describe("captureCard", () => {
  it("returns null for no frames or no detections", async () => {
    expect(await captureCard([], fakeDetector([]))).toBeNull();
    expect(await captureCard([frame(true), frame(true)], fakeDetector([null, null]))).toBeNull();
  });

  it("warps each detection and picks the sharpest as best", async () => {
    const frames = [frame(false), frame(true), frame(false)];
    const detector = fakeDetector([det(cardQuad, 0.6), det(cardQuad, 0.7), det(cardQuad, 0.8)]);
    const capture = await captureCard(frames, detector);
    expect(detector.calls).toBe(3);
    expect(capture).not.toBeNull();
    expect(capture!.cards).toHaveLength(3);
    expect(capture!.best.width).toBe(CARD_WIDTH);
    expect(capture!.best.height).toBe(CARD_HEIGHT);
    expect(capture!.best).toBe(capture!.cards[1]);
    expect(capture!.detection.score).toBe(0.7);
  });

  it("skips frames with implausible or failed detections", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const tiny = rectToQuad({ x: 0, y: 0, width: 10, height: 14 });
    const capture = await captureCard(
      [frame(true), frame(true), frame(true)],
      fakeDetector([det(tiny), new Error("boom"), det()]),
    );
    expect(capture!.cards).toHaveLength(1);
    warn.mockRestore();
  });

  it("drops detections that jumped far from the best one", async () => {
    const elsewhere = rectToQuad({ x: 10, y: 30, width: 140, height: 196 });
    const capture = await captureCard([frame(true), frame(false)], fakeDetector([det(), det(elsewhere)]));
    expect(capture!.cards).toHaveLength(1);
    expect(capture!.detection.quad).toEqual(cardQuad);
  });

  it("falls back to the guide rectangle when allowed", async () => {
    const capture = await captureCard([frame(false), frame(true)], fakeDetector([null, null]), {
      allowGuideFallback: true,
    });
    expect(capture!.detection.source).toBe("guide");
    expect(capture!.cards).toHaveLength(2);
    expect(capture!.best).toBe(capture!.cards[1]);
  });
});
