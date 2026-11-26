/**
 * Runs the real ONNX path (jpeg-js decode -> toModelInput -> onnxruntime-node)
 * against scripts/fixtures/tiny-embedder.onnx, a few-KB stand-in with the
 * real embedder's input and output shapes.
 *
 * @jest-environment ./src/test/jest/hostTypedArraysEnvironment.cjs
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import jpeg from "jpeg-js";

import { EMBED_MODEL } from "../../utils/recognition/model";
import { decodeJpeg, ensureModelFile, loadEmbedder, modelCacheFileName, type Embedder } from "./nodeEmbedder";

const TINY_MODEL = path.join(__dirname, "..", "..", "..", "scripts", "fixtures", "tiny-embedder.onnx");

/** A Scryfall-sized (488x680) JPEG: a vertical gradient with a colored box. */
function syntheticCardJpeg(tint: [number, number, number]): Uint8Array {
  const width = 488;
  const height = 680;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inBox = x > 40 && x < 448 && y > 60 && y < 360;
      data[i] = inBox ? tint[0] : (y / height) * 255;
      data[i + 1] = inBox ? tint[1] : 120;
      data[i + 2] = inBox ? tint[2] : 255 - (y / height) * 255;
      data[i + 3] = 255;
    }
  }
  return new Uint8Array(jpeg.encode({ data, width, height }, 90).data);
}

const norm = (v: number[]) => Math.hypot(...v);

let embedder: Embedder;

beforeAll(async () => {
  embedder = await loadEmbedder(TINY_MODEL);
});

afterAll(async () => {
  await embedder.release();
});

describe("loadEmbedder", () => {
  it("reads the model's input and output names", () => {
    expect(embedder.inputName).toBe("input");
    expect(embedder.outputName).toBe("embedding");
  });

  it("turns a JPEG into a normalized 256-d vector with the real model spec", async () => {
    const image = decodeJpeg(syntheticCardJpeg([200, 30, 30]));
    expect([image.width, image.height]).toEqual([488, 680]);

    const vector = await embedder.embed(image, EMBED_MODEL);

    expect(vector).toHaveLength(256);
    expect(vector.every(Number.isFinite)).toBe(true);
    expect(norm(vector)).toBeCloseTo(1, 5);
  });

  it("is deterministic and tells different images apart", async () => {
    const red = decodeJpeg(syntheticCardJpeg([200, 30, 30]));
    const blue = decodeJpeg(syntheticCardJpeg([30, 30, 200]));
    const a = await embedder.embed(red, EMBED_MODEL);
    const b = await embedder.embed(red, EMBED_MODEL);
    const c = await embedder.embed(blue, EMBED_MODEL);
    expect(a).toEqual(b);
    const dot = a.reduce((sum, value, i) => sum + value * c[i]!, 0);
    expect(dot).toBeLessThan(0.999);
  });

  it("fails clearly when fed the wrong layout for the model", async () => {
    const image = decodeJpeg(syntheticCardJpeg([10, 200, 10]));
    await expect(embedder.embed(image, { ...EMBED_MODEL, layout: "NHWC" })).rejects.toThrow(/dimensions/i);
  });
});

describe("ensureModelFile", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mv-model-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("downloads once into the cache and reuses the file", async () => {
    const bytes = await readFile(TINY_MODEL);
    const fakeFetch = jest.fn(() => Promise.resolve(new Response(bytes, { status: 200 })));

    const first = await ensureModelFile({
      url: "https://models.test/tiny.onnx",
      modelId: "tiny/v1",
      cacheDir: dir,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const second = await ensureModelFile({
      url: "https://models.test/tiny.onnx",
      modelId: "tiny/v1",
      cacheDir: dir,
      fetch: fakeFetch as unknown as typeof fetch,
    });

    expect(first).toBe(path.join(dir, "tiny_v1.onnx"));
    expect(second).toBe(first);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(await readFile(first)).toEqual(bytes);
    // The cached file really is a loadable model.
    const cached = await loadEmbedder(first);
    await cached.release();
  });

  it("leaves nothing behind when the download fails", async () => {
    const fakeFetch = jest.fn(() => Promise.resolve(new Response("nope", { status: 404 })));
    await expect(
      ensureModelFile({
        url: "https://models.test/missing.onnx",
        modelId: "missing",
        cacheDir: dir,
        fetch: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow("HTTP 404");
    const left = await readdir(dir);
    expect(left).not.toContain(modelCacheFileName("missing"));
    expect(left.filter((name) => name.endsWith(".partial"))).toEqual([]);
  });
});
