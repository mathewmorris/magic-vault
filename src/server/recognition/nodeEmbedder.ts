/**
 * Node-only side of embedding card images: JPEG decoding (jpeg-js), the
 * ONNX session (onnxruntime-node) and fetching the model file once into a
 * cache. Used by scripts/embed-cards.ts and scripts/calibrate-embedder.ts,
 * never by the app itself.
 */

import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { type ReadableStream as WebReadableStream } from "node:stream/web";

import jpeg from "jpeg-js";
import * as ort from "onnxruntime-node";

import { type EmbedModelSpec } from "../../utils/recognition/model";
import { toModelInput, type RgbaImage } from "../../utils/recognition/preprocess";
import { l2Normalize } from "../../utils/recognition/vector";

export type InputSpec = Pick<
  EmbedModelSpec,
  "inputWidth" | "inputHeight" | "mean" | "std" | "layout" | "dims"
>;

export function decodeJpeg(bytes: Uint8Array): RgbaImage {
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return { data: decoded.data, width: decoded.width, height: decoded.height };
}

export type Embedder = {
  inputName: string;
  outputName: string;
  /** Embeds one image with the given preprocessing, L2-normalized. */
  embed(image: RgbaImage, spec: InputSpec): Promise<number[]>;
  release(): Promise<void>;
};

export async function loadEmbedder(modelPath: string): Promise<Embedder> {
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  if (!inputName || !outputName) throw new Error(`${modelPath} has no inputs or outputs`);

  return {
    inputName,
    outputName,
    async embed(image, spec) {
      const data = toModelInput(image, spec);
      const dims =
        spec.layout === "NCHW"
          ? [1, 3, spec.inputHeight, spec.inputWidth]
          : [1, spec.inputHeight, spec.inputWidth, 3];
      const output = (await session.run({ [inputName]: new ort.Tensor("float32", data, dims) }))[
        outputName
      ];
      if (!output) throw new Error(`Model gave no ${outputName} output`);
      const values = output.data as Float32Array;
      if (values.length !== spec.dims) {
        throw new Error(`Model gave ${values.length} values, expected ${spec.dims}`);
      }
      return l2Normalize(values);
    },
    release: () => session.release(),
  };
}

/** A file name for a model id that is safe on every filesystem. */
export function modelCacheFileName(modelId: string): string {
  return `${modelId.replace(/[^A-Za-z0-9._-]/g, "_")}.onnx`;
}

/**
 * Path to the model file, downloading it into `cacheDir` the first time.
 * Keyed by model id, so bumping EMBED_MODEL.id fetches the new file.
 */
export async function ensureModelFile(opts: {
  url: string;
  modelId: string;
  cacheDir: string;
  fetch?: typeof fetch;
}): Promise<string> {
  const target = path.resolve(opts.cacheDir, modelCacheFileName(opts.modelId));
  const existing = await stat(target).catch(() => null);
  if (existing && existing.size > 0) return target;

  await mkdir(path.dirname(target), { recursive: true });
  const response = await (opts.fetch ?? fetch)(opts.url, {
    headers: { "User-Agent": "MagicVault/1.0 (+https://github.com/mathewmorris/magic-vault)" },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Downloading the model failed (HTTP ${response.status}) from ${opts.url}`);
  }
  const partial = `${target}.partial`;
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
      createWriteStream(partial),
    );
    await rename(partial, target);
  } catch (err) {
    await rm(partial, { force: true });
    throw err;
  }
  return target;
}
