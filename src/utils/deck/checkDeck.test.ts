import {
  checkDeck,
  isBasicLand,
  ownCopyLimit,
  parseBoard,
  toDeckCheckCard,
  type DeckCheckCard,
  type DeckProblem,
} from "./checkDeck";

const legalIn = (...formats: string[]) =>
  Object.fromEntries(formats.map((format) => [format, "legal"]));

const ALL_FORMATS = legalIn(
  "commander", "standard", "pioneer", "modern", "legacy", "vintage", "pauper",
  "historic", "timeless", "brawl", "oathbreaker",
);

const card = (overrides: Partial<DeckCheckCard> = {}): DeckCheckCard => ({
  name: "Grizzly Bears",
  type_line: "Creature — Bear",
  legalities: ALL_FORMATS,
  color_identity: ["G"],
  oracle_text: null,
  count: 1,
  board: "main",
  ...overrides,
});

const forest = (count: number, board: DeckCheckCard["board"] = "main") =>
  card({ name: "Forest", type_line: "Basic Land — Forest", color_identity: [], count, board });

/** n different one-of cards, all legal and green. */
const singletons = (n: number, board: DeckCheckCard["board"] = "main") =>
  Array.from({ length: n }, (_, i) => card({ name: `Card ${i}`, board }));

const kinds = (problems: DeckProblem[]) => problems.map((problem) => problem.kind);

describe("checkDeck", () => {
  describe("60-card formats", () => {
    test("a legal 60-card deck with a full sideboard has no problems", () => {
      const deck = [card({ count: 4 }), forest(56), ...singletons(15, "side")];

      expect(checkDeck("modern", deck)).toStrictEqual([]);
    });

    test("flags a main deck under 60 cards", () => {
      const problems = checkDeck("standard", [card({ count: 4 }), forest(50)]);

      expect(problems).toStrictEqual([
        {
          kind: "deck_too_small",
          count: 54,
          min: 60,
          message: "Main deck has 54 cards, Standard needs at least 60",
        },
      ]);
    });

    test("doesn't count the sideboard toward the main deck", () => {
      const problems = checkDeck("pioneer", [forest(59), ...singletons(1, "side")]);

      expect(kinds(problems)).toStrictEqual(["deck_too_small"]);
    });

    test("flags a sideboard over 15 cards", () => {
      const problems = checkDeck("legacy", [forest(60), ...singletons(16, "side")]);

      expect(problems).toStrictEqual([
        {
          kind: "sideboard_too_large",
          count: 16,
          max: 15,
          message: "Sideboard has 16 cards, Legacy allows at most 15",
        },
      ]);
    });

    test("allows 4 copies and flags a 5th", () => {
      expect(checkDeck("modern", [card({ count: 4 }), forest(56)])).toStrictEqual([]);

      expect(checkDeck("modern", [card({ count: 5 }), forest(55)])).toStrictEqual([
        {
          kind: "too_many_copies",
          cardName: "Grizzly Bears",
          count: 5,
          max: 4,
          message: "Grizzly Bears: 5 copies, at most 4 allowed in Modern",
        },
      ]);
    });

    test("counts copies across the main deck and sideboard together", () => {
      const problems = checkDeck("modern", [card({ count: 3 }), card({ count: 2, board: "side" }), forest(57)]);

      expect(problems).toContainEqual(
        expect.objectContaining({ kind: "too_many_copies", cardName: "Grizzly Bears", count: 5 }) as DeckProblem
      );
    });

    test("counts different printings of the same card together", () => {
      const problems = checkDeck("modern", [card({ count: 2 }), card({ count: 3 }), forest(55)]);

      expect(kinds(problems)).toStrictEqual(["too_many_copies"]);
    });

    test("cards on the commander board count as main deck in formats without commanders", () => {
      expect(checkDeck("modern", [forest(59), card({ board: "commander" })])).toStrictEqual([]);
    });

    test("ignores cards with a count of 0", () => {
      expect(checkDeck("modern", [forest(60), card({ count: 0, legalities: { modern: "banned" } })])).toStrictEqual([]);
    });
  });

  describe("legality", () => {
    test("flags a banned card", () => {
      const problems = checkDeck("modern", [card({ name: "Splinter Twin", legalities: { modern: "banned" } }), forest(59)]);

      expect(problems).toStrictEqual([
        { kind: "banned", cardName: "Splinter Twin", message: "Splinter Twin is banned in Modern" },
      ]);
    });

    test("flags a card that isn't legal in the format", () => {
      const problems = checkDeck("standard", [card({ name: "Black Lotus", legalities: { standard: "not_legal" } }), forest(59)]);

      expect(problems).toStrictEqual([
        { kind: "not_legal", cardName: "Black Lotus", message: "Black Lotus isn't legal in Standard" },
      ]);
    });

    test("a card missing from the legalities object is treated as unknown, not flagged", () => {
      expect(checkDeck("modern", [card({ legalities: {} }), forest(59)])).toStrictEqual([]);
    });

    test("skips legality for cards whose legalities haven't synced yet", () => {
      expect(checkDeck("modern", [card({ legalities: null }), forest(59)])).toStrictEqual([]);
    });

    test("reports a banned card once, not also for its copies", () => {
      const problems = checkDeck("modern", [card({ count: 6, legalities: { modern: "banned" } }), forest(54)]);

      expect(kinds(problems)).toStrictEqual(["banned"]);
    });

    test("allows one copy of a restricted card", () => {
      const lotus = card({ name: "Black Lotus", legalities: { vintage: "restricted" } });

      expect(checkDeck("vintage", [lotus, forest(59)])).toStrictEqual([]);
    });

    test("flags more than one copy of a restricted card", () => {
      const lotus = card({ name: "Black Lotus", legalities: { vintage: "restricted" }, count: 2 });

      expect(checkDeck("vintage", [lotus, forest(58)])).toStrictEqual([
        {
          kind: "restricted",
          cardName: "Black Lotus",
          count: 2,
          message: "Black Lotus is restricted in Vintage: at most 1 copy, the deck has 2",
        },
      ]);
    });

    test("restricted copies in the sideboard count too", () => {
      const lotus = { name: "Black Lotus", legalities: { vintage: "restricted" } };
      const problems = checkDeck("vintage", [card(lotus), card({ ...lotus, board: "side" }), forest(59)]);

      expect(kinds(problems)).toStrictEqual(["restricted"]);
    });

    test("uses another printing's legalities when one printing has none yet", () => {
      const problems = checkDeck("modern", [
        card({ legalities: null }),
        card({ legalities: { modern: "banned" } }),
        forest(58),
      ]);

      expect(kinds(problems)).toStrictEqual(["banned"]);
    });
  });

  describe("cards exempt from copy limits", () => {
    test("any number of basic lands", () => {
      expect(checkDeck("modern", [forest(60)])).toStrictEqual([]);
    });

    test("snow-covered basics and Wastes are basic too", () => {
      const snow = card({ name: "Snow-Covered Forest", type_line: "Basic Snow Land — Forest", count: 30 });
      const wastes = card({ name: "Wastes", type_line: "Basic Land", count: 30 });

      expect(checkDeck("modern", [snow, wastes])).toStrictEqual([]);
    });

    test("cards that say a deck can have any number of them", () => {
      const rats = card({
        name: "Relentless Rats",
        oracle_text: "A deck can have any number of cards named Relentless Rats.",
        count: 30,
      });

      expect(checkDeck("modern", [rats, forest(30)])).toStrictEqual([]);
    });

    test("cards that allow up to N copies, but no more", () => {
      const dwarves = {
        name: "Seven Dwarves",
        oracle_text: "Seven Dwarves gets +1/+1 for each other creature named Seven Dwarves you control.\nA deck can have up to seven cards named Seven Dwarves.",
      };

      expect(checkDeck("modern", [card({ ...dwarves, count: 7 }), forest(53)])).toStrictEqual([]);
      expect(kinds(checkDeck("modern", [card({ ...dwarves, count: 8 }), forest(52)]))).toStrictEqual(["too_many_copies"]);
    });

    test("basic lands are exempt in singleton formats too", () => {
      const commander = card({ name: "Titania", type_line: "Legendary Creature — Elemental", board: "commander" });

      expect(checkDeck("commander", [commander, forest(99)])).toStrictEqual([]);
    });
  });

  describe("commander", () => {
    const commander = (overrides: Partial<DeckCheckCard> = {}) =>
      card({
        name: "Atraxa, Praetors' Voice",
        type_line: "Legendary Creature — Phyrexian Angel Horror",
        color_identity: ["W", "U", "B", "G"],
        board: "commander",
        ...overrides,
      });

    test("a 99-card deck plus one commander has no problems", () => {
      expect(checkDeck("commander", [commander(), ...singletons(99)])).toStrictEqual([]);
    });

    test("needs exactly 100 cards counting the commander", () => {
      expect(checkDeck("commander", [commander(), ...singletons(98)])).toStrictEqual([
        {
          kind: "deck_wrong_size",
          count: 99,
          expected: 100,
          message: "Deck has 99 cards counting the commander, Commander needs exactly 100",
        },
      ]);
      expect(kinds(checkDeck("commander", [commander(), ...singletons(100)]))).toStrictEqual(["deck_wrong_size"]);
    });

    test("allows two commanders (partners)", () => {
      const partners = [
        commander({ name: "Thrasios, Triton Hero", color_identity: ["G", "U"] }),
        commander({ name: "Tymna the Weaver", color_identity: ["W", "B"] }),
      ];

      expect(checkDeck("commander", [...partners, ...singletons(98)])).toStrictEqual([]);
    });

    test("flags a deck with no commander", () => {
      expect(checkDeck("commander", singletons(100))).toStrictEqual([
        {
          kind: "commander_count",
          count: 0,
          min: 1,
          max: 2,
          message: "Commander needs 1 or 2 on the commander board, the deck has 0",
        },
      ]);
    });

    test("flags three commanders", () => {
      const three = [commander({ name: "A" }), commander({ name: "B" }), commander({ name: "C" })];

      expect(kinds(checkDeck("commander", [...three, ...singletons(97)]))).toStrictEqual(["commander_count"]);
    });

    test("is singleton: a second copy of a non-basic is flagged", () => {
      const problems = checkDeck("commander", [commander(), card({ name: "Sol Ring", count: 2 }), ...singletons(97)]);

      expect(problems).toStrictEqual([
        {
          kind: "too_many_copies",
          cardName: "Sol Ring",
          count: 2,
          max: 1,
          message: "Sol Ring: 2 copies, at most 1 allowed in Commander",
        },
      ]);
    });

    test("the commander can't also be in the main deck", () => {
      const problems = checkDeck("commander", [commander(), commander({ board: "main" }), ...singletons(98)]);

      expect(kinds(problems)).toStrictEqual(["too_many_copies"]);
    });

    test("flags cards outside the commander's color identity, naming the extra colors", () => {
      const bolt = card({ name: "Lightning Bolt", color_identity: ["R"] });
      const problems = checkDeck("commander", [commander(), bolt, ...singletons(98)]);

      expect(problems).toStrictEqual([
        {
          kind: "color_identity",
          cardName: "Lightning Bolt",
          outside: ["R"],
          message: "Lightning Bolt is outside the commander's color identity (R)",
        },
      ]);
    });

    test("uses the combined identity of both partners", () => {
      const partners = [
        commander({ name: "Thrasios, Triton Hero", color_identity: ["G", "U"] }),
        commander({ name: "Tymna the Weaver", color_identity: ["W", "B"] }),
      ];
      const deck = [
        ...partners,
        card({ name: "Vindicate", color_identity: ["W", "B"] }),
        card({ name: "Boros Charm", color_identity: ["R", "W"] }),
        ...singletons(96),
      ];

      expect(checkDeck("commander", deck)).toStrictEqual([
        expect.objectContaining({ kind: "color_identity", cardName: "Boros Charm", outside: ["R"] }) as DeckProblem,
      ]);
    });

    test("sorts the colors outside the identity in WUBRG order", () => {
      const mono = commander({ name: "Isamaru", color_identity: ["W"] });
      const deck = [mono, card({ name: "Sliver Queen", color_identity: ["G", "R", "B", "U", "W"] }), ...singletons(98, "main").map((c) => ({ ...c, color_identity: [] }))];

      expect(checkDeck("commander", deck)).toStrictEqual([
        expect.objectContaining({ kind: "color_identity", outside: ["U", "B", "R", "G"] }) as DeckProblem,
      ]);
    });

    test("colorless cards fit any commander", () => {
      const solRing = card({ name: "Sol Ring", type_line: "Artifact", color_identity: [] });

      expect(checkDeck("commander", [commander(), solRing, ...singletons(98)])).toStrictEqual([]);
    });

    test("skips the color check while a commander's identity is unknown", () => {
      const bolt = card({ name: "Lightning Bolt", color_identity: ["R"] });

      expect(checkDeck("commander", [commander({ color_identity: null }), bolt, ...singletons(98)])).toStrictEqual([]);
    });

    test("skips the color check for a card whose identity is unknown", () => {
      const unknown = card({ name: "Mystery", color_identity: null });

      expect(checkDeck("commander", [commander(), unknown, ...singletons(98)])).toStrictEqual([]);
    });

    test("ignores the side board entirely", () => {
      const side = [
        card({ name: "Lightning Bolt", color_identity: ["R"], board: "side" }),
        card({ name: "Card 0", board: "side" }),
        card({ name: "Banned", legalities: { commander: "banned" }, board: "side" }),
      ];

      expect(checkDeck("commander", [commander(), ...singletons(99), ...side])).toStrictEqual([]);
    });

    test("flags a card banned in commander", () => {
      const problems = checkDeck("commander", [
        commander(),
        card({ name: "Mana Crypt", legalities: { commander: "banned" } }),
        ...singletons(98),
      ]);

      expect(kinds(problems)).toStrictEqual(["banned"]);
    });

    test("flags a banned commander", () => {
      const problems = checkDeck("commander", [commander({ legalities: { commander: "banned" } }), ...singletons(99)]);

      expect(problems).toStrictEqual([
        expect.objectContaining({ kind: "banned", cardName: "Atraxa, Praetors' Voice" }) as DeckProblem,
      ]);
    });
  });

  describe("brawl and oathbreaker", () => {
    test("brawl is a 100-card singleton deck with a commander", () => {
      const commander = card({ name: "Commander", board: "commander" });

      expect(checkDeck("brawl", [commander, ...singletons(99)])).toStrictEqual([]);
      expect(kinds(checkDeck("brawl", singletons(100)))).toStrictEqual(["commander_count"]);
    });

    test("oathbreaker is 60 cards counting the oathbreaker and signature spell", () => {
      const walker = card({ name: "Oathbreaker", type_line: "Legendary Planeswalker — Someone", board: "commander" });
      const spell = card({ name: "Signature", type_line: "Instant", board: "commander" });

      expect(checkDeck("oathbreaker", [walker, spell, ...singletons(58)])).toStrictEqual([]);
      expect(kinds(checkDeck("oathbreaker", [walker, spell, ...singletons(58), card({ name: "Card 1" })]))).toStrictEqual([
        "too_many_copies",
        "deck_wrong_size",
      ]);
    });

    test("oathbreaker needs something on the commander board", () => {
      expect(checkDeck("oathbreaker", singletons(60))).toStrictEqual([
        {
          kind: "commander_count",
          count: 0,
          min: 1,
          message: "Oathbreaker needs at least 1 on the commander board, the deck has 0",
        },
      ]);
    });
  });

  test("reports an unknown format instead of guessing its rules", () => {
    expect(checkDeck("cube", [forest(40)])).toStrictEqual([
      { kind: "unknown_format", format: "cube", message: "\"cube\" isn't a format we can check" },
    ]);
  });
});

describe("isBasicLand", () => {
  test.each([
    ["Basic Land — Forest", true],
    ["Basic Snow Land — Island", true],
    ["Basic Land", true],
    ["Land", false],
    ["Legendary Land", false],
    ["Snow Land — Forest", false],
  ])("%s -> %s", (typeLine, expected) => {
    expect(isBasicLand(typeLine)).toBe(expected);
  });

  test("an unknown type line isn't basic", () => {
    expect(isBasicLand(null)).toBe(false);
  });
});

describe("ownCopyLimit", () => {
  test("is unlimited for basics and any-number cards, N for up-to-N cards, null otherwise", () => {
    expect(ownCopyLimit({ type_line: "Basic Land — Plains", oracle_text: null })).toBe(Infinity);
    expect(ownCopyLimit({ type_line: "Creature — Rat", oracle_text: "A deck can have any number of cards named Rat Colony." })).toBe(Infinity);
    expect(ownCopyLimit({ type_line: "Legendary Creature — Wraith Knight", oracle_text: "A deck can have up to nine cards named Nazgûl." })).toBe(9);
    expect(ownCopyLimit({ type_line: "Creature — Bear", oracle_text: "Trample" })).toBeNull();
  });
});

describe("parseBoard", () => {
  test("keeps known boards and treats anything else as main", () => {
    expect(parseBoard("main")).toBe("main");
    expect(parseBoard("side")).toBe("side");
    expect(parseBoard("commander")).toBe("commander");
    expect(parseBoard("maybe")).toBe("main");
  });
});

describe("toDeckCheckCard", () => {
  const row = {
    name: "Sol Ring",
    type_line: "Artifact",
    oracle_text: "{T}: Add {C}{C}.",
    legalities: { commander: "legal", modern: "banned" },
    color_identity: [],
  };

  test("copies the fields and keeps well-formed JSON", () => {
    expect(toDeckCheckCard(row, 1, "main")).toStrictEqual({
      name: "Sol Ring",
      type_line: "Artifact",
      oracle_text: "{T}: Add {C}{C}.",
      legalities: { commander: "legal", modern: "banned" },
      color_identity: [],
      count: 1,
      board: "main",
    });
  });

  test("treats missing or malformed JSON as unknown", () => {
    const card = toDeckCheckCard({ ...row, legalities: null, color_identity: "W" }, 2, "side");

    expect(card.legalities).toBeNull();
    expect(card.color_identity).toBeNull();
    expect(toDeckCheckCard({ ...row, legalities: ["legal"] }, 1, "main").legalities).toBeNull();
    expect(toDeckCheckCard({ ...row, color_identity: ["W", 1] }, 1, "main").color_identity).toBeNull();
  });

  test("drops legalities entries that aren't strings", () => {
    expect(toDeckCheckCard({ ...row, legalities: { commander: "legal", modern: 3 } }, 1, "main").legalities).toStrictEqual({
      commander: "legal",
    });
  });
});
