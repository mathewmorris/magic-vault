import { Prisma } from "@prisma/client";

import { type ScryfallCard } from "./client";
import { cacheScryfallCards, toCardRow } from "./cacheCards";

const bolt: ScryfallCard = {
  id: "bolt-2ed",
  oracle_id: "bolt-oracle",
  name: "Lightning Bolt",
  scryfall_uri: "https://scryfall.com/card/2ed/162/lightning-bolt",
  image_status: "highres_scan",
  layout: "normal",
  image_uris: { small: "https://cards.scryfall.io/small/bolt.jpg" },
  mana_cost: "{R}",
  cmc: 1,
  type_line: "Instant",
  oracle_text: "Lightning Bolt deals 3 damage to any target.",
  colors: ["R"],
  color_identity: ["R"],
  keywords: [],
  set: "2ed",
  set_name: "Unlimited Edition",
  collector_number: "162",
  rarity: "common",
  artist: "Christopher Rush",
  released_at: "1993-12-01",
  legalities: { modern: "legal", standard: "not_legal" },
  finishes: ["nonfoil"],
  lang: "en",
};

describe("toCardRow", () => {
  test("copies gameplay and printing fields", () => {
    expect(toCardRow(bolt)).toStrictEqual({
      id: "bolt-2ed",
      name: "Lightning Bolt",
      scryfall_uri: "https://scryfall.com/card/2ed/162/lightning-bolt",
      image_status: "highres_scan",
      layout: "normal",
      image_uris: { small: "https://cards.scryfall.io/small/bolt.jpg" },
      card_faces: Prisma.DbNull,
      all_parts: Prisma.DbNull,
      oracle_id: "bolt-oracle",
      mana_cost: "{R}",
      cmc: 1,
      type_line: "Instant",
      oracle_text: "Lightning Bolt deals 3 damage to any target.",
      power: null,
      toughness: null,
      loyalty: null,
      colors: ["R"],
      color_identity: ["R"],
      keywords: [],
      set: "2ed",
      set_name: "Unlimited Edition",
      collector_number: "162",
      rarity: "common",
      artist: "Christopher Rush",
      flavor_text: null,
      released_at: "1993-12-01",
      legalities: { modern: "legal", standard: "not_legal" },
      finishes: ["nonfoil"],
      lang: "en",
    });
  });

  test("keeps cmc 0 instead of treating it as missing", () => {
    expect(toCardRow({ ...bolt, cmc: 0 }).cmc).toBe(0);
  });
});

describe("cacheScryfallCards", () => {
  test("skips cards missing a required column", async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { card: { createMany } } as unknown as Parameters<typeof cacheScryfallCards>[0];

    const count = await cacheScryfallCards(prisma, [bolt, { ...bolt, id: "x", layout: "" }]);

    expect(count).toBe(1);
    expect(createMany).toHaveBeenCalledWith({ data: [toCardRow(bolt)], skipDuplicates: true });
  });
});
