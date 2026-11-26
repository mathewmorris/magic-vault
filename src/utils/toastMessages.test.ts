import { collectionLabel, mutationErrorMessage } from "./toastMessages";

describe("mutationErrorMessage", () => {
  test("asks to sign in again on UNAUTHORIZED", () => {
    const error = { data: { code: "UNAUTHORIZED" } };

    expect(mutationErrorMessage("create your collection", error)).toBe(
      "Couldn't create your collection. Your session may have expired, so try signing in again.",
    );
  });

  test.each(["FORBIDDEN", "NOT_FOUND"])("explains a %s error", (code) => {
    const error = { data: { code } };

    expect(mutationErrorMessage("delete this collection", error)).toBe(
      "Couldn't delete this collection. It may have been removed, or it isn't yours.",
    );
  });

  test("falls back to try again for other codes", () => {
    const error = { data: { code: "INTERNAL_SERVER_ERROR" } };

    expect(mutationErrorMessage("recover this collection", error)).toBe(
      "Couldn't recover this collection. Please try again.",
    );
  });

  test.each([
    ["a plain Error", new Error("boom")],
    ["null data", { data: null }],
    ["null", null],
    ["a string", "network down"],
    ["a non-string code", { data: { code: 500 } }],
  ])("falls back to try again for %s", (_label, error) => {
    expect(mutationErrorMessage("create your collection", error)).toBe(
      "Couldn't create your collection. Please try again.",
    );
  });

  test("never shows the raw server message", () => {
    const error = {
      message: "Prisma exploded at line 42",
      data: { code: "INTERNAL_SERVER_ERROR" },
    };

    expect(mutationErrorMessage("create your collection", error)).not.toContain(
      "Prisma",
    );
  });
});

describe("collectionLabel", () => {
  test("quotes the name", () => {
    expect(collectionLabel("Elves")).toBe('"Elves"');
  });

  test("trims the name", () => {
    expect(collectionLabel("  Elves  ")).toBe('"Elves"');
  });

  test.each(["", "   ", null, undefined])(
    "falls back when the name is %p",
    (name) => {
      expect(collectionLabel(name)).toBe("your collection");
    },
  );
});
