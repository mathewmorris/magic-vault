import { type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sub } from 'date-fns/sub';
import { isBefore } from 'date-fns/isBefore';

import {
  createTRPCRouter,
  cronProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { affiliateConfig } from "~/server/affiliate";
import { verifyCollectionOwnership } from "~/server/api/util";
import { importUpsertSql, matchImportRows, smallImage } from "~/server/collectionImport";
import {
  CONDITIONS,
  IMPORT_FORMAT_CHOICES,
  ImportParseError,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_TEXT_LENGTH,
  MAX_ROW_QUANTITY,
  parseImport,
  type ParsedImport,
} from "~/utils/import";
import { mergeImportEntries } from "~/utils/import/entries";
import {
  EXPORT_FORMATS,
  exportFilename,
  toCsvExport,
  toTextExport,
} from "~/utils/import/export";
import { buyLinks } from "~/utils/buyLinks";
import {
  cardFinishes,
  collectionValue,
  defaultFinish,
  type CollectionValue,
  type ValuedEntry,
} from "~/utils/price";

const collectionName = z
  .string()
  .trim()
  .min(1, "Collection name can't be empty")
  .max(50, "Collection name can be at most 50 characters");

// Matches FINISHES in ~/utils/price.
const cardFinish = z.enum(["nonfoil", "foil", "etched"]);

// Entries are read oldest first; ties (rows created in the same millisecond)
// fall back to card id, then finish, so the order never shuffles.
const entryOrder = [
  { createdAt: "asc" },
  { cardId: "asc" },
  { finish: "asc" },
] satisfies Prisma.CardsOnCollectionsOrderByWithRelationInput[];

function assertCardHasFinish(finishes: unknown, finish: string) {
  const known = cardFinishes(finishes);
  // Rows from before finishes were stored have no list; allow any finish there.
  if (known.length > 0 && !known.some((option) => option === finish)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This card doesn't come in that finish",
    });
  }
}

/**
 * Turns a list of card ids (repeats mean multiple copies) into one entry per
 * card with a count. Entries keep the order each card first showed up in, and
 * get createdAt values a millisecond apart so that order sticks when reading.
 */
export function toCardEntries(cardIds: string[], now = new Date()) {
  const counts = new Map<string, number>();
  for (const cardId of cardIds) {
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }

  return Array.from(counts, ([cardId, count], index) => ({
    cardId,
    count,
    createdAt: new Date(now.getTime() + index),
  }));
}

export const collectionRouter = createTRPCRouter({
  getAll: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.collection.findMany({
      where: {
        userId: ctx.session.user.id,
        deletedAt: null,
      }
    });
  }),

  // Total value of each of the user's (not deleted) collections, keyed by
  // collection id. Two queries: every entry, then the prices of those cards.
  // Collections with no cards are left out.
  values: protectedProcedure.query(async ({ ctx }) => {
    const entries = await ctx.prisma.cardsOnCollections.findMany({
      where: {
        collection: {
          userId: ctx.session.user.id,
          deletedAt: null,
        },
      },
      select: {
        collectionId: true,
        cardId: true,
        finish: true,
        count: true,
      },
    })

    const values: Record<string, CollectionValue> = {};
    if (entries.length === 0) {
      return values;
    }

    const cards = await ctx.prisma.card.findMany({
      where: {
        id: { in: Array.from(new Set(entries.map(entry => entry.cardId))) },
      },
      select: {
        id: true,
        price: { select: { prices: true } },
      },
    })
    const pricesById = new Map(cards.map(card => [card.id, card.price?.prices ?? null]));

    const byCollection = new Map<string, ValuedEntry[]>();
    for (const { collectionId, cardId, finish, count } of entries) {
      // Same as the cards query: ids that don't match a card are skipped.
      if (!pricesById.has(cardId)) continue;
      const list = byCollection.get(collectionId) ?? [];
      list.push({ prices: pricesById.get(cardId), finish, count });
      byCollection.set(collectionId, list);
    }
    for (const [collectionId, list] of byCollection) {
      values[collectionId] = collectionValue(list);
    }

    return values;
  }),

  getDeletedCollections: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.collection.findMany({
      where: {
        userId: ctx.session.user.id,
        deletedAt: {
          not: null
        },
      },
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const collection = await ctx.prisma.collection.findUnique({
        where: {
          id: input.id
        }
      });

      // Someone else's collection looks exactly like a missing one, so ids
      // can't be probed to find out which collections exist.
      if (!collection || collection.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Collection not found",
        });
      }

      return collection;
    }),

  create: protectedProcedure.input(z.object({ name: z.string(), cards: z.string().array() }))
    .mutation(async ({ ctx, input }) => {

      const collection = await ctx.prisma.collection.create({
        data: {
          name: input.name,
          cards: input.cards,
          cardEntries: {
            create: toCardEntries(input.cards),
          },
          user: {
            connect: {
              id: ctx.session.user.id
            }
          }
        }
      });

      return collection;
    }),

  update: protectedProcedure.input(z.object({ id: z.string(), name: z.string().optional(), cards: z.string().array().optional() }))
    .mutation(async ({ ctx, input }) => {
      await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.id)

      const collection = await ctx.prisma.collection.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
          cards: input.cards,
        },
      })

      return collection;
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), name: collectionName }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.id)

      return ctx.prisma.collection.update({
        where: {
          id: collection.id,
        },
        data: {
          name: input.name,
        },
      })
    }),

  // Cards in a collection with their finish, condition, language and count,
  // in entryOrder.
  cards: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      const entries = await ctx.prisma.cardsOnCollections.findMany({
        where: {
          collectionId: collection.id,
        },
        orderBy: entryOrder,
      })

      if (entries.length === 0) {
        return [];
      }

      const cards = await ctx.prisma.card.findMany({
        where: {
          id: { in: entries.map(entry => entry.cardId) },
        },
        include: { price: { select: { prices: true } } },
      })
      // Prices live in CardPrice; hand them back on the card as before.
      const cardsById = new Map(cards.map(({ price, ...card }) => [card.id, { ...card, prices: price?.prices ?? null }]));
      const affiliate = affiliateConfig();

      return entries.flatMap(({ cardId, finish, condition, language, count }) => {
        const card = cardsById.get(cardId);
        return card ? [{ card, finish, condition, language, count, buyLinks: buyLinks(card, affiliate) }] : [];
      });
    }),

  // Reads a pasted list or CSV and matches each line to a card, without
  // changing anything. A mutation rather than a query so the text goes in
  // the request body, not the URL. Lines that couldn't be read or matched
  // come back in `unmatched` with the reason, in line order.
  previewImport: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      text: z.string().max(MAX_IMPORT_TEXT_LENGTH, "That's too much text for one import (the limit is about 1 MB)"),
      format: z.enum(IMPORT_FORMAT_CHOICES).default("auto"),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      let parsed: ParsedImport;
      try {
        parsed = parseImport(input.text, input.format);
      } catch (error) {
        if (error instanceof ImportParseError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }

      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `That's ${parsed.rows.length} lines; one import can take up to ${MAX_IMPORT_ROWS}. Split it into smaller imports.`,
        });
      }

      const result = await matchImportRows(ctx.prisma, parsed.rows);

      const matched = result.matched.map(({ row, card, finish, matchedBy, note }) => ({
        lineNumber: row.lineNumber,
        raw: row.raw,
        quantity: row.quantity,
        finish,
        condition: row.condition,
        language: row.language,
        matchedBy,
        note: note ?? null,
        card: {
          id: card.id,
          name: card.name,
          set: card.set,
          setName: card.set_name,
          collectorNumber: card.collector_number,
          image: smallImage(card),
          scryfallUri: card.scryfall_uri,
        },
      }));

      const unmatched = [
        ...parsed.errors.map(({ lineNumber, raw, message }) => ({ lineNumber, raw, reason: message })),
        ...result.unmatched.map(({ row, reason }) => ({ lineNumber: row.lineNumber, raw: row.raw, reason })),
      ].sort((a, b) => a.lineNumber - b.lineNumber);

      return { format: parsed.format, matched, unmatched };
    }),

  // Adds the rows a preview matched (and the user kept) to a collection in
  // one transaction. Counts add on to what's already there; an entry that's
  // already there keeps its condition and language. With `replace`, every
  // entry in the collection is removed first.
  applyImport: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      rows: z.array(z.object({
        cardId: z.string().min(1),
        finish: cardFinish,
        condition: z.enum(CONDITIONS),
        language: z.string().regex(/^[a-z]{2,3}$/),
        quantity: z.number().int().min(1).max(MAX_ROW_QUANTITY),
      })).min(1).max(MAX_IMPORT_ROWS),
      replace: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      const entries = mergeImportEntries(input.rows);
      const cardIds = Array.from(new Set(entries.map((entry) => entry.cardId)));
      const cards = await ctx.prisma.card.findMany({
        where: {
          id: { in: cardIds },
        },
        select: {
          id: true,
          finishes: true,
        },
      })
      const finishesById = new Map(cards.map((card) => [card.id, card.finishes]));

      const missing = cardIds.filter((cardId) => !finishesById.has(cardId));
      if (missing.length > 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: missing.length === 1
            ? "A card in this import wasn't found. Preview the import again."
            : `${missing.length} cards in this import weren't found. Preview the import again.`,
        });
      }

      for (const entry of entries) {
        assertCardHasFinish(finishesById.get(entry.cardId), entry.finish);
      }

      const writes: Prisma.PrismaPromise<unknown>[] = [];
      if (input.replace) {
        writes.push(ctx.prisma.cardsOnCollections.deleteMany({ where: { collectionId: collection.id } }));
      }
      writes.push(ctx.prisma.$executeRaw(importUpsertSql(collection.id, entries)));
      await ctx.prisma.$transaction(writes);

      return {
        entries: entries.length,
        cards: entries.reduce((total, entry) => total + entry.quantity, 0),
      };
    }),

  // The collection as a file: a Moxfield-style CSV or a plain text list.
  // Entries whose card no longer exists are left out, as in `cards`.
  exportCsv: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      format: z.enum(EXPORT_FORMATS).default("csv"),
    }))
    .query(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      const entries = await ctx.prisma.cardsOnCollections.findMany({
        where: {
          collectionId: collection.id,
        },
        orderBy: entryOrder,
      })

      const cards = entries.length === 0 ? [] : await ctx.prisma.card.findMany({
        where: {
          id: { in: Array.from(new Set(entries.map((entry) => entry.cardId))) },
        },
        select: {
          id: true,
          name: true,
          set: true,
          collector_number: true,
        },
      })
      const cardsById = new Map(cards.map((card) => [card.id, card]));

      const rows = entries.flatMap(({ cardId, finish, condition, language, count }) => {
        const card = cardsById.get(cardId);
        return card ? [{ card, finish, condition, language, count }] : [];
      });

      return {
        format: input.format,
        filename: exportFilename(collection.name, input.format),
        text: input.format === "csv" ? toCsvExport(rows) : toTextExport(rows),
      };
    }),

  // Adds one copy in `finish`. Without a finish it's non-foil, or the card's
  // first finish when it has no non-foil printing.
  addCard: protectedProcedure
    .input(z.object({ collectionId: z.string(), cardId: z.string().min(1), finish: cardFinish.optional() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      const card = await ctx.prisma.card.findUnique({
        where: {
          id: input.cardId,
        },
      })

      if (!card) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Card not found",
        });
      }

      const finish = input.finish ?? defaultFinish(card.finishes);
      assertCardHasFinish(card.finishes, finish);

      return ctx.prisma.cardsOnCollections.upsert({
        where: {
          collectionId_cardId_finish: {
            collectionId: collection.id,
            cardId: card.id,
            finish,
          },
        },
        create: {
          collectionId: collection.id,
          cardId: card.id,
          finish,
          count: 1,
        },
        update: {
          count: { increment: 1 },
        },
      })
    }),

  // Takes one copy in `finish` out, or every copy in that finish when `all`
  // is set. The last copy removes the entry from the collection.
  removeCard: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      cardId: z.string(),
      finish: cardFinish.default("nonfoil"),
      all: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)
      const where = { collectionId: collection.id, cardId: input.cardId, finish: input.finish };

      if (!input.all) {
        // Only decrements while there's more than one copy, so two quick
        // clicks can never leave a row sitting at 0.
        const decremented = await ctx.prisma.cardsOnCollections.updateMany({
          where: { ...where, count: { gt: 1 } },
          data: { count: { decrement: 1 } },
        })

        if (decremented.count > 0) {
          return { removed: false };
        }
      }

      await ctx.prisma.cardsOnCollections.deleteMany({ where })

      return { removed: true };
    }),

  // Moves every copy of a card from one finish to another, in one
  // transaction. If the card is already there in the new finish the counts
  // are added together; otherwise the entry keeps its place in the list.
  setFinish: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      cardId: z.string(),
      from: cardFinish,
      to: cardFinish,
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      const card = await ctx.prisma.card.findUnique({
        where: {
          id: input.cardId,
        },
      })

      if (!card) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Card not found",
        });
      }

      assertCardHasFinish(card.finishes, input.to);

      const key = (finish: string) => ({
        collectionId_cardId_finish: {
          collectionId: collection.id,
          cardId: input.cardId,
          finish,
        },
      });

      return ctx.prisma.$transaction(async (tx) => {
        const source = await tx.cardsOnCollections.findUnique({ where: key(input.from) })

        if (!source) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That card isn't in this collection in that finish",
          });
        }

        if (input.from === input.to) {
          return source;
        }

        // The deleted row carries the count as of the delete, so a copy
        // added a moment earlier still moves over.
        const moved = await tx.cardsOnCollections.delete({ where: key(input.from) })

        return tx.cardsOnCollections.upsert({
          where: key(input.to),
          create: {
            collectionId: collection.id,
            cardId: input.cardId,
            finish: input.to,
            count: moved.count,
            condition: moved.condition,
            language: moved.language,
            createdAt: moved.createdAt,
          },
          update: {
            count: { increment: moved.count },
          },
        })
      })
    }),

  softDelete: protectedProcedure.input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      return await ctx.prisma.collection.update({
        where: {
          id: collection.id,
        },
        data: {
          deletedAt: new Date(),
        }
      })
    }),

  recover: protectedProcedure.input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      return await ctx.prisma.collection.update({
        where: {
          id: collection.id,
        },
        data: {
          deletedAt: null,
        }
      })
    }),

  destroy: protectedProcedure.input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      return ctx.prisma.collection.delete({
        where: {
          id: collection.id,
        }
      })
    }),

  destroy30DaysOld: cronProcedure
    .mutation(async ({ ctx }) => {
      const thirtyDaysAgo = sub(new Date(), { days: 30 });
      const softDeletedCollections = await ctx.prisma.collection.findMany({
        where: {
          deletedAt: {
            not: null,
          },
        },
      })

      const readyToBeDeleted = softDeletedCollections.filter(({ deletedAt }) => {
        return deletedAt != null && isBefore(deletedAt, thirtyDaysAgo);
      })


      if (readyToBeDeleted.length > 0) {
        // attempt to delete list (if one doesn't exist, does query fail?)
        const deleted = await ctx.prisma.collection.deleteMany({
          where: {
            id: {
              in: readyToBeDeleted.map(collection => collection.id),
            }
          }
        });

        return deleted;
      } else {
        return { count: 0 };
      }
    }),
});

