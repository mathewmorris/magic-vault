import { appendTerms, EMPTY_FILTERS, filterTerms, type SearchFilters } from "./filterTerms";
import { parseQuery } from "./parseQuery";

const withFilters = (overrides: Partial<SearchFilters>) => filterTerms({ ...EMPTY_FILTERS, ...overrides });

describe("filterTerms", () => {
  test("no filters, no terms", () => {
    expect(filterTerms(EMPTY_FILTERS)).toStrictEqual([]);
  });

  test("colors in WUBRG order with the chosen mode", () => {
    expect(withFilters({ colors: ["G", "W"] })).toStrictEqual(["c:wg"]);
    expect(withFilters({ colors: ["R", "U"], colorMode: "exactly" })).toStrictEqual(["c=ur"]);
    expect(withFilters({ colors: ["B"], colorMode: "atMost" })).toStrictEqual(["c<=b"]);
  });

  test("color identity", () => {
    expect(withFilters({ identity: ["U", "B", "G"] })).toStrictEqual(["id:ubg"]);
  });

  test("type is quoted when it has spaces", () => {
    expect(withFilters({ type: "goblin" })).toStrictEqual(["t:goblin"]);
    expect(withFilters({ type: '  legendary   "creature" ' })).toStrictEqual([
      't:"legendary creature"',
    ]);
    expect(withFilters({ type: "   " })).toStrictEqual([]);
  });

  test("rarity, set and format", () => {
    expect(withFilters({ rarity: "mythic", set: " LEA ", format: "vintage" })).toStrictEqual([
      "r:mythic",
      "s:lea",
      "f:vintage",
    ]);
  });

  test("mana value range", () => {
    expect(withFilters({ mvMin: "2", mvMax: "4" })).toStrictEqual(["mv>=2", "mv<=4"]);
    expect(withFilters({ mvMin: "3" })).toStrictEqual(["mv>=3"]);
    expect(withFilters({ mvMax: "1" })).toStrictEqual(["mv<=1"]);
    expect(withFilters({ mvMin: "3", mvMax: "3" })).toStrictEqual(["mv=3"]);
    expect(withFilters({ mvMin: "x", mvMax: "-1" })).toStrictEqual([]);
  });

  test("every term it writes parses back without warnings", () => {
    const terms = withFilters({
      colors: ["W", "U"],
      colorMode: "exactly",
      identity: ["W", "U", "B"],
      type: "legendary creature",
      rarity: "rare",
      set: "dmu",
      format: "commander",
      mvMin: "1",
      mvMax: "5",
    });
    const parsed = parseQuery(terms.join(" "));
    expect(parsed.warnings).toStrictEqual([]);
    expect(parsed.terms).toHaveLength(terms.length);
  });
});

describe("appendTerms", () => {
  test("adds terms after the query", () => {
    expect(appendTerms(" goblin ", ["c:r", "mv<=2"])).toBe("goblin c:r mv<=2");
  });

  test("works with an empty query or no terms", () => {
    expect(appendTerms("", ["c:r"])).toBe("c:r");
    expect(appendTerms("goblin", [])).toBe("goblin");
  });
});
