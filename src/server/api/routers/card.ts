import { z } from "zod";

import {
    createTRPCRouter,
    publicProcedure,
} from "~/server/api/trpc";

export const cardRouter = createTRPCRouter({
    findMany: publicProcedure.input(z.object({ cardIds: z.string().array() })).query(async ({ ctx, input }) => {
        const cards = await ctx.prisma.card.findMany({
            where: {
                id: { in: input.cardIds },
            }
        })

        return cards;
    }),
    search: publicProcedure
        .meta({ description: "Searching for card based on name alone.", })
        .input(
            z.object({
                name: z.string().min(1).describe('The name you are looking for.'),
                limit: z.number().min(1).max(100).nullish(),
                cursor: z.string().nullish(),
            }),
        )
        .query(async (opts) => {
            const { input, ctx } = opts;

            const limit = input.limit ?? 50;
            const { cursor, name } = input;
            const items = await ctx.prisma.card.findMany({
                take: limit + 1, // get an extra item at the end which we'll use as next cursor
                where: {
                    name: {
                        contains: name,
                        mode: 'insensitive',
                    },
                },
                cursor: cursor ? { id: cursor } : undefined,
                orderBy: {
                    id: 'asc',
                },
            });
            let nextCursor: typeof cursor | undefined = undefined;
            if (items.length > limit) {
                const nextItem = items.pop();
                nextCursor = nextItem!.id;
            }
            return {
                items,
                nextCursor,
            };
        }),
});

