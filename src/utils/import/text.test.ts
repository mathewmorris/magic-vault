import { parseTextLine, parseTextList } from "./text";

const row = (lineNumber: number, raw: string, fields: Record<string, unknown>) => ({
  lineNumber,
  quantity: 1,
  finish: "nonfoil",
  condition: "NM",
  language: "en",
  raw,
  ...fields,
});

describe("parseTextLine", () => {
  test.each([
    ["4 Lightning Bolt", { quantity: 4, name: "Lightning Bolt" }],
    ["4x Lightning Bolt", { quantity: 4, name: "Lightning Bolt" }],
    ["4X Lightning Bolt", { quantity: 4, name: "Lightning Bolt" }],
    ["4 x Lightning Bolt", { quantity: 4, name: "Lightning Bolt" }],
    ["Lightning Bolt", { name: "Lightning Bolt" }],
    ["Lightning Bolt x3", { quantity: 3, name: "Lightning Bolt" }],
    ["1 Lightning Bolt (2ED) 162", { name: "Lightning Bolt", setCode: "2ed", collectorNumber: "162" }],
    ["1 Lightning Bolt (2ED)", { name: "Lightning Bolt", setCode: "2ed" }],
    [
      "1 Lightning Bolt (2ED) 162 *F*",
      { name: "Lightning Bolt", setCode: "2ed", collectorNumber: "162", finish: "foil" },
    ],
    [
      "1 Sol Ring (CMM) 464 *E*",
      { name: "Sol Ring", setCode: "cmm", collectorNumber: "464", finish: "etched" },
    ],
    ["4 Lightning Bolt (M10) 146", { quantity: 4, name: "Lightning Bolt", setCode: "m10", collectorNumber: "146" }],
    ["1 Delver of Secrets // Insectile Aberration (ISD) 51", {
      name: "Delver of Secrets // Insectile Aberration",
      setCode: "isd",
      collectorNumber: "51",
    }],
    ["2 Borborygmos, Enraged", { quantity: 2, name: "Borborygmos, Enraged" }],
    ["1 Xenagos, the Reveler (THS) 207", { name: "Xenagos, the Reveler", setCode: "ths", collectorNumber: "207" }],
    ["1 Kozilek, the Great Distortion (OGW) 4a", {
      name: "Kozilek, the Great Distortion",
      setCode: "ogw",
      collectorNumber: "4a",
    }],
    ["1 Lightning Bolt (PLST) M10-146", { name: "Lightning Bolt", setCode: "plst", collectorNumber: "M10-146" }],
    // A name with words in parentheses isn't a set code.
    ["1 Erase (Not the Urza's Legacy One)", { name: "Erase (Not the Urza's Legacy One)" }],
  ])("%s", (line, fields) => {
    expect(parseTextLine(line, 1)).toStrictEqual(row(1, line, fields));
  });

  test("ignores other markers but keeps the foil one, in either order", () => {
    expect(parseTextLine("1 Atraxa, Praetors' Voice (2X2) 190 *CMDR* *F*", 3)).toStrictEqual(
      row(3, "1 Atraxa, Praetors' Voice (2X2) 190 *CMDR* *F*", {
        name: "Atraxa, Praetors' Voice",
        setCode: "2x2",
        collectorNumber: "190",
        finish: "foil",
      }),
    );
    expect(parseTextLine("1 Sol Ring (C21) 263 *F* *CMDR*", 1)).toMatchObject({ finish: "foil", collectorNumber: "263" });
  });

  test("drops Archidekt categories and tags and Moxfield hashtags", () => {
    expect(parseTextLine("1x Sol Ring (c21) 263 [Ramp] ^Have,#37d67a^", 1)).toMatchObject({
      name: "Sol Ring",
      setCode: "c21",
      collectorNumber: "263",
    });
    expect(parseTextLine("1 Sol Ring (C21) 263 *F* #ramp #artifacts", 1)).toMatchObject({
      name: "Sol Ring",
      finish: "foil",
    });
    expect(parseTextLine("1 Sol Ring [Ramp{noDeck}]", 1)).toMatchObject({ name: "Sol Ring" });
  });

  test("reads a set code in square brackets when there's no other", () => {
    expect(parseTextLine("2 Lightning Bolt [2ED]", 1)).toMatchObject({ name: "Lightning Bolt", setCode: "2ed" });
  });

  test("rejects a count of zero or more than the limit", () => {
    expect(parseTextLine("0 Lightning Bolt", 5)).toStrictEqual({
      lineNumber: 5,
      raw: "0 Lightning Bolt",
      message: "The count has to be at least 1.",
    });
    expect(parseTextLine("10000 Forest", 1)).toMatchObject({ message: "The count can be at most 9999." });
  });

  test("rejects a line with a count and no name", () => {
    expect(parseTextLine("1 *F*", 1)).toMatchObject({ message: "There's no card name on this line." });
  });
});

describe("parseTextList", () => {
  test("reads an Arena export, skipping its headers and the deck name", () => {
    const text = [
      "About",
      "Name Mono-Red Burn",
      "",
      "Deck",
      "20 Mountain (M21) 270",
      "4 Lightning Bolt (M10) 146",
      "",
      "Sideboard",
      "2 Smash to Smithereens (ORI) 163",
    ].join("\n");

    const parsed = parseTextList(text);

    expect(parsed.format).toBe("text");
    expect(parsed.errors).toStrictEqual([]);
    expect(parsed.rows.map(({ lineNumber, quantity, name, setCode }) => [lineNumber, quantity, name, setCode])).toStrictEqual([
      [5, 20, "Mountain", "m21"],
      [6, 4, "Lightning Bolt", "m10"],
      [9, 2, "Smash to Smithereens", "ori"],
    ]);
  });

  test("skips comments, MTGO headers and Moxfield's section counts", () => {
    const text = [
      "// Burn, by a friend",
      "# old list",
      "Commander (1)",
      "1 Krenko, Mob Boss",
      "SIDEBOARD:",
      "   ",
      "3 Pyroblast",
      "Maybeboard",
    ].join("\r\n");

    expect(parseTextList(text).rows.map((parsed) => parsed.name)).toStrictEqual(["Krenko, Mob Boss", "Pyroblast"]);
  });

  test("returns lines it can't read as errors and keeps going", () => {
    const parsed = parseTextList("4 Lightning Bolt\n0 Counterspell\n1 Opt");

    expect(parsed.rows.map((parsed) => parsed.name)).toStrictEqual(["Lightning Bolt", "Opt"]);
    expect(parsed.errors).toStrictEqual([
      { lineNumber: 2, raw: "0 Counterspell", message: "The count has to be at least 1." },
    ]);
  });

  test("returns nothing for empty text", () => {
    expect(parseTextList("")).toStrictEqual({ format: "text", rows: [], errors: [] });
  });
});
