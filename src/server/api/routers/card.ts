import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
    createTRPCRouter,
    publicProcedure,
} from "~/server/api/trpc";
import { affiliateConfig } from "~/server/affiliate";
import { buildCardSearch, type CardSearchRow } from "~/server/search/buildCardSearch";
import { cacheScryfallCards } from "~/server/scryfall/cacheCards";
import {
    isScryfallFallbackEnabled,
    isScryfallId,
    scryfall,
    type ScryfallRuling,
} from "~/server/scryfall/client";
import { buyLinks } from "~/utils/buyLinks";

/** How many other printings the card page lists. */
export const PRINTINGS_LIMIT = 60;

/** The columns the card page's printings list reads. */
export const printingSelect = {
    id: true,
    name: true,
    set: true,
    set_name: true,
    collector_number: true,
    rarity: true,
    released_at: true,
    image_uris: true,
    card_faces: true,
} as const;
import { parseQuery } from "~/utils/search/parseQuery";
import {
    MAX_QUERY_LENGTH,
    MAX_SEARCH_PAGE,
    SEARCH_PAGE_SIZE,
    SEARCH_SORTS,
} from "~/utils/search/searchOptions";

export const cardRouter = createTRPCRouter({
    byId: publicProcedure
        .meta({ description: "One card with its other printings, for the card page." })
        .input(z.object({ id: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
            const card = await ctx.prisma.card.findUnique({ where: { id: input.id } });
            if (!card) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
            }

            // Rows synced before oracle_id existed can't be matched up, so
            // they just show no other printings.
            const found = card.oracle_id
                ? await ctx.prisma.card.findMany({
                    where: { oracle_id: card.oracle_id, id: { not: card.id } },
                    select: printingSelect,
                    orderBy: [{ released_at: { sort: "desc", nulls: "last" } }, { id: "asc" }],
                    take: PRINTINGS_LIMIT + 1, // one extra tells us there are more
                })
                : [];

            return {
                ...card,
                printings: found.slice(0, PRINTINGS_LIMIT),
                hasMorePrintings: found.length > PRINTINGS_LIMIT,
                buyLinks: buyLinks(card, affiliateConfig()),
            };
        }),
    rulings: publicProcedure
        .meta({ description: "A card's rulings, fetched from Scryfall when asked for." })
        .input(z.object({ id: z.string().max(64) }))
        .query(async ({ input }): Promise<ScryfallRuling[]> => {
            if (!isScryfallId(input.id) || !isScryfallFallbackEnabled()) return [];

            try {
                const outcome = await scryfall.getRulings(input.id);
                if (outcome.status === "ok") return outcome.rulings;
                if (outcome.status === "error") {
                    console.warn("Scryfall rulings fetch failed:", outcome.message);
                }
            } catch (err) {
                console.error("Scryfall rulings fetch failed", err);
            }
            // Rulings are extra; the card page still works without them.
            return [];
        }),
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
    searchAdvanced: publicProcedure
        .meta({ description: "Scryfall-style card search (c:, t:, o:, mv:, r:, s:, f: and more), one result per card." })
        .input(
            z.object({
                q: z.string().max(MAX_QUERY_LENGTH).describe('The search, e.g. goblin c:r mv<=2'),
                sort: z.enum(SEARCH_SORTS).default("name"),
                page: z.number().int().min(1).max(MAX_SEARCH_PAGE).default(1),
            }),
        )
        .query(async ({ ctx, input }): Promise<{ items: CardSearchRow[]; hasMore: boolean; warnings: string[] }> => {
            const { terms, warnings } = parseQuery(input.q);
            // Nothing to search for: don't list the whole table.
            if (terms.length === 0) return { items: [], hasMore: false, warnings };

            const rows = await ctx.prisma.$queryRaw<CardSearchRow[]>(
                buildCardSearch(terms, { sort: input.sort, page: input.page, pageSize: SEARCH_PAGE_SIZE }),
            );
            return {
                items: rows.slice(0, SEARCH_PAGE_SIZE),
                hasMore: rows.length > SEARCH_PAGE_SIZE,
                warnings,
            };
        }),
});

