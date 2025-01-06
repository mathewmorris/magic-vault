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
    const dateNow = new Date();
    const collection = {
      id: collectionId,
      name: "Collection",
      cards: [],
      userId,
      updatedAt: dateNow,
      createdAt: dateNow,
      deletedAt: null,
    }

    prismaMock.collection.findUnique.mockResolvedValue(collection);

    const result = await verifyCollectionOwnership(prismaMock, userId, collectionId);

    expect(result).toEqual(collection);
    expect(prismaMock.collection.findUnique).toHaveBeenCalledWith({
      where: { id: collectionId },
    });
  });

  test("should throw NOT_FOUND error if the collection does not exist", async () => {
    return expect(
      verifyCollectionOwnership(prismaMock, userId, collectionId)
    )
      .rejects
      .toStrictEqual(
        new TRPCError({ code: "NOT_FOUND", message: "Collection not found" })
      );
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

    return expect(
      verifyCollectionOwnership(prismaMock, userId, collectionId)
    ).rejects.toStrictEqual(
      new TRPCError({
        code: "FORBIDDEN",
        message: "You are not authorized to access this collection",
      })
    );
  });
});

