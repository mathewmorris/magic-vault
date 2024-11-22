import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

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
  create: protectedProcedure.input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => {

      const collection = await ctx.prisma.collection.create({
        data: {
          name: input.name,
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
});

