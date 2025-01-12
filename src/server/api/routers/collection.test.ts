import prismaMock from "singleton";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { TRPCError } from "@trpc/server";
import { type Collection } from "@prisma/client";
import { sub } from "date-fns/sub";

describe("collection procedures", () => {
    const userId = "user123";
    const collectionId = "collection456";
    let activeCollection: Collection;
    let deletedCollection: Collection;
    const dateNow = new Date();

    beforeEach(() => {
        jest.clearAllMocks();
        activeCollection = {
            id: collectionId,
            name: "Collection",
            cards: [],
            userId,
            updatedAt: dateNow,
            createdAt: dateNow,
            deletedAt: null,
        }
        deletedCollection = {
            ...activeCollection,
            deletedAt: dateNow,
        }
    });

    describe("getAll", function() {
        test("should not return soft-deleted collections", async () => {
            const session = {
                user: { id: userId, name: "John Doe" },
                expires: "1",
            }

            const ctx = createInnerTRPCContext({ session });
            const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

            // The passing result is forced by my mock. Maybe an integration or e2e test would be better?
            // Essentially, I need to create a few collections, soft delete some of those, then 
            // check results of this query. This might test prisma too much though. Will need
            // to think about it more.
            prismaMock.collection.findMany.mockResolvedValue([activeCollection]);

            return expect(
                caller.collection.getAll()
            ).resolves.toStrictEqual([activeCollection]);
        });
    });

    describe("softDelete", function() {
        test("should set `deletedAt` to date", async () => {
            const session = {
                user: { id: userId, name: "John Doe" },
                expires: "1",
            }

            const ctx = createInnerTRPCContext({ session });
            const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

            prismaMock.collection.findUnique.mockResolvedValue(activeCollection);
            prismaMock.collection.update.mockResolvedValue(deletedCollection);

            return expect(
                caller.collection.softDelete({ collectionId })
            ).resolves.toStrictEqual(deletedCollection);
        });

        test("should throw error when collection not owned", async () => {
            const session = {
                user: { id: "notowner", name: "John Doe" },
                expires: "1",
            }

            const ctx = createInnerTRPCContext({ session });
            const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

            prismaMock.collection.findUnique.mockResolvedValue(activeCollection);

            return expect(
                caller.collection.softDelete({ collectionId })
            ).rejects.toStrictEqual(new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to access this collection" }));
        });

    })
    describe('recoverCollection', function() {
        test("should throw error when collection not owned", async function() {
            const session = {
                user: { id: "notowner", name: "John Doe" },
                expires: "1",
            }

            const ctx = createInnerTRPCContext({ session });
            const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

            prismaMock.collection.findUnique.mockResolvedValueOnce(deletedCollection);

            return expect(
                caller.collection.recover({ collectionId })
            ).rejects.toStrictEqual(new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to access this collection" }));
        });

        test("should remove date from deletedAt field of owned collection", async function() {
            const session = {
                user: { id: userId, name: "John Doe" },
                expires: "1",
            }

            const ctx = createInnerTRPCContext({ session });
            const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

            prismaMock.collection.findUnique.mockResolvedValueOnce(deletedCollection);
            prismaMock.collection.update.mockResolvedValueOnce(activeCollection);

            return expect(
                caller.collection.recover({ collectionId })
            ).resolves.toStrictEqual(activeCollection);
        });
    });

    describe("destroy30DaysOld", function() {
        const fortyDaysAgo = sub(dateNow, { days: 40 });
        const collectionIds = ["1", "2", "3", "4", "5", "6"];
        let deletedCollections: Collection[];

        beforeEach(() => {
            deletedCollections = collectionIds.map(id => ({
                ...deletedCollection,
                id,
                deletedAt: fortyDaysAgo,
            }));
        })

        test("should delete list of collections given", async function() {
            const session = {
                user: { id: 'CRON_JOB' },
                expires: "1",
            };

            const ctx = createInnerTRPCContext({ session });
            const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

            prismaMock.collection.findMany.mockResolvedValueOnce(deletedCollections);
            prismaMock.collection.deleteMany.mockResolvedValueOnce({ count: deletedCollections.length });

            return expect(
                caller.collection.destroy30DaysOld()
            ).resolves.toStrictEqual({ count: deletedCollections.length });
        });

        test("should throw error when not admin or authorized bot", async function() {
            const session = {
                user: { id: userId, name: "John Doe" },
                expires: "1",
            }

            const ctx = createInnerTRPCContext({ session });
            const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

            prismaMock.collection.findMany.mockResolvedValueOnce(deletedCollections);
            prismaMock.collection.deleteMany.mockResolvedValueOnce({ count: deletedCollections.length });

            return expect(
                caller.collection.destroy30DaysOld()
            ).rejects.toStrictEqual(
                new TRPCError({
                    code: "UNAUTHORIZED"
                })
            );
        });
    });
});

