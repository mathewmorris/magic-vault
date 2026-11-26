import { verifyDeckOwnership } from "./verifyDeckOwnership";
import { TRPCError } from "@trpc/server";
import { type Deck } from "@prisma/client";
import prismaMock from "singleton";

describe("verifyDeckOwnership", () => {
  const userId = "user123";
  const deckId = "deck456";
  const buildDeck = (overrides: Partial<Deck> = {}): Deck => ({
    id: deckId,
    name: "Deck",
    format: "commander",
    description: null,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns the deck when the user owns it", async () => {
    const deck = buildDeck();
    prismaMock.deck.findUnique.mockResolvedValue(deck);

    await expect(verifyDeckOwnership(prismaMock, userId, deckId)).resolves.toStrictEqual(deck);
    expect(prismaMock.deck.findUnique).toHaveBeenCalledWith({ where: { id: deckId } });
  });

  test("throws NOT_FOUND when the deck doesn't exist", async () => {
    prismaMock.deck.findUnique.mockResolvedValue(null);

    await expect(verifyDeckOwnership(prismaMock, userId, deckId)).rejects.toStrictEqual(
      new TRPCError({ code: "NOT_FOUND", message: "Deck not found" })
    );
  });

  test("throws FORBIDDEN when someone else owns the deck", async () => {
    prismaMock.deck.findUnique.mockResolvedValue(buildDeck({ userId: "otherUser789" }));

    await expect(verifyDeckOwnership(prismaMock, userId, deckId)).rejects.toStrictEqual(
      new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to access this deck" })
    );
  });
});
