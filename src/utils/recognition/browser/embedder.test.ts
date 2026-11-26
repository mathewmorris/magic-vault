import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { EmbedModelSpec } from "../model";
import type { RgbaImage } from "../preprocess";
import { embedBurst, embedderFromSession, resolveLayout, type MakeTensor, type SessionLike } from "./embedder";
import { fromFloat16Bits } from "./tensorData";

const spec: EmbedModelSpec = {
  id: "test-model",
  url: "https://example.invalid/model.onnx",
  inputWidth: 4,
  inputHeight: 6,
  dims: 3,
  layout: "NCHW",
  mean: [0, 0, 0],
  std: [1, 1, 1],
};

type FakeTensor = { type: string; data: Float32Array | Uint16Array; dims: number[]; dispose: () => void };

function solid(width: number, height: number, rgb: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return { data, width, height };
}

/** A fake session whose output is the mean of each input channel. */
function fakeSession(opts: { shape?: (number | string)[]; type?: string; outputLength?: number } = {}) {
  const feeds: Record<string, FakeTensor>[] = [];
  const disposed: string[] = [];
  const session: SessionLike = {
    inputNames: ["pixel_values"],
    outputNames: ["embedding"],
    inputMetadata: [{ name: "pixel_values", isTensor: true, type: opts.type ?? "float32", shape: opts.shape }],
    run(input) {
      const tensor = input.pixel_values as FakeTensor;
      feeds.push(input as Record<string, FakeTensor>);
      const values =
        tensor.type === "float16" ? Array.from(tensor.data, (b) => fromFloat16Bits(b)) : Array.from(tensor.data);
      const plane = values.length / 3;
      const nchw = tensor.dims[1] === 3;
      const means = [0, 1, 2].map((c) => {
        let sum = 0;
        for (let i = 0; i < plane; i++) sum += nchw ? values[c * plane + i]! : values[i * 3 + c]!;
        return sum / plane + 0.01;
      });
      const out = new Float32Array(opts.outputLength ?? 3);
      out.set(means.slice(0, out.length));
      return Promise.resolve({
        embedding: { type: "float32", dims: [1, out.length], data: out, dispose: () => disposed.push("out") },
      });
    },
    release: () => Promise.resolve(),
  };
  return { session, feeds, disposed };
}

const makeTensor: MakeTensor = (type, data, dims) => ({ type, data, dims, dispose: () => undefined });

describe("resolveLayout", () => {
  let warn: jest.SpiedFunction<typeof console.warn>;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it("keeps the spec's layout when the model agrees or doesn't say", () => {
    expect(resolveLayout({ layout: "NCHW" }, ["batch", 3, 448, 320])).toBe("NCHW");
    expect(resolveLayout({ layout: "NHWC" }, undefined)).toBe("NHWC");
    expect(resolveLayout({ layout: "NHWC" }, ["n", "h", "w", "c"])).toBe("NHWC");
    expect(warn).not.toHaveBeenCalled();
  });

  it("follows the model's shape when it contradicts the spec, and warns", () => {
    expect(resolveLayout({ layout: "NCHW" }, [1, 448, 320, 3])).toBe("NHWC");
    expect(resolveLayout({ layout: "NHWC" }, [1, 3, 448, 320])).toBe("NCHW");
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("embedderFromSession", () => {
  it("feeds an NCHW tensor of the spec's size and returns an L2-normalized vector", async () => {
    const { session, feeds, disposed } = fakeSession({ shape: [1, 3, 6, 4] });
    const embedder = embedderFromSession(session, spec, makeTensor);
    expect(embedder.modelId).toBe("test-model");
    const vector = await embedder.embed(solid(8, 12, [255, 0, 0]));
    expect(feeds[0]!.pixel_values!.dims).toEqual([1, 3, 6, 4]);
    expect(feeds[0]!.pixel_values!.type).toBe("float32");
    const norm = Math.hypot(...vector);
    expect(norm).toBeCloseTo(1, 6);
    // Red channel dominates.
    expect(vector[0]!).toBeGreaterThan(0.99);
    expect(disposed).toEqual(["out"]);
  });

  it("follows an NHWC model even when the spec says NCHW", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { session, feeds } = fakeSession({ shape: [1, 6, 4, 3] });
    const vector = await embedderFromSession(session, spec, makeTensor).embed(solid(4, 6, [0, 255, 0]));
    expect(feeds[0]!.pixel_values!.dims).toEqual([1, 6, 4, 3]);
    expect(vector[1]!).toBeGreaterThan(0.99);
    warn.mockRestore();
  });

  it("sends float16 when the model's input is float16", async () => {
    const { session, feeds } = fakeSession({ shape: [1, 3, 6, 4], type: "float16" });
    const vector = await embedderFromSession(session, spec, makeTensor).embed(solid(4, 6, [0, 0, 255]));
    expect(feeds[0]!.pixel_values!.type).toBe("float16");
    expect(feeds[0]!.pixel_values!.data).toBeInstanceOf(Uint16Array);
    expect(vector[2]!).toBeGreaterThan(0.99);
  });

  it("rejects an output of the wrong size", async () => {
    const { session } = fakeSession({ outputLength: 5 });
    await expect(embedderFromSession(session, spec, makeTensor).embed(solid(4, 6, [1, 2, 3]))).rejects.toThrow(
      /expected 3/,
    );
  });

  it("refuses to run after dispose", async () => {
    const { session } = fakeSession();
    const embedder = embedderFromSession(session, spec, makeTensor);
    embedder.dispose();
    await expect(embedder.embed(solid(4, 6, [1, 2, 3]))).rejects.toThrow(/disposed/);
  });
});

describe("embedBurst", () => {
  it("averages the embeddings of each card", async () => {
    const { session, feeds } = fakeSession();
    const embedder = embedderFromSession(session, spec, makeTensor);
    const vector = await embedBurst(embedder, [solid(4, 6, [255, 0, 0]), solid(4, 6, [0, 255, 0])]);
    expect(feeds).toHaveLength(2);
    expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
    expect(vector[0]!).toBeCloseTo(vector[1]!, 6);
    expect(vector[2]!).toBeLessThan(0.1);
  });

  it("rejects an empty burst", async () => {
    const { session } = fakeSession();
    await expect(embedBurst(embedderFromSession(session, spec, makeTensor), [])).rejects.toThrow();
  });
});
