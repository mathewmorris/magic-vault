import { type Card, type CardsOnDecks } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { verifyDeckOwnership } from "~/server/api/util";
import { DECK_BOARDS, DECK_FORMATS, parseBoard } from "~/utils/deck/checkDeck";
import { computeOwnership } from "~/utils/deck/ownership";

const deckName = z
  .string()
  .trim()
  .min(1, "Deck name can't be empty")
  .max(50, "Deck name can be at most 50 characters");

const deckFormat = z.enum(DECK_FORMATS);
const deckBoard = z.enum(DECK_BOARDS);

// Stops a typo like 4000 from making a deck nobody can scroll through.
const MAX_COPIES = 250;

export const deckRouter = createTRPCRouter({
  // The user's decks, most recently changed first, each with how many cards
  // are in the deck itself (main plus commander, not the sideboard).
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const decks = await ctx.prisma.deck.findMany({
      where: {
        userId: ctx.session.user.id,
        deletedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    });

    const entries: CardsOnDecks[] = decks.length === 0
      ? []
      : await ctx.prisma.cardsOnDecks.findMany({
          where: {
            deckId: { in: decks.map((deck) => deck.id) },
          },
        });

    const cardCounts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.board === "side") continue;
      cardCounts.set(entry.deckId, (cardCounts.get(entry.deckId) ?? 0) + entry.count);
    }

    return decks.map((deck) => ({ ...deck, cardCount: cardCounts.get(deck.id) ?? 0 }));
  }),

  // A deck with its cards, oldest first. Entries whose card no longer exists
  // are skipped, same as collections.
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const deck = await ctx.prisma.deck.findUnique({
        where: { id: input.id },
      });

      // Someone else's deck looks exactly like a missing one, so ids can't
      // be probed to find out which decks exist.
      if (!deck || deck.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deck not found",
        });
      }

      const entries = await ctx.prisma.cardsOnDecks.findMany({
        where: { deckId: deck.id },
        orderBy: [
          { createdAt: "asc" },
          { cardId: "asc" },
        ],
      });

      const cards: Card[] = entries.length === 0
        ? []
        : await ctx.prisma.card.findMany({
            where: {
              id: { in: Array.from(new Set(entries.map((entry) => entry.cardId))) },
            },
          });
      const cardsById = new Map(cards.map((card) => [card.id, card]));

      return {
        ...deck,
        cards: entries.flatMap(({ cardId, count, board }) => {
          const card = cardsById.get(cardId);
          return card ? [{ card, count, board: parseBoard(board) }] : [];
        }),
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: deckName,
        format: deckFormat.default("commander"),
        description: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return ctx.prisma.deck.create({
        data: {
          name: input.name,
          format: input.format,
          // A blank description is stored as no description.
          description: input.description === "" ? null : input.description ?? null,
          user: {
            connect: {
              id: ctx.session.user.id,
            },
          },
        },
      });
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), name: deckName }))
    .mutation(async ({ ctx, input }) => {
      const deck = await verifyDeckOwnership(ctx.prisma, ctx.session.user.id, input.id);

      return ctx.prisma.deck.update({
        where: { id: deck.id },
        data: { name: input.name },
      });
    }),

  setFormat: protectedProcedure
    .input(z.object({ id: z.string(), format: deckFormat }))
    .mutation(async ({ ctx, input }) => {
      const deck = await verifyDeckOwnership(ctx.prisma, ctx.session.user.id, input.id);

      return ctx.prisma.deck.update({
        where: { id: deck.id },
        data: { format: input.format },
      });
    }),

  softDelete: protectedProcedure
    .input(z.object({ deckId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deck = await verifyDeckOwnership(ctx.prisma, ctx.session.user.id, input.deckId);

      return ctx.prisma.deck.update({
        where: { id: deck.id },
        data: { deletedAt: new Date() },
      });
    }),

  addCard: protectedProcedure
    .input(z.object({ deckId: z.string(), cardId: z.string().min(1), board: deckBoard.default("main") }))
    .mutation(async ({ ctx, input }) => {
      const deck = await verifyDeckOwnership(ctx.prisma, ctx.session.user.id, input.deckId);

      const card = await ctx.prisma.card.findUnique({
        where: { id: input.cardId },
      });

      if (!card) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Card not found",
        });
      }

      return ctx.prisma.cardsOnDecks.upsert({
        where: {
          deckId_cardId_board: {
            deckId: deck.id,
            cardId: card.id,
            board: input.board,
          },
        },
        create: {
          deckId: deck.id,
          cardId: card.id,
          board: input.board,
          count: 1,
        },
        update: {
          count: { increment: 1 },
        },
      });
    }),

  // Takes one copy off the board. The last copy removes the card from it.
  removeCard: protectedProcedure
    .input(z.object({ deckId: z.string(), cardId: z.string(), board: deckBoard.default("main") }))
    .mutation(async ({ ctx, input }) => {
      const deck = await verifyDeckOwnership(ctx.prisma, ctx.session.user.id, input.deckId);
      const where = { deckId: deck.id, cardId: input.cardId, board: input.board };

      // Only decrements while there's more than one copy, so two quick
      // clicks can never leave a row sitting at 0.
      const decremented = await ctx.prisma.cardsOnDecks.updateMany({
        where: { ...where, count: { gt: 1 } },
        data: { count: { decrement: 1 } },
      });

      if (decremented.count > 0) {
        return { removed: false };
      }

      await ctx.prisma.cardsOnDecks.deleteMany({ where });

      return { removed: true };
    }),

  // Sets how many copies are on a board. 0 takes the card off it.
  setCount: protectedProcedure
    .input(
      z.object({
        deckId: z.string(),
        cardId: z.string().min(1),
        board: deckBoard.default("main"),
        count: z.number().int().min(0).max(MAX_COPIES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const deck = await verifyDeckOwnership(ctx.prisma, ctx.session.user.id, input.deckId);
      const key = { deckId: deck.id, cardId: input.cardId, board: input.board };

      if (input.count === 0) {
        await ctx.prisma.cardsOnDecks.deleteMany({ where: key });
        return { removed: true };
      }

      const card = await ctx.prisma.card.findUnique({
        where: { id: input.cardId },
      });

      if (!card) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Card not found",
        });
      }

      await ctx.prisma.cardsOnDecks.upsert({
        where: { deckId_cardId_board: key },
        create: { ...key, count: input.count },
        update: { count: input.count },
      });

      return { removed: false };
    }),

  // How many copies of each deck card the user owns, in any printing, across
  // all of their collections that aren't deleted.
  ownership: protectedProcedure
    .input(z.object({ deckId: z.string() }))
    .query(async ({ ctx, input }) => {
      const deck = await verifyDeckOwnership(ctx.prisma, ctx.session.user.id, input.deckId);

      const deckEntries = await ctx.prisma.cardsOnDecks.findMany({
        where: { deckId: deck.id },
        orderBy: [
          { createdAt: "asc" },
          { cardId: "asc" },
        ],
      });

      if (deckEntries.length === 0) {
        return computeOwnership([], [], [], []);
      }

      const deckCards = await ctx.prisma.card.findMany({
        where: {
          id: { in: Array.from(new Set(deckEntries.map((entry) => entry.cardId))) },
        },
      });

      const collectionEntries = await ctx.prisma.cardsOnCollections.findMany({
        where: {
          collection: {
            userId: ctx.session.user.id,
            deletedAt: null,
          },
        },
      });

      if (collectionEntries.length === 0) {
        return computeOwnership(deckEntries, deckCards, [], []);
      }

      // Only the owned printings that can match a deck card: same oracle_id,
      // or the very same card when it has no oracle_id.
      const oracleIds = Array.from(
        new Set(deckCards.flatMap((card) => (card.oracle_id ? [card.oracle_id] : [])))
      );
      const idsWithoutOracle = deckCards.filter((card) => !card.oracle_id).map((card) => card.id);

      const collectionCards = await ctx.prisma.card.findMany({
        where: {
          id: { in: Array.from(new Set(collectionEntries.map((entry) => entry.cardId))) },
          OR: [
            { oracle_id: { in: oracleIds } },
            { id: { in: idsWithoutOracle } },
          ],
        },
      });

      return computeOwnership(deckEntries, deckCards, collectionEntries, collectionCards);
    }),
});
