import prismaMock from "singleton";
import { buildCard } from "./testing/cardFixture";
import {
  chunk,
  importCardSelect,
  importUpsertSql,
  matchImportRows,
  smallImage,
} from "./collectionImport";
import { type ImportRow } from "~/utils/import/types";

const row = (overrides: Partial<ImportRow> & { name: string }): ImportRow => ({
  lineNumber: 1,
  quantity: 1,
  finish: "nonfoil",
  condition: "NM",
  language: "en",
  raw: overrides.name,
  ...overrides,
});

const counterspellId = "0df55e3f-14de-46ef-b6b1-616618724d9e";

describe("chunk", () => {
  test("splits a list into pieces of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toStrictEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toStrictEqual([]);
  });
});

describe("matchImportRows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("looks up ids and printings first, then names, then front faces", async () => {
    const counterspell = buildCard({ id: counterspellId, name: "Counterspell", set: "lea" });
    const bolt2ed = buildCard({ id: "bolt-2ed", name: "Lightning Bolt", set: "2ed", collector_number: "162", lang: "en" });
    const boltClb = buildCard({ id: "bolt-clb", name: "Lightning Bolt", set: "clb", collector_number: "187", lang: "en", released_at: "2022-06-10" });
    const delver = buildCard({ id: "delver", name: "Delver of Secrets // Insectile Aberration", set: "isd", lang: "en" });
    prismaMock.card.findMany
      .mockResolvedValueOnce([counterspell])
      .mockResolvedValueOnce([bolt2ed])
      .mockResolvedValueOnce([boltClb])
      .mockResolvedValueOnce([delver]);

    const rows = [
      row({ lineNumber: 1, name: "Counterspell", scryfallId: counterspellId }),
      row({ lineNumber: 2, name: "Lightning Bolt", setCode: "2ed", collectorNumber: "162" }),
      row({ lineNumber: 3, name: "Lightning Bolt" }),
      row({ lineNumber: 4, name: "Delver of Secrets" }),
      row({ lineNumber: 5, name: "Lightning Blot" }),
    ];

    const result = await matchImportRows(prismaMock, rows);

    expect(prismaMock.card.findMany).toHaveBeenCalledTimes(4);
    expect(prismaMock.card.findMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: [counterspellId] } },
      select: importCardSelect,
    });
    expect(prismaMock.card.findMany).toHaveBeenNthCalledWith(2, {
      where: { OR: [{ set: "2ed", collector_number: "162" }] },
      select: importCardSelect,
    });
    // Rows 1 and 2 matched in the first round, so only the rest go by name.
    expect(prismaMock.card.findMany).toHaveBeenNthCalledWith(3, {
      where: { name: { in: ["lightning bolt", "delver of secrets", "lightning blot"], mode: "insensitive" } },
      select: importCardSelect,
    });
    // Only names that didn't match exactly are tried as front faces.
    expect(prismaMock.card.findMany).toHaveBeenNthCalledWith(4, {
      where: {
        OR: [
          { name: { startsWith: "delver of secrets // ", mode: "insensitive" } },
          { name: { startsWith: "lightning blot // ", mode: "insensitive" } },
        ],
      },
      select: importCardSelect,
    });

    expect(result.matched.map(({ row, card, matchedBy }) => [row.lineNumber, card.id, matchedBy])).toStrictEqual([
      [1, counterspellId, "scryfallId"],
      [2, "bolt-2ed", "printing"],
      [3, "bolt-clb", "name"],
      [4, "delver", "name"],
    ]);
    expect(result.unmatched).toStrictEqual([
      { row: rows[4], reason: 'No card named "Lightning Blot" was found' },
    ]);
  });

  test("skips the name lookups when ids and printings matched everything", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce([
      buildCard({ id: "bolt-2ed", name: "Lightning Bolt", set: "2ed", collector_number: "162" }),
    ]);

    const result = await matchImportRows(prismaMock, [
      row({ name: "Lightning Bolt", setCode: "2ed", collectorNumber: "162" }),
    ]);

    expect(prismaMock.card.findMany).toHaveBeenCalledTimes(1);
    expect(result.matched).toHaveLength(1);
  });

  test("doesn't try front faces for names that are already two-part or matched", async () => {
    prismaMock.card.findMany.mockResolvedValueOnce([buildCard({ id: "fire-ice", name: "Fire // Ice" })]);

    await matchImportRows(prismaMock, [row({ name: "Fire // Ice" }), row({ name: "Wear // Tear" })]);

    // One name query, and no front-face query since both names have a //.
    expect(prismaMock.card.findMany).toHaveBeenCalledTimes(1);
  });

  test("batches big imports into a few queries", async () => {
    prismaMock.card.findMany.mockResolvedValue([]);
    const rows = Array.from({ length: 1200 }, (_, index) =>
      row({ lineNumber: index + 1, name: `Card ${index}`, setCode: "abc", collectorNumber: String(index) }),
    );

    await matchImportRows(prismaMock, rows);

    // 3 printing queries (500 each), 2 name queries (1000 each), 6 front-face queries (200 each).
    expect(prismaMock.card.findMany).toHaveBeenCalledTimes(11);
  });

  test("makes no queries for no rows", async () => {
    await expect(matchImportRows(prismaMock, [])).resolves.toStrictEqual({ matched: [], unmatched: [] });
    expect(prismaMock.card.findMany).not.toHaveBeenCalled();
  });
});

describe("smallImage", () => {
  test("uses the card's own image, or its front face's", () => {
    expect(smallImage({ image_uris: { small: "https://cards.scryfall.io/small/a.jpg" }, card_faces: null })).toBe(
      "https://cards.scryfall.io/small/a.jpg",
    );
    expect(
      smallImage({
        image_uris: null,
        card_faces: [{ image_uris: { small: "https://cards.scryfall.io/small/front.jpg" } }, { image_uris: { small: "back" } }],
      }),
    ).toBe("https://cards.scryfall.io/small/front.jpg");
  });

  test("is null when there's no image", () => {
    expect(smallImage({ image_uris: null, card_faces: null })).toBeNull();
    expect(smallImage({ image_uris: { normal: "x" }, card_faces: [{ name: "Front" }] })).toBeNull();
  });
});

describe("importUpsertSql", () => {
  test("sends the entries as one array per column", () => {
    const sql = importUpsertSql("collection-1", [
      { cardId: "bolt", finish: "nonfoil", condition: "NM", language: "en", quantity: 4 },
      { cardId: "opt", finish: "foil", condition: "LP", language: "ja", quantity: 1 },
    ]);

    expect(sql.values).toStrictEqual([
      "collection-1",
      ["bolt", "opt"],
      ["nonfoil", "foil"],
      ["NM", "LP"],
      ["en", "ja"],
      [4, 1],
    ]);
    expect(sql.sql).toContain('INSERT INTO "CardsOnCollections"');
    expect(sql.sql).toContain('ON CONFLICT ("collectionId", "cardId", "finish") DO UPDATE');
    expect(sql.sql).toContain('"count" = "CardsOnCollections"."count" + EXCLUDED."count"');
  });
});
