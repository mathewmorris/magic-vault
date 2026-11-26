import { TRPCError } from "@trpc/server";
import { type prisma as prismaClient } from "~/server/db";

/**
 * Utility function to verify ownership of a deck.
 *
 * @param prisma - Prisma client instance.
 * @param userId - The ID of the current user.
 * @param deckId - The ID of the deck to verify ownership for.
 * @returns The deck if ownership is verified.
 * @throws TRPCError if the deck is not found or the user is not the owner.
 */
export const verifyDeckOwnership = async (
  prisma: typeof prismaClient,
  userId: string,
  deckId: string
) => {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
  });

  if (!deck) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deck not found",
    });
  }

  if (deck.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not authorized to access this deck",
    });
  }

  return deck;
};
