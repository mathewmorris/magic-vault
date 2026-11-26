import { describe, expect, it } from "@jest/globals";

import { pickCardQuad, rotatedRectPoints, type ContourCandidate } from "./contourPick";
import { quadArea } from "./geometry";

const W = 640;
const H = 480;

function rect(x: number, y: number, w: number, h: number) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

describe("pickCardQuad", () => {
  it("returns null with no plausible candidate", () => {
    const candidates: ContourCandidate[] = [
      { kind: "poly", points: rect(0, 0, 50, 70) }, // too small
      { kind: "poly", points: rect(100, 100, 200, 200) }, // square
      { kind: "poly", points: rect(100, 100, 200, 280).slice(0, 3) }, // 3 corners
    ];
    expect(pickCardQuad(candidates, W, H)).toBeNull();
    expect(pickCardQuad([], W, H)).toBeNull();
  });

  it("picks the largest plausible polygon", () => {
    const small = rect(10, 10, 150, 210);
    const big = rect(300, 20, 220, 310);
    const result = pickCardQuad(
      [
        { kind: "poly", points: small },
        { kind: "poly", points: big },
      ],
      W,
      H,
    );
    expect(result?.kind).toBe("poly");
    expect(quadArea(result!.quad)).toBeCloseTo(220 * 310);
    expect(result!.score).toBeGreaterThan(0.6);
    expect(result!.score).toBeLessThanOrEqual(0.7);
  });

  it("prefers a polygon over a bigger bounding box", () => {
    const result = pickCardQuad(
      [
        { kind: "minAreaRect", points: rect(50, 20, 300, 420), contourArea: 300 * 420 },
        { kind: "poly", points: rect(300, 20, 200, 280) },
      ],
      W,
      H,
    );
    expect(result?.kind).toBe("poly");
  });

  it("uses a bounding box when it's well filled, and not when it's mostly empty", () => {
    const box = rect(200, 40, 220, 310);
    const filled = pickCardQuad([{ kind: "minAreaRect", points: box, contourArea: 220 * 310 * 0.9 }], W, H);
    expect(filled?.kind).toBe("minAreaRect");
    expect(filled!.score).toBeLessThanOrEqual(0.5);
    expect(pickCardQuad([{ kind: "minAreaRect", points: box, contourArea: 220 * 310 * 0.4 }], W, H)).toBeNull();
  });

  it("orders corners from an unordered polygon", () => {
    const [a, b, c, d] = rect(200, 40, 220, 310);
    const result = pickCardQuad([{ kind: "poly", points: [c!, a!, d!, b!] }], W, H);
    expect(result!.quad[0]).toEqual({ x: 200, y: 40 });
    expect(result!.quad[2]).toEqual({ x: 420, y: 350 });
  });
});

describe("rotatedRectPoints", () => {
  it("returns the corners of an unrotated box", () => {
    const points = rotatedRectPoints({ center: { x: 10, y: 20 }, size: { width: 4, height: 6 }, angle: 0 });
    expect(points).toEqual([
      { x: 8, y: 17 },
      { x: 12, y: 17 },
      { x: 12, y: 23 },
      { x: 8, y: 23 },
    ]);
  });

  it("keeps the size when rotated", () => {
    const points = rotatedRectPoints({ center: { x: 0, y: 0 }, size: { width: 4, height: 6 }, angle: 30 });
    expect(Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y)).toBeCloseTo(4);
    expect(Math.hypot(points[2]!.x - points[1]!.x, points[2]!.y - points[1]!.y)).toBeCloseTo(6);
  });
});
