import { mergeImportEntries, type ImportEntry } from "./entries";

const entry = (overrides: Partial<ImportEntry>): ImportEntry => ({
  cardId: "bolt",
  finish: "nonfoil",
  condition: "NM",
  language: "en",
  quantity: 1,
  ...overrides,
});

describe("mergeImportEntries", () => {
  test("adds up rows for the same card and finish, keeping first-seen order", () => {
    expect(
      mergeImportEntries([
        entry({ cardId: "bolt", quantity: 2 }),
        entry({ cardId: "opt" }),
        entry({ cardId: "bolt", quantity: 3, condition: "LP", language: "ja" }),
        entry({ cardId: "bolt", finish: "foil" }),
      ]),
    ).toStrictEqual([
      entry({ cardId: "bolt", quantity: 5 }),
      entry({ cardId: "opt" }),
      entry({ cardId: "bolt", finish: "foil" }),
    ]);
  });

  test("doesn't change the rows it was given", () => {
    const first = entry({ quantity: 2 });
    mergeImportEntries([first, entry({ quantity: 1 })]);

    expect(first.quantity).toBe(2);
  });
});
