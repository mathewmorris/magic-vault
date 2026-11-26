import { parseSymbols, splitOracleText, splitSymbols, symbolImageUrl } from "./manaSymbols";

describe("parseSymbols", () => {
  test("splits a mana cost into its symbols", () => {
    expect(parseSymbols("{2}{W/U}{T}")).toEqual(["{2}", "{W/U}", "{T}"]);
  });

  test("handles big numbers, hybrid, phyrexian and X", () => {
    expect(parseSymbols("{10}{2/W}{G/U/P}{X}{X}")).toEqual(["{10}", "{2/W}", "{G/U/P}", "{X}", "{X}"]);
  });

  test("ignores the text between faces of a split card", () => {
    expect(parseSymbols("{1}{R} // {2}{U}")).toEqual(["{1}", "{R}", "{2}", "{U}"]);
  });

  test("returns nothing for an empty cost", () => {
    expect(parseSymbols("")).toEqual([]);
  });
});

describe("splitSymbols", () => {
  test("keeps the text around symbols in order", () => {
    expect(splitSymbols("{1}{R} // {2}{U}")).toEqual([
      { type: "symbol", value: "{1}" },
      { type: "symbol", value: "{R}" },
      { type: "text", value: " // " },
      { type: "symbol", value: "{2}" },
      { type: "symbol", value: "{U}" },
    ]);
  });

  test("leaves braces that aren't symbols as text", () => {
    expect(splitSymbols("Say {hello world}")).toEqual([{ type: "text", value: "Say {hello world}" }]);
  });
});

describe("symbolImageUrl", () => {
  test.each([
    ["{W/U}", "WU"],
    ["{2/W}", "2W"],
    ["{T}", "T"],
    ["{10}", "10"],
    ["{g/u/p}", "GUP"],
  ])("%s -> %s.svg", (token, name) => {
    expect(symbolImageUrl(token)).toBe(`https://svgs.scryfall.io/card-symbols/${name}.svg`);
  });
});

describe("splitOracleText", () => {
  test("keeps line breaks as separate lines with symbols inline", () => {
    expect(splitOracleText("Flying\n{T}: Add {G}.")).toEqual([
      [{ type: "text", value: "Flying" }],
      [
        { type: "symbol", value: "{T}" },
        { type: "text", value: ": Add " },
        { type: "symbol", value: "{G}" },
        { type: "text", value: "." },
      ],
    ]);
  });

  test("keeps an empty line as an empty line", () => {
    expect(splitOracleText("A\n\nB")).toEqual([
      [{ type: "text", value: "A" }],
      [],
      [{ type: "text", value: "B" }],
    ]);
  });
});
