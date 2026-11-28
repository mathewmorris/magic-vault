import { Prisma, type Card } from "@prisma/client";

/** The Scryfall columns a Card row leaves empty when Scryfall has no value. */
export const emptyCardFields = {
  oracle_id: null,
  mana_cost: null,
  cmc: null,
  type_line: null,
  oracle_text: null,
  power: null,
  toughness: null,
  loyalty: null,
  colors: null,
  color_identity: null,
  keywords: null,
  set: null,
  set_name: null,
  collector_number: null,
  rarity: null,
  artist: null,
  flavor_text: null,
  released_at: null,
  legalities: null,
  finishes: null,
  lang: null,
  border_color: null,
  frame: null,
  frame_effects: [],
  promo_types: [],
  security_stamp: null,
  illustration_id: null,
  purchase_uris: null,
} satisfies Partial<Card>;

/** What toCardRow writes for those columns when the Scryfall card has none. */
export const emptyCardRowFields = {
  ...emptyCardFields,
  colors: Prisma.DbNull,
  color_identity: Prisma.DbNull,
  keywords: Prisma.DbNull,
  legalities: Prisma.DbNull,
  finishes: Prisma.DbNull,
  purchase_uris: Prisma.DbNull,
};

/** A Card row for tests, with the optional Scryfall columns empty. */
export const buildCard = (overrides: Partial<Card> = {}): Card => ({
  id: "card-1",
  name: "Black Lotus",
  scryfall_uri: "https://scryfall.com/card/black-lotus",
  image_status: "highres_scan",
  image_uris: null,
  card_faces: null,
  all_parts: null,
  layout: "normal",
  ...emptyCardFields,
  ...overrides,
});
