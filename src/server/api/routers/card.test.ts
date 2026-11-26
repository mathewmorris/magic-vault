import prismaMock from "singleton";
import { Prisma } from "@prisma/client";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { isScryfallFallbackEnabled, scryfall } from "../../scryfall/client";
import { buildCard, emptyCardRowFields } from "../../testing/cardFixture";

jest.mock("../../scryfall/client", () => ({
  ...jest.requireActual<object>("../../scryfall/client"),
  isScryfallFallbackEnabled: jest.fn(() => false),
  scryfall: { searchByName: jest.fn() },
}));

const fallbackEnabled = isScryfallFallbackEnabled as jest.MockedFunction<
  typeof isScryfallFallbackEnabled
>;
const searchByName = scryfall.searchByName as jest.MockedFunction<
  typeof scryfall.searchByName
>;

describe("card procedures", () => {
  const callerWithoutSession = () => {
    const ctx = createInnerTRPCContext({ session: null });
    return appRouter.createCaller({ ...ctx, prisma: prismaMock });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fallbackEnabled.mockReturnValue(false);
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
  describe("search Scryfall fallback", () => {
    const scryfallCard = {
      id: "new-1",
      name: "Brand New Card",
      scryfall_uri: "https://scryfall.com/card/new/1/brand-new-card",
      image_status: "highres_scan",
      layout: "normal",
      image_uris: { small: "https://cards.scryfall.io/small/new.jpg" },
    };

    beforeEach(() => {
      fallbackEnabled.mockReturnValue(true);
    });

    test("does not call Scryfall when the flag is off", async () => {
      fallbackEnabled.mockReturnValue(false);
      prismaMock.card.findMany.mockResolvedValue([]);

      const result = await callerWithoutSession().card.search({ name: "brand new" });

      expect(result).toStrictEqual({ items: [], nextCursor: undefined });
      expect(searchByName).not.toHaveBeenCalled();
    });

    test("does not call Scryfall when local results exist", async () => {
      prismaMock.card.findMany.mockResolvedValue([buildCard()]);

      await callerWithoutSession().card.search({ name: "lotus" });

      expect(searchByName).not.toHaveBeenCalled();
    });

    test("does not call Scryfall for later pages", async () => {
      prismaMock.card.findMany.mockResolvedValue([]);

      await callerWithoutSession().card.search({ name: "lotus", cursor: "page-2" });

      expect(searchByName).not.toHaveBeenCalled();
    });

    test("caches Scryfall results on a local miss and returns them", async () => {
      const stored = buildCard({ id: "new-1", name: "Brand New Card" });
      prismaMock.card.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([stored]);
      prismaMock.card.createMany.mockResolvedValue({ count: 1 });
      searchByName.mockResolvedValue({ status: "ok", cards: [scryfallCard] });

      const result = await callerWithoutSession().card.search({ name: "brand new" });

      expect(searchByName).toHaveBeenCalledWith("brand new");
      expect(prismaMock.card.createMany).toHaveBeenCalledWith({
        data: [
          {
            id: "new-1",
            name: "Brand New Card",
            scryfall_uri: "https://scryfall.com/card/new/1/brand-new-card",
            image_status: "highres_scan",
            layout: "normal",
            image_uris: { small: "https://cards.scryfall.io/small/new.jpg" },
            card_faces: Prisma.DbNull,
            all_parts: Prisma.DbNull,
            ...emptyCardRowFields,
          },
        ],
        skipDuplicates: true,
      });
      expect(prismaMock.card.findMany).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual({ items: [stored], nextCursor: undefined });
    });

    test.each([
      [{ status: "not_found" as const }],
      [{ status: "rate_limited" as const }],
      [{ status: "skipped" as const, reason: "query too short" }],
      [{ status: "error" as const, message: "Scryfall returned 503" }],
    ])("returns the empty local result when Scryfall answers %j", async (outcome) => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      prismaMock.card.findMany.mockResolvedValue([]);
      searchByName.mockResolvedValue(outcome);

      const result = await callerWithoutSession().card.search({ name: "nothing here" });

      expect(result).toStrictEqual({ items: [], nextCursor: undefined });
      expect(prismaMock.card.createMany).not.toHaveBeenCalled();
      expect(prismaMock.card.findMany).toHaveBeenCalledTimes(1);
    });

    test("still answers when caching fails", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      prismaMock.card.findMany.mockResolvedValue([]);
      prismaMock.card.createMany.mockRejectedValue(new Error("db down"));
      searchByName.mockResolvedValue({ status: "ok", cards: [scryfallCard] });

      const result = await callerWithoutSession().card.search({ name: "brand new" });

      expect(result).toStrictEqual({ items: [], nextCursor: undefined });
    });
  });
});
