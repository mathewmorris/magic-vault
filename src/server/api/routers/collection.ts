import { z } from "zod";
import { sub } from 'date-fns/sub';
import { isBefore } from 'date-fns/isBefore';

import {
  createTRPCRouter,
  cronProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { verifyCollectionOwnership } from "~/server/api/util";

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
    .query(({ ctx, input }) => {
      return ctx.prisma.collection.findUnique({
        where: {
          id: input.id
        }
      });
    }),

  create: protectedProcedure.input(z.object({ name: z.string(), cards: z.string().array() }))
    .mutation(async ({ ctx, input }) => {

      const collection = await ctx.prisma.collection.create({
        data: {
          name: input.name,
          cards: input.cards,
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

