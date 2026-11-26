import { describe, expect, it } from "@jest/globals";

import { resizeBilinear, toModelInput, type RgbaImage } from "./preprocess";

function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { data, width, height };
}

describe("resizeBilinear", () => {
  it("keeps a solid color solid", () => {
    const out = resizeBilinear(solid(7, 5, [10, 20, 30, 255]), 3, 11);
    expect(out.width).toBe(3);
    expect(out.height).toBe(11);
    for (let i = 0; i < out.width * out.height; i++) {
      expect(Array.from(out.data.slice(i * 4, i * 4 + 4))).toEqual([10, 20, 30, 255]);
    }
  });

  it("interpolates between two columns", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 200, 200, 200, 255]);
    const out = resizeBilinear({ data, width: 2, height: 1 }, 4, 1);
    const reds = [0, 1, 2, 3].map((x) => out.data[x * 4]);
    expect(reds).toEqual([0, 50, 150, 200]);
  });

  it("rejects truncated data", () => {
    expect(() => resizeBilinear({ data: new Uint8Array(4), width: 2, height: 2 }, 1, 1)).toThrow();
  });
});

describe("toModelInput", () => {
  const spec = {
    inputWidth: 2,
    inputHeight: 2,
    mean: [0.5, 0.5, 0.5] as [number, number, number],
    std: [0.5, 0.5, 0.5] as [number, number, number],
  };

  it("normalizes and lays out channels first (NCHW)", () => {
    const out = toModelInput(solid(2, 2, [255, 0, 127.5, 255]), { ...spec, layout: "NCHW" });
    expect(out).toHaveLength(12);
    expect(Array.from(out.slice(0, 4))).toEqual([1, 1, 1, 1]);
    expect(Array.from(out.slice(4, 8))).toEqual([-1, -1, -1, -1]);
    // 127.5 is stored as 128 in a clamped byte array.
    expect(out[8]).toBeCloseTo(128 / 255 / 0.5 - 1, 5);
  });

  it("supports channels last (NHWC)", () => {
    const out = toModelInput(solid(2, 2, [255, 0, 0, 255]), { ...spec, layout: "NHWC" });
    expect(Array.from(out.slice(0, 3))).toEqual([1, -1, -1]);
  });

  it("resizes to the model's input size", () => {
    const out = toModelInput(solid(10, 14, [0, 0, 0, 255]), { ...spec, layout: "NCHW" });
    expect(out).toHaveLength(2 * 2 * 3);
  });
});
