import {
  cardFinishes,
  collectionValue,
  defaultFinish,
  finishLabel,
  formatUsd,
  priceFor,
  unpricedLabel,
} from "./price";

const prices = { usd: "0.42", usd_foil: "1.80", usd_etched: null, eur: "0.19", tix: "0.03" };

describe("priceFor", () => {
  test("picks the price for each finish, in cents", () => {
    expect(priceFor(prices, "nonfoil")).toBe(42);
    expect(priceFor(prices, "foil")).toBe(180);
  });

  test("is null when the finish has no price, never another finish's", () => {
    expect(priceFor(prices, "etched")).toBeNull();
    expect(priceFor({ usd_foil: "5.00" }, "nonfoil")).toBeNull();
    expect(priceFor({ usd: "5.00" }, "foil")).toBeNull();
  });

  test("handles whole dollars and big prices without rounding errors", () => {
    expect(priceFor({ usd: "12" }, "nonfoil")).toBe(1200);
    expect(priceFor({ usd: "29999.99" }, "nonfoil")).toBe(2999999);
    expect(priceFor({ usd: "0.07" }, "nonfoil")).toBe(7);
  });

  test("is null for missing or malformed prices", () => {
    expect(priceFor(null, "nonfoil")).toBeNull();
    expect(priceFor(undefined, "nonfoil")).toBeNull();
    expect(priceFor(["1.00"], "nonfoil")).toBeNull();
    expect(priceFor({ usd: 1 }, "nonfoil")).toBeNull();
    expect(priceFor({ usd: "" }, "nonfoil")).toBeNull();
    expect(priceFor({ usd: "-1.00" }, "nonfoil")).toBeNull();
    expect(priceFor({ usd: "abc" }, "nonfoil")).toBeNull();
  });

  test("is null for an unknown finish", () => {
    expect(priceFor(prices, "glossy")).toBeNull();
  });
});

describe("formatUsd", () => {
  test("formats cents as dollars", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(42)).toBe("$0.42");
    expect(formatUsd(123450)).toBe("$1,234.50");
  });
});

describe("collectionValue", () => {
  test("sums price times count and counts entries with no price", () => {
    expect(
      collectionValue([
        { prices, finish: "nonfoil", count: 4 },
        { prices, finish: "foil", count: 1 },
        { prices, finish: "etched", count: 2 },
        { prices: null, finish: "nonfoil", count: 1 },
      ]),
    ).toStrictEqual({ totalCents: 42 * 4 + 180, unpriced: 2 });
  });

  test("is zero for an empty collection", () => {
    expect(collectionValue([])).toStrictEqual({ totalCents: 0, unpriced: 0 });
  });
});

describe("cardFinishes and defaultFinish", () => {
  test("keeps known finishes in order", () => {
    expect(cardFinishes(["nonfoil", "foil", "glossy"])).toStrictEqual(["nonfoil", "foil"]);
    expect(cardFinishes(null)).toStrictEqual([]);
    expect(cardFinishes({ nonfoil: true })).toStrictEqual([]);
  });

  test("defaults to non-foil unless the card has no non-foil printing", () => {
    expect(defaultFinish(["nonfoil", "foil"])).toBe("nonfoil");
    expect(defaultFinish(null)).toBe("nonfoil");
    expect(defaultFinish(["foil"])).toBe("foil");
    expect(defaultFinish(["etched", "foil"])).toBe("etched");
  });
});

describe("labels", () => {
  test("names finishes and pluralizes unpriced cards", () => {
    expect(finishLabel("nonfoil")).toBe("Non-foil");
    expect(finishLabel("etched")).toBe("Etched");
    expect(unpricedLabel(1)).toBe("1 card without a price");
    expect(unpricedLabel(3)).toBe("3 cards without a price");
  });
});
