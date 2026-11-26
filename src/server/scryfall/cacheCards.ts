import { Prisma, type PrismaClient } from "@prisma/client";

import { type ScryfallCard } from "./client";

type CardWriter = Pick<PrismaClient, "card">;

const json = (value: unknown) =>
  value == null ? Prisma.DbNull : (value as Prisma.InputJsonValue);

/** Map a Scryfall card to a Card row, the same columns the bulk sync writes. */
export function toCardRow(card: ScryfallCard): Prisma.CardCreateManyInput {
  return {
    id: card.id,
    name: card.name,
    scryfall_uri: card.scryfall_uri,
    image_status: card.image_status,
    layout: card.layout,
    image_uris: json(card.image_uris),
    card_faces: json(card.card_faces),
    all_parts: json(card.all_parts),
    oracle_id: card.oracle_id ?? null,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    type_line: card.type_line ?? null,
    oracle_text: card.oracle_text ?? null,
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    loyalty: card.loyalty ?? null,
    colors: json(card.colors),
    color_identity: json(card.color_identity),
    keywords: json(card.keywords),
    set: card.set ?? null,
    set_name: card.set_name ?? null,
    collector_number: card.collector_number ?? null,
    rarity: card.rarity ?? null,
    artist: card.artist ?? null,
    flavor_text: card.flavor_text ?? null,
    released_at: card.released_at ?? null,
    legalities: json(card.legalities),
    finishes: json(card.finishes),
    lang: card.lang ?? null,
    prices: json(card.prices),
    purchase_uris: json(card.purchase_uris),
  };
}

/**
 * Store cards fetched from the Scryfall API in the Card table.
 *
 * One createMany with skipDuplicates: rows we already have are left alone,
 * since the daily bulk sync keeps those current. That keeps this to a single
 * query inside a user's search request.
 */
export async function cacheScryfallCards(
  prisma: CardWriter,
  cards: ScryfallCard[],
): Promise<number> {
  const rows = cards
    .filter((card) => card.id && card.name && card.scryfall_uri && card.image_status && card.layout)
    .map(toCardRow);
  if (rows.length === 0) return 0;
  const { count } = await prisma.card.createMany({ data: rows, skipDuplicates: true });
  return count;
}
