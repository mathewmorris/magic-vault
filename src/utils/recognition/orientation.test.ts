import { describe, expect, it, jest } from "@jest/globals";

import type { ScanCard, ScanMatch, ScanMatchResult } from "~/server/api/routers/scan";
import { orderCorners, rectToQuad, rotateImage, warpQuad, type Orientation, type Point, type Quad } from "./geometry";
import type { CardOcrResult } from "./ocr";
import {
  bestVariantIndex,
  MAX_ORIENTATION_VARIANTS,
  needsOrientationRetry,
  orientationCandidates,
  readColourCues,
  recognizeOriented,
  topSimilarity,
  trustedOcrName,
  UPRIGHT_SURE_SIMILARITY,
  type OrientedMatchInput,
  type OrientedRecognitionDeps,
} from "./orientation";
import type { RgbaImage } from "./preprocess";

// ---- Fixtures ----

function card(id: string, name: string, extra: Partial<ScanCard> = {}): ScanCard {
  return {
    id,
    name,
    set: "tst",
    set_name: "Test",
    collector_number: "1",
    lang: "en",
    rarity: "rare",
    layout: "normal",
    image_uris: null,
    card_faces: null,
    ...extra,
  };
}

const m = (c: ScanCard, similarity: number, face = 0): ScanMatch => ({ card: c, face, similarity });

const bolt = card("bolt", "Lightning Bolt", { set: "m11", collector_number: "149" });
const shock = card("shock", "Shock");
const bears = card("bears", "Grizzly Bears");
const fireIce = card("fire-ice", "Fire // Ice", {
  layout: "split",
  card_faces: [{ name: "Fire" }, { name: "Ice" }],
});
const invasion = card("invasion", "Invasion of Zendikar // Awakened Skyclave", {
  layout: "battle",
  card_faces: [{ name: "Invasion of Zendikar" }, { name: "Awakened Skyclave" }],
});

/** A portrait card-shaped quad centered at (cx, cy), turned `degrees` clockwise on screen. */
function cardQuad(degrees: number, cx = 400, cy = 400, width = 150): Quad {
  const height = (width * 88) / 63;
  const t = (degrees * Math.PI) / 180;
  const corners: Point[] = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ].map(({ x, y }) => ({ x: cx + x * Math.cos(t) - y * Math.sin(t), y: cy + x * Math.sin(t) + y * Math.cos(t) }));
  // What the detectors hand on: corners put in screen order by orderCorners.
  return orderCorners(corners);
}

/** w x h image whose red channel is the pixel index mod 256, green its row. */
function patterned(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([i % 256, Math.floor(i / width), 7, 255], i * 4);
  return { data, width, height };
}

const ocr = (name: string | null, set?: string, number?: string): CardOcrResult => ({
  name,
  collector: set && number ? { setCode: set, collectorNumber: number, lang: "en", rarity: null, total: null } : null,
  rawTitle: name ?? "",
  rawCollector: set && number ? `${number} ${set}` : "",
});

// ---- Variant selection ----

describe("orientationCandidates", () => {
  it("tries upright and upside down for a portrait card", () => {
    expect(orientationCandidates(cardQuad(0))).toEqual([0, 180]);
    expect(orientationCandidates(cardQuad(15))).toEqual([0, 180]);
  });

  it("tries the same two for an upside-down card: the quad can't tell", () => {
    // orderCorners only sees four points, so 180 degrees looks like 0.
    cardQuad(180).forEach((p, i) => {
      expect(p.x).toBeCloseTo(cardQuad(0)[i]!.x, 6);
      expect(p.y).toBeCloseTo(cardQuad(0)[i]!.y, 6);
    });
    expect(orientationCandidates(cardQuad(180))).toEqual([0, 180]);
    expect(orientationCandidates(cardQuad(-170))).toEqual([0, 180]);
  });

  it("adds both landscape turns for a card lying sideways, capped at 4", () => {
    for (const degrees of [90, -90, 75, 105]) {
      const candidates = orientationCandidates(cardQuad(degrees));
      expect(candidates).toEqual([0, 180, 270, 90]);
      expect(candidates.length).toBeLessThanOrEqual(MAX_ORIENTATION_VARIANTS);
    }
    expect(orientationCandidates(rectToQuad({ x: 0, y: 0, width: 280, height: 200 }))).toEqual([0, 180, 270, 90]);
  });

  it("270 of a sideways card's portrait crop is the card as the camera saw it", () => {
    // A landscape card in a frame: warp it as the scanner does (orderCorners
    // turns it portrait), turn that 270, and compare with a straight
    // landscape crop of the same rectangle.
    const frame = patterned(60, 40);
    const rect = rectToQuad({ x: 10, y: 8, width: 42, height: 30 });
    const portrait = warpQuad(frame, orderCorners([...rect]), 30, 42);
    const seen = warpQuad(frame, rect, 42, 30);
    const turned = rotateImage(portrait, 270);
    expect([turned.width, turned.height]).toEqual([42, 30]);
    expect(Array.from(turned.data)).toEqual(Array.from(seen.data));
    // ...and 90 is the same upside down.
    expect(Array.from(rotateImage(portrait, 90).data)).toEqual(Array.from(rotateImage(seen, 180).data));
  });
});

describe("bestVariantIndex and topSimilarity", () => {
  it("picks the variant whose best match is most similar", () => {
    const variants = [
      [m(shock, 0.31), m(bolt, 0.42)],
      [m(bolt, 0.88), m(shock, 0.2)],
      [m(shock, 0.5)],
    ];
    expect(variants.map((v) => topSimilarity(v))).toEqual([0.42, 0.88, 0.5]);
    expect(bestVariantIndex(variants.map((v) => topSimilarity(v)))).toBe(1);
  });

  it("gives a tie to the earlier variant and skips empty ones", () => {
    expect(bestVariantIndex([0.7, 0.7, 0.6])).toBe(0);
    expect(bestVariantIndex([null, 0.2, 0.4])).toBe(2);
    expect(bestVariantIndex([null, null])).toBe(0);
    expect(bestVariantIndex([])).toBe(0);
    expect(topSimilarity([])).toBeNull();
  });
});

describe("needsOrientationRetry", () => {
  it("retries only an unconfident result with a weak best match", () => {
    expect(needsOrientationRetry({ candidates: [], confident: true }, [m(bolt, 0.3)])).toBe(false);
    expect(needsOrientationRetry({ candidates: [], confident: false }, [m(bolt, UPRIGHT_SURE_SIMILARITY)])).toBe(false);
    expect(needsOrientationRetry({ candidates: [], confident: false }, [m(bolt, 0.4)])).toBe(true);
    expect(needsOrientationRetry({ candidates: [], confident: false }, [])).toBe(true);
  });
});

describe("trustedOcrName", () => {
  it("keeps the name for a normal card upright or upside down", () => {
    expect(trustedOcrName("Lightning Bolt", [m(bolt, 0.8)], 0)).toBe("Lightning Bolt");
    expect(trustedOcrName("Lightning Bolt", [m(bolt, 0.8)], 180)).toBe("Lightning Bolt");
  });

  it("drops it when a landscape turn won", () => {
    expect(trustedOcrName("Lightning Bolt", [m(bolt, 0.8)], 270)).toBeNull();
    expect(trustedOcrName("Lightning Bolt", [m(bolt, 0.8)], 90)).toBeNull();
  });

  it("drops it when the best match's layout has no title bar on top", () => {
    for (const layout of ["split", "aftermath", "planar"]) {
      expect(trustedOcrName("Fire", [m(card("x", "X", { layout }), 0.8)], 0)).toBeNull();
    }
    // Only the best match counts, whatever order the matches came in.
    expect(trustedOcrName("Fire", [m(bolt, 0.4), m(fireIce, 0.8)], 0)).toBeNull();
    expect(trustedOcrName("Lightning Bolt", [m(fireIce, 0.4), m(bolt, 0.8)], 0)).toBe("Lightning Bolt");
  });

  it("keeps it for a battle's back face, which is an ordinary portrait card", () => {
    expect(trustedOcrName("Invasion of Zendikar", [m(invasion, 0.8, 0)], 0)).toBeNull();
    expect(trustedOcrName("Awakened Skyclave", [m(invasion, 0.8, 1)], 0)).toBe("Awakened Skyclave");
  });

  it("passes no name through as null", () => {
    expect(trustedOcrName(null, [m(bolt, 0.8)], 0)).toBeNull();
    expect(trustedOcrName("", [m(bolt, 0.8)], 0)).toBeNull();
  });
});

// ---- recognizeOriented with fake embedder, OCR and server ----

type Fakes = {
  deps: OrientedRecognitionDeps;
  embedded: RgbaImage[];
  ocrRead: RgbaImage[];
  /** The orientation passed with each OCR read. */
  ocrTurns: Orientation[];
  calls: OrientedMatchInput[];
};

/**
 * Fake embedder: a 1-d "embedding" holding how many times embed() has run,
 * so the server fake can tell variants apart. The server fake answers each
 * call with the next entry of `answers`.
 */
function fakes(answers: ScanMatchResult[], ocrResults: (CardOcrResult | null)[]): Fakes {
  const embedded: RgbaImage[] = [];
  const ocrRead: RgbaImage[] = [];
  const ocrTurns: Orientation[] = [];
  const calls: OrientedMatchInput[] = [];
  let next = 0;
  let ocrNext = 0;
  const deps: OrientedRecognitionDeps = {
    embedBurst: jest.fn((cards: RgbaImage[]) => Promise.resolve([cards.length])),
    embed: (image) => {
      embedded.push(image);
      return Promise.resolve([100 + embedded.length]);
    },
    ocr: (image, orientation) => {
      ocrRead.push(image);
      ocrTurns.push(orientation);
      return Promise.resolve(ocrResults[ocrNext++] ?? null);
    },
    match: (input) => {
      calls.push(input);
      const answer = answers[next++];
      if (!answer) throw new Error(`unexpected match call ${next}`);
      return Promise.resolve(answer);
    },
  };
  return { deps, embedded, ocrRead, ocrTurns, calls };
}

const best = patterned(4, 6);
const burst = [patterned(4, 6), best];

describe("recognizeOriented", () => {
  it("stops after one call when the upright scan is confident", async () => {
    const f = fakes([{ matches: [m(bolt, 0.9), m(shock, 0.4)], printing: null }], [ocr("Lightning Bolt")]);

    const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(0) }, f.deps);

    expect(out.orientation).toBe(0);
    expect(out.orientationsTried).toEqual([0]);
    expect(out.card).toBe(best);
    expect(out.result.confident).toBe(true);
    expect(out.result.candidates[0]!.card.id).toBe("bolt");
    expect(f.calls).toEqual([{ embedding: [2], printing: undefined }]);
    expect(f.embedded).toHaveLength(0);
    expect(f.ocrRead).toEqual([best]);
  });

  it("doesn't retry an unconfident result whose best match is strong (reprints)", async () => {
    const boltB = card("bolt-b", "Lightning Bolt", { set: "2xm" });
    const f = fakes([{ matches: [m(bolt, 0.84), m(boltB, 0.83)], printing: null }], [ocr(null)]);

    const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(0) }, f.deps);

    expect(out.result.confident).toBe(false);
    expect(f.calls).toHaveLength(1);
    expect(out.orientationsTried).toEqual([0]);
  });

  it("turns an upside-down card round, re-reads OCR and looks up the new printing", async () => {
    const upsideDown: ScanMatchResult = { matches: [m(shock, 0.32)], printing: null };
    const f = fakes(
      [
        upsideDown,
        // Second call: the 180 variant (index 1) wins.
        { matches: [m(bolt, 0.91)], printing: null, variant: 1, variantSimilarities: [0.32, 0.91] },
        // Third call: the winning embedding again, with the printing OCR read that way up.
        { matches: [m(bolt, 0.91)], printing: bolt },
      ],
      [ocr("uɐǝ ʇɥƃıl"), ocr("Lightning Bolt", "M11", "149")],
    );

    const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(180) }, f.deps);

    expect(out.orientation).toBe(180);
    expect(out.orientationsTried).toEqual([0, 180]);
    // The 180 crop was embedded once (sharpest frame only) and OCR'd.
    expect(f.embedded).toHaveLength(1);
    expect(Array.from(f.embedded[0]!.data)).toEqual(Array.from(rotateImage(best, 180).data));
    expect(f.ocrRead).toHaveLength(2);
    expect(f.ocrRead[1]).toBe(f.embedded[0]);
    expect(f.ocrTurns).toEqual([0, 180]);
    expect(out.card).toBe(f.embedded[0]);
    expect(f.calls).toEqual([
      { embedding: [2], printing: undefined },
      { embedding: [2], alternates: [[101]], printing: undefined },
      { embedding: [101], printing: { set: "M11", collectorNumber: "149", name: "Lightning Bolt" } },
    ]);
    expect(out.server.printing).toEqual(bolt);
    expect(out.server.variant).toBe(1);
    expect(out.server.variantSimilarities).toEqual([0.32, 0.91]);
    expect(out.result.confident).toBe(true);
    expect(out.result.candidates[0]!.reasons).toContain("set and number match");
  });

  it("drops a printing the upright OCR misread once another orientation wins", async () => {
    const f = fakes(
      [
        { matches: [m(bears, 0.3)], printing: shock },
        { matches: [m(bolt, 0.9)], printing: shock, variant: 1, variantSimilarities: [0.3, 0.9] },
      ],
      [ocr(null, "ZZZ", "9"), ocr("Lightning Bolt")],
    );

    const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(0) }, f.deps);

    expect(out.orientation).toBe(180);
    expect(f.calls).toHaveLength(2);
    expect(out.server.printing).toBeNull();
    expect(out.result.candidates.map((c) => c.card.id)).toEqual(["bolt"]);
  });

  it("tries the landscape turns for a sideways card and ignores the title OCR when one wins", async () => {
    const f = fakes(
      [
        { matches: [m(shock, 0.25)], printing: null },
        {
          matches: [m(invasion, 0.86, 0), m(bolt, 0.3)],
          printing: null,
          variant: 2,
          variantSimilarities: [0.25, 0.2, 0.86, 0.4],
        },
      ],
      [ocr("Shock"), ocr("Lightning Bolt")],
    );

    const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(90) }, f.deps);

    expect(out.orientationsTried).toEqual([0, 180, 270, 90]);
    expect(out.orientation).toBe(270);
    // 180, 270, 90 embedded in that order; the landscape ones are landscape.
    expect(f.embedded.map((img) => [img.width, img.height])).toEqual([
      [4, 6],
      [6, 4],
      [6, 4],
    ]);
    expect(f.calls[1]).toEqual({ embedding: [2], alternates: [[101], [102], [103]], printing: undefined });
    expect(out.card).toBe(f.embedded[1]);
    // OCR read "Lightning Bolt" off the turned card, but a landscape crop has
    // no title bar where it looked, so the name isn't used.
    expect(out.ocr?.name).toBe("Lightning Bolt");
    expect(out.result.candidates[0]!.card.id).toBe("invasion");
    expect(out.result.candidates.every((c) => c.nameScore === null)).toBe(true);
  });

  it("stays upright when the upright variant still wins the second call", async () => {
    const f = fakes(
      [
        { matches: [m(shock, 0.5)], printing: null },
        { matches: [m(shock, 0.5)], printing: null, variant: 0, variantSimilarities: [0.5, 0.2] },
      ],
      [ocr("Shock")],
    );

    const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(0) }, f.deps);

    expect(out.orientation).toBe(0);
    expect(out.orientationsTried).toEqual([0, 180]);
    expect(out.card).toBe(best);
    expect(f.ocrRead).toHaveLength(1);
    expect(out.result.candidates[0]!.card.id).toBe("shock");
  });

  describe("text only, no card pictures indexed", () => {
    const empty: ScanMatchResult = { matches: [], printing: null };
    const noScores: ScanMatchResult = { matches: [], printing: null, variant: 0, variantSimilarities: [null, null] };

    it("reads an upside-down card the other way up and keeps that read", async () => {
      const f = fakes(
        [empty, noScores, { matches: [], printing: bolt }],
        // Upright, the title is noise and the collector line nothing.
        [ocr(null), ocr("Lightning Bolt", "M11", "149")],
      );

      const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(180) }, f.deps);

      expect(out.orientation).toBe(180);
      expect(f.ocrTurns).toEqual([0, 180]);
      expect(f.calls[2]).toEqual({
        embedding: [101],
        printing: { set: "M11", collectorNumber: "149", name: "Lightning Bolt" },
      });
      expect(out.server.printing).toEqual(bolt);
      expect(out.result.confident).toBe(true);
      expect(out.result.candidates[0]!.card.id).toBe("bolt");
    });

    it("stays upright when the upside-down read finds no more", async () => {
      const f = fakes([empty, noScores], [ocr("Shock"), ocr(null)]);

      const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(0) }, f.deps);

      expect(out.orientation).toBe(0);
      expect(out.card).toBe(best);
      expect(out.orientationsTried).toEqual([0, 180]);
      expect(f.calls).toHaveLength(2);
    });

    it("keeps upright on a tie", async () => {
      const f = fakes([empty, noScores], [ocr("Shock"), ocr("Kcohs")]);
      const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(0) }, f.deps);
      expect(out.orientation).toBe(0);
    });
  });

  it("ignores the name on a split card even upright", async () => {
    const split: ScanMatchResult = { matches: [m(fireIce, 0.62), m(shock, 0.6)], printing: null };
    const f = fakes([split, { ...split, variant: 0, variantSimilarities: [0.62, 0.3] }], [ocr("Shock")]);
    // The misread "Shock" must not lift Shock over Fire // Ice.
    const out = await recognizeOriented({ cards: burst, best, quad: cardQuad(0) }, f.deps);
    expect(out.result.candidates[0]!.card.id).toBe("fire-ice");
    expect(out.result.candidates.every((c) => c.nameScore === null)).toBe(true);
  });
});

describe("readColourCues", () => {
  it("skips the colour cues for landscape turns, whose regions don't line up", () => {
    const landscape = patterned(680, 488);
    expect(readColourCues(landscape, 90)).toEqual({ border: null, rarityColour: null });
    expect(readColourCues(landscape, 270)).toEqual({ border: null, rarityColour: null });
  });
});
