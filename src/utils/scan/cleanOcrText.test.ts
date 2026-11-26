import { cleanOcrLine, extractCardName, normalizeName } from "./cleanOcrText";

describe("cleanOcrLine", () => {
  test.each([
    // [raw OCR line, expected name]
    ["Lightning Bolt", "Lightning Bolt"],
    ["Lightning Bolt {R}", "Lightning Bolt"],
    ["Lightning Bolt ®", "Lightning Bolt"],
    ["| Lightning Bolt @", "Lightning Bolt"],
    ["Counterspell UU", "Counterspell"],
    ["Serra Angel 3WW", "Serra Angel"],
    ["Wrath of God 2WW", "Wrath of God"],
    ["Tarmogoyf 1G", "Tarmogoyf"],
    ["Black Lotus 0", "Black Lotus"],
    ["Birds of Paradise ©", "Birds of Paradise"],
    ["Swords to Plowshares W", "Swords to Plowshares"],
    ["Shivan Dragon 4RR", "Shivan Dragon"],
    ["Sol Ring (1)", "Sol Ring"],
    ["Llanowar Elves (G)", "Llanowar Elves"],
    ["Llanowar   Elves \t G", "Llanowar Elves"],
    ["e Sol Ring 1", "Sol Ring"],
    ["' -Dark Ritual B", "Dark Ritual"],
    ["~ Brainstorm . U", "Brainstorm"],
    ["Thoughtseize B e", "Thoughtseize"],
    ["Snapcaster Mage 1U o", "Snapcaster Mage"],
  ])("cleans %j to %j", (raw, expected) => {
    expect(cleanOcrLine(raw)).toBe(expected);
  });

  test("keeps commas that are part of the name", () => {
    expect(cleanOcrLine("Jace, the Mind Sculptor 2UU")).toBe("Jace, the Mind Sculptor");
  });

  test("keeps apostrophes and turns curly ones into straight ones", () => {
    expect(cleanOcrLine("Ajani’s Pridemate 1W")).toBe("Ajani's Pridemate");
  });

  test("keeps hyphens and accented letters", () => {
    expect(cleanOcrLine("Lim-Dûl’s Vault UB")).toBe("Lim-Dûl's Vault");
  });

  test("turns long dashes into hyphens", () => {
    expect(cleanOcrLine("Will–o’-the-Wisp B")).toBe("Will-o'-the-Wisp");
  });

  test("keeps a leading article 'A'", () => {
    expect(cleanOcrLine("A Display of My Dark Power")).toBe("A Display of My Dark Power");
  });

  test("drops a comma left dangling at the end", () => {
    expect(cleanOcrLine("Teferi, 2WU")).toBe("Teferi");
  });

  test("drops the multiplication and division signs from the Latin-1 range", () => {
    expect(cleanOcrLine("Giant × Growth ÷ G")).toBe("Giant Growth");
  });

  test.each([[""], ["   "], ["@@ 12 ©"], ["{2}{U}{U}"], ["UU"], ["WUBRG"], ["| ~ ."]])(
    "returns an empty string for junk-only input %j",
    (raw) => {
      expect(cleanOcrLine(raw)).toBe("");
    },
  );
});

describe("extractCardName", () => {
  test("takes the first line that looks like a name", () => {
    const raw = "\n\n~ .\nShivan Dragon 4RR\nCreature — Dragon\n";
    expect(extractCardName(raw)).toBe("Shivan Dragon");
  });

  test("skips lines with fewer than three letters", () => {
    expect(extractCardName("1 U\nOpt U\nInstant")).toBe("Opt");
  });

  test("handles Windows line endings", () => {
    expect(extractCardName("@\r\nDark Confidant 1B\r\n")).toBe("Dark Confidant");
  });

  test("collapses runs of whitespace", () => {
    expect(extractCardName("  Grim    Lavamancer   R  ")).toBe("Grim Lavamancer");
  });

  test.each([[null], [undefined], [""], ["\n\n"], ["@ 3 ©\n| |"]])(
    "returns an empty string when there's nothing usable (%j)",
    (raw) => {
      expect(extractCardName(raw)).toBe("");
    },
  );
});

describe("normalizeName", () => {
  test.each([
    ["Lightning Bolt", "lightning bolt"],
    ["LIGHTNING   BOLT", "lightning bolt"],
    ["Lim-Dûl's Vault", "lim duls vault"],
    ["Ajani’s Pridemate", "ajanis pridemate"],
    ["Æther Vial", "aether vial"],
    ["Jace, the Mind Sculptor", "jace the mind sculptor"],
    ["Fire // Ice", "fire ice"],
    ["  ", ""],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });
});
