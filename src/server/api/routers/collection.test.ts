import prismaMock from "singleton";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { TRPCError } from "@trpc/server";

describe("collection api", () => {
    const userId = "user123";
    const collectionId = "collection456";

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("getAll procedure should not return soft-deleted collections", async () => {
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
        prismaMock.collection.findMany.mockResolvedValue([collection]);

        return expect(
            caller.collection.getAll()
        ).resolves.toStrictEqual([collection]);
    });

    test("softDelete should set `deletedAt` to date", async () => {
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
        const session = {
            user: { id: userId, name: "John Doe" },
            expires: "1",
        }

        const ctx = createInnerTRPCContext({ session });
        const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

        prismaMock.collection.findUnique.mockResolvedValue(collection);
        prismaMock.collection.update.mockResolvedValue({ ...collection, deletedAt: dateNow });

        return expect(
            caller.collection.softDelete({ collectionId })
        ).resolves.toStrictEqual({ ...collection, deletedAt: dateNow });
    });

    test("softDelete should throw error when collection not owned", async () => {
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
        const session = {
            user: { id: "notowner", name: "John Doe" },
            expires: "1",
        }

        const ctx = createInnerTRPCContext({ session });
        const caller = appRouter.createCaller({ ...ctx, prisma: prismaMock });

        prismaMock.collection.findUnique.mockResolvedValue(collection);
        prismaMock.collection.update.mockResolvedValue({ ...collection, deletedAt: dateNow });

        return expect(
            caller.collection.softDelete({ collectionId })
        ).rejects.toStrictEqual(new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to access this collection" }));
    });
});

