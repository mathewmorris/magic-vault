import prismaMock from "singleton";
import { Prisma } from "@prisma/client";
import { createInnerTRPCContext } from "../trpc";
import { appRouter } from "../root";
import { isScryfallFallbackEnabled, scryfall } from "../../scryfall/client";
import { buildCard, emptyCardRowFields } from "../../testing/cardFixture";
import { affiliateConfig } from "../../affiliate";
import { buyLinks } from "~/utils/buyLinks";
import { PRINTINGS_LIMIT } from "./card";

jest.mock("../../scryfall/client", () => ({
  ...jest.requireActual<object>("../../scryfall/client"),
  isScryfallFallbackEnabled: jest.fn(() => false),
  scryfall: { searchByName: jest.fn(), getRulings: jest.fn() },
}));

const fallbackEnabled = isScryfallFallbackEnabled as jest.MockedFunction<
  typeof isScryfallFallbackEnabled
>;
const searchByName = scryfall.searchByName as jest.MockedFunction<
  typeof scryfall.searchByName
>;
const getRulings = scryfall.getRulings as jest.MockedFunction<typeof scryfall.getRulings>;

jest.mock("../../affiliate", () => ({ affiliateConfig: jest.fn(() => ({ enabled: false })) }));
const mockedAffiliateConfig = affiliateConfig as jest.MockedFunction<typeof affiliateConfig>;

describe("card procedures", () => {
  const callerWithoutSession = () => {
    const ctx = createInnerTRPCContext({ session: null });
    return appRouter.createCaller({ ...ctx, prisma: prismaMock });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fallbackEnabled.mockReturnValue(false);
    mockedAffiliateConfig.mockReturnValue({ enabled: false });
  });

  describe("byId", () => {
    test("returns the card with its other printings", async () => {
      const card = buildCard({ id: "a", oracle_id: "oracle-1", set: "lea" });
      const printings = [
        {
          id: "b",
          name: "Black Lotus",
          set: "leb",
          set_name: "Limited Edition Beta",
          collector_number: "233",
          rarity: "rare",
          released_at: "1993-10-01",
          image_uris: null,
          card_faces: null,
        },
      ];
      prismaMock.card.findUnique.mockResolvedValue(card);
      prismaMock.card.findMany.mockResolvedValue(printings as never);

      const result = await callerWithoutSession().card.byId({ id: "a" });

      expect(result).toStrictEqual({
        ...card,
        printings,
        hasMorePrintings: false,
        buyLinks: buyLinks(card),
      });
      expect(prismaMock.card.findUnique).toHaveBeenCalledWith({ where: { id: "a" } });
    });

    test("asks for other printings of the same oracle card, newest first, list columns only", async () => {
      prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "a", oracle_id: "oracle-1" }));
      prismaMock.card.findMany.mockResolvedValue([]);

      await callerWithoutSession().card.byId({ id: "a" });

      expect(prismaMock.card.findMany).toHaveBeenCalledWith({
        where: { oracle_id: "oracle-1", id: { not: "a" } },
        select: {
          id: true,
          name: true,
          set: true,
          set_name: true,
          collector_number: true,
          rarity: true,
          released_at: true,
          image_uris: true,
          card_faces: true,
        },
        orderBy: [{ released_at: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        take: PRINTINGS_LIMIT + 1,
      });
    });

    test("caps printings and says there are more", async () => {
      prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "a", oracle_id: "oracle-1" }));
      const many = Array.from({ length: PRINTINGS_LIMIT + 1 }, (_, i) => ({ id: `p${i}` }));
      prismaMock.card.findMany.mockResolvedValue(many as never);

      const result = await callerWithoutSession().card.byId({ id: "a" });

      expect(result.printings).toHaveLength(PRINTINGS_LIMIT);
      expect(result.hasMorePrintings).toBe(true);
    });

    test("skips the printings query for cards without an oracle_id", async () => {
      const card = buildCard({ id: "a" });
      prismaMock.card.findUnique.mockResolvedValue(card);

      const result = await callerWithoutSession().card.byId({ id: "a" });

      expect(result).toStrictEqual({
        ...card,
        printings: [],
        hasMorePrintings: false,
        buyLinks: buyLinks(card),
      });
      expect(prismaMock.card.findMany).not.toHaveBeenCalled();
    });

    test("buy links carry no affiliate tracking while the switch is off", async () => {
      prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "a" }));

      const result = await callerWithoutSession().card.byId({ id: "a" });

      expect(result.buyLinks.map((link) => link.store)).toEqual(["tcgplayer", "cardkingdom", "cardmarket"]);
      expect(result.buyLinks.some((link) => link.affiliate)).toBe(false);
    });

    test("buy links use the affiliate settings when the switch is on", async () => {
      mockedAffiliateConfig.mockReturnValue({ enabled: true, cardKingdomPartner: "magicvault" });
      prismaMock.card.findUnique.mockResolvedValue(buildCard({ id: "a" }));

      const result = await callerWithoutSession().card.byId({ id: "a" });

      const ck = result.buyLinks.find((link) => link.store === "cardkingdom");
      expect(ck?.affiliate).toBe(true);
      expect(ck?.href).toContain("partner=magicvault");
    });

    test("throws NOT_FOUND for an unknown id", async () => {
      prismaMock.card.findUnique.mockResolvedValue(null);

      await expect(callerWithoutSession().card.byId({ id: "missing" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(prismaMock.card.findMany).not.toHaveBeenCalled();
    });
  });

  describe("rulings", () => {
    const id = "bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd";
    const rulings = [{ source: "wotc", published_at: "2004-10-04", comment: "A ruling." }];

    beforeEach(() => {
      fallbackEnabled.mockReturnValue(true);
    });

    test("returns Scryfall's rulings for a valid id", async () => {
      getRulings.mockResolvedValue({ status: "ok", rulings });

      await expect(callerWithoutSession().card.rulings({ id })).resolves.toStrictEqual(rulings);
      expect(getRulings).toHaveBeenCalledWith(id);
    });

    test("returns [] without calling Scryfall for an id that isn't a UUID", async () => {
      await expect(callerWithoutSession().card.rulings({ id: "../search" })).resolves.toStrictEqual([]);
      expect(getRulings).not.toHaveBeenCalled();
    });

    test("returns [] without calling Scryfall when Scryfall calls are turned off", async () => {
      fallbackEnabled.mockReturnValue(false);

      await expect(callerWithoutSession().card.rulings({ id })).resolves.toStrictEqual([]);
      expect(getRulings).not.toHaveBeenCalled();
    });

    test.each([
      [{ status: "rate_limited" as const }],
      [{ status: "skipped" as const, reason: "not a Scryfall card id" }],
      [{ status: "error" as const, message: "Scryfall returned 503" }],
    ])("returns [] when Scryfall answers %j", async (outcome) => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      getRulings.mockResolvedValue(outcome);

      await expect(callerWithoutSession().card.rulings({ id })).resolves.toStrictEqual([]);
    });

    test("returns [] when the client throws", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      getRulings.mockRejectedValue(new Error("boom"));

      await expect(callerWithoutSession().card.rulings({ id })).resolves.toStrictEqual([]);
    });
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
