import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { verifyCollectionOwnership } from "../util/verifyCollectionOwnership";

export const collectionRouter = createTRPCRouter({
  getAll: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.collection.findMany();
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
  recoverCollection: protectedProcedure.input(z.object({ collectionId: z.string() }))
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
    })
});

