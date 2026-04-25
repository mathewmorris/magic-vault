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

        test("scopes the query to the authenticated user's id with deletedAt null", async () => {
            prismaMock.collection.findMany.mockResolvedValue([activeCollection]);

            await authedCaller().collection.getAll();

            expect(prismaMock.collection.findMany).toHaveBeenCalledWith({
                where: { userId, deletedAt: null },
            });
        });

        test("rejects unauthenticated callers", async () => {
            await expect(unauthedCaller().collection.getAll()).rejects.toStrictEqual(
                new TRPCError({ code: "UNAUTHORIZED" })
            );
        });
    });

    describe("getDeletedCollections", function() {
        test("returns only soft-deleted collections for the user", async () => {
            prismaMock.collection.findMany.mockResolvedValue([deletedCollection]);

            await expect(
                authedCaller().collection.getDeletedCollections()
            ).resolves.toStrictEqual([deletedCollection]);

            expect(prismaMock.collection.findMany).toHaveBeenCalledWith({
                where: { userId, deletedAt: { not: null } },
            });
        });
    });

    describe("byId", function() {
        test("looks up the collection by id", async () => {
            prismaMock.collection.findUnique.mockResolvedValue(activeCollection);

            await expect(
                authedCaller().collection.byId({ id: collectionId })
            ).resolves.toStrictEqual(activeCollection);

            expect(prismaMock.collection.findUnique).toHaveBeenCalledWith({
                where: { id: collectionId },
            });
        });
    });

    describe("create", function() {
        test("creates a collection connected to the current user", async () => {
            prismaMock.collection.create.mockResolvedValue(activeCollection);

            await expect(
                authedCaller().collection.create({ name: "Collection", cards: ["c1", "c2"] })
            ).resolves.toStrictEqual(activeCollection);

            expect(prismaMock.collection.create).toHaveBeenCalledWith({
                data: {
                    name: "Collection",
                    cards: ["c1", "c2"],
                    user: { connect: { id: userId } },
                },
            });
        });
    });

    describe("update", function() {
        test("updates name and cards on the collection", async () => {
            const renamed = { ...activeCollection, name: "Renamed", cards: ["x"] };
            prismaMock.collection.update.mockResolvedValue(renamed);

            await expect(
                authedCaller().collection.update({ id: collectionId, name: "Renamed", cards: ["x"] })
            ).resolves.toStrictEqual(renamed);

            expect(prismaMock.collection.update).toHaveBeenCalledWith({
                where: { id: collectionId },
                data: { name: "Renamed", cards: ["x"] },
            });
        });
    });

    describe("destroy", function() {
        test("hard-deletes when caller owns the collection", async () => {
            prismaMock.collection.findUnique.mockResolvedValue(activeCollection);
            prismaMock.collection.delete.mockResolvedValue(activeCollection);

            await expect(
                authedCaller().collection.destroy({ collectionId })
            ).resolves.toStrictEqual(activeCollection);

            expect(prismaMock.collection.delete).toHaveBeenCalledWith({
                where: { id: collectionId },
            });
        });

        test("throws FORBIDDEN when caller does not own the collection", async () => {
            prismaMock.collection.findUnique.mockResolvedValue(activeCollection);

            await expect(
                authedCaller("notowner").collection.destroy({ collectionId })
            ).rejects.toStrictEqual(
                new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to access this collection" })
            );

            expect(prismaMock.collection.delete).not.toHaveBeenCalled();
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

