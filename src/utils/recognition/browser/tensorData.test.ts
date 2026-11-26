import { describe, expect, it } from "@jest/globals";

import {
  LETTERBOX_FILL,
  float32ToFloat16Bits,
  fromFloat16Bits,
  letterboxTensor,
  numericShape,
  tensorToNumbers,
  toFloat16Bits,
} from "./tensorData";

describe("float16", () => {
  it.each([
    [1, 0x3c00],
    [-2, 0xc000],
    [0.5, 0x3800],
    [65504, 0x7bff],
    [0, 0],
    [2 ** -24, 0x0001],
    [1e-9, 0],
    [70000, 0x7c00],
    [Infinity, 0x7c00],
  ])("encodes %p", (value, bits) => {
    expect(toFloat16Bits(value)).toBe(bits);
  });

  it("encodes NaN as NaN", () => {
    expect(Number.isNaN(fromFloat16Bits(toFloat16Bits(NaN)))).toBe(true);
  });

  it("round-trips pixel-range values closely", () => {
    for (let v = -3; v <= 3; v += 0.0137) {
      expect(fromFloat16Bits(toFloat16Bits(v))).toBeCloseTo(v, 2);
    }
    expect(fromFloat16Bits(toFloat16Bits(0.1))).toBeCloseTo(0.1, 4);
  });

  it("converts arrays", () => {
    expect(Array.from(float32ToFloat16Bits([1, 0.5]))).toEqual([0x3c00, 0x3800]);
  });
});

describe("tensorToNumbers", () => {
  it("decodes float16 bits", () => {
    const values = tensorToNumbers({ type: "float16", dims: [2], data: new Uint16Array([0x3c00, 0xc000]) });
    expect(Array.from(values)).toEqual([1, -2]);
  });

  it("passes float32 through and converts int64", () => {
    const f = new Float32Array([1.5]);
    expect(tensorToNumbers({ type: "float32", dims: [1], data: f })).toBe(f);
    expect(tensorToNumbers({ type: "int64", dims: [2], data: new BigInt64Array([BigInt(3), BigInt(-1)]) })).toEqual([3, -1]);
  });

  it("throws on non-numeric data", () => {
    expect(() => tensorToNumbers({ type: "string", dims: [1], data: "x" })).toThrow();
  });
});

describe("numericShape", () => {
  it("nulls out symbolic dims", () => {
    expect(numericShape(["batch", 3, 448, 320])).toEqual([null, 3, 448, 320]);
    expect(numericShape(undefined)).toEqual([]);
  });
});

describe("letterboxTensor", () => {
  it("scales a wide frame into the middle band and pads the rest", () => {
    // 8x4 frame, red on the left half, blue on the right.
    const data = new Uint8ClampedArray(8 * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 8; x++) data.set(x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * 8 + x) * 4);
    }
    const { data: t, letterbox } = letterboxTensor({ data, width: 8, height: 4 }, 4);
    expect(letterbox).toMatchObject({ scale: 0.5, padX: 0, padY: 1 });
    const plane = 16;
    const at = (c: number, x: number, y: number) => t[c * plane + y * 4 + x]!;
    // Padding rows.
    expect(at(0, 0, 0)).toBeCloseTo(LETTERBOX_FILL);
    expect(at(2, 3, 3)).toBeCloseTo(LETTERBOX_FILL);
    // Content rows.
    expect(at(0, 0, 1)).toBeCloseTo(1);
    expect(at(2, 0, 1)).toBeCloseTo(0);
    expect(at(0, 3, 2)).toBeCloseTo(0);
    expect(at(2, 3, 2)).toBeCloseTo(1);
  });
});
