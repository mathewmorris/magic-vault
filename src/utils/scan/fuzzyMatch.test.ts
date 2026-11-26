import { levenshtein, nameSimilarity, rankCandidates, scoreCardName } from "./fuzzyMatch";

describe("levenshtein", () => {
  test.each([
    ["", "", 0],
    ["abc", "", 3],
    ["", "abc", 3],
    ["bolt", "bolt", 0],
    ["kitten", "sitting", 3],
    ["flaw", "lawn", 2],
    ["lightning", "lightnmg", 2],
    ["counterspell", "countersp", 3],
  ])("distance between %j and %j is %i", (a, b, expected) => {
    expect(levenshtein(a, b)).toBe(expected);
  });

  test("is symmetric", () => {
    expect(levenshtein("serra angel", "sera angle")).toBe(levenshtein("sera angle", "serra angel"));
  });
});

describe("nameSimilarity", () => {
  test("is 1 for the same name", () => {
    expect(nameSimilarity("Lightning Bolt", "Lightning Bolt")).toBe(1);
  });

  test("ignores case, accents and punctuation", () => {
    expect(nameSimilarity("LIM DULS VAULT", "Lim-Dûl's Vault")).toBe(1);
    expect(nameSimilarity("jace the mind sculptor", "Jace, the Mind Sculptor")).toBe(1);
  });

  test("scores a one-letter OCR slip close to 1", () => {
    // 1 edit over 14 characters
    expect(nameSimilarity("Lightnlng Bolt", "Lightning Bolt")).toBeCloseTo(1 - 1 / 14, 5);
  });

  test("scores unrelated names low", () => {
    expect(nameSimilarity("Lightning Bolt", "Wrath of God")).toBeLessThan(0.3);
  });

  test("is 0 when either side is empty", () => {
    expect(nameSimilarity("", "Lightning Bolt")).toBe(0);
    expect(nameSimilarity("Lightning Bolt", "")).toBe(0);
    expect(nameSimilarity("@@", "!!")).toBe(0);
  });
});

describe("scoreCardName", () => {
  test("matches the front face of a double-faced card", () => {
    expect(scoreCardName("Delver of Secrets", "Delver of Secrets // Insectile Aberration")).toBe(1);
  });

  test("matches either half of a split card", () => {
    expect(scoreCardName("Fire", "Fire // Ice")).toBe(1);
    expect(scoreCardName("Ice", "Fire // Ice")).toBe(1);
  });

  test("still scores a normal card by its full name", () => {
    expect(scoreCardName("Serra Angel", "Serra Angel")).toBe(1);
  });
});

describe("rankCandidates", () => {
  type Card = { id: string; name: string };

  const cards: Card[] = [
    { id: "1", name: "Chain Lightning" },
    { id: "2", name: "Lightning Helix" },
    { id: "3", name: "Lightning Bolt" },
    { id: "4", name: "Lightning Bolt" }, // a second printing
    { id: "5", name: "Bolt of Keranos" },
    { id: "6", name: "Lightning Axe" },
    { id: "7", name: "Wrath of God" },
  ];
  const getName = (card: Card) => card.name;

  test("puts the closest name first for messy OCR text", () => {
    const ranked = rankCandidates("Lightnmg Bo t", cards, getName);
    expect(ranked[0]?.name).toBe("Lightning Bolt");
    expect(ranked[0]?.candidate.id).toBe("3");
  });

  test("returns matches sorted by score, best first", () => {
    const ranked = rankCandidates("Lightning Bolt", cards, getName, { minScore: 0 });
    const scores = ranked.map((match) => match.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(ranked[0]).toEqual({ candidate: cards[2], name: "Lightning Bolt", score: 1 });
  });

  test("keeps only the first printing of each name by default", () => {
    const ranked = rankCandidates("Lightning Bolt", cards, getName, { minScore: 0, limit: 10 });
    expect(ranked.filter((match) => match.name === "Lightning Bolt")).toHaveLength(1);
  });

  test("can keep every printing when asked", () => {
    const ranked = rankCandidates("Lightning Bolt", cards, getName, {
      minScore: 0.99,
      uniqueNames: false,
    });
    expect(ranked.map((match) => match.candidate.id)).toEqual(["3", "4"]);
  });

  test("respects the limit", () => {
    expect(rankCandidates("Lightning", cards, getName, { minScore: 0, limit: 2 })).toHaveLength(2);
  });

  test("drops candidates under the minimum score", () => {
    const ranked = rankCandidates("Lightning Bolt", cards, getName);
    expect(ranked.map((match) => match.name)).not.toContain("Wrath of God");
    expect(ranked.every((match) => match.score >= 0.5)).toBe(true);
  });

  test("returns nothing when nothing is close", () => {
    expect(rankCandidates("Tarmogoyf", cards, getName)).toEqual([]);
  });

  test("returns nothing for empty OCR text or no candidates", () => {
    expect(rankCandidates("", cards, getName)).toEqual([]);
    expect(rankCandidates("Lightning Bolt", [], getName)).toEqual([]);
  });

  test("breaks ties alphabetically so results are stable", () => {
    const tied = [{ id: "a", name: "Bolt" }, { id: "b", name: "Boat" }];
    // "Bost" is one edit from both
    const ranked = rankCandidates("Bost", tied, getName, { minScore: 0 });
    expect(ranked.map((match) => match.name)).toEqual(["Boat", "Bolt"]);
  });

  test("finds a double-faced card from its front face text", () => {
    const dfcs = [
      { id: "d1", name: "Delver of Secrets // Insectile Aberration" },
      { id: "d2", name: "Deliver Unto Evil" },
    ];
    const ranked = rankCandidates("Delver of Secrets", dfcs, getName);
    expect(ranked[0]?.candidate.id).toBe("d1");
    expect(ranked[0]?.score).toBe(1);
  });
});
