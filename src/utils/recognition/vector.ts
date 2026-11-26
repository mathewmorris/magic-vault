/** Small vector helpers for embeddings. */

export function l2Normalize(vector: ArrayLike<number>): number[] {
  let sum = 0;
  // ArrayLike (Float32Array, number[]) isn't iterable as a type, so index it.
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < vector.length; i++) sum += vector[i]! * vector[i]!;
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) throw new Error("Cannot normalize a zero vector");
  return Array.from(vector, (value) => value / norm);
}

/**
 * Average several embeddings of the same card (e.g. a short burst of frames)
 * and re-normalize. Glare moves between frames, so the average is steadier
 * than any single frame.
 */
export function averageEmbeddings(vectors: ArrayLike<number>[]): number[] {
  const first = vectors[0];
  if (!first) throw new Error("No embeddings to average");
  const sum = new Array<number>(first.length).fill(0);
  for (const vector of vectors) {
    if (vector.length !== first.length) throw new Error("Embeddings have different sizes");
    const unit = l2Normalize(vector);
    for (let i = 0; i < unit.length; i++) sum[i]! += unit[i]!;
  }
  return l2Normalize(sum);
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error("Vectors have different sizes");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / Math.sqrt(na * nb);
}

/** pgvector text format, e.g. "[0.1,0.2]". Rejects NaN/Infinity. */
export function toVectorLiteral(vector: ArrayLike<number>): string {
  const parts: string[] = [];
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i]!;
    if (!Number.isFinite(value)) throw new Error("Embedding has a non-finite value");
    parts.push(String(Math.fround(value)));
  }
  return `[${parts.join(",")}]`;
}
