import { summarizeSession, type AddedCard } from "./scanSession";

const bolt = { cardId: "bolt", name: "Lightning Bolt" };
const goyf = { cardId: "goyf", name: "Tarmogoyf" };
const burn = { collectionId: "burn", collectionName: "Burn" };
const binder = { collectionId: "binder", collectionName: "Binder" };

describe("summarizeSession", () => {
  test("is empty with nothing added", () => {
    expect(summarizeSession([])).toEqual([]);
  });

  test("groups repeats of a card in the same collection", () => {
    const added: AddedCard[] = [
      { ...bolt, ...burn },
      { ...goyf, ...burn },
      { ...bolt, ...burn },
    ];

    expect(summarizeSession(added)).toEqual([
      { ...bolt, ...burn, count: 2 },
      { ...goyf, ...burn, count: 1 },
    ]);
  });

  test("keeps the same card in different collections apart", () => {
    const added: AddedCard[] = [
      { ...bolt, ...burn },
      { ...bolt, ...binder },
    ];

    expect(summarizeSession(added)).toEqual([
      { ...bolt, ...binder, count: 1 },
      { ...bolt, ...burn, count: 1 },
    ]);
  });

  test("lists the most recently added card first", () => {
    const added: AddedCard[] = [
      { ...goyf, ...burn },
      { ...bolt, ...burn },
    ];

    expect(summarizeSession(added).map((row) => row.cardId)).toEqual(["bolt", "goyf"]);
  });
});
