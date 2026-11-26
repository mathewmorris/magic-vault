import { computeOwnership, formatMissingList, ownershipKey } from "./ownership";

const deckCard = (id: string, name: string, oracle_id: string | null) => ({ id, name, oracle_id });

describe("computeOwnership", () => {
  test("counts owned copies of any printing, across collections", () => {
    const result = computeOwnership(
      [{ cardId: "bolt-m10", count: 4 }],
      [deckCard("bolt-m10", "Lightning Bolt", "bolt")],
      [
        { cardId: "bolt-m10", count: 1 },
        { cardId: "bolt-a25", count: 2 },
      ],
      [
        { id: "bolt-m10", oracle_id: "bolt" },
        { id: "bolt-a25", oracle_id: "bolt" },
      ],
    );

    expect(result).toStrictEqual({
      cards: [{ key: "oracle:bolt", name: "Lightning Bolt", cardIds: ["bolt-m10"], needed: 4, owned: 3, missing: 1 }],
      totals: { needed: 4, owned: 3, missing: 1 },
    });
  });

  test("adds up the same card across boards and printings in the deck", () => {
    const result = computeOwnership(
      [
        { cardId: "bolt-m10", count: 2 },
        { cardId: "bolt-a25", count: 1 },
        { cardId: "bolt-m10", count: 1 },
      ],
      [deckCard("bolt-m10", "Lightning Bolt", "bolt"), deckCard("bolt-a25", "Lightning Bolt", "bolt")],
      [{ cardId: "bolt-a25", count: 1 }],
      [{ id: "bolt-a25", oracle_id: "bolt" }],
    );

    expect(result.cards).toStrictEqual([
      { key: "oracle:bolt", name: "Lightning Bolt", cardIds: ["bolt-m10", "bolt-a25"], needed: 4, owned: 1, missing: 3 },
    ]);
  });

  test("owning more than needed covers the card but doesn't inflate the total", () => {
    const result = computeOwnership(
      [
        { cardId: "ring", count: 1 },
        { cardId: "crypt", count: 1 },
      ],
      [deckCard("ring", "Sol Ring", "sol"), deckCard("crypt", "Mana Crypt", "crypt-o")],
      [{ cardId: "ring", count: 7 }],
      [{ id: "ring", oracle_id: "sol" }],
    );

    expect(result.cards.map(({ name, owned, missing }) => ({ name, owned, missing }))).toStrictEqual([
      { name: "Sol Ring", owned: 7, missing: 0 },
      { name: "Mana Crypt", owned: 0, missing: 1 },
    ]);
    expect(result.totals).toStrictEqual({ needed: 2, owned: 1, missing: 1 });
  });

  test("falls back to the card id when a card has no oracle_id", () => {
    const result = computeOwnership(
      [{ cardId: "old", count: 2 }],
      [deckCard("old", "Old Card", null)],
      [
        { cardId: "old", count: 1 },
        // A different printing can't be matched without an oracle_id.
        { cardId: "other", count: 5 },
      ],
      [
        { id: "old", oracle_id: null },
        { id: "other", oracle_id: null },
      ],
    );

    expect(result.cards).toStrictEqual([
      { key: "card:old", name: "Old Card", cardIds: ["old"], needed: 2, owned: 1, missing: 1 },
    ]);
  });

  test("ignores collection cards that aren't in the deck and entries with no card row", () => {
    const result = computeOwnership(
      [
        { cardId: "ring", count: 1 },
        { cardId: "gone", count: 3 },
      ],
      [deckCard("ring", "Sol Ring", "sol")],
      [
        { cardId: "elf", count: 4 },
        { cardId: "unknown", count: 2 },
      ],
      [{ id: "elf", oracle_id: "llanowar" }],
    );

    expect(result).toStrictEqual({
      cards: [{ key: "oracle:sol", name: "Sol Ring", cardIds: ["ring"], needed: 1, owned: 0, missing: 1 }],
      totals: { needed: 1, owned: 0, missing: 1 },
    });
  });

  test("an empty deck needs nothing", () => {
    expect(computeOwnership([], [], [], [])).toStrictEqual({
      cards: [],
      totals: { needed: 0, owned: 0, missing: 0 },
    });
  });
});

describe("ownershipKey", () => {
  test("prefers the oracle_id", () => {
    expect(ownershipKey({ id: "a", oracle_id: "o" })).toBe("oracle:o");
    expect(ownershipKey({ id: "a", oracle_id: null })).toBe("card:a");
  });
});

describe("formatMissingList", () => {
  test("lists missing cards one per line with how many are missing", () => {
    expect(
      formatMissingList([
        { name: "Sol Ring", missing: 1 },
        { name: "Forest", missing: 0 },
        { name: "Lightning Bolt", missing: 3 },
      ])
    ).toBe("1 Sol Ring\n3 Lightning Bolt");
  });

  test("is empty when nothing is missing", () => {
    expect(formatMissingList([{ name: "Forest", missing: 0 }])).toBe("");
  });
});
