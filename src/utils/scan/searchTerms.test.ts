import { buildSearchTerms } from "./searchTerms";

describe("buildSearchTerms", () => {
  test("starts with the full name, then the longest words", () => {
    expect(buildSearchTerms("Jace, the Mind Sculptor")).toEqual([
      "Jace, the Mind Sculptor",
      "Sculptor",
      "Jace",
      "Mind",
    ]);
  });

  test("skips short words", () => {
    expect(buildSearchTerms("Wrath of God")).toEqual(["Wrath of God", "Wrath"]);
  });

  test("caps the number of terms", () => {
    expect(buildSearchTerms("Avacyn Angel Hope Saint Lightbringer", { maxTerms: 2 })).toEqual([
      "Avacyn Angel Hope Saint Lightbringer",
      "Lightbringer",
    ]);
  });

  test("doesn't repeat a single-word name", () => {
    expect(buildSearchTerms("Tarmogoyf")).toEqual(["Tarmogoyf"]);
  });

  test("drops duplicate words regardless of case", () => {
    expect(buildSearchTerms("Bolt bolt BOLT Strike")).toEqual(["Bolt bolt BOLT Strike", "Strike", "Bolt"]);
  });

  test("tidies whitespace in the full name", () => {
    expect(buildSearchTerms("  Serra   Angel ")).toEqual(["Serra Angel", "Serra", "Angel"]);
  });

  test("strips punctuation off the words it searches on", () => {
    expect(buildSearchTerms("Ajani's Pridemate")).toEqual(["Ajani's Pridemate", "Pridemate", "Ajani's"]);
  });

  test("returns nothing for text too short to search", () => {
    expect(buildSearchTerms("")).toEqual([]);
    expect(buildSearchTerms(" a ")).toEqual([]);
  });
});
