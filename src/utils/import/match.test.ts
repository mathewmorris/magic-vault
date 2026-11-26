import { frontFaceKey, importLookups, nameKey, resolveRows, type MatchCard } from "./match";
import { type ImportRow } from "./types";

const card = (overrides: Partial<MatchCard> & { id: string; name: string }): MatchCard => ({
  set: null,
  set_name: null,
  collector_number: null,
  lang: "en",
  released_at: null,
  finishes: ["nonfoil", "foil"],
  ...overrides,
});

const row = (overrides: Partial<ImportRow> & { name: string }): ImportRow => ({
  lineNumber: 1,
  quantity: 1,
  finish: "nonfoil",
  condition: "NM",
  language: "en",
  raw: overrides.name,
  ...overrides,
});

const boltM10 = card({ id: "bolt-m10", name: "Lightning Bolt", set: "m10", set_name: "Magic 2010", collector_number: "146", released_at: "2009-07-17" });
const bolt2ed = card({ id: "bolt-2ed", name: "Lightning Bolt", set: "2ed", set_name: "Unlimited Edition", collector_number: "162", released_at: "1993-12-01", finishes: ["nonfoil"] });
const boltClb = card({ id: "bolt-clb", name: "Lightning Bolt", set: "clb", set_name: "Battle for Baldur's Gate", collector_number: "187", released_at: "2022-06-10" });
const boltClbJa = card({ id: "bolt-clb-ja", name: "Lightning Bolt", set: "clb", set_name: "Battle for Baldur's Gate", collector_number: "187", released_at: "2022-06-10", lang: "ja" });
const boltSta = card({ id: "bolt-sta", name: "Lightning Bolt", set: "sta", collector_number: "42", released_at: "2021-04-23", finishes: ["nonfoil", "foil", "etched"] });
const delver = card({ id: "delver", name: "Delver of Secrets // Insectile Aberration", set: "isd", collector_number: "51", released_at: "2011-09-30" });
const fireIce = card({ id: "fire-ice", name: "Fire // Ice", set: "apc", collector_number: "128", released_at: "2001-06-04" });
const promoFoil = card({ id: "promo", name: "Mana Crypt", set: "pmei", collector_number: "1", finishes: ["foil"] });

const ALL = [boltM10, bolt2ed, boltClb, boltClbJa, boltSta, delver, fireIce, promoFoil];

describe("nameKey", () => {
  test("ignores case, extra spaces and curly apostrophes", () => {
    expect(nameKey("  Ajani’s   PRIDEMATE ")).toBe("ajani's pridemate");
  });

  test("writes split names the same way however they're slashed", () => {
    expect(nameKey("Fire/Ice")).toBe("fire // ice");
    expect(nameKey("Fire // Ice")).toBe("fire // ice");
    expect(nameKey("Fire  //Ice")).toBe("fire // ice");
  });
});

describe("frontFaceKey", () => {
  test("is the part before // or null", () => {
    expect(frontFaceKey("fire // ice")).toBe("fire");
    expect(frontFaceKey("opt")).toBeNull();
  });
});

describe("importLookups", () => {
  test("collects ids, printings and names without repeats", () => {
    const rows = [
      row({ name: "Lightning Bolt", setCode: "2ED", collectorNumber: "162" }),
      row({ name: "lightning bolt", setCode: "2ed", collectorNumber: "162" }),
      row({ name: "Counterspell", scryfallId: "0DF55E3F-14DE-46EF-B6B1-616618724D9E" }),
      row({ name: "Opt", setCode: "xln" }),
    ];

    expect(importLookups(rows)).toStrictEqual({
      scryfallIds: ["0df55e3f-14de-46ef-b6b1-616618724d9e"],
      printings: [{ set: "2ed", collectorNumber: "162" }],
      names: ["lightning bolt", "counterspell", "opt"],
    });
  });
});

describe("resolveRows", () => {
  test("matches by Scryfall id first, even over a printing or name", () => {
    const { matched } = resolveRows(
      [row({ name: "Lightning Bolt", scryfallId: "bolt-clb", setCode: "2ed", collectorNumber: "162" })],
      ALL,
    );

    expect(matched).toStrictEqual([
      { row: expect.anything() as unknown, card: boltClb, finish: "nonfoil", matchedBy: "scryfallId" },
    ]);
  });

  test("then by set and collector number", () => {
    const { matched } = resolveRows([row({ name: "Lightning Bolt", setCode: "2ed", collectorNumber: "162" })], ALL);

    expect(matched[0]).toMatchObject({ card: bolt2ed, matchedBy: "printing" });
    expect(matched[0]).not.toHaveProperty("note");
  });

  test("prefers the row's own language among printings with the same number", () => {
    const ja = resolveRows([row({ name: "Lightning Bolt", setCode: "clb", collectorNumber: "187", language: "ja" })], ALL);
    const en = resolveRows([row({ name: "Lightning Bolt", setCode: "clb", collectorNumber: "187" })], ALL);

    expect(ja.matched[0]?.card).toBe(boltClbJa);
    expect(en.matched[0]?.card).toBe(boltClb);
  });

  test("doesn't trust a printing whose name doesn't agree", () => {
    const { matched } = resolveRows([row({ name: "Lightning Bolt", setCode: "isd", collectorNumber: "51" })], ALL);

    expect(matched[0]).toMatchObject({
      card: boltClb,
      matchedBy: "name",
      note: "Couldn't find ISD 51, so this is CLB 187 instead",
    });
  });

  test("by name, picks the newest English printing", () => {
    const { matched } = resolveRows([row({ name: "lightning BOLT" })], ALL);

    expect(matched[0]).toMatchObject({ card: boltClb, matchedBy: "name" });
    expect(matched[0]).not.toHaveProperty("note");
  });

  test("by name, prefers the row's set, then its collector number", () => {
    const bySet = resolveRows([row({ name: "Lightning Bolt", setCode: "m10" })], ALL);
    const bySetName = resolveRows([row({ name: "Lightning Bolt", setName: "Unlimited Edition" })], ALL);

    expect(bySet.matched[0]).toMatchObject({ card: boltM10, matchedBy: "name" });
    expect(bySet.matched[0]).not.toHaveProperty("note");
    expect(bySetName.matched[0]?.card).toBe(bolt2ed);
  });

  test("notes when the printing asked for wasn't found", () => {
    const { matched } = resolveRows([row({ name: "Lightning Bolt", setCode: "lea", collectorNumber: "161" })], ALL);

    expect(matched[0]?.note).toBe("Couldn't find LEA 161, so this is CLB 187 instead");
  });

  test("matches a double-faced card by its full name or its front face", () => {
    const { matched } = resolveRows(
      [row({ name: "Delver of Secrets // Insectile Aberration" }), row({ name: "Delver of Secrets" }), row({ name: "Fire/Ice" }), row({ name: "fire" })],
      ALL,
    );

    expect(matched.map((match) => match.card.id)).toStrictEqual(["delver", "delver", "fire-ice", "fire-ice"]);
  });

  test("matches a printing whose card name is the full double-faced name", () => {
    const { matched } = resolveRows([row({ name: "Delver of Secrets", setCode: "isd", collectorNumber: "51" })], ALL);

    expect(matched[0]).toMatchObject({ card: delver, matchedBy: "printing" });
  });

  test("prefers a card with exactly that name over a front face", () => {
    const fire = card({ id: "fire", name: "Fire", released_at: "1990-01-01" });
    const { matched } = resolveRows([row({ name: "Fire" })], [fireIce, fire]);

    expect(matched[0]?.card).toBe(fire);
  });

  test("keeps the row's finish, or uses the card's own when the row didn't ask", () => {
    const { matched, unmatched } = resolveRows(
      [
        row({ name: "Lightning Bolt", setCode: "sta", collectorNumber: "42", finish: "etched" }),
        row({ name: "Mana Crypt" }),
        row({ name: "Lightning Bolt", setCode: "2ed", collectorNumber: "162", finish: "foil" }),
      ],
      ALL,
    );

    expect(matched.map(({ card, finish }) => [card.id, finish])).toStrictEqual([
      ["bolt-sta", "etched"],
      ["promo", "foil"],
    ]);
    expect(unmatched).toStrictEqual([
      { row: expect.objectContaining({ finish: "foil" }) as unknown, reason: "Lightning Bolt (2ED 162) doesn't come in foil" },
    ]);
  });

  test("accepts any finish for cards that have no finish list yet", () => {
    const old = card({ id: "old", name: "Opt", finishes: null });

    expect(resolveRows([row({ name: "Opt", finish: "etched" })], [old]).matched[0]?.finish).toBe("etched");
  });

  test("says why a row didn't match", () => {
    const { unmatched } = resolveRows(
      [row({ name: "Lightning Blot" }), row({ lineNumber: 2, name: "Counterspel", setCode: "lea", collectorNumber: "54" })],
      ALL,
    );

    expect(unmatched.map((miss) => miss.reason)).toStrictEqual([
      'No card named "Lightning Blot" was found',
      'No card named "Counterspel" was found (looked for LEA 54 too)',
    ]);
  });

  test("without names, only ids and printings match", () => {
    const { matched, unmatched } = resolveRows(
      [row({ name: "Lightning Bolt" }), row({ name: "Lightning Bolt", setCode: "m10", collectorNumber: "146" })],
      ALL,
      { useNames: false },
    );

    expect(matched.map((match) => match.card.id)).toStrictEqual(["bolt-m10"]);
    expect(unmatched.map((miss) => miss.row.setCode)).toStrictEqual([undefined]);
  });

  test("keeps the rows' order and picks the same card whatever order the cards come in", () => {
    const rows = [row({ name: "Opt" }), row({ name: "Lightning Bolt" }), row({ name: "Fire // Ice" })];
    const forward = resolveRows(rows, ALL);
    const backward = resolveRows(rows, [...ALL].reverse());

    expect(forward.matched.map((match) => match.card.id)).toStrictEqual(["bolt-clb", "fire-ice"]);
    expect(backward.matched.map((match) => match.card.id)).toStrictEqual(["bolt-clb", "fire-ice"]);
    expect(forward.unmatched.map((miss) => miss.row.name)).toStrictEqual(["Opt"]);
  });

  test("ignores the same card showing up twice", () => {
    expect(resolveRows([row({ name: "Fire // Ice" })], [fireIce, fireIce]).matched).toHaveLength(1);
  });
});
