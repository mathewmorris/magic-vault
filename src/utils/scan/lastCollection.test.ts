import {
  LAST_COLLECTION_KEY,
  pickInitialCollection,
  readLastCollectionId,
  saveLastCollectionId,
} from "./lastCollection";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("readLastCollectionId / saveLastCollectionId", () => {
  test("round-trips through storage", () => {
    const storage = memoryStorage();
    saveLastCollectionId("abc", storage);
    expect(storage.data.get(LAST_COLLECTION_KEY)).toBe("abc");
    expect(readLastCollectionId(storage)).toBe("abc");
  });

  test("returns null when nothing is saved", () => {
    expect(readLastCollectionId(memoryStorage())).toBeNull();
  });

  test("swallows storage errors", () => {
    expect(readLastCollectionId(throwingStorage)).toBeNull();
    expect(() => saveLastCollectionId("abc", throwingStorage)).not.toThrow();
  });

  test("copes with no storage at all", () => {
    expect(readLastCollectionId(null)).toBeNull();
    expect(() => saveLastCollectionId("abc", null)).not.toThrow();
  });
});

describe("pickInitialCollection", () => {
  const collections = [{ id: "a" }, { id: "b" }, { id: "c" }];

  test("prefers the collection from the URL", () => {
    expect(pickInitialCollection(collections, { requested: "c", remembered: "b" })).toBe("c");
  });

  test("falls back to the remembered one", () => {
    expect(pickInitialCollection(collections, { requested: null, remembered: "b" })).toBe("b");
  });

  test("skips ids that aren't in the list", () => {
    expect(pickInitialCollection(collections, { requested: "gone", remembered: "b" })).toBe("b");
    expect(pickInitialCollection(collections, { requested: "gone", remembered: "also-gone" })).toBe("a");
  });

  test("uses the first collection when there's nothing else", () => {
    expect(pickInitialCollection(collections, {})).toBe("a");
  });

  test("returns null with no collections", () => {
    expect(pickInitialCollection([], { requested: "a", remembered: "b" })).toBeNull();
  });
});
