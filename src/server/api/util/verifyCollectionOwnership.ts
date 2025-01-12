import { TRPCError } from "@trpc/server";
import { type prisma as prismaClient } from "~/server/db";

/**
 * Utility function to verify ownership of a collection.
 *
 * @param prisma - Prisma client instance.
 * @param userId - The ID of the current user.
 * @param collectionId - The ID of the collection to verify ownership for.
 * @returns The collection if ownership is verified.
 * @throws TRPCError if the collection is not found or the user is not the owner.
 */
export const verifyCollectionOwnership = async (
  prisma: typeof prismaClient,
  userId: string,
  collectionId: string
) => {
  // Fetch the collection
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
  });

  // Check if the collection exists
  if (!collection) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Collection not found",
    });
  }

  // Check ownership
  if (collection.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not authorized to access this collection",
    });
  }

  // Return the collection if ownership is verified
  return collection;
};

