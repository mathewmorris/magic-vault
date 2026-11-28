import { type PrismaClient } from "@prisma/client";
import { mockDeep } from "jest-mock-extended";

import { ensureTestUser, findTestUser, pickFinish, pickPrintings, TEST_USERS } from "./testUsers";

describe("TEST_USERS", () => {
  test("has four users with fixed ids and .invalid emails", () => {
    expect(TEST_USERS).toHaveLength(4);
    expect(new Set(TEST_USERS.map((user) => user.id)).size).toBe(4);
    for (const user of TEST_USERS) {
      expect(user.id).toMatch(/^preview-user-/);
      expect(user.email).toMatch(/@preview\.magic-vault\.invalid$/);
    }
  });

  test("gives each user a different setup", () => {
    const shapes = TEST_USERS.map((user) => `${user.collections.length}/${user.decks.length}`);
    expect(new Set(shapes).size).toBe(4);
  });
});

describe("findTestUser", () => {
  test("finds only the fixed ids", () => {
    expect(findTestUser("preview-user-vintage")?.name).toBe("Vic Vintage");
    expect(findTestUser("someone-else")).toBeUndefined();
    expect(findTestUser(null)).toBeUndefined();
  });
});

describe("pickPrintings", () => {
  test("prefers a priced printing, then the newest", () => {
    const picked = pickPrintings([
      { id: "old-priced", name: "Bolt", finishes: [], hasPrice: true, releasedAt: "1993-08-05" },
      { id: "new-unpriced", name: "Bolt", finishes: [], hasPrice: false, releasedAt: "2024-01-01" },
      { id: "new-priced", name: "Bolt", finishes: [], hasPrice: true, releasedAt: "2020-01-01" },
    ]);
    expect(picked.get("Bolt")?.id).toBe("new-priced");
  });
});

describe("pickFinish", () => {
  test("uses the asked finish when the printing has it", () => {
    expect(pickFinish(["nonfoil", "foil"], "foil")).toBe("foil");
  });

  test("falls back to the printing's first finish", () => {
    expect(pickFinish(["foil"], "nonfoil")).toBe("foil");
  });

  test("allows any finish when the printing lists none", () => {
    expect(pickFinish(null, "foil")).toBe("foil");
  });
});

describe("ensureTestUser", () => {
  const dana = findTestUser("preview-user-deckbuilder")!;

  test("leaves an existing test user alone", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.user.findUnique.mockResolvedValue({ email: dana.email } as never);

    await ensureTestUser(prisma, dana);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("refuses when the id belongs to someone who isn't the test user", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.user.findUnique.mockResolvedValue({ email: "real@example.com" } as never);

    await expect(ensureTestUser(prisma, dana)).rejects.toThrow();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("creates a missing user with their collections and decks", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.card.findMany.mockResolvedValue([
      { id: "bolt", name: "Lightning Bolt", finishes: ["nonfoil"], released_at: "2020-01-01", price: { prices: { usd: "1" } } },
      { id: "atraxa", name: "Atraxa, Praetors' Voice", finishes: ["nonfoil"], released_at: "2016-11-11", price: null },
    ] as never);

    await ensureTestUser(prisma, dana);

    const data = prisma.user.create.mock.calls[0]![0].data as unknown as {
      id: string;
      email: string;
      collections: { create: { name: string; cardEntries: { create: unknown[] } }[] };
      decks: { create: { name: string; cardEntries: { create: { cardId: string; board: string; count: number }[] } }[] };
    };
    expect(data.id).toBe(dana.id);
    expect(data.email).toBe(dana.email);
    expect(data.collections.create.map((c) => c.name)).toEqual(["Deck staples"]);
    expect(data.decks.create.map((d) => d.name)).toEqual(["Atraxa Superfriends", "Mono-Red Burn", "Izzet Tempo"]);
    expect(data.decks.create[0]!.cardEntries.create).toContainEqual({ cardId: "atraxa", board: "commander", count: 1 });
    // Cards the database doesn't have are skipped.
    expect(data.collections.create[0]!.cardEntries.create).toEqual([{ cardId: "bolt", finish: "nonfoil", count: 4 }]);
  });
});
