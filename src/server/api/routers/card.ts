import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

export const cardRouter = createTRPCRouter({
  add: publicProcedure
  .input(z.object({ scryfallId: z.string(), name: z.string() }))
  .mutation(async ({ctx, input}) => {
    const card = ctx.prisma.card.create({
      data: input,
    });

    return card;
  }),
});

