import prismaMock from "singleton";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { TRPCError } from "@trpc/server";
import { type CardsOnCollections, type Collection } from "@prisma/client";
import { buildCard } from "../../testing/cardFixture";
import { toCardEntries } from "./collection";

describe("collection card procedures", () => {
    const userId = "user123";
    const collectionId = "collection456";
    const dateNow = new Date();
    let collection: Collection;

    const buildEntry = (overrides: Partial<CardsOnCollections> = {}): CardsOnCollections => ({
        collectionId,
        cardId: "card-1",
        finish: "nonfoil",
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
        test("returns cards with finish and count in the order the entries come back", async () => {
            const lotus = buildCard({ id: "lotus", name: "Black Lotus" });
            const mox = buildCard({ id: "mox", name: "Mox Pearl" });
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([
                buildEntry({ cardId: "mox", count: 2 }),
                buildEntry({ cardId: "lotus", count: 1 }),
                buildEntry({ cardId: "mox", finish: "foil", count: 1 }),
            ]);
            // The card lookup comes back in a different order on purpose.
            prismaMock.card.findMany.mockResolvedValue([lotus, mox]);

            await expect(
                authedCaller().collection.cards({ collectionId })
            ).resolves.toStrictEqual([
                { card: mox, finish: "nonfoil", count: 2 },
                { card: lotus, finish: "nonfoil", count: 1 },
                { card: mox, finish: "foil", count: 1 },
            ]);
        });

        test("asks for a stable order: oldest first, then by card id", async () => {
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([]);

            await authedCaller().collection.cards({ collectionId });

            expect(prismaMock.cardsOnCollections.findMany).toHaveBeenCalledWith({
                where: { collectionId },
                orderBy: [{ createdAt: "asc" }, { cardId: "asc" }, { finish: "asc" }],
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
            ).resolves.toStrictEqual([{ card: lotus, finish: "nonfoil", count: 1 }]);
        });

        test("throws FORBIDDEN for someone else's collection", async () => {
            await expect(
                authedCaller("notowner").collection.cards({ collectionId })
            ).rejects.toStrictEqual(forbidden);

            expect(prismaMock.cardsOnCollections.findMany).not.toHaveBeenCalled();
        });
    });

    describe("addCard", () => {
        test("adds the card or bumps its count by one, non-foil by default", async () => {
            const entry = buildEntry({ cardId: "lotus", count: 2 });
            prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "lotus" }));
            prismaMock.cardsOnCollections.upsert.mockResolvedValue(entry);

            await expect(
                authedCaller().collection.addCard({ collectionId, cardId: "lotus" })
            ).resolves.toStrictEqual(entry);

            expect(prismaMock.cardsOnCollections.upsert).toHaveBeenCalledWith({
                where: { collectionId_cardId_finish: { collectionId, cardId: "lotus", finish: "nonfoil" } },
                create: { collectionId, cardId: "lotus", finish: "nonfoil", count: 1 },
                update: { count: { increment: 1 } },
            });
        });

        test("adds the finish that was asked for", async () => {
            prismaMock.card.findUnique.mockResolvedValue(
                buildCard({ id: "lotus", finishes: ["nonfoil", "foil"] })
            );
            prismaMock.cardsOnCollections.upsert.mockResolvedValue(buildEntry({ finish: "foil" }));

            await authedCaller().collection.addCard({ collectionId, cardId: "lotus", finish: "foil" });

            expect(prismaMock.cardsOnCollections.upsert).toHaveBeenCalledWith(expect.objectContaining({
                where: { collectionId_cardId_finish: { collectionId, cardId: "lotus", finish: "foil" } },
                create: { collectionId, cardId: "lotus", finish: "foil", count: 1 },
            }));
        });

        test("defaults to the card's own finish when it has no non-foil printing", async () => {
            prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "promo", finishes: ["foil"] }));
            prismaMock.cardsOnCollections.upsert.mockResolvedValue(buildEntry({ finish: "foil" }));

            await authedCaller().collection.addCard({ collectionId, cardId: "promo" });

            expect(prismaMock.cardsOnCollections.upsert).toHaveBeenCalledWith(expect.objectContaining({
                create: { collectionId, cardId: "promo", finish: "foil", count: 1 },
            }));
        });

        test("throws BAD_REQUEST for a finish the card doesn't come in", async () => {
            prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "lotus", finishes: ["nonfoil"] }));

            await expect(
                authedCaller().collection.addCard({ collectionId, cardId: "lotus", finish: "etched" })
            ).rejects.toStrictEqual(new TRPCError({
                code: "BAD_REQUEST",
                message: "This card doesn't come in that finish",
            }));

            expect(prismaMock.cardsOnCollections.upsert).not.toHaveBeenCalled();
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
                where: { collectionId, cardId: "lotus", finish: "nonfoil", count: { gt: 1 } },
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
                where: { collectionId, cardId: "lotus", finish: "nonfoil" },
            });
        });

        test("removes every copy when all is set", async () => {
            prismaMock.cardsOnCollections.deleteMany.mockResolvedValue({ count: 1 });

            await expect(
                authedCaller().collection.removeCard({ collectionId, cardId: "lotus", all: true })
            ).resolves.toStrictEqual({ removed: true });

            expect(prismaMock.cardsOnCollections.updateMany).not.toHaveBeenCalled();
            expect(prismaMock.cardsOnCollections.deleteMany).toHaveBeenCalledWith({
                where: { collectionId, cardId: "lotus", finish: "nonfoil" },
            });
        });

        test("only touches the finish it's given", async () => {
            prismaMock.cardsOnCollections.deleteMany.mockResolvedValue({ count: 1 });

            await authedCaller().collection.removeCard({ collectionId, cardId: "lotus", finish: "foil", all: true });

            expect(prismaMock.cardsOnCollections.deleteMany).toHaveBeenCalledWith({
                where: { collectionId, cardId: "lotus", finish: "foil" },
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

    describe("setFinish", () => {
        const key = (finish: string) => ({
            collectionId_cardId_finish: { collectionId, cardId: "lotus", finish },
        });

        beforeEach(() => {
            prismaMock.card.findUnique.mockResolvedValue(
                buildCard({ id: "lotus", finishes: ["nonfoil", "foil"] })
            );
            prismaMock.$transaction.mockImplementation((run) => run(prismaMock));
        });

        test("moves every copy to the new finish, keeping the entry's place", async () => {
            const createdAt = new Date("2026-01-01T00:00:00.000Z");
            const source = buildEntry({ cardId: "lotus", count: 3, createdAt });
            const moved = buildEntry({ cardId: "lotus", finish: "foil", count: 3, createdAt });
            prismaMock.cardsOnCollections.findUnique.mockResolvedValue(source);
            prismaMock.cardsOnCollections.delete.mockResolvedValue(source);
            prismaMock.cardsOnCollections.upsert.mockResolvedValue(moved);

            await expect(
                authedCaller().collection.setFinish({ collectionId, cardId: "lotus", from: "nonfoil", to: "foil" })
            ).resolves.toStrictEqual(moved);

            expect(prismaMock.cardsOnCollections.delete).toHaveBeenCalledWith({ where: key("nonfoil") });
            expect(prismaMock.cardsOnCollections.upsert).toHaveBeenCalledWith({
                where: key("foil"),
                create: { collectionId, cardId: "lotus", finish: "foil", count: 3, createdAt },
                update: { count: { increment: 3 } },
            });
        });

        test("throws NOT_FOUND when there's no entry in the old finish", async () => {
            prismaMock.cardsOnCollections.findUnique.mockResolvedValue(null);

            await expect(
                authedCaller().collection.setFinish({ collectionId, cardId: "lotus", from: "nonfoil", to: "foil" })
            ).rejects.toStrictEqual(new TRPCError({
                code: "NOT_FOUND",
                message: "That card isn't in this collection in that finish",
            }));

            expect(prismaMock.cardsOnCollections.delete).not.toHaveBeenCalled();
            expect(prismaMock.cardsOnCollections.upsert).not.toHaveBeenCalled();
        });

        test("throws BAD_REQUEST for a finish the card doesn't come in", async () => {
            await expect(
                authedCaller().collection.setFinish({ collectionId, cardId: "lotus", from: "nonfoil", to: "etched" })
            ).rejects.toStrictEqual(new TRPCError({
                code: "BAD_REQUEST",
                message: "This card doesn't come in that finish",
            }));

            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        test("throws FORBIDDEN and doesn't write for someone else's collection", async () => {
            await expect(
                authedCaller("notowner").collection.setFinish({ collectionId, cardId: "lotus", from: "nonfoil", to: "foil" })
            ).rejects.toStrictEqual(forbidden);

            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });
    });

    describe("values", () => {
        test("totals each collection and counts entries without a price", async () => {
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([
                buildEntry({ collectionId: "a", cardId: "lotus", count: 2 }),
                buildEntry({ collectionId: "a", cardId: "lotus", finish: "foil", count: 1 }),
                buildEntry({ collectionId: "b", cardId: "mox", count: 1 }),
                buildEntry({ collectionId: "b", cardId: "gone", count: 1 }),
            ]);
            prismaMock.card.findMany.mockResolvedValue([
                buildCard({ id: "lotus", prices: { usd: "10.00", usd_foil: null } }),
                buildCard({ id: "mox", prices: null }),
            ]);

            await expect(authedCaller().collection.values()).resolves.toStrictEqual({
                a: { totalCents: 2000, unpriced: 1 },
                b: { totalCents: 0, unpriced: 1 },
            });

            expect(prismaMock.cardsOnCollections.findMany).toHaveBeenCalledWith({
                where: { collection: { userId, deletedAt: null } },
                select: { collectionId: true, cardId: true, finish: true, count: true },
            });
            expect(prismaMock.card.findMany).toHaveBeenCalledWith({
                where: { id: { in: ["lotus", "mox", "gone"] } },
                select: { id: true, prices: true },
            });
        });

        test("skips the card lookup when there are no entries", async () => {
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([]);

            await expect(authedCaller().collection.values()).resolves.toStrictEqual({});
            expect(prismaMock.card.findMany).not.toHaveBeenCalled();
        });
    });
});
