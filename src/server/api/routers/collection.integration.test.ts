import { TRPCError } from "@trpc/server";
import { sub } from "date-fns/sub";

import {
  callerFor,
  createCollection,
  createUser,
  prisma,
} from "~/test/integration/helpers";

// These run the real collection router against a real Postgres database (no
// Prisma mocks), so they prove the queries return the right rows, not just
// that we called Prisma with the arguments we expected.
describe("collection router (integration)", () => {
  describe("getAll", () => {
    test("returns only the caller's collections that aren't soft-deleted", async () => {
      const me = await createUser();
      const someoneElse = await createUser();
      const active = await createCollection(me.id, { name: "Active" });
      await createCollection(me.id, { name: "Deleted", deletedAt: new Date() });
      await createCollection(someoneElse.id, { name: "Not mine" });

      const result = await callerFor(me.id).collection.getAll();

      expect(result.map((c) => c.id)).toStrictEqual([active.id]);
    });
  });

  describe("getDeletedCollections", () => {
    test("returns only the caller's soft-deleted collections", async () => {
      const me = await createUser();
      const someoneElse = await createUser();
      await createCollection(me.id, { name: "Active" });
      const deleted = await createCollection(me.id, { deletedAt: new Date() });
      await createCollection(someoneElse.id, { deletedAt: new Date() });

      const result = await callerFor(me.id).collection.getDeletedCollections();

      expect(result.map((c) => c.id)).toStrictEqual([deleted.id]);
    });
  });

  describe("byId", () => {
    test("returns the collection to its owner", async () => {
      const me = await createUser();
      const collection = await createCollection(me.id);

      await expect(
        callerFor(me.id).collection.byId({ id: collection.id }),
      ).resolves.toMatchObject({ id: collection.id, userId: me.id });
    });

    test("throws NOT_FOUND for a collection owned by someone else", async () => {
      const owner = await createUser();
      const intruder = await createUser();
      const collection = await createCollection(owner.id);

      await expect(
        callerFor(intruder.id).collection.byId({ id: collection.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("throws NOT_FOUND for an id that doesn't exist", async () => {
      const me = await createUser();

      await expect(
        callerFor(me.id).collection.byId({ id: "does-not-exist" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("prices", () => {
    // Prices live in CardPrice, not on the Card row.
    const addPricedCards = async (collectionId: string) => {
      await prisma.card.createMany({
        data: ["lotus", "mox"].map((id) => ({
          id,
          name: id,
          scryfall_uri: `https://scryfall.com/card/${id}`,
          image_status: "highres_scan",
          layout: "normal",
          // The old column is ignored now.
          prices: { usd: "999.00" },
        })),
      });
      await prisma.cardPrice.create({ data: { cardId: "lotus", prices: { usd: "10.00", usd_foil: "25.00" } } });
      await prisma.cardsOnCollections.createMany({
        data: [
          { collectionId, cardId: "lotus", count: 2 },
          { collectionId, cardId: "lotus", finish: "foil", count: 1 },
          { collectionId, cardId: "mox", count: 1 },
        ],
      });
    };

    test("cards and values read prices from CardPrice", async () => {
      const me = await createUser();
      const collection = await createCollection(me.id);
      await addPricedCards(collection.id);
      const caller = callerFor(me.id);

      const cards = await caller.collection.cards({ collectionId: collection.id });
      const pricesById = Object.fromEntries(cards.map(({ card }) => [card.id, card.prices]));
      expect(pricesById).toStrictEqual({ lotus: { usd: "10.00", usd_foil: "25.00" }, mox: null });

      await expect(caller.collection.values()).resolves.toStrictEqual({
        [collection.id]: { totalCents: 4500, unpriced: 1 },
      });
    });

    test("a card's price goes with the card", async () => {
      const me = await createUser();
      const collection = await createCollection(me.id);
      await addPricedCards(collection.id);
      await prisma.cardsOnCollections.deleteMany({ where: { cardId: "lotus" } });

      await prisma.card.delete({ where: { id: "lotus" } });

      await expect(prisma.cardPrice.count()).resolves.toBe(0);
    });
  });

  describe("create", () => {
    test("saves a collection that belongs to the caller", async () => {
      const me = await createUser();

      const created = await callerFor(me.id).collection.create({
        name: "New",
        cards: ["card-1", "card-2"],
      });

      const row = await prisma.collection.findUniqueOrThrow({ where: { id: created.id } });
      expect(row).toMatchObject({
        name: "New",
        cards: ["card-1", "card-2"],
        userId: me.id,
        deletedAt: null,
      });
    });
  });

  describe("update", () => {
    test("lets the owner change name and cards", async () => {
      const me = await createUser();
      const collection = await createCollection(me.id, { name: "Old", cards: [] });

      await callerFor(me.id).collection.update({
        id: collection.id,
        name: "Renamed",
        cards: ["card-1"],
      });

      const row = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
      expect(row).toMatchObject({ name: "Renamed", cards: ["card-1"] });
    });

    test("rejects a non-owner with FORBIDDEN and leaves the row alone", async () => {
      const owner = await createUser();
      const intruder = await createUser();
      const collection = await createCollection(owner.id, { name: "Mine", cards: ["card-1"] });

      const attempt = callerFor(intruder.id).collection.update({
        id: collection.id,
        name: "Hijacked",
        cards: [],
      });

      await expect(attempt).rejects.toBeInstanceOf(TRPCError);
      await expect(attempt).rejects.toMatchObject({ code: "FORBIDDEN" });
      const row = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
      expect(row).toMatchObject({ name: "Mine", cards: ["card-1"], userId: owner.id });
    });
  });

  describe("softDelete", () => {
    test("sets deletedAt and moves the collection from getAll to getDeletedCollections", async () => {
      const me = await createUser();
      const collection = await createCollection(me.id);
      const caller = callerFor(me.id);

      const result = await caller.collection.softDelete({ collectionId: collection.id });

      expect(result.deletedAt).toBeInstanceOf(Date);
      const row = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(await caller.collection.getAll()).toHaveLength(0);
      expect((await caller.collection.getDeletedCollections()).map((c) => c.id)).toStrictEqual([
        collection.id,
      ]);
    });

    test("rejects a non-owner with FORBIDDEN and doesn't delete anything", async () => {
      const owner = await createUser();
      const intruder = await createUser();
      const collection = await createCollection(owner.id);

      await expect(
        callerFor(intruder.id).collection.softDelete({ collectionId: collection.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const row = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
      expect(row.deletedAt).toBeNull();
    });
  });

  describe("recover", () => {
    test("clears deletedAt so the collection shows up in getAll again", async () => {
      const me = await createUser();
      const collection = await createCollection(me.id, { deletedAt: new Date() });
      const caller = callerFor(me.id);

      const result = await caller.collection.recover({ collectionId: collection.id });

      expect(result.deletedAt).toBeNull();
      expect((await caller.collection.getAll()).map((c) => c.id)).toStrictEqual([collection.id]);
      expect(await caller.collection.getDeletedCollections()).toHaveLength(0);
    });

    test("rejects a non-owner with FORBIDDEN and leaves it deleted", async () => {
      const owner = await createUser();
      const intruder = await createUser();
      const collection = await createCollection(owner.id, { deletedAt: new Date() });

      await expect(
        callerFor(intruder.id).collection.recover({ collectionId: collection.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const row = await prisma.collection.findUniqueOrThrow({ where: { id: collection.id } });
      expect(row.deletedAt).not.toBeNull();
    });
  });

  describe("destroy", () => {
    test("hard-deletes the owner's collection", async () => {
      const me = await createUser();
      const collection = await createCollection(me.id);

      await callerFor(me.id).collection.destroy({ collectionId: collection.id });

      expect(await prisma.collection.findUnique({ where: { id: collection.id } })).toBeNull();
    });

    test("rejects a non-owner with FORBIDDEN and keeps the row", async () => {
      const owner = await createUser();
      const intruder = await createUser();
      const collection = await createCollection(owner.id);

      await expect(
        callerFor(intruder.id).collection.destroy({ collectionId: collection.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(await prisma.collection.findUnique({ where: { id: collection.id } })).not.toBeNull();
    });
  });

  describe("destroy30DaysOld", () => {
    test("removes only collections soft-deleted more than 30 days ago", async () => {
      const me = await createUser();
      const old = await createCollection(me.id, { deletedAt: sub(new Date(), { days: 31 }) });
      const recent = await createCollection(me.id, { deletedAt: sub(new Date(), { days: 29 }) });
      const active = await createCollection(me.id);

      const result = await callerFor("CRON_JOB").collection.destroy30DaysOld();

      expect(result).toStrictEqual({ count: 1 });
      const remaining = await prisma.collection.findMany({ select: { id: true } });
      expect(remaining.map((c) => c.id).sort()).toStrictEqual([recent.id, active.id].sort());
      expect(await prisma.collection.findUnique({ where: { id: old.id } })).toBeNull();
    });
  });
});
