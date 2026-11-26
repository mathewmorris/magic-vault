import {
  cardImages,
  formatRarity,
  legalityRows,
  readCardFaces,
  smallImage,
} from "./cardDetail";

const front = { small: "https://cards.scryfall.io/small/front.jpg", large: "https://cards.scryfall.io/large/front.jpg" };
const back = { small: "https://cards.scryfall.io/small/back.jpg", normal: "https://cards.scryfall.io/normal/back.jpg" };

describe("readCardFaces", () => {
  test("reads faces and skips anything that isn't one", () => {
    expect(
      readCardFaces([
        { object: "card_face", name: "Delver of Secrets", mana_cost: "{U}", type_line: "Creature", power: "1", toughness: "1", image_uris: front },
        { name: "Insectile Aberration", mana_cost: "", oracle_text: "Flying" },
        "junk",
        { mana_cost: "{1}" },
      ]),
    ).toEqual([
      {
        name: "Delver of Secrets",
        mana_cost: "{U}",
        type_line: "Creature",
        oracle_text: undefined,
        power: "1",
        toughness: "1",
        loyalty: undefined,
        flavor_text: undefined,
        artist: undefined,
        image_uris: { small: front.small, normal: undefined, large: front.large, png: undefined },
      },
      {
        name: "Insectile Aberration",
        mana_cost: undefined,
        type_line: undefined,
        oracle_text: "Flying",
        power: undefined,
        toughness: undefined,
        loyalty: undefined,
        flavor_text: undefined,
        artist: undefined,
        image_uris: undefined,
      },
    ]);
  });

  test("returns [] for null or non-arrays", () => {
    expect(readCardFaces(null)).toEqual([]);
    expect(readCardFaces({ name: "x" })).toEqual([]);
  });
});

describe("cardImages", () => {
  test("uses the top-level image for single-faced and split cards", () => {
    expect(cardImages({ image_uris: front, card_faces: [{ name: "A" }, { name: "B" }] })).toEqual([front.large]);
  });

  test("uses one image per face for double-faced cards", () => {
    expect(
      cardImages({
        image_uris: null,
        card_faces: [
          { name: "A", image_uris: front },
          { name: "B", image_uris: back },
        ],
      }),
    ).toEqual([front.large, back.normal]);
  });

  test("returns [] when there is no image", () => {
    expect(cardImages({ image_uris: null, card_faces: null })).toEqual([]);
  });
});

describe("smallImage", () => {
  test("prefers the small top-level image, then the front face", () => {
    expect(smallImage({ image_uris: front, card_faces: null })).toBe(front.small);
    expect(smallImage({ image_uris: null, card_faces: [{ name: "B", image_uris: back }] })).toBe(back.small);
    expect(smallImage({ image_uris: null, card_faces: null })).toBeUndefined();
  });
});

describe("legalityRows", () => {
  test("lists every format and treats unknown values as not legal", () => {
    const rows = legalityRows({ standard: "legal", vintage: "restricted", legacy: "banned", modern: "weird" });

    expect(rows.map((row) => row.key)).toEqual([
      "standard",
      "pioneer",
      "modern",
      "legacy",
      "vintage",
      "commander",
      "pauper",
      "brawl",
      "historic",
      "timeless",
      "oathbreaker",
    ]);
    expect(rows.find((row) => row.key === "standard")?.legality).toBe("legal");
    expect(rows.find((row) => row.key === "vintage")?.legality).toBe("restricted");
    expect(rows.find((row) => row.key === "legacy")?.legality).toBe("banned");
    expect(rows.find((row) => row.key === "modern")?.legality).toBe("not_legal");
    expect(rows.find((row) => row.key === "pauper")?.legality).toBe("not_legal");
  });

  test("handles missing legalities", () => {
    expect(legalityRows(null).every((row) => row.legality === "not_legal")).toBe(true);
  });
});

describe("formatRarity", () => {
  test("capitalizes", () => {
    expect(formatRarity("mythic")).toBe("Mythic");
    expect(formatRarity(null)).toBeUndefined();
  });
});
