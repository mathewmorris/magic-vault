import { parseQuery, type SearchTerm } from "./parseQuery";

const terms = (query: string) => parseQuery(query).terms;
const only = (query: string): SearchTerm => {
  const { terms: parsed, warnings } = parseQuery(query);
  expect(warnings).toStrictEqual([]);
  expect(parsed).toHaveLength(1);
  return parsed[0]!;
};

describe("parseQuery", () => {
  describe("names", () => {
    test("an empty query has no terms and no warnings", () => {
      expect(parseQuery("")).toStrictEqual({ terms: [], warnings: [] });
      expect(parseQuery("   \t ")).toStrictEqual({ terms: [], warnings: [] });
    });

    test("bare words are separate name terms", () => {
      expect(terms("lightning  bolt")).toStrictEqual([
        { kind: "name", value: "lightning", negated: false },
        { kind: "name", value: "bolt", negated: false },
      ]);
    });

    test("a quoted phrase is one name term", () => {
      expect(only('"lightning bolt"')).toStrictEqual({
        kind: "name",
        value: "lightning bolt",
        negated: false,
      });
    });

    test("a quoted phrase keeps colons and keyword-looking text", () => {
      expect(only('"Circle of Protection: Red"')).toStrictEqual({
        kind: "name",
        value: "Circle of Protection: Red",
        negated: false,
      });
    });

    test("a leading dash negates", () => {
      expect(terms('-goblin -"lightning bolt"')).toStrictEqual([
        { kind: "name", value: "goblin", negated: true },
        { kind: "name", value: "lightning bolt", negated: true },
      ]);
    });

    test("a dash inside a word is part of the name", () => {
      expect(only("will-o'-the-wisp")).toStrictEqual({
        kind: "name",
        value: "will-o'-the-wisp",
        negated: false,
      });
    });

    test("a lone dash is ignored", () => {
      expect(parseQuery("bolt -")).toStrictEqual({
        terms: [{ kind: "name", value: "bolt", negated: false }],
        warnings: [],
      });
    });

    test("an unclosed quote runs to the end and warns", () => {
      const result = parseQuery('"lightning bolt');
      expect(result.terms).toStrictEqual([
        { kind: "name", value: "lightning bolt", negated: false },
      ]);
      expect(result.warnings).toHaveLength(1);
    });

    test('"or" warns instead of searching for it', () => {
      const result = parseQuery("bolt or shock");
      expect(result.terms.map((term) => term.kind === "name" && term.value)).toStrictEqual([
        "bolt",
        "shock",
      ]);
      expect(result.warnings).toHaveLength(1);
    });

    test('a quoted "or" is a name', () => {
      expect(only('"or"')).toStrictEqual({ kind: "name", value: "or", negated: false });
    });
  });

  describe("colors", () => {
    test.each([
      ["c:r", ">=", ["R"]],
      ["color:ur", ">=", ["U", "R"]],
      ["colors:gw", ">=", ["W", "G"]],
      ["c>=wu", ">=", ["W", "U"]],
      ["c=wu", "=", ["W", "U"]],
      ["c<=wu", "<=", ["W", "U"]],
      ["c<wu", "<", ["W", "U"]],
      ["c>wu", ">", ["W", "U"]],
      ["C:RRG", ">=", ["R", "G"]],
      ["c:red", ">=", ["R"]],
      ["c:Blue", ">=", ["U"]],
    ])("%s", (query, operator, colors) => {
      expect(only(query)).toStrictEqual({
        kind: "color",
        field: "colors",
        operator,
        colors,
        negated: false,
      });
    });

    test("c:c means exactly colorless", () => {
      expect(only("c:c")).toStrictEqual({
        kind: "color",
        field: "colors",
        operator: "=",
        colors: [],
        negated: false,
      });
      expect(only("c:colorless")).toMatchObject({ operator: "=", colors: [] });
    });

    test("c<=c keeps its operator", () => {
      expect(only("c<=c")).toMatchObject({ operator: "<=", colors: [] });
    });

    test("c:m is multicolor", () => {
      expect(only("c:m")).toStrictEqual({ kind: "multicolor", field: "colors", negated: false });
      expect(only("color:multicolor")).toStrictEqual({
        kind: "multicolor",
        field: "colors",
        negated: false,
      });
    });

    test("negated colors", () => {
      expect(only("-c:r")).toMatchObject({ kind: "color", negated: true });
    });

    test.each(["c:x", "c:rx", "c:purple", "id:wq"])("%s warns and is ignored", (query) => {
      const result = parseQuery(query);
      expect(result.terms).toStrictEqual([]);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe("color identity", () => {
    test.each([
      ["id:wu", "<=", ["W", "U"]],
      ["identity:bg", "<=", ["B", "G"]],
      ["ci:r", "<=", ["R"]],
      ["id=wu", "=", ["W", "U"]],
      ["id>=wu", ">=", ["W", "U"]],
      ["id<wu", "<", ["W", "U"]],
      ["id>wu", ">", ["W", "U"]],
    ])("%s", (query, operator, colors) => {
      expect(only(query)).toStrictEqual({
        kind: "color",
        field: "color_identity",
        operator,
        colors,
        negated: false,
      });
    });

    test("id:c is a colorless identity", () => {
      expect(only("id:c")).toStrictEqual({
        kind: "color",
        field: "color_identity",
        operator: "<=",
        colors: [],
        negated: false,
      });
    });

    test("id:m is a multicolor identity", () => {
      expect(only("id:m")).toStrictEqual({
        kind: "multicolor",
        field: "color_identity",
        negated: false,
      });
    });
  });

  describe("type and oracle text", () => {
    test.each([
      ["t:creature", "type", "creature"],
      ["type:Goblin", "type", "Goblin"],
      ['t:"legendary creature"', "type", "legendary creature"],
      ["o:flying", "oracle", "flying"],
      ['oracle:"draw a card"', "oracle", "draw a card"],
      ["o=trample", "oracle", "trample"],
    ])("%s", (query, kind, value) => {
      expect(only(query)).toStrictEqual({ kind, value, negated: false });
    });

    test("negated type", () => {
      expect(only("-t:land")).toStrictEqual({ kind: "type", value: "land", negated: true });
    });

    test("comparisons don't apply to text", () => {
      const result = parseQuery("t>creature");
      expect(result.terms).toStrictEqual([]);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe("mana value", () => {
    test.each([
      ["mv:3", "=", 3],
      ["mv=3", "=", 3],
      ["cmc>2", ">", 2],
      ["manavalue<=4", "<=", 4],
      ["mv>=0", ">=", 0],
      ["mv<1", "<", 1],
      ["cmc:2.5", "=", 2.5],
    ])("%s", (query, operator, value) => {
      expect(only(query)).toStrictEqual({ kind: "manaValue", operator, value, negated: false });
    });

    test.each(["mv:x", "mv:even", "cmc>three"])("%s warns", (query) => {
      const result = parseQuery(query);
      expect(result.terms).toStrictEqual([]);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe("rarity", () => {
    test.each([
      ["r:common", "=", "common"],
      ["rarity:Mythic", "=", "mythic"],
      ["r:u", "=", "uncommon"],
      ["r:m", "=", "mythic"],
      ["r:special", "=", "special"],
      ["r:bonus", "=", "bonus"],
      ["r>=rare", ">=", "rare"],
      ["r<uncommon", "<", "uncommon"],
      ["r>r", ">", "rare"],
    ])("%s", (query, operator, value) => {
      expect(only(query)).toStrictEqual({ kind: "rarity", operator, value, negated: false });
    });

    test("unknown rarity warns", () => {
      const result = parseQuery("r:legendary");
      expect(result.terms).toStrictEqual([]);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe("set", () => {
    test.each(["s:LEA", "set:lea", "e:Lea", "edition:lea", "s=lea"])("%s", (query) => {
      expect(only(query)).toStrictEqual({ kind: "set", value: "lea", negated: false });
    });

    test("negated set", () => {
      expect(only("-s:lea")).toStrictEqual({ kind: "set", value: "lea", negated: true });
    });
  });

  describe("formats", () => {
    test.each([
      ["f:modern", "modern", "legal"],
      ["format:Commander", "commander", "legal"],
      ["legal:vintage", "vintage", "legal"],
      ["f:edh", "commander", "legal"],
      ["banned:legacy", "legacy", "banned"],
      ["restricted:vintage", "vintage", "restricted"],
    ])("%s", (query, format, status) => {
      expect(only(query)).toStrictEqual({ kind: "legality", format, status, negated: false });
    });

    test("negated format", () => {
      expect(only("-f:standard")).toMatchObject({ format: "standard", negated: true });
    });

    test("unknown format warns", () => {
      const result = parseQuery("f:freeform");
      expect(result.terms).toStrictEqual([]);
      expect(result.warnings).toStrictEqual(['Unknown format "freeform" was ignored.']);
    });
  });

  describe("warnings", () => {
    test("unknown keywords warn and the rest still parses", () => {
      expect(parseQuery("pow>3 bolt is:foil")).toStrictEqual({
        terms: [{ kind: "name", value: "bolt", negated: false }],
        warnings: ['Unknown keyword "pow" was ignored.', 'Unknown keyword "is" was ignored.'],
      });
    });

    test("a keyword with no value warns", () => {
      const result = parseQuery("t: bolt");
      expect(result.terms).toStrictEqual([{ kind: "name", value: "bolt", negated: false }]);
      expect(result.warnings).toHaveLength(1);
    });

    test("keywords are case-insensitive", () => {
      expect(only("T:Creature")).toStrictEqual({ kind: "type", value: "Creature", negated: false });
    });
  });

  test("a full query", () => {
    expect(terms('goblin c:r -t:token mv<=2 r>=uncommon s:m21 f:modern o:"haste"')).toStrictEqual([
      { kind: "name", value: "goblin", negated: false },
      { kind: "color", field: "colors", operator: ">=", colors: ["R"], negated: false },
      { kind: "type", value: "token", negated: true },
      { kind: "manaValue", operator: "<=", value: 2, negated: false },
      { kind: "rarity", operator: ">=", value: "uncommon", negated: false },
      { kind: "set", value: "m21", negated: false },
      { kind: "legality", format: "modern", status: "legal", negated: false },
      { kind: "oracle", value: "haste", negated: false },
    ]);
  });
});
