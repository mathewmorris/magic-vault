import prismaMock from "singleton";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { TRPCError } from "@trpc/server";
import { type CardsOnCollections, type Collection } from "@prisma/client";
import { buildCard } from "../../testing/cardFixture";
import { importUpsertSql } from "../../collectionImport";
import { SUPPORTED_FORMATS_MESSAGE } from "~/utils/import";

describe("collection import and export procedures", () => {
    const userId = "user123";
    const collectionId = "collection456";
    const dateNow = new Date();
    let collection: Collection;

    const buildEntry = (overrides: Partial<CardsOnCollections> = {}): CardsOnCollections => ({
        collectionId,
        cardId: "card-1",
        finish: "nonfoil",
        count: 1,
        condition: "NM",
        language: "en",
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
            name: "Burn Binder",
            cards: [],
            userId,
            updatedAt: dateNow,
            createdAt: dateNow,
            deletedAt: null,
        };
        prismaMock.collection.findUnique.mockResolvedValue(collection);
    });

    describe("previewImport", () => {
        test("matches lines to cards and lists the rest with a reason, in line order", async () => {
            const bolt = buildCard({
                id: "bolt-2ed",
                name: "Lightning Bolt",
                set: "2ed",
                set_name: "Unlimited Edition",
                collector_number: "162",
                lang: "en",
                finishes: ["nonfoil"],
                scryfall_uri: "https://scryfall.com/card/2ed/162/lightning-bolt",
                image_uris: { small: "https://cards.scryfall.io/small/bolt.jpg" },
            });
            prismaMock.card.findMany
                .mockResolvedValueOnce([bolt]) // printings
                .mockResolvedValueOnce([]) // names
                .mockResolvedValueOnce([]); // front faces

            const result = await authedCaller().collection.previewImport({
                collectionId,
                text: "Deck\n4 Lightning Bolt (2ED) 162\n0 Opt\n1 Lightning Blot\n",
            });

            expect(result).toStrictEqual({
                format: "text",
                matched: [
                    {
                        lineNumber: 2,
                        raw: "4 Lightning Bolt (2ED) 162",
                        quantity: 4,
                        finish: "nonfoil",
                        condition: "NM",
                        language: "en",
                        matchedBy: "printing",
                        note: null,
                        card: {
                            id: "bolt-2ed",
                            name: "Lightning Bolt",
                            set: "2ed",
                            setName: "Unlimited Edition",
                            collectorNumber: "162",
                            image: "https://cards.scryfall.io/small/bolt.jpg",
                            scryfallUri: "https://scryfall.com/card/2ed/162/lightning-bolt",
                        },
                    },
                ],
                unmatched: [
                    { lineNumber: 3, raw: "0 Opt", reason: "The count has to be at least 1." },
                    { lineNumber: 4, raw: "1 Lightning Blot", reason: 'No card named "Lightning Blot" was found' },
                ],
            });
            expect(prismaMock.cardsOnCollections.upsert).not.toHaveBeenCalled();
            expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
        });

        test("reads a CSV, with its condition and language", async () => {
            prismaMock.card.findMany.mockResolvedValueOnce([
                buildCard({ id: "0df55e3f-14de-46ef-b6b1-616618724d9e", name: "Counterspell", finishes: ["nonfoil", "foil"] }),
            ]);

            const result = await authedCaller().collection.previewImport({
                collectionId,
                text: "Quantity,Name,Finish,Condition,Language,Scryfall ID\n2,Counterspell,Foil,Lightly Played,Japanese,0df55e3f-14de-46ef-b6b1-616618724d9e",
            });

            expect(result.format).toBe("archidekt");
            expect(result.matched).toStrictEqual([
                expect.objectContaining({ quantity: 2, finish: "foil", condition: "LP", language: "ja", matchedBy: "scryfallId" }),
            ]);
        });

        test("throws BAD_REQUEST naming the supported formats for a CSV it can't read", async () => {
            await expect(
                authedCaller().collection.previewImport({ collectionId, text: "Qty,Title\n4,Lightning Bolt", format: "csv" })
            ).rejects.toStrictEqual(new TRPCError({
                code: "BAD_REQUEST",
                message: `Couldn't tell which site this CSV came from from its header row. ${SUPPORTED_FORMATS_MESSAGE}`,
            }));

            expect(prismaMock.card.findMany).not.toHaveBeenCalled();
        });

        test("throws BAD_REQUEST for more rows than one import takes", async () => {
            const text = Array.from({ length: 5001 }, () => "1 Opt").join("\n");

            await expect(
                authedCaller().collection.previewImport({ collectionId, text })
            ).rejects.toStrictEqual(new TRPCError({
                code: "BAD_REQUEST",
                message: "That's 5001 lines; one import can take up to 5000. Split it into smaller imports.",
            }));

            expect(prismaMock.card.findMany).not.toHaveBeenCalled();
        });

        test("rejects text over the size limit", async () => {
            await expect(
                authedCaller().collection.previewImport({ collectionId, text: "x".repeat(1_000_001) })
            ).rejects.toThrow(TRPCError);
        });

        test("throws FORBIDDEN for someone else's collection", async () => {
            await expect(
                authedCaller("notowner").collection.previewImport({ collectionId, text: "4 Lightning Bolt" })
            ).rejects.toStrictEqual(forbidden);

            expect(prismaMock.card.findMany).not.toHaveBeenCalled();
        });
    });

    describe("applyImport", () => {
        const rows = [
            { cardId: "bolt", finish: "nonfoil" as const, condition: "NM" as const, language: "en", quantity: 2 },
            { cardId: "opt", finish: "foil" as const, condition: "LP" as const, language: "ja", quantity: 1 },
            { cardId: "bolt", finish: "nonfoil" as const, condition: "HP" as const, language: "en", quantity: 3 },
        ];

        beforeEach(() => {
            prismaMock.card.findMany.mockResolvedValue([
                buildCard({ id: "bolt", finishes: ["nonfoil"] }),
                buildCard({ id: "opt", finishes: ["nonfoil", "foil"] }),
            ]);
        });

        test("adds the merged rows in one transaction", async () => {
            await expect(
                authedCaller().collection.applyImport({ collectionId, rows })
            ).resolves.toStrictEqual({ entries: 2, cards: 6 });

            expect(prismaMock.card.findMany).toHaveBeenCalledWith({
                where: { id: { in: ["bolt", "opt"] } },
                select: { id: true, finishes: true },
            });
            expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
            expect(prismaMock.$executeRaw).toHaveBeenCalledWith(importUpsertSql(collectionId, [
                { cardId: "bolt", finish: "nonfoil", condition: "NM", language: "en", quantity: 5 },
                { cardId: "opt", finish: "foil", condition: "LP", language: "ja", quantity: 1 },
            ]));
            expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
            expect(prismaMock.$transaction.mock.calls[0]?.[0]).toHaveLength(1);
            expect(prismaMock.cardsOnCollections.deleteMany).not.toHaveBeenCalled();
        });

        test("empties the collection first when replacing it", async () => {
            await authedCaller().collection.applyImport({ collectionId, rows, replace: true });

            expect(prismaMock.cardsOnCollections.deleteMany).toHaveBeenCalledWith({ where: { collectionId } });
            expect(prismaMock.$transaction.mock.calls[0]?.[0]).toHaveLength(2);
        });

        test("throws BAD_REQUEST for a finish the card doesn't come in, and writes nothing", async () => {
            await expect(
                authedCaller().collection.applyImport({
                    collectionId,
                    rows: [{ cardId: "bolt", finish: "foil", condition: "NM", language: "en", quantity: 1 }],
                })
            ).rejects.toStrictEqual(new TRPCError({
                code: "BAD_REQUEST",
                message: "This card doesn't come in that finish",
            }));

            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        test("throws NOT_FOUND when a card is gone, and writes nothing", async () => {
            await expect(
                authedCaller().collection.applyImport({
                    collectionId,
                    rows: [...rows, { cardId: "gone", finish: "nonfoil", condition: "NM", language: "en", quantity: 1 }],
                })
            ).rejects.toStrictEqual(new TRPCError({
                code: "NOT_FOUND",
                message: "A card in this import wasn't found. Preview the import again.",
            }));

            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        test("rejects conditions and counts it doesn't know", async () => {
            await expect(
                authedCaller().collection.applyImport({
                    collectionId,
                    rows: [{ cardId: "bolt", finish: "nonfoil", condition: "Mint" as "NM", language: "en", quantity: 1 }],
                })
            ).rejects.toThrow(TRPCError);
            await expect(
                authedCaller().collection.applyImport({
                    collectionId,
                    rows: [{ cardId: "bolt", finish: "nonfoil", condition: "NM", language: "en", quantity: 0 }],
                })
            ).rejects.toThrow(TRPCError);

            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });

        test("throws FORBIDDEN and doesn't write for someone else's collection", async () => {
            await expect(
                authedCaller("notowner").collection.applyImport({ collectionId, rows })
            ).rejects.toStrictEqual(forbidden);

            expect(prismaMock.$transaction).not.toHaveBeenCalled();
        });
    });

    describe("exportCsv", () => {
        beforeEach(() => {
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([
                buildEntry({ cardId: "bolt", count: 4 }),
                buildEntry({ cardId: "gone" }),
                buildEntry({ cardId: "borb", finish: "foil", condition: "LP", language: "ja" }),
            ]);
            prismaMock.card.findMany.mockResolvedValue([
                buildCard({ id: "borb", name: "Borborygmos, Enraged", set: "dis", collector_number: "99" }),
                buildCard({ id: "bolt", name: "Lightning Bolt", set: "2ed", collector_number: "162" }),
            ]);
        });

        test("writes a Moxfield-style CSV in entry order, skipping missing cards", async () => {
            await expect(authedCaller().collection.exportCsv({ collectionId })).resolves.toStrictEqual({
                format: "csv",
                filename: "burn-binder.csv",
                text:
                    "Count,Name,Edition,Collector Number,Foil,Condition,Language,Scryfall ID\r\n" +
                    "4,Lightning Bolt,2ed,162,,Near Mint,English,bolt\r\n" +
                    '1,"Borborygmos, Enraged",dis,99,foil,Lightly Played,Japanese,borb\r\n',
            });

            expect(prismaMock.cardsOnCollections.findMany).toHaveBeenCalledWith({
                where: { collectionId },
                orderBy: [{ createdAt: "asc" }, { cardId: "asc" }, { finish: "asc" }],
            });
            expect(prismaMock.card.findMany).toHaveBeenCalledWith({
                where: { id: { in: ["bolt", "gone", "borb"] } },
                select: { id: true, name: true, set: true, collector_number: true },
            });
        });

        test("writes a text list", async () => {
            await expect(authedCaller().collection.exportCsv({ collectionId, format: "text" })).resolves.toStrictEqual({
                format: "text",
                filename: "burn-binder.txt",
                text: "4 Lightning Bolt (2ED) 162\n1 Borborygmos, Enraged (DIS) 99 *F*\n",
            });
        });

        test("writes just the header for an empty collection", async () => {
            prismaMock.cardsOnCollections.findMany.mockResolvedValue([]);

            const { text } = await authedCaller().collection.exportCsv({ collectionId });

            expect(text).toBe("Count,Name,Edition,Collector Number,Foil,Condition,Language,Scryfall ID\r\n");
            expect(prismaMock.card.findMany).not.toHaveBeenCalled();
        });

        test("throws FORBIDDEN for someone else's collection", async () => {
            await expect(
                authedCaller("notowner").collection.exportCsv({ collectionId })
            ).rejects.toStrictEqual(forbidden);
        });
    });
});
