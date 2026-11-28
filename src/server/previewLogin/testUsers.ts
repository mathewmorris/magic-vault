import { Prisma, type PrismaClient } from "@prisma/client";

type CardLine = { name: string; count: number; finish?: "foil" | "nonfoil" };
type DeckLine = { name: string; count: number; board?: "main" | "side" | "commander" };

export type TestUser = {
  id: string;
  name: string;
  email: string;
  blurb: string;
  collections: { name: string; cards: CardLine[] }[];
  decks: { name: string; format: string; description?: string; cards: DeckLine[] }[];
  achievements: string[];
};

const card = (name: string, count = 1, finish?: "foil" | "nonfoil"): CardLine => ({ name, count, finish });
const deckCard = (name: string, count = 1, board?: "main" | "side" | "commander"): DeckLine => ({
  name,
  count,
  board,
});

/**
 * The only accounts the preview login can sign in as. Ids and emails are
 * fixed, and the emails use the reserved .invalid domain, so no real person
 * can own one of these accounts.
 */
export const TEST_USERS: readonly TestUser[] = [
  {
    id: "preview-user-newcomer",
    name: "Nova Newcomer",
    email: "nova@preview.magic-vault.invalid",
    blurb: "Brand new. No collections or decks yet.",
    collections: [],
    decks: [],
    achievements: [],
  },
  {
    id: "preview-user-collector",
    name: "Casey Collector",
    email: "casey@preview.magic-vault.invalid",
    blurb: "Three collections with a pile of foils and bulk. No decks.",
    collections: [
      {
        name: "Trade binder",
        cards: [
          card("Lightning Bolt", 4),
          card("Counterspell", 3),
          card("Sol Ring", 2, "foil"),
          card("Llanowar Elves", 4),
          card("Swords to Plowshares", 2),
          card("Brainstorm", 4),
          card("Path to Exile", 3),
          card("Birds of Paradise", 1, "foil"),
        ],
      },
      {
        name: "Bulk commons",
        cards: [
          card("Shock", 12),
          card("Opt", 9),
          card("Giant Growth", 7),
          card("Grizzly Bears", 5),
          card("Mountain", 20),
          card("Island", 20),
          card("Forest", 20),
        ],
      },
      {
        name: "Foils",
        cards: [
          card("Serra Angel", 1, "foil"),
          card("Shivan Dragon", 1, "foil"),
          card("Thoughtseize", 1, "foil"),
          card("Teferi, Hero of Dominaria", 1, "foil"),
        ],
      },
    ],
    decks: [],
    achievements: [],
  },
  {
    id: "preview-user-deckbuilder",
    name: "Dana Deckbuilder",
    email: "dana@preview.magic-vault.invalid",
    blurb: "One staples binder and three decks: Commander, Modern and Pauper.",
    collections: [
      {
        name: "Deck staples",
        cards: [card("Command Tower", 2), card("Arcane Signet", 2), card("Lightning Bolt", 4), card("Mountain", 30)],
      },
    ],
    decks: [
      {
        name: "Atraxa Superfriends",
        format: "commander",
        description: "Proliferate everything.",
        cards: [
          deckCard("Atraxa, Praetors' Voice", 1, "commander"),
          deckCard("Doubling Season"),
          deckCard("Teferi, Hero of Dominaria"),
          deckCard("Sol Ring"),
          deckCard("Arcane Signet"),
          deckCard("Command Tower"),
          deckCard("Cultivate"),
          deckCard("Swords to Plowshares"),
          deckCard("Path to Exile"),
          deckCard("Birds of Paradise"),
          deckCard("Forest", 10),
          deckCard("Island", 10),
        ],
      },
      {
        name: "Mono-Red Burn",
        format: "modern",
        description: "Point it at their face.",
        cards: [
          deckCard("Monastery Swiftspear", 4),
          deckCard("Eidolon of the Great Revel", 4),
          deckCard("Lightning Bolt", 4),
          deckCard("Lava Spike", 4),
          deckCard("Rift Bolt", 4),
          deckCard("Skewer the Critics", 4),
          deckCard("Shock", 4),
          deckCard("Mountain", 18),
          deckCard("Smash to Smithereens", 3, "side"),
        ],
      },
      {
        name: "Izzet Tempo",
        format: "pauper",
        cards: [
          deckCard("Counterspell", 4),
          deckCard("Opt", 4),
          deckCard("Brainstorm", 4),
          deckCard("Lightning Bolt", 4),
          deckCard("Shock", 4),
          deckCard("Island", 12),
          deckCard("Mountain", 8),
        ],
      },
    ],
    achievements: [],
  },
  {
    id: "preview-user-vintage",
    name: "Vic Vintage",
    email: "vic@preview.magic-vault.invalid",
    blurb: "The pricey one. A Power binder, a Vintage deck and an achievement.",
    collections: [
      {
        name: "Power",
        cards: [
          card("Black Lotus"),
          card("Mox Sapphire"),
          card("Mox Jet"),
          card("Ancestral Recall"),
          card("Time Walk"),
          card("The One Ring", 1, "foil"),
          card("Ragavan, Nimble Pilferer", 2),
          card("Force of Will", 4),
        ],
      },
    ],
    decks: [
      {
        name: "Blue Power",
        format: "vintage",
        cards: [
          deckCard("Black Lotus"),
          deckCard("Mox Sapphire"),
          deckCard("Mox Jet"),
          deckCard("Ancestral Recall"),
          deckCard("Time Walk"),
          deckCard("Force of Will", 4),
          deckCard("Brainstorm"),
          deckCard("Dark Ritual", 4),
          deckCard("Thoughtseize", 4),
          deckCard("Island", 12),
          deckCard("Force of Will", 1, "side"),
        ],
      },
    ],
    achievements: ["untap-step"],
  },
];

export function findTestUser(id: unknown): TestUser | undefined {
  return typeof id === "string" ? TEST_USERS.find((user) => user.id === id) : undefined;
}

type Printing = { id: string; name: string; finishes: Prisma.JsonValue; hasPrice: boolean; releasedAt: string };

/**
 * One printing per card name: the newest English printing that has a price,
 * or the newest English printing if none do. Names with no printing in the
 * database are left out.
 */
export function pickPrintings(rows: Printing[]): Map<string, Printing> {
  const picked = new Map<string, Printing>();
  for (const row of rows) {
    const current = picked.get(row.name);
    const better =
      !current ||
      (row.hasPrice && !current.hasPrice) ||
      (row.hasPrice === current.hasPrice && row.releasedAt > current.releasedAt);
    if (better) picked.set(row.name, row);
  }
  return picked;
}

/** The finish asked for if the printing has it, otherwise its first finish. */
export function pickFinish(finishes: Prisma.JsonValue, wanted: "foil" | "nonfoil" = "nonfoil"): string {
  const known = Array.isArray(finishes) ? finishes.filter((f): f is string => typeof f === "string") : [];
  if (known.length === 0 || known.includes(wanted)) return wanted;
  return known[0]!;
}

async function loadPrintings(prisma: PrismaClient, names: string[]) {
  const rows = await prisma.card.findMany({
    where: { name: { in: names }, lang: "en", image_status: { not: "missing" } },
    select: { id: true, name: true, finishes: true, released_at: true, price: { select: { prices: true } } },
  });
  return pickPrintings(
    rows.map((row) => {
      const prices = row.price?.prices as Record<string, unknown> | null | undefined;
      return {
        id: row.id,
        name: row.name,
        finishes: row.finishes,
        releasedAt: row.released_at ?? "",
        hasPrice: Boolean(prices && (prices.usd ?? prices.usd_foil)),
      };
    }),
  );
}

/**
 * Make sure the test user exists. A user that's missing is created with its
 * collections, decks and achievements. A user that already exists is left as
 * it is, so changes made while testing stick around.
 */
export async function ensureTestUser(prisma: PrismaClient, testUser: TestUser): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id: testUser.id }, select: { email: true } });
  if (existing) {
    if (existing.email !== testUser.email) throw new Error("A non-test user has a test user's id");
    return;
  }

  const names = [
    ...testUser.collections.flatMap((c) => c.cards.map((line) => line.name)),
    ...testUser.decks.flatMap((d) => d.cards.map((line) => line.name)),
  ];
  const printings = names.length > 0 ? await loadPrintings(prisma, [...new Set(names)]) : new Map<string, Printing>();

  const collections = testUser.collections.map((collection) => {
    const entries = new Map<string, { cardId: string; finish: string; count: number }>();
    for (const line of collection.cards) {
      const printing = printings.get(line.name);
      if (!printing) continue;
      const finish = pickFinish(printing.finishes, line.finish);
      const key = `${printing.id}:${finish}`;
      const entry = entries.get(key);
      if (entry) entry.count += line.count;
      else entries.set(key, { cardId: printing.id, finish, count: line.count });
    }
    return { name: collection.name, cardEntries: { create: [...entries.values()] } };
  });

  const decks = testUser.decks.map((deck) => {
    const entries = new Map<string, { cardId: string; board: string; count: number }>();
    for (const line of deck.cards) {
      const printing = printings.get(line.name);
      if (!printing) continue;
      const board = line.board ?? "main";
      const key = `${printing.id}:${board}`;
      const entry = entries.get(key);
      if (entry) entry.count += line.count;
      else entries.set(key, { cardId: printing.id, board, count: line.count });
    }
    return {
      name: deck.name,
      format: deck.format,
      description: deck.description,
      cardEntries: { create: [...entries.values()] },
    };
  });

  try {
    await prisma.user.create({
      data: {
        id: testUser.id,
        name: testUser.name,
        email: testUser.email,
        emailVerified: new Date(),
        collections: { create: collections },
        decks: { create: decks },
        achievements: { create: testUser.achievements.map((key) => ({ key })) },
      },
    });
  } catch (error) {
    // Two picks at once: the other request already made the user.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}
