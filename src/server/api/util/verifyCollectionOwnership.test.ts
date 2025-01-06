import { verifyCollectionOwnership } from "./verifyCollectionOwnership";
import { TRPCError } from "@trpc/server";
import prismaMock from "singleton";

describe("verifyCollectionOwnership", () => {
  const userId = "user123";
  const collectionId = "collection456";

  beforeEach(() => {
    jest.clearAllMocks(); // Clear mock state between tests
  });

  test("should return the collection if ownership is verified", async () => {
    prismaMock.collection.findUnique.mockResolvedValue({
      id: collectionId,
      name: "Collection",
      cards: [],
      userId,
      updatedAt: new Date(),
      createdAt: new Date(),
      deletedAt: null,
    });

    const result = await verifyCollectionOwnership(prismaMock, userId, collectionId);

    expect(result).toEqual({ id: collectionId, userId });
    expect(prismaMock.collection.findUnique).toHaveBeenCalledWith({
      where: { id: collectionId },
    });
  });

  test("should throw NOT_FOUND error if the collection does not exist", async () => {
    prismaMock.collection.findUnique.mockResolvedValue(null);

    await expect(
      verifyCollectionOwnership(prismaMock, userId, collectionId)
    ).rejects.toThrowError(new TRPCError({ code: "NOT_FOUND" }));

    expect(prismaMock.collection.findUnique).toHaveBeenCalledWith({
      where: { id: collectionId },
    });
  });

  test("should throw FORBIDDEN error if the user is not the owner", async () => {
    prismaMock.collection.findUnique.mockResolvedValue({
      id: collectionId,
      userId: "otherUser789",
      name: "Collection",
      cards: [],
      updatedAt: new Date(),
      createdAt: new Date(),
      deletedAt: null,
    });

    await expect(
      verifyCollectionOwnership(prismaMock, userId, collectionId)
    ).rejects.toThrowError(
      new TRPCError({
        code: "FORBIDDEN",
        message: "You are not authorized to access this collection",
      })
    );

    expect(prismaMock.collection.findUnique).toHaveBeenCalledWith({
      where: { id: collectionId },
    });
  });
});

