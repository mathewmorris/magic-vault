import prismaMock from "singleton";
import { type Card } from "@prisma/client";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";

describe("card procedures", () => {
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

  const callerWithoutSession = () => {
    const ctx = createInnerTRPCContext({ session: null });
    return appRouter.createCaller({ ...ctx, prisma: prismaMock });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("findMany", () => {
    test("returns cards matching the requested ids", async () => {
      const cards = [buildCard({ id: "a" }), buildCard({ id: "b", name: "Mox Pearl" })];
      prismaMock.card.findMany.mockResolvedValue(cards);

      const caller = callerWithoutSession();

      await expect(
        caller.card.findMany({ cardIds: ["a", "b"] })
      ).resolves.toStrictEqual(cards);

      expect(prismaMock.card.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["a", "b"] } },
      });
    });

    test("returns empty array when no ids match", async () => {
      prismaMock.card.findMany.mockResolvedValue([]);

      const caller = callerWithoutSession();

      await expect(
        caller.card.findMany({ cardIds: ["missing"] })
      ).resolves.toStrictEqual([]);
    });
  });

  describe("search", () => {
    test("returns items and no cursor when result count is at or below limit", async () => {
      const cards = [buildCard({ id: "a" }), buildCard({ id: "b" })];
      prismaMock.card.findMany.mockResolvedValue(cards);

      const caller = callerWithoutSession();

      const result = await caller.card.search({ name: "lotus", limit: 50 });

      expect(result).toStrictEqual({ items: cards, nextCursor: undefined });
      expect(prismaMock.card.findMany).toHaveBeenCalledWith({
        take: 51,
        where: { name: { contains: "lotus", mode: "insensitive" } },
        cursor: undefined,
        orderBy: { id: "asc" },
      });
    });

    test("pops the extra item and returns its id as nextCursor when over limit", async () => {
      const cards = [
        buildCard({ id: "a" }),
        buildCard({ id: "b" }),
        buildCard({ id: "c" }),
      ];
      prismaMock.card.findMany.mockResolvedValue(cards);

      const caller = callerWithoutSession();

      const result = await caller.card.search({ name: "lotus", limit: 2 });

      expect(result.items).toStrictEqual([cards[0], cards[1]]);
      expect(result.nextCursor).toBe("c");
    });

    test("forwards cursor to prisma when paginating", async () => {
      prismaMock.card.findMany.mockResolvedValue([]);

      const caller = callerWithoutSession();

      await caller.card.search({ name: "lotus", limit: 10, cursor: "page-2" });

      expect(prismaMock.card.findMany).toHaveBeenCalledWith({
        take: 11,
        where: { name: { contains: "lotus", mode: "insensitive" } },
        cursor: { id: "page-2" },
        orderBy: { id: "asc" },
      });
    });

    test("rejects empty name input via zod", async () => {
      const caller = callerWithoutSession();

      await expect(caller.card.search({ name: "" })).rejects.toThrow();
    });
  });
});
