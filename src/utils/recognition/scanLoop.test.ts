import type { RecognitionCandidate, RecognitionResult } from "./fuse";
import type { Quad } from "./geometry";
import {
  AUTO_ADD_MIN_SCORE,
  CAPTURE_MAX_SIDE,
  CAPTURE_MIN_SIDE,
  bestOf,
  captureMaxSide,
  sureMatch,
} from "./scanLoop";

function candidate(id: string, score: number): RecognitionCandidate {
  return { card: { id }, score } as unknown as RecognitionCandidate;
}

function result(confident: boolean, ...scores: number[]): RecognitionResult {
  return { confident, candidates: scores.map((score, i) => candidate(`c${i}`, score)) };
}

function rect(x: number, y: number, w: number, h: number): Quad {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

describe("sureMatch", () => {
  test("is the top pick of a confident ranking", () => {
    expect(sureMatch(result(true, 1.2, 0.7))?.card.id).toBe("c0");
  });

  test("is null when the ranking isn't confident, is empty, or is missing", () => {
    expect(sureMatch(result(false, 1.2, 0.7))).toBeNull();
    expect(sureMatch(result(true))).toBeNull();
    expect(sureMatch(null)).toBeNull();
  });

  test("is null for a confident pick under the score floor", () => {
    expect(sureMatch(result(true, AUTO_ADD_MIN_SCORE - 0.01))).toBeNull();
    expect(sureMatch(result(true, AUTO_ADD_MIN_SCORE))).not.toBeNull();
  });
});

describe("bestOf", () => {
  test("keeps the look whose top pick scored best", () => {
    const low = { result: result(false, 0.5) };
    const high = { result: result(false, 0.7) };
    expect(bestOf(null, low)).toBe(low);
    expect(bestOf(low, high)).toBe(high);
    expect(bestOf(high, low)).toBe(high);
    expect(bestOf(high, { result: null })).toBe(high);
  });
});

describe("captureMaxSide", () => {
  test("keeps the full size with no card in view", () => {
    expect(captureMaxSide(null, 1920, 1080)).toBe(CAPTURE_MAX_SIDE);
  });

  test("keeps the full size while the card is small in the frame", () => {
    // Card 600 px tall in a 1280 px tall portrait frame: it needs every pixel.
    expect(captureMaxSide(rect(150, 300, 430, 600), 720, 1280)).toBe(CAPTURE_MAX_SIDE);
    // Card 1000 px tall in a 1920 px tall frame: 1920 * 850 / 1000 is over the cap.
    expect(captureMaxSide(rect(200, 400, 714, 1000), 1080, 1920)).toBe(CAPTURE_MAX_SIDE);
  });

  test("shrinks the frame when the card fills most of it", () => {
    // Card 1000 px tall in a 1280 px tall frame: 1280 * 850 / 1000.
    expect(captureMaxSide(rect(0, 100, 714, 1000), 720, 1280)).toBe(1088);
  });

  test("never drops below what the corner model reads", () => {
    // Corners past the frame's edges (the card is closer than the frame).
    expect(captureMaxSide(rect(-600, -800, 2000, 2800), 720, 1280)).toBe(CAPTURE_MIN_SIDE);
  });

  test("uses the card's long side whichever way it's turned", () => {
    expect(captureMaxSide(rect(100, 0, 1000, 714), 1280, 720)).toBe(1088);
  });
});
