import prismaMock from "singleton";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { TRPCError } from "@trpc/server";
import { type Card, type CardsOnCollections, type Collection } from "@prisma/client";
import { toCardEntries } from "./collection";

describe("collection card procedures", () => {
    const userId = "user123";
    const collectionId = "collection456";
    const dateNow = new Date();
    let collection: Collection;

    const buildCard = (overrides: Partial<Card> = {}): Card => ({
        id: "card-1",
        name: "Black Lotus",
        scryfall_uri: "https://scryfall.com/card/black-lotus",
        image_status: "highres_scan",
        image_uris: null,
        card_faces: null,
        all_parts: null,
        layout: "normal",
        ...overrides,
    });

    const buildEntry = (overrides: Partial<CardsOnCollections> = {}): CardsOnCollections => ({
        collectionId,
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

    const forbidden = new TRPCError({
        code: "FORBIDDEN",
        message: "You are not authorized to access this collection",
    });

    beforeEach(() => {
        jest.clearAllMocks();
        collection = {
            id: collectionId,
            name: "Collection",
            cards: [],
            userId,
            updatedAt: dateNow,
            createdAt: dateNow,
            deletedAt: null,
        };
        prismaMock.collection.findUnique.mockResolvedValue(collection);
    });

    describe("toCardEntries", () => {
        test("counts repeats and keeps first-seen order with increasing createdAt", () => {
            const now = new Date("2026-01-01T00:00:00.000Z");

            expect(toCardEntries(["b", "a", "b", "c", "b"], now)).toStrictEqual([
                { cardId: "b", count: 3, createdAt: new Date("2026-01-01T00:00:00.000Z") },
                { cardId: "a", count: 1, createdAt: new Date("2026-01-01T00:00:00.001Z") },
                { cardId: "c", count: 1, createdAt: new Date("2026-01-01T00:00:00.002Z") },
            ]);
        });
    });

    describe("cards", () => {
        test("returns cards with counts in the order the entries come back", async () => {
            const lotus = buildCard({ id: "lotus", name: "Black Lotus" });
            const mox = buildCard({ id: "mox", name: "Mox Pearl" });
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([
                buildEntry({ cardId: "mox", count: 2 }),
                buildEntry({ cardId: "lotus", count: 1 }),
            ]);
            // The card lookup comes back in a different order on purpose.
            prismaMock.card.findMany.mockResolvedValue([lotus, mox]);

            await expect(
                authedCaller().collection.cards({ collectionId })
            ).resolves.toStrictEqual([
                { card: mox, count: 2 },
                { card: lotus, count: 1 },
            ]);
        });

        test("asks for a stable order: oldest first, then by card id", async () => {
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([]);

            await authedCaller().collection.cards({ collectionId });

            expect(prismaMock.cardsOnCollections.findMany).toHaveBeenCalledWith({
                where: { collectionId },
                orderBy: [{ createdAt: "asc" }, { cardId: "asc" }],
            });
            expect(prismaMock.card.findMany).not.toHaveBeenCalled();
        });

        test("skips entries whose card no longer exists", async () => {
            const lotus = buildCard({ id: "lotus" });
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([
                buildEntry({ cardId: "gone" }),
                buildEntry({ cardId: "lotus" }),
            ]);
            prismaMock.card.findMany.mockResolvedValue([lotus]);

            await expect(
                authedCaller().collection.cards({ collectionId })
            ).resolves.toStrictEqual([{ card: lotus, count: 1 }]);
        });

        test("throws FORBIDDEN for someone else's collection", async () => {
            await expect(
                authedCaller("notowner").collection.cards({ collectionId })
            ).rejects.toStrictEqual(forbidden);

            expect(prismaMock.cardsOnCollections.findMany).not.toHaveBeenCalled();
        });
    });

    describe("addCard", () => {
        test("adds the card or bumps its count by one", async () => {
            const entry = buildEntry({ cardId: "lotus", count: 2 });
            prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "lotus" }));
            prismaMock.cardsOnCollections.upsert.mockResolvedValue(entry);

            await expect(
                authedCaller().collection.addCard({ collectionId, cardId: "lotus" })
            ).resolves.toStrictEqual(entry);

            expect(prismaMock.cardsOnCollections.upsert).toHaveBeenCalledWith({
                where: { collectionId_cardId: { collectionId, cardId: "lotus" } },
                create: { collectionId, cardId: "lotus", count: 1 },
                update: { count: { increment: 1 } },
            });
        });

        test("throws NOT_FOUND for a card that doesn't exist", async () => {
            prismaMock.card.findUnique.mockResolvedValue(null);

            await expect(
                authedCaller().collection.addCard({ collectionId, cardId: "nope" })
            ).rejects.toStrictEqual(new TRPCError({ code: "NOT_FOUND", message: "Card not found" }));

            expect(prismaMock.cardsOnCollections.upsert).not.toHaveBeenCalled();
        });

        test("throws FORBIDDEN and doesn't write for someone else's collection", async () => {
            await expect(
                authedCaller("notowner").collection.addCard({ collectionId, cardId: "lotus" })
            ).rejects.toStrictEqual(forbidden);

            expect(prismaMock.cardsOnCollections.upsert).not.toHaveBeenCalled();
        });
    });

    describe("removeCard", () => {
        test("takes one copy off when there is more than one", async () => {
            prismaMock.cardsOnCollections.updateMany.mockResolvedValue({ count: 1 });

            await expect(
                authedCaller().collection.removeCard({ collectionId, cardId: "lotus" })
            ).resolves.toStrictEqual({ removed: false });

            expect(prismaMock.cardsOnCollections.updateMany).toHaveBeenCalledWith({
                where: { collectionId, cardId: "lotus", count: { gt: 1 } },
                data: { count: { decrement: 1 } },
            });
            expect(prismaMock.cardsOnCollections.deleteMany).not.toHaveBeenCalled();
        });

        test("removes the card when it's the last copy", async () => {
            prismaMock.cardsOnCollections.updateMany.mockResolvedValue({ count: 0 });
            prismaMock.cardsOnCollections.deleteMany.mockResolvedValue({ count: 1 });

            await expect(
                authedCaller().collection.removeCard({ collectionId, cardId: "lotus" })
            ).resolves.toStrictEqual({ removed: true });

            expect(prismaMock.cardsOnCollections.deleteMany).toHaveBeenCalledWith({
                where: { collectionId, cardId: "lotus" },
            });
        });

        test("removes every copy when all is set", async () => {
            prismaMock.cardsOnCollections.deleteMany.mockResolvedValue({ count: 1 });

            await expect(
                authedCaller().collection.removeCard({ collectionId, cardId: "lotus", all: true })
            ).resolves.toStrictEqual({ removed: true });

            expect(prismaMock.cardsOnCollections.updateMany).not.toHaveBeenCalled();
            expect(prismaMock.cardsOnCollections.deleteMany).toHaveBeenCalledWith({
                where: { collectionId, cardId: "lotus" },
            });
        });

        test("throws FORBIDDEN and doesn't write for someone else's collection", async () => {
            await expect(
                authedCaller("notowner").collection.removeCard({ collectionId, cardId: "lotus" })
            ).rejects.toStrictEqual(forbidden);

            expect(prismaMock.cardsOnCollections.updateMany).not.toHaveBeenCalled();
            expect(prismaMock.cardsOnCollections.deleteMany).not.toHaveBeenCalled();
        });
    });
});
