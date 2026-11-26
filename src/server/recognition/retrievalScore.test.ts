import { describe, expect, it } from "@jest/globals";

import { scoreRetrieval } from "./retrievalScore";

const axis = (i: number, n = 8) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));

describe("scoreRetrieval", () => {
  it("scores a perfect match as 1", () => {
    const gallery = [0, 1, 2].map((i) => axis(i));
    const score = scoreRetrieval(gallery, gallery);
    expect(score).toMatchObject({ recallAt1: 1, recallAt5: 1 });
    expect(score.medianTrueSimilarity).toBeCloseTo(1);
    expect(score.medianBestOtherSimilarity).toBeCloseTo(0);
  });

  it("counts a near miss in recall@5 but not recall@1", () => {
    const gallery = [axis(0), axis(1), axis(2)];
    // Query 0 looks more like card 1 than card 0.
    const queries = [[0.5, 0.8, 0, 0, 0, 0, 0, 0], axis(1), axis(2)];
    const score = scoreRetrieval(queries, gallery);
    expect(score.recallAt1).toBeCloseTo(2 / 3);
    expect(score.recallAt5).toBe(1);
  });

  it("does not reward a model that maps every card to the same point", () => {
    const same = [1, 1, 0, 0, 0, 0, 0, 0];
    const score = scoreRetrieval([same, same, same], [same, same, same]);
    expect(score.recallAt1).toBe(0);
  });

  it("rejects mismatched or tiny inputs", () => {
    expect(() => scoreRetrieval([axis(0)], [axis(0), axis(1)])).toThrow();
    expect(() => scoreRetrieval([axis(0)], [axis(0)])).toThrow();
  });
});
