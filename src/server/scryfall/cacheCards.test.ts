import { Prisma } from "@prisma/client";

import { type ScryfallCard } from "./client";
import { cacheScryfallCards, toCardRow, toPriceRow } from "./cacheCards";

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
  prices: { usd: "450.00", usd_foil: null, eur: null },
  purchase_uris: { tcgplayer: "https://www.tcgplayer.com/product/1" },
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
      purchase_uris: { tcgplayer: "https://www.tcgplayer.com/product/1" },
    });
  });

  test("leaves prices out, since they live in CardPrice", () => {
    expect(toCardRow(bolt)).not.toHaveProperty("prices");
    expect(toCardRow({ ...bolt, purchase_uris: null }).purchase_uris).toBe(Prisma.DbNull);
  });

  test("keeps cmc 0 instead of treating it as missing", () => {
    expect(toCardRow({ ...bolt, cmc: 0 }).cmc).toBe(0);
  });
});

describe("toPriceRow", () => {
  test("keys the prices by card id", () => {
    expect(toPriceRow(bolt)).toStrictEqual({ cardId: "bolt-2ed", prices: { usd: "450.00", usd_foil: null, eur: null } });
  });

  test("stores a card with no prices as a database null", () => {
    expect(toPriceRow({ ...bolt, prices: undefined }).prices).toBe(Prisma.DbNull);
  });
});

describe("cacheScryfallCards", () => {
  const writer = () => {
    const calls: string[] = [];
    const card = { createMany: jest.fn(() => { calls.push("card"); return Promise.resolve({ count: 1 }); }) };
    const cardPrice = { createMany: jest.fn(() => { calls.push("cardPrice"); return Promise.resolve({ count: 1 }); }) };
    const prisma = { card, cardPrice } as unknown as Parameters<typeof cacheScryfallCards>[0];
    return { prisma, card, cardPrice, calls };
  };

  test("skips cards missing a required column and writes prices after cards", async () => {
    const { prisma, card, cardPrice, calls } = writer();

    const count = await cacheScryfallCards(prisma, [bolt, { ...bolt, id: "x", layout: "" }]);

    expect(count).toBe(1);
    expect(card.createMany).toHaveBeenCalledWith({ data: [toCardRow(bolt)], skipDuplicates: true });
    expect(cardPrice.createMany).toHaveBeenCalledWith({ data: [toPriceRow(bolt)], skipDuplicates: true });
    expect(calls).toStrictEqual(["card", "cardPrice"]);
  });

  test("writes nothing when no card can be stored", async () => {
    const { prisma, card, cardPrice } = writer();

    await expect(cacheScryfallCards(prisma, [{ ...bolt, layout: "" }])).resolves.toBe(0);
    expect(card.createMany).not.toHaveBeenCalled();
    expect(cardPrice.createMany).not.toHaveBeenCalled();
  });
});
