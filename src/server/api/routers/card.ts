import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

export const cardRouter = createTRPCRouter({
  search: publicProcedure
  .input(z.string().min(1))
  .query(async ({ ctx, input }) => {
    const matches = ctx.prisma.card.findMany({
      where: {
        name: {
          contains: input,
        }
      }
    });

    return matches;
  }),
});

