import prismaMock from "test-utils/singleton";
import { verifyCollectionOwnership } from "~/server/api/util/verifyCollectionOwnership";
import { TRPCError } from "@trpc/server";

describe("verifyCollectionOwnership", () => {
  const userId = "user123";
  const collectionId = "collection456";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should return the collection if ownership is verified", async () => {
    const dateNow = new Date();
    const collection = {
      id: collectionId,
      name: "Collection",
      userId,
      updatedAt: dateNow,
      createdAt: dateNow,
      deletedAt: null,
    }

    prismaMock.collection.findUnique.mockResolvedValue(collection);

    return expect(
      verifyCollectionOwnership(prismaMock, userId, collectionId)
    ).resolves.toStrictEqual(collection);
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

