import { type Prisma, type Card } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
    createTRPCRouter,
    publicProcedure,
} from "~/server/api/trpc";

interface ScryfallSearchResponse {
    object: string;
    total_cards: number;
    has_more: boolean;
    data: Card[];
}

export const cardRouter = createTRPCRouter({
    search: publicProcedure
    .input(z.string().min(1))
    .query(async ({ ctx, input }) => {
        // TODO: Create a searchRouter that will save results of search calls to scryfallAPI
        // will use to see if search in db returns same number of results
        // const matches = await ctx.prisma.card.findMany({
        //     where: {
        //         name: {
        //             contains: input,
        //         }
        //     }
        // });

        const scryfallSearch = await fetch(`https://api.scryfall.com/cards/search?q=${input}`);

        if (!scryfallSearch.ok) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Something went wrong when trying to search the Scryfall API.',
                cause: scryfallSearch.statusText,
            })
        }

        const cards = await scryfallSearch.json() as ScryfallSearchResponse;
        await ctx.prisma.card.createMany({
            skipDuplicates: true,
            data: cards.data.map((card) => ({
                scryfall_id: card.id,
                scryfall_uri: card.scryfall_uri,
                name: card.name,
                layout: card.layout,
                image_status: card.image_status,
                all_parts: card.all_parts as Prisma.JsonArray,
                card_faces: card.card_faces as Prisma.JsonArray,
                image_uris: card.image_uris as Prisma.JsonArray,
            })),
        });

        return cards.data;
    }),
});

