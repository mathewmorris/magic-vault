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

const collectionName = z
  .string()
  .trim()
  .min(1, "Collection name can't be empty")
  .max(50, "Collection name can be at most 50 characters");

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

  // Cards in a collection with their counts, oldest first. Ties (rows created
  // in the same millisecond) fall back to card id so the order never shuffles.
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

      return entries.flatMap(({ cardId, count }) => {
        const card = cardsById.get(cardId);
        return card ? [{ card, count }] : [];
      });
    }),

  addCard: protectedProcedure
    .input(z.object({ collectionId: z.string(), cardId: z.string().min(1) }))
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

      return ctx.prisma.cardsOnCollections.upsert({
        where: {
          collectionId_cardId: {
            collectionId: collection.id,
            cardId: card.id,
          },
        },
        create: {
          collectionId: collection.id,
          cardId: card.id,
          count: 1,
        },
        update: {
          count: { increment: 1 },
        },
      })
    }),

  // Takes one copy out, or every copy when `all` is set. The last copy
  // removes the card from the collection.
  removeCard: protectedProcedure
    .input(z.object({ collectionId: z.string(), cardId: z.string(), all: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await verifyCollectionOwnership(ctx.prisma, ctx.session.user.id, input.collectionId)
      const where = { collectionId: collection.id, cardId: input.cardId };

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

