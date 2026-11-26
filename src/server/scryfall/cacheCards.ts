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
