import prismaMock from "singleton";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { TRPCError } from "@trpc/server";
import { type CardsOnCollections, type CardsOnDecks, type Deck } from "@prisma/client";
import { buildCard } from "../../testing/cardFixture";

describe("deck procedures", () => {
    const userId = "user123";
    const deckId = "deck456";
    const dateNow = new Date();
    let deck: Deck;

    const buildDeck = (overrides: Partial<Deck> = {}): Deck => ({
        id: deckId,
        name: "Atraxa Superfriends",
        format: "commander",
        description: null,
        userId,
        createdAt: dateNow,
        updatedAt: dateNow,
        deletedAt: null,
        ...overrides,
    });

    const buildEntry = (overrides: Partial<CardsOnDecks> = {}): CardsOnDecks => ({
        deckId,
        cardId: "card-1",
        count: 1,
        board: "main",
        createdAt: dateNow,
        updatedAt: dateNow,
        ...overrides,
    });

    const buildCollectionEntry = (overrides: Partial<CardsOnCollections> = {}): CardsOnCollections => ({
        collectionId: "collection-1",
        cardId: "card-1",
        count: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
        ...overrides,
    });

    const authedCaller = (id: string = userId) => {
        const session = {
            user: { id, name: "John Doe" },
            expires: "1",
        };
        const ctx = createInnerTRPCContext({ session });
        return appRouter.createCaller({ ...ctx, prisma: prismaMock });
    };

    const unauthedCaller = () => {
        const ctx = createInnerTRPCContext({ session: null });
        return appRouter.createCaller({ ...ctx, prisma: prismaMock });
    };

    const forbidden = new TRPCError({
        code: "FORBIDDEN",
        message: "You are not authorized to access this deck",
    });

    beforeEach(() => {
        jest.clearAllMocks();
        deck = buildDeck();
        prismaMock.deck.findUnique.mockResolvedValue(deck);
    });

    test("every procedure needs a signed-in user", async () => {
        await expect(unauthedCaller().deck.getAll()).rejects.toStrictEqual(
            new TRPCError({ code: "UNAUTHORIZED" })
        );
        await expect(unauthedCaller().deck.ownership({ deckId })).rejects.toStrictEqual(
            new TRPCError({ code: "UNAUTHORIZED" })
        );
    });

    describe("getAll", () => {
        test("returns the user's live decks, newest change first, with main plus commander counts", async () => {
            const other = buildDeck({ id: "deck-2", name: "Burn" });
            prismaMock.deck.findMany.mockResolvedValue([deck, other]);
            prismaMock.cardsOnDecks.findMany.mockResolvedValue([
                buildEntry({ cardId: "a", count: 3 }),
                buildEntry({ cardId: "b", count: 1, board: "commander" }),
                buildEntry({ cardId: "c", count: 15, board: "side" }),
            ]);

            await expect(authedCaller().deck.getAll()).resolves.toStrictEqual([
                { ...deck, cardCount: 4 },
                { ...other, cardCount: 0 },
            ]);

            expect(prismaMock.deck.findMany).toHaveBeenCalledWith({
                where: { userId, deletedAt: null },
                orderBy: { updatedAt: "desc" },
            });
            expect(prismaMock.cardsOnDecks.findMany).toHaveBeenCalledWith({
                where: { deckId: { in: [deckId, "deck-2"] } },
            });
        });

        test("skips the card lookup when there are no decks", async () => {
            prismaMock.deck.findMany.mockResolvedValue([]);

            await expect(authedCaller().deck.getAll()).resolves.toStrictEqual([]);
            expect(prismaMock.cardsOnDecks.findMany).not.toHaveBeenCalled();
        });
    });

    describe("getById", () => {
        test("returns the deck with each entry's card, count and board", async () => {
            const ring = buildCard({ id: "ring", name: "Sol Ring" });
            const atraxa = buildCard({ id: "atraxa", name: "Atraxa, Praetors' Voice" });
            prismaMock.cardsOnDecks.findMany.mockResolvedValue([
                buildEntry({ cardId: "atraxa", board: "commander" }),
                buildEntry({ cardId: "ring", count: 1 }),
                buildEntry({ cardId: "gone" }),
            ]);
            prismaMock.card.findMany.mockResolvedValue([ring, atraxa]);

            await expect(authedCaller().deck.getById({ id: deckId })).resolves.toStrictEqual({
                ...deck,
                cards: [
                    { card: atraxa, count: 1, board: "commander" },
                    { card: ring, count: 1, board: "main" },
                ],
            });

            expect(prismaMock.cardsOnDecks.findMany).toHaveBeenCalledWith({
                where: { deckId },
                orderBy: [{ createdAt: "asc" }, { cardId: "asc" }],
            });
            expect(prismaMock.card.findMany).toHaveBeenCalledWith({
                where: { id: { in: ["atraxa", "ring", "gone"] } },
            });
        });

        test("returns no cards without looking any up for an empty deck", async () => {
            prismaMock.cardsOnDecks.findMany.mockResolvedValue([]);

            await expect(authedCaller().deck.getById({ id: deckId })).resolves.toStrictEqual({ ...deck, cards: [] });
            expect(prismaMock.card.findMany).not.toHaveBeenCalled();
        });

        test("someone else's deck looks the same as a missing one", async () => {
            const notFound = new TRPCError({ code: "NOT_FOUND", message: "Deck not found" });

            await expect(authedCaller("notowner").deck.getById({ id: deckId })).rejects.toStrictEqual(notFound);

            prismaMock.deck.findUnique.mockResolvedValue(null);
            await expect(authedCaller().deck.getById({ id: deckId })).rejects.toStrictEqual(notFound);

            expect(prismaMock.cardsOnDecks.findMany).not.toHaveBeenCalled();
        });
    });

    describe("create", () => {
        test("creates a deck for the user with a trimmed name, defaulting to commander", async () => {
            prismaMock.deck.create.mockResolvedValue(deck);

            await expect(authedCaller().deck.create({ name: "  Atraxa Superfriends " })).resolves.toStrictEqual(deck);

            expect(prismaMock.deck.create).toHaveBeenCalledWith({
                data: {
                    name: "Atraxa Superfriends",
                    format: "commander",
                    description: null,
                    user: { connect: { id: userId } },
                },
            });
        });

        test("keeps the chosen format and description", async () => {
            prismaMock.deck.create.mockResolvedValue(deck);

            await authedCaller().deck.create({ name: "Burn", format: "modern", description: "Bolt the bird" });

            expect(prismaMock.deck.create).toHaveBeenCalledWith({
                data: {
                    name: "Burn",
                    format: "modern",
                    description: "Bolt the bird",
                    user: { connect: { id: userId } },
                },
            });
        });

        test("rejects an empty name, a long name and an unknown format", async () => {
            await expect(authedCaller().deck.create({ name: "   " })).rejects.toThrow("Deck name can't be empty");
            await expect(authedCaller().deck.create({ name: "x".repeat(51) })).rejects.toThrow(
                "Deck name can be at most 50 characters"
            );
            await expect(
                // @ts-expect-error: not one of the formats
                authedCaller().deck.create({ name: "Cube", format: "cube" })
            ).rejects.toBeInstanceOf(TRPCError);

            expect(prismaMock.deck.create).not.toHaveBeenCalled();
        });
    });

    describe("rename and setFormat", () => {
        test("rename updates the name", async () => {
            const renamed = buildDeck({ name: "New name" });
            prismaMock.deck.update.mockResolvedValue(renamed);

            await expect(authedCaller().deck.rename({ id: deckId, name: "New name" })).resolves.toStrictEqual(renamed);
            expect(prismaMock.deck.update).toHaveBeenCalledWith({
                where: { id: deckId },
                data: { name: "New name" },
            });
        });

        test("setFormat updates the format", async () => {
            prismaMock.deck.update.mockResolvedValue(buildDeck({ format: "vintage" }));

            await authedCaller().deck.setFormat({ id: deckId, format: "vintage" });
            expect(prismaMock.deck.update).toHaveBeenCalledWith({
                where: { id: deckId },
                data: { format: "vintage" },
            });
        });

        test("neither writes to someone else's deck", async () => {
            await expect(authedCaller("notowner").deck.rename({ id: deckId, name: "Mine" })).rejects.toStrictEqual(forbidden);
            await expect(authedCaller("notowner").deck.setFormat({ id: deckId, format: "modern" })).rejects.toStrictEqual(forbidden);

            expect(prismaMock.deck.update).not.toHaveBeenCalled();
        });
    });

    describe("softDelete", () => {
        test("marks the deck deleted", async () => {
            prismaMock.deck.update.mockResolvedValue(buildDeck({ deletedAt: dateNow }));

            await authedCaller().deck.softDelete({ deckId });

            expect(prismaMock.deck.update).toHaveBeenCalledWith({
                where: { id: deckId },
                data: { deletedAt: expect.any(Date) as Date },
            });
        });

        test("doesn't touch someone else's deck", async () => {
            await expect(authedCaller("notowner").deck.softDelete({ deckId })).rejects.toStrictEqual(forbidden);
            expect(prismaMock.deck.update).not.toHaveBeenCalled();
        });
    });

    describe("addCard", () => {
        test("adds a copy to the main board by default", async () => {
            const entry = buildEntry({ cardId: "ring", count: 2 });
            prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "ring" }));
            prismaMock.cardsOnDecks.upsert.mockResolvedValue(entry);

            await expect(authedCaller().deck.addCard({ deckId, cardId: "ring" })).resolves.toStrictEqual(entry);

            expect(prismaMock.cardsOnDecks.upsert).toHaveBeenCalledWith({
                where: { deckId_cardId_board: { deckId, cardId: "ring", board: "main" } },
                create: { deckId, cardId: "ring", board: "main", count: 1 },
                update: { count: { increment: 1 } },
            });
        });

        test("adds to the board it's given", async () => {
            prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "atraxa" }));
            prismaMock.cardsOnDecks.upsert.mockResolvedValue(buildEntry({ cardId: "atraxa", board: "commander" }));

            await authedCaller().deck.addCard({ deckId, cardId: "atraxa", board: "commander" });

            expect(prismaMock.cardsOnDecks.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { deckId_cardId_board: { deckId, cardId: "atraxa", board: "commander" } },
                }) as object
            );
        });

        test("throws NOT_FOUND for a card that doesn't exist", async () => {
            prismaMock.card.findUnique.mockResolvedValue(null);

            await expect(authedCaller().deck.addCard({ deckId, cardId: "nope" })).rejects.toStrictEqual(
                new TRPCError({ code: "NOT_FOUND", message: "Card not found" })
            );
            expect(prismaMock.cardsOnDecks.upsert).not.toHaveBeenCalled();
        });

        test("doesn't write to someone else's deck", async () => {
            await expect(authedCaller("notowner").deck.addCard({ deckId, cardId: "ring" })).rejects.toStrictEqual(forbidden);
            expect(prismaMock.cardsOnDecks.upsert).not.toHaveBeenCalled();
        });
    });

    describe("removeCard", () => {
        test("takes one copy off when there is more than one", async () => {
            prismaMock.cardsOnDecks.updateMany.mockResolvedValue({ count: 1 });

            await expect(authedCaller().deck.removeCard({ deckId, cardId: "ring", board: "side" })).resolves.toStrictEqual({
                removed: false,
            });

            expect(prismaMock.cardsOnDecks.updateMany).toHaveBeenCalledWith({
                where: { deckId, cardId: "ring", board: "side", count: { gt: 1 } },
                data: { count: { decrement: 1 } },
            });
            expect(prismaMock.cardsOnDecks.deleteMany).not.toHaveBeenCalled();
        });

        test("removes the card from the board at its last copy", async () => {
            prismaMock.cardsOnDecks.updateMany.mockResolvedValue({ count: 0 });
            prismaMock.cardsOnDecks.deleteMany.mockResolvedValue({ count: 1 });

            await expect(authedCaller().deck.removeCard({ deckId, cardId: "ring" })).resolves.toStrictEqual({
                removed: true,
            });

            expect(prismaMock.cardsOnDecks.deleteMany).toHaveBeenCalledWith({
                where: { deckId, cardId: "ring", board: "main" },
            });
        });

        test("doesn't write to someone else's deck", async () => {
            await expect(authedCaller("notowner").deck.removeCard({ deckId, cardId: "ring" })).rejects.toStrictEqual(forbidden);
            expect(prismaMock.cardsOnDecks.updateMany).not.toHaveBeenCalled();
            expect(prismaMock.cardsOnDecks.deleteMany).not.toHaveBeenCalled();
        });
    });

    describe("setCount", () => {
        test("sets the count, adding the card if it isn't on the board yet", async () => {
            prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "bolt" }));
            prismaMock.cardsOnDecks.upsert.mockResolvedValue(buildEntry({ cardId: "bolt", count: 4 }));

            await expect(authedCaller().deck.setCount({ deckId, cardId: "bolt", count: 4 })).resolves.toStrictEqual({
                removed: false,
            });

            expect(prismaMock.cardsOnDecks.upsert).toHaveBeenCalledWith({
                where: { deckId_cardId_board: { deckId, cardId: "bolt", board: "main" } },
                create: { deckId, cardId: "bolt", board: "main", count: 4 },
                update: { count: 4 },
            });
        });

        test("0 takes the card off the board", async () => {
            prismaMock.cardsOnDecks.deleteMany.mockResolvedValue({ count: 1 });

            await expect(
                authedCaller().deck.setCount({ deckId, cardId: "bolt", board: "side", count: 0 })
            ).resolves.toStrictEqual({ removed: true });

            expect(prismaMock.cardsOnDecks.deleteMany).toHaveBeenCalledWith({
                where: { deckId, cardId: "bolt", board: "side" },
            });
            expect(prismaMock.cardsOnDecks.upsert).not.toHaveBeenCalled();
        });

        test("throws NOT_FOUND for a card that doesn't exist", async () => {
            prismaMock.card.findUnique.mockResolvedValue(null);

            await expect(authedCaller().deck.setCount({ deckId, cardId: "nope", count: 2 })).rejects.toStrictEqual(
                new TRPCError({ code: "NOT_FOUND", message: "Card not found" })
            );
            expect(prismaMock.cardsOnDecks.upsert).not.toHaveBeenCalled();
        });

        test("rejects negative and fractional counts", async () => {
            await expect(authedCaller().deck.setCount({ deckId, cardId: "bolt", count: -1 })).rejects.toBeInstanceOf(TRPCError);
            await expect(authedCaller().deck.setCount({ deckId, cardId: "bolt", count: 1.5 })).rejects.toBeInstanceOf(TRPCError);
            expect(prismaMock.cardsOnDecks.upsert).not.toHaveBeenCalled();
        });

        test("doesn't write to someone else's deck", async () => {
            await expect(
                authedCaller("notowner").deck.setCount({ deckId, cardId: "bolt", count: 0 })
            ).rejects.toStrictEqual(forbidden);
            expect(prismaMock.cardsOnDecks.deleteMany).not.toHaveBeenCalled();
        });
    });

    describe("ownership", () => {
        test("counts owned copies of any printing across the user's live collections", async () => {
            prismaMock.cardsOnDecks.findMany.mockResolvedValue([
                buildEntry({ cardId: "bolt-m10", count: 4 }),
                buildEntry({ cardId: "old", count: 1 }),
            ]);
            prismaMock.card.findMany
                .mockResolvedValueOnce([
                    buildCard({ id: "bolt-m10", name: "Lightning Bolt", oracle_id: "bolt" }),
                    buildCard({ id: "old", name: "Old Card" }),
                ])
                .mockResolvedValueOnce([
                    buildCard({ id: "bolt-a25", name: "Lightning Bolt", oracle_id: "bolt" }),
                    buildCard({ id: "old", name: "Old Card" }),
                ]);
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([
                buildCollectionEntry({ collectionId: "c1", cardId: "bolt-a25", count: 2 }),
                buildCollectionEntry({ collectionId: "c2", cardId: "bolt-a25", count: 1 }),
                buildCollectionEntry({ collectionId: "c2", cardId: "old", count: 1 }),
                buildCollectionEntry({ collectionId: "c2", cardId: "elf", count: 4 }),
            ]);

            await expect(authedCaller().deck.ownership({ deckId })).resolves.toStrictEqual({
                cards: [
                    { key: "oracle:bolt", name: "Lightning Bolt", cardIds: ["bolt-m10"], needed: 4, owned: 3, missing: 1 },
                    { key: "card:old", name: "Old Card", cardIds: ["old"], needed: 1, owned: 1, missing: 0 },
                ],
                totals: { needed: 5, owned: 4, missing: 1 },
            });

            expect(prismaMock.cardsOnCollections.findMany).toHaveBeenCalledWith({
                where: { collection: { userId, deletedAt: null } },
            });
            expect(prismaMock.card.findMany).toHaveBeenNthCalledWith(2, {
                where: {
                    id: { in: ["bolt-a25", "old", "elf"] },
                    OR: [{ oracle_id: { in: ["bolt"] } }, { id: { in: ["old"] } }],
                },
            });
        });

        test("everything is missing when the user has no collection cards", async () => {
            prismaMock.cardsOnDecks.findMany.mockResolvedValue([buildEntry({ cardId: "ring", count: 1 })]);
            prismaMock.card.findMany.mockResolvedValue([buildCard({ id: "ring", name: "Sol Ring", oracle_id: "sol" })]);
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([]);

            await expect(authedCaller().deck.ownership({ deckId })).resolves.toStrictEqual({
                cards: [{ key: "oracle:sol", name: "Sol Ring", cardIds: ["ring"], needed: 1, owned: 0, missing: 1 }],
                totals: { needed: 1, owned: 0, missing: 1 },
            });
            expect(prismaMock.card.findMany).toHaveBeenCalledTimes(1);
        });

        test("an empty deck needs no lookups", async () => {
            prismaMock.cardsOnDecks.findMany.mockResolvedValue([]);

            await expect(authedCaller().deck.ownership({ deckId })).resolves.toStrictEqual({
                cards: [],
                totals: { needed: 0, owned: 0, missing: 0 },
            });
            expect(prismaMock.card.findMany).not.toHaveBeenCalled();
            expect(prismaMock.cardsOnCollections.findMany).not.toHaveBeenCalled();
        });

        test("throws FORBIDDEN for someone else's deck", async () => {
            await expect(authedCaller("notowner").deck.ownership({ deckId })).rejects.toStrictEqual(forbidden);
            expect(prismaMock.cardsOnDecks.findMany).not.toHaveBeenCalled();
        });
    });
});
