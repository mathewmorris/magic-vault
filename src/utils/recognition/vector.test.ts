import { describe, expect, it } from "@jest/globals";

import { averageEmbeddings, cosineSimilarity, l2Normalize, toVectorLiteral } from "./vector";

describe("vector helpers", () => {
  it("normalizes to unit length", () => {
    expect(l2Normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(() => l2Normalize([0, 0])).toThrow();
  });

  it("averages normalized embeddings", () => {
    const avg = averageEmbeddings([
      [1, 0],
      [0, 10],
    ]);
    expect(avg[0]).toBeCloseTo(Math.SQRT1_2);
    expect(avg[1]).toBeCloseTo(Math.SQRT1_2);
    expect(() => averageEmbeddings([])).toThrow();
    expect(() => averageEmbeddings([[1], [1, 2]])).toThrow();
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("formats pgvector literals and rejects NaN", () => {
    expect(toVectorLiteral([0.5, -1])).toBe("[0.5,-1]");
    expect(() => toVectorLiteral([Number.NaN])).toThrow();
  });
});
