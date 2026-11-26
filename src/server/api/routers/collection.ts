import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sub } from 'date-fns/sub';
import { isBefore } from 'date-fns/isBefore';

import {
  createTRPCRouter,
  cronProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { verifyCollectionOwnership } from "~/server/api/util";
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
        prices: true,
      },
    })
    const pricesById = new Map(cards.map(card => [card.id, card.prices]));

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

  // Cards in a collection with their finish and count, oldest first. Ties
  // (rows created in the same millisecond) fall back to card id, then finish,
  // so the order never shuffles.
  cards: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)

      const entries = await ctx.prisma.cardsOnCollections.findMany({
        where: {
          collectionId: collection.id,
        },
        orderBy: [
          { createdAt: "asc" },
          { cardId: "asc" },
          { finish: "asc" },
        ],
      })

      if (entries.length === 0) {
        return [];
      }

      const cards = await ctx.prisma.card.findMany({
        where: {
          id: { in: entries.map(entry => entry.cardId) },
        },
      })
      const cardsById = new Map(cards.map(card => [card.id, card]));

      return entries.flatMap(({ cardId, finish, count }) => {
        const card = cardsById.get(cardId);
        return card ? [{ card, finish, count }] : [];
      });
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

