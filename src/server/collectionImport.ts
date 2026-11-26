import { Prisma, type PrismaClient } from "@prisma/client";

import { type ImportEntry } from "~/utils/import/entries";
import {
  frontFaceKey,
  importLookups,
  nameKey,
  resolveRows,
  type MatchResult,
} from "~/utils/import/match";
import { type ImportRow } from "~/utils/import/types";

/** The card columns an import preview needs. */
export const importCardSelect = {
  id: true,
  name: true,
  set: true,
  set_name: true,
  collector_number: true,
  lang: true,
  released_at: true,
  finishes: true,
  image_uris: true,
  card_faces: true,
  scryfall_uri: true,
} satisfies Prisma.CardSelect;

export type ImportCard = Prisma.CardGetPayload<{ select: typeof importCardSelect }>;

type CardReader = Pick<PrismaClient, "card">;

// How many lookups go in one query, so a big import is a handful of queries
// with a sensible number of parameters each.
export const ID_CHUNK = 1000;
export const PRINTING_CHUNK = 500;
export const NAME_CHUNK = 1000;
export const FRONT_FACE_CHUNK = 200;

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/**
 * Finds a card for each import row (see ~/utils/import/match for the rules).
 * Lookups are batched: one round of queries by Scryfall id and by set and
 * collector number, then, for the rows those didn't match, one round by
 * exact name and one by front-face name ("Delver of Secrets" for
 * "Delver of Secrets // Insectile Aberration").
 */
export async function matchImportRows(
  prisma: CardReader,
  rows: ImportRow[],
): Promise<MatchResult<ImportCard>> {
  const select = importCardSelect;
  const { scryfallIds, printings } = importLookups(rows);

  const firstRound = await Promise.all([
    ...chunk(scryfallIds, ID_CHUNK).map((ids) =>
      prisma.card.findMany({ where: { id: { in: ids } }, select }),
    ),
    ...chunk(printings, PRINTING_CHUNK).map((part) =>
      prisma.card.findMany({
        where: {
          OR: part.map(({ set, collectorNumber }) => ({ set, collector_number: collectorNumber })),
        },
        select,
      }),
    ),
  ]);
  const found = firstRound.flat();

  const needNames = resolveRows(rows, found, { useNames: false }).unmatched.map(({ row }) => row);
  if (needNames.length > 0) {
    const { names } = importLookups(needNames);

    const exact = (
      await Promise.all(
        chunk(names, NAME_CHUNK).map((part) =>
          prisma.card.findMany({
            where: { name: { in: part, mode: "insensitive" } },
            select,
          }),
        ),
      )
    ).flat();
    found.push(...exact);

    // Names that only match as the front face of a two-part card.
    const foundNames = new Set(exact.map((card) => nameKey(card.name)));
    const fronts = names.filter((name) => frontFaceKey(name) === null && !foundNames.has(name));
    const faces = await Promise.all(
      chunk(fronts, FRONT_FACE_CHUNK).map((part) =>
        prisma.card.findMany({
          where: {
            OR: part.map((name) => ({
              name: { startsWith: `${name} // `, mode: "insensitive" as const },
            })),
          },
          select,
        }),
      ),
    );
    found.push(...faces.flat());
  }

  return resolveRows(rows, found);
}

/** The small image of a card, or of its front face for a double-faced card. */
export function smallImage(card: Pick<ImportCard, "image_uris" | "card_faces">): string | null {
  const images = card.image_uris as { small?: unknown } | null;
  if (typeof images?.small === "string") return images.small;
  const faces = card.card_faces as { image_uris?: { small?: unknown } }[] | null;
  const face = Array.isArray(faces) ? faces[0]?.image_uris?.small : undefined;
  return typeof face === "string" ? face : null;
}

/**
 * One statement that adds every entry to a collection: new cards are
 * inserted, cards already there in that finish get the count added on
 * (keeping their condition, language and place in the list). New entries
 * get createdAt a millisecond apart so they keep the import's order.
 * `entries` must have one row per card and finish (see mergeImportEntries),
 * since Postgres won't update the same row twice in one statement.
 */
export function importUpsertSql(collectionId: string, entries: ImportEntry[]): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "CardsOnCollections" ("collectionId", "cardId", "finish", "condition", "language", "count", "createdAt", "updatedAt")
    SELECT ${collectionId}, t."cardId", t."finish", t."condition", t."language", t."count",
           (now() AT TIME ZONE 'UTC') + (t."position" - 1) * INTERVAL '1 millisecond',
           now() AT TIME ZONE 'UTC'
    FROM unnest(
      ${entries.map((entry) => entry.cardId)}::text[],
      ${entries.map((entry) => entry.finish)}::text[],
      ${entries.map((entry) => entry.condition)}::text[],
      ${entries.map((entry) => entry.language)}::text[],
      ${entries.map((entry) => entry.quantity)}::integer[]
    ) WITH ORDINALITY AS t("cardId", "finish", "condition", "language", "count", "position")
    ON CONFLICT ("collectionId", "cardId", "finish") DO UPDATE
    SET "count" = "CardsOnCollections"."count" + EXCLUDED."count",
        "updatedAt" = EXCLUDED."updatedAt"
  `;
}
