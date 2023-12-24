import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

export const cardRouter = createTRPCRouter({
  add: publicProcedure
  .input(z.object({
    name: z.string(),
    scryfall_id: z.string(),
    scryfall_uri: z.string(),
    image_status: z.string(),
    layout: z.string(),
    image_uris: z.object({
      small: z.string(),
      normal: z.string(),
      large: z.string(),
      art_crop: z.string(),
      border_crop: z.string(),
      png: z.string(),
    }).nullish(),
  }))
  .mutation(async ({ctx, input}) => {
    const card = ctx.prisma.card.create({
      data: input,
    });

    return card;
  }),
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

