/**
 * Turn a flattened card into a 256-d embedding with the MIT card embedder,
 * using the same preprocessing as the Node indexer (../preprocess.ts) so the
 * vectors are comparable with the gallery.
 *
 * The ORT part is injectable (`embedderFromSession`) so embed/embedBurst are
 * unit tested with a fake session.
 */

import { EMBED_MODEL, type EmbedModelSpec } from "../model";
import { toModelInput, type RgbaImage } from "../preprocess";
import { averageEmbeddings, l2Normalize } from "../vector";
import { createSession, loadOrt } from "./ort";
import {
  float32ToFloat16Bits,
  numericShape,
  tensorToNumbers,
  type TensorLike,
  type ValueMetadataLike,
} from "./tensorData";

export type Embedder = {
  readonly modelId: string;
  embed(card: RgbaImage): Promise<number[]>;
  dispose(): void;
};

/** What the embedder needs from an ORT session. */
export type SessionLike = {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly inputMetadata?: readonly ValueMetadataLike[];
  run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike & { dispose?: () => void }>>;
  release?(): Promise<void>;
};

export type MakeTensor = (
  type: "float32" | "float16",
  data: Float32Array | Uint16Array,
  dims: number[],
) => { dispose?: () => void };

/**
 * The layout the model actually wants: spec.layout, unless the session's
 * input shape says otherwise ([N, 3, H, W] is NCHW, [N, H, W, 3] is NHWC).
 */
export function resolveLayout(
  spec: Pick<EmbedModelSpec, "layout">,
  shape: ReadonlyArray<number | string> | undefined,
): EmbedModelSpec["layout"] {
  const dims = numericShape(shape);
  if (dims.length !== 4) return spec.layout;
  let fromModel: EmbedModelSpec["layout"] | null = null;
  if (dims[1] === 3 && dims[3] !== 3) fromModel = "NCHW";
  else if (dims[3] === 3 && dims[1] !== 3) fromModel = "NHWC";
  if (fromModel && fromModel !== spec.layout) {
    console.warn(
      `Embedder input shape [${(shape ?? []).join(", ")}] says ${fromModel}, not ${spec.layout}; following the model.`,
    );
    return fromModel;
  }
  return spec.layout;
}

export function embedderFromSession(
  session: SessionLike,
  spec: EmbedModelSpec,
  makeTensor: MakeTensor,
): Embedder {
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  if (!inputName || !outputName) throw new Error("Embedder model has no inputs or outputs");
  const meta = session.inputMetadata?.find((m) => m.name === inputName);
  const layout = resolveLayout(spec, meta?.shape);
  const half = meta?.type === "float16";
  const dims =
    layout === "NCHW"
      ? [1, 3, spec.inputHeight, spec.inputWidth]
      : [1, spec.inputHeight, spec.inputWidth, 3];
  let disposed = false;

  return {
    modelId: spec.id,
    async embed(card) {
      if (disposed) throw new Error("Embedder was disposed");
      const data = toModelInput(card, { ...spec, layout });
      const input = half ? makeTensor("float16", float32ToFloat16Bits(data), dims) : makeTensor("float32", data, dims);
      const results = await session.run({ [inputName]: input });
      try {
        const output = results[outputName] ?? Object.values(results)[0];
        if (!output) throw new Error("Embedder returned no output");
        const values = tensorToNumbers(output);
        if (values.length !== spec.dims) {
          throw new Error(`Embedder returned ${values.length} values, expected ${spec.dims}`);
        }
        return l2Normalize(values);
      } finally {
        input.dispose?.();
        for (const value of Object.values(results)) value.dispose?.();
      }
    },
    dispose() {
      disposed = true;
      void session.release?.();
    },
  };
}

export async function createEmbedder(spec: EmbedModelSpec = EMBED_MODEL): Promise<Embedder> {
  const [ort, session] = await Promise.all([loadOrt(), createSession(spec.url)]);
  return embedderFromSession(
    session as unknown as SessionLike,
    spec,
    (type, data, dims) => new ort.Tensor(type, data, dims),
  );
}

/**
 * Embed several crops of the same card (a burst) and average them. Glare and
 * blur move between frames, so the average is steadier than any one frame.
 */
export async function embedBurst(embedder: Embedder, cards: RgbaImage[]): Promise<number[]> {
  if (cards.length === 0) throw new Error("No cards to embed");
  const vectors: number[][] = [];
  // One at a time: ORT web sessions don't run concurrently.
  for (const card of cards) vectors.push(await embedder.embed(card));
  return averageEmbeddings(vectors);
}
