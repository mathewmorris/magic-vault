"use client";

import { useCallback, useEffect } from "react";
import { api, type RouterOutputs } from "~/utils/api";

type ListedCollection = RouterOutputs["collection"]["getAll"][number];

/**
 * How long a collection's data counts as fresh. Long enough that data loaded
 * ahead of a click isn't fetched again when the page opens; the collection
 * page invalidates it whenever something there changes it.
 */
export const COLLECTION_STALE_TIME = 30_000;

/** How many collections in a list get their cards loaded before any click. */
export const PREFETCH_LIMIT = 5;

/**
 * Loads a collection page's data ahead of the click, so opening a collection
 * doesn't wait on the server. Returns a function for hover and focus; the
 * first PREFETCH_LIMIT collections given are loaded as soon as they show.
 */
export function usePrefetchCollection(collections: ListedCollection[] | undefined) {
  const utils = api.useUtils();

  const prefetch = useCallback(
    (collection: ListedCollection) => {
      // The list already has the collection row byId would return, so the
      // page can show its name and buttons straight away.
      if (!utils.collection.byId.getData({ id: collection.id })) {
        utils.collection.byId.setData({ id: collection.id }, collection);
      }
      void utils.collection.cards.prefetch(
        { collectionId: collection.id },
        { staleTime: COLLECTION_STALE_TIME },
      );
    },
    [utils],
  );

  useEffect(() => {
    collections?.slice(0, PREFETCH_LIMIT).forEach(prefetch);
  }, [collections, prefetch]);

  return prefetch;
}
