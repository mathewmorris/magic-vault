import prismaMock from "singleton";
import { TRPCError } from "@trpc/server";
import { type PrismaClient } from "@prisma/client";

import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { scanCardSelect } from "./scan";
import { buildCard } from "../../testing/cardFixture";
import { EMBED_MODEL } from "../../../utils/recognition/model";

const FLAG = "NEXT_PUBLIC_FEATURE_AI_SCAN";

const caller = () =>
  appRouter.createCaller({ ...createInnerTRPCContext({ session: null }), prisma: prismaMock });

const embedding = () => {
  const v = new Array<number>(EMBED_MODEL.dims).fill(0);
  v[0] = 1;
  return v;
};

const scanCard = (id: string, name = id) => {
  const card = buildCard({ id, name, set: "m21", set_name: "Core Set 2021", collector_number: "1" });
  return {
    id: card.id,
    name: card.name,
    set: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    lang: card.lang,
    rarity: card.rarity,
    layout: card.layout,
    image_uris: card.image_uris,
    card_faces: card.card_faces,
  };
};

/** Answers raw SQL by looking at what the statement is for. */
function answerRawQueries(opts: { nearest?: unknown[]; printing?: unknown[] }) {
  prismaMock.$queryRawUnsafe.mockImplementation(((sql: string) => {
    if (sql.includes('FROM "CardEmbedding"')) return Promise.resolve(opts.nearest ?? []);
    if (sql.includes('FROM "Card"')) return Promise.resolve(opts.printing ?? []);
    return Promise.reject(new Error(`unexpected SQL: ${sql}`));
  }) as unknown as PrismaClient["$queryRawUnsafe"]);
}

describe("scan procedures", () => {
  const original = process.env[FLAG];

  beforeEach(() => {
    process.env[FLAG] = "true";
  });

  afterAll(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  });

  describe("status", () => {
    test("reports the model and how many faces are indexed for it", async () => {
      prismaMock.cardEmbedding.count.mockResolvedValue(1234);

      await expect(caller().scan.status()).resolves.toEqual({
        enabled: true,
        modelId: EMBED_MODEL.id,
        indexed: 1234,
      });
      expect(prismaMock.cardEmbedding.count).toHaveBeenCalledWith({
        where: { modelId: EMBED_MODEL.id },
      });
    });

    test("does not touch the database when the flag is off", async () => {
      process.env[FLAG] = "false";

      await expect(caller().scan.status()).resolves.toEqual({
        enabled: false,
        modelId: EMBED_MODEL.id,
        indexed: 0,
      });
      expect(prismaMock.cardEmbedding.count).not.toHaveBeenCalled();
    });
  });

  describe("match", () => {
    test("returns NOT_FOUND when the flag is off", async () => {
      delete process.env[FLAG];

      await expect(
        caller().scan.match({ embedding: embedding(), modelId: EMBED_MODEL.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND", message: "AI scan is turned off" });
      expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    test("returns BAD_REQUEST for another model id", async () => {
      const error = await caller()
        .scan.match({ embedding: embedding(), modelId: "some-old-model" })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(TRPCError);
      expect(error).toMatchObject({ code: "BAD_REQUEST" });
      expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    test.each([
      ["too short", { embedding: [1, 2, 3] }],
      ["non-finite", { embedding: embedding().map((v, i) => (i === 3 ? Infinity : v)) }],
      ["limit too big", { embedding: embedding(), limit: 51 }],
      ["limit zero", { embedding: embedding(), limit: 0 }],
      ["empty set code", { embedding: embedding(), printing: { set: " ", collectorNumber: "1" } }],
    ])("rejects bad input: %s", async (_label, input) => {
      await expect(
        caller().scan.match({ modelId: EMBED_MODEL.id, ...input }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    test("loads cards in one query, keeps similarity order and skips missing cards", async () => {
      answerRawQueries({
        nearest: [
          { cardId: "b", face: 1, similarity: 0.93 },
          { cardId: "gone", face: 0, similarity: 0.9 },
          { cardId: "a", face: 0, similarity: 0.71 },
        ],
      });
      // findMany order is arbitrary; the router must not depend on it.
      prismaMock.card.findMany.mockResolvedValue([scanCard("a"), scanCard("b")] as never);

      const result = await caller().scan.match({ embedding: embedding(), modelId: EMBED_MODEL.id });

      expect(result).toEqual({
        matches: [
          { card: scanCard("b"), face: 1, similarity: 0.93 },
          { card: scanCard("a"), face: 0, similarity: 0.71 },
        ],
        printing: null,
      });
      expect(prismaMock.card.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.card.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["b", "gone", "a"] } },
        select: scanCardSelect,
      });
      // Default limit 20 needs no ef_search change, so no transaction.
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      const [sql, vector, modelId] = prismaMock.$queryRawUnsafe.mock.calls[0]! as unknown[];
      expect(sql).toContain("LIMIT 20");
      expect(vector).toMatch(/^\[1,0,0/);
      expect(modelId).toBe(EMBED_MODEL.id);
    });

    test("looks up the exact printing and loads it with the matches", async () => {
      answerRawQueries({
        nearest: [{ cardId: "a", face: 0, similarity: 0.8 }],
        printing: [{ id: "p" }],
      });
      prismaMock.card.findMany.mockResolvedValue([scanCard("p"), scanCard("a")] as never);

      const result = await caller().scan.match({
        embedding: embedding(),
        modelId: EMBED_MODEL.id,
        printing: { set: "M21", collectorNumber: "007" },
      });

      expect(result.printing).toEqual(scanCard("p"));
      expect(result.matches.map((m) => m.card.id)).toEqual(["a"]);
      expect(prismaMock.card.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ["a", "p"] } } }),
      );
      const printingCall = prismaMock.$queryRawUnsafe.mock.calls.find(([sql]) =>
        String(sql).includes('FROM "Card"'),
      );
      expect(printingCall?.slice(1)).toEqual(["m21", "7", null]);
    });

    test("returns printing null when OCR's printing isn't in the database", async () => {
      answerRawQueries({ nearest: [], printing: [] });

      const result = await caller().scan.match({
        embedding: embedding(),
        modelId: EMBED_MODEL.id,
        printing: { set: "zzz", collectorNumber: "1" },
      });

      expect(result).toEqual({ matches: [], printing: null });
      expect(prismaMock.card.findMany).not.toHaveBeenCalled();
    });

    describe("alternates", () => {
      /** A unit vector along axis `i`, so each variant's SQL call can be told apart. */
      const axis = (i: number) => {
        const v = new Array<number>(EMBED_MODEL.dims).fill(0);
        v[i] = 1;
        return v;
      };

      /** Answers the nearest-neighbour query per variant, keyed by the vector's first value. */
      function answerPerVariant(byAxis: Record<number, unknown[]>, printing: unknown[] = []) {
        prismaMock.$queryRawUnsafe.mockImplementation(((sql: string, vector?: string) => {
          if (sql.includes('FROM "CardEmbedding"')) {
            const values = (vector ?? "").replace(/[[\]]/g, "").split(",").map(Number);
            return Promise.resolve(byAxis[values.indexOf(1)] ?? []);
          }
          if (sql.includes('FROM "Card"')) return Promise.resolve(printing);
          return Promise.reject(new Error(`unexpected SQL: ${sql}`));
        }) as unknown as PrismaClient["$queryRawUnsafe"]);
      }

      test("searches every embedding and returns the matches of the best one, with its index", async () => {
        answerPerVariant({
          0: [{ cardId: "a", face: 0, similarity: 0.41 }],
          1: [
            { cardId: "b", face: 0, similarity: 0.88 },
            { cardId: "c", face: 0, similarity: 0.5 },
          ],
          2: [{ cardId: "d", face: 0, similarity: 0.6 }],
        });
        prismaMock.card.findMany.mockResolvedValue([scanCard("b"), scanCard("c")] as never);

        const result = await caller().scan.match({
          embedding: axis(0),
          alternates: [axis(1), axis(2)],
          modelId: EMBED_MODEL.id,
        });

        expect(result).toEqual({
          matches: [
            { card: scanCard("b"), face: 0, similarity: 0.88 },
            { card: scanCard("c"), face: 0, similarity: 0.5 },
          ],
          printing: null,
          variant: 1,
          variantSimilarities: [0.41, 0.88, 0.6],
        });
        const searches = prismaMock.$queryRawUnsafe.mock.calls.filter(([sql]) =>
          String(sql).includes('FROM "CardEmbedding"'),
        );
        expect(searches).toHaveLength(3);
        // Only the winning variant's cards are loaded.
        expect(prismaMock.card.findMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.card.findMany).toHaveBeenCalledWith({
          where: { id: { in: ["b", "c"] } },
          select: scanCardSelect,
        });
      });

      test("keeps the main embedding on a tie or when the alternates find nothing", async () => {
        answerPerVariant({
          0: [{ cardId: "a", face: 0, similarity: 0.7 }],
          1: [{ cardId: "b", face: 0, similarity: 0.7 }],
          2: [],
        });
        prismaMock.card.findMany.mockResolvedValue([scanCard("a")] as never);

        const result = await caller().scan.match({
          embedding: axis(0),
          alternates: [axis(1), axis(2)],
          modelId: EMBED_MODEL.id,
        });

        expect(result.variant).toBe(0);
        expect(result.variantSimilarities).toEqual([0.7, 0.7, null]);
        expect(result.matches.map((m) => m.card.id)).toEqual(["a"]);
      });

      test("still looks up the printing once, alongside the winner's cards", async () => {
        answerPerVariant({ 0: [], 1: [{ cardId: "a", face: 0, similarity: 0.8 }] }, [{ id: "p" }]);
        prismaMock.card.findMany.mockResolvedValue([scanCard("a"), scanCard("p")] as never);

        const result = await caller().scan.match({
          embedding: axis(0),
          alternates: [axis(1)],
          modelId: EMBED_MODEL.id,
          printing: { set: "M21", collectorNumber: "7" },
        });

        expect(result.variant).toBe(1);
        expect(result.printing).toEqual(scanCard("p"));
        const printingCalls = prismaMock.$queryRawUnsafe.mock.calls.filter(([sql]) =>
          String(sql).includes('FROM "Card"'),
        );
        expect(printingCalls).toHaveLength(1);
      });

      test("an empty alternates list still reports variant 0", async () => {
        answerPerVariant({ 0: [{ cardId: "a", face: 0, similarity: 0.6 }] });
        prismaMock.card.findMany.mockResolvedValue([scanCard("a")] as never);

        const result = await caller().scan.match({ embedding: axis(0), alternates: [], modelId: EMBED_MODEL.id });

        expect(result).toMatchObject({ variant: 0, variantSimilarities: [0.6] });
      });

      test.each([
        ["more than 3", { alternates: [axis(1), axis(2), axis(3), axis(4)] }],
        ["wrong size", { alternates: [[1, 0, 0]] }],
        ["non-finite", { alternates: [axis(1).map((v, i) => (i === 5 ? NaN : v))] }],
      ])("rejects bad alternates: %s", async (_label, input) => {
        await expect(
          caller().scan.match({ embedding: axis(0), modelId: EMBED_MODEL.id, ...input }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
      });
    });

    test("raises ef_search in a transaction for big limits", async () => {
      answerRawQueries({ nearest: [{ cardId: "a", face: 0, similarity: 0.5 }] });
      prismaMock.$executeRawUnsafe.mockResolvedValue(0);
      prismaMock.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) =>
        fn(prismaMock)) as unknown as PrismaClient["$transaction"]);
      prismaMock.card.findMany.mockResolvedValue([scanCard("a")] as never);

      const result = await caller().scan.match({
        embedding: embedding(),
        modelId: EMBED_MODEL.id,
        limit: 50,
      });

      expect(result.matches).toHaveLength(1);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL hnsw.ef_search = 100");
    });
  });
});
