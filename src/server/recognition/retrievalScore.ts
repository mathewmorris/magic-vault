/** Recall@k for a gallery/query split, used by scripts/calibrate-embedder.ts. */

import { cosineSimilarity } from "../../utils/recognition/vector";

export type RetrievalScore = {
  /** Share of queries whose own gallery entry ranked first. */
  recallAt1: number;
  /** Share of queries whose own gallery entry ranked in the top 5. */
  recallAt5: number;
  /** Median similarity between a query and its own gallery entry. */
  medianTrueSimilarity: number;
  /** Median of each query's best similarity to any other gallery entry. */
  medianBestOtherSimilarity: number;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

/**
 * queries[i] is a photo of the card in gallery[i]. Ties count against the
 * query, so a model that maps everything to one point scores 0, not 1.
 */
export function scoreRetrieval(queries: readonly number[][], gallery: readonly number[][]): RetrievalScore {
  if (queries.length !== gallery.length) throw new Error("Need one query per gallery entry");
  if (gallery.length < 2) throw new Error("Need at least two cards to rank");
  let top1 = 0;
  let top5 = 0;
  const trueSims: number[] = [];
  const otherSims: number[] = [];
  queries.forEach((query, i) => {
    const sims = gallery.map((vector) => cosineSimilarity(query, vector));
    const own = sims[i]!;
    const ahead = sims.filter((s, j) => j !== i && s >= own).length;
    if (ahead === 0) top1++;
    if (ahead < 5) top5++;
    trueSims.push(own);
    otherSims.push(Math.max(...sims.filter((_, j) => j !== i)));
  });
  return {
    recallAt1: top1 / queries.length,
    recallAt5: top5 / queries.length,
    medianTrueSimilarity: median(trueSims),
    medianBestOtherSimilarity: median(otherSims),
  };
}
