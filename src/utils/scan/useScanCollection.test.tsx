/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";

import { useScanCollection } from "./useScanCollection";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));

let collectionsData: { id: string; name: string | null }[] | undefined = [];
const addCardMutate = jest.fn<void, [{ collectionId: string; cardId: string }]>();
const createMutateAsync = jest.fn();
const invalidateAll = jest.fn();

jest.mock("~/utils/api", () => ({
  api: {
    useUtils: () => ({
      collection: { getAll: { invalidate: invalidateAll }, cards: { invalidate: jest.fn() } },
    }),
    collection: {
      getAll: { useQuery: () => ({ data: collectionsData, isError: false }) },
      addCard: {
        useMutation: () => ({ mutate: addCardMutate, reset: jest.fn(), isLoading: false, error: null }),
      },
      removeCard: { useMutation: () => ({ mutate: jest.fn(), isLoading: false, error: null }) },
      create: { useMutation: () => ({ mutateAsync: createMutateAsync, isLoading: false, error: null }) },
    },
  },
}));

beforeEach(() => {
  collectionsData = [];
  addCardMutate.mockReset();
  createMutateAsync.mockReset();
  invalidateAll.mockReset();
  window.localStorage.clear();
});

describe("useScanCollection with no collections yet", () => {
  test("offers My collection and makes it on the first add", async () => {
    createMutateAsync.mockResolvedValue({ id: "new-1", name: "My collection" });
    const { result } = renderHook(() => useScanCollection(null));

    expect(result.current.collectionName).toBe("My collection");

    act(() => result.current.add({ id: "bolt", name: "Lightning Bolt" }));

    await waitFor(() => expect(addCardMutate).toHaveBeenCalled());
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync).toHaveBeenCalledWith({ name: "My collection", cards: [] });
    expect(addCardMutate.mock.calls[0]![0]).toEqual({ collectionId: "new-1", cardId: "bolt" });
    expect(invalidateAll).toHaveBeenCalled();
  });

  test("two quick adds make only one collection", async () => {
    let resolve: (value: { id: string; name: string }) => void = () => undefined;
    createMutateAsync.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useScanCollection(null));

    act(() => {
      result.current.add({ id: "bolt", name: "Lightning Bolt" });
      result.current.add({ id: "shock", name: "Shock" });
    });
    await act(() => {
      resolve({ id: "new-1", name: "My collection" });
      return Promise.resolve();
    });

    await waitFor(() => expect(addCardMutate).toHaveBeenCalledTimes(2));
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
  });

  test("uses an existing collection and makes none", async () => {
    collectionsData = [{ id: "burn", name: "Burn" }];
    const { result } = renderHook(() => useScanCollection(null));

    await waitFor(() => expect(result.current.collectionName).toBe("Burn"));
    act(() => result.current.add({ id: "bolt", name: "Lightning Bolt" }));

    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(addCardMutate.mock.calls[0]![0]).toEqual({ collectionId: "burn", cardId: "bolt" });
  });
});
