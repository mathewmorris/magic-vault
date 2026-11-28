/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { type Collection } from "@prisma/client";

const getData = jest.fn();
const setData = jest.fn();
const prefetch = jest.fn();

jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      collection: {
        byId: { getData, setData },
        cards: { prefetch },
      },
    }),
  },
}));

import { COLLECTION_STALE_TIME, PREFETCH_LIMIT, usePrefetchCollection } from "./usePrefetchCollection";

const collection = (id: string): Collection => ({
  id,
  name: `Collection ${id}`,
  cards: [],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  userId: "me",
  deletedAt: null,
});

describe("usePrefetchCollection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getData.mockReturnValue(undefined);
  });

  test("loads the first few collections' cards as soon as the list shows", () => {
    const list = Array.from({ length: PREFETCH_LIMIT + 2 }, (_, i) => collection(`c${i}`));

    renderHook(() => usePrefetchCollection(list));

    expect(prefetch).toHaveBeenCalledTimes(PREFETCH_LIMIT);
    expect(prefetch).toHaveBeenCalledWith({ collectionId: "c0" }, { staleTime: COLLECTION_STALE_TIME });
    expect(prefetch).not.toHaveBeenCalledWith({ collectionId: `c${PREFETCH_LIMIT}` }, expect.anything());
  });

  test("seeds the collection from the list row so the page has its name right away", () => {
    const row = collection("c0");

    renderHook(() => usePrefetchCollection([row]));

    expect(setData).toHaveBeenCalledWith({ id: "c0" }, row);
  });

  test("doesn't overwrite a collection the page already has", () => {
    getData.mockReturnValue(collection("c0"));

    renderHook(() => usePrefetchCollection([collection("c0")]));

    expect(setData).not.toHaveBeenCalled();
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  test("the returned function loads a collection further down on hover", () => {
    const { result } = renderHook(() => usePrefetchCollection(undefined));

    result.current(collection("later"));

    expect(prefetch).toHaveBeenCalledWith({ collectionId: "later" }, { staleTime: COLLECTION_STALE_TIME });
  });
});
