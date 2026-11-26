import { isSearchSort, parsePageParam, searchHref } from "./searchOptions";

describe("isSearchSort", () => {
  test("accepts the known sorts only", () => {
    expect(isSearchSort("mv")).toBe(true);
    expect(isSearchSort("price")).toBe(false);
    expect(isSearchSort(null)).toBe(false);
  });
});

describe("parsePageParam", () => {
  test.each([
    [null, 1],
    ["", 1],
    ["3", 3],
    ["0", 1],
    ["-2", 1],
    ["1.5", 1],
    ["abc", 1],
    ["999999", 1000],
  ])("%j is page %d", (value, page) => {
    expect(parsePageParam(value)).toBe(page);
  });
});

describe("searchHref", () => {
  test("leaves out defaults", () => {
    expect(searchHref({ q: "" })).toBe("/search");
    expect(searchHref({ q: "bolt", sort: "name", page: 1 })).toBe("/search?q=bolt");
  });

  test("encodes the query, sort and page", () => {
    expect(searchHref({ q: ' goblin c>=r o:"haste" ', sort: "mv", page: 2 })).toBe(
      "/search?q=goblin+c%3E%3Dr+o%3A%22haste%22&sort=mv&page=2",
    );
  });
});
