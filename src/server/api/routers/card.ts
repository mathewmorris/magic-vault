import { z } from "zod";

import {
    createTRPCRouter,
    publicProcedure,
} from "~/server/api/trpc";
import { cacheScryfallCards } from "~/server/scryfall/cacheCards";
import { isScryfallFallbackEnabled, scryfall } from "~/server/scryfall/client";

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
            const findLocal = () => ctx.prisma.card.findMany({
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
            let items = await findLocal();

            // Read-through cache: a first-page miss may be a card newer than
            // our last bulk sync, so ask Scryfall, store what it finds, and
            // read again so ordering and paging stay the same.
            if (items.length === 0 && !cursor && isScryfallFallbackEnabled()) {
                const outcome = await scryfall.searchByName(name);
                if (outcome.status === "ok") {
                    try {
                        const added = await cacheScryfallCards(ctx.prisma, outcome.cards);
                        if (added > 0) items = await findLocal();
                    } catch (err) {
                        console.error("Caching Scryfall cards failed", err);
                    }
                } else if (outcome.status === "error") {
                    console.warn("Scryfall search fallback failed:", outcome.message);
                }
            }
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

