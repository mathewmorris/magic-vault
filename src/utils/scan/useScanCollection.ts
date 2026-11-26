"use client";

/**
 * The "add what you scan to a collection" side of /scan, shared by the
 * title-OCR scanner and the AI scanner: who's signed in, which collection
 * cards go to, adding and undoing, and the session tally.
 */

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collectionLabel } from "~/components/scan/CollectionPicker";
import { api } from "~/utils/api";
import { signInHref } from "~/utils/signInHref";
import {
  pickInitialCollection,
  readLastCollectionId,
  saveLastCollectionId,
} from "~/utils/scan/lastCollection";
import { type AddedCard } from "~/utils/scan/scanSession";

export type ScanAuth = "signed-in" | "signed-out" | "loading";

export function useScanCollection(requestedCollection: string | null) {
  const utils = api.useUtils();
  const { status } = useSession();
  const auth: ScanAuth =
    status === "authenticated" ? "signed-in" : status === "unauthenticated" ? "signed-out" : "loading";

  const collectionsQuery = api.collection.getAll.useQuery(undefined, {
    enabled: auth === "signed-in",
  });
  const collections = useMemo(() => collectionsQuery.data ?? [], [collectionsQuery.data]);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedCard[]>([]);
  const [addedName, setAddedName] = useState<string | null>(null);
  const addCard = api.collection.addCard.useMutation();
  const removeCard = api.collection.removeCard.useMutation();
  // React Query keeps reset stable across renders, unlike the mutation object.
  const resetAddCard = addCard.reset;
  const signInUrl = signInHref(
    requestedCollection ? `/scan?collection=${encodeURIComponent(requestedCollection)}` : "/scan",
  );

  // Once the collections load, start with the one from the URL, then the last
  // one used, then the first. Also covers the current one going away.
  useEffect(() => {
    if (!collectionsQuery.data) return;
    if (collectionId && collections.some((collection) => collection.id === collectionId)) return;
    setCollectionId(
      pickInitialCollection(collections, {
        requested: requestedCollection,
        remembered: readLastCollectionId(),
      }),
    );
  }, [collectionsQuery.data, collections, collectionId, requestedCollection]);

  const collection = collections.find((entry) => entry.id === collectionId) ?? null;
  const collectionName = collection ? collectionLabel(collection.name) : null;

  const chooseCollection = useCallback((id: string) => {
    setCollectionId(id);
    saveLastCollectionId(id);
  }, []);

  /** Forget the last add's "Added X" message and error, e.g. for a new scan. */
  const clearAdded = useCallback(() => {
    setAddedName(null);
    resetAddCard();
  }, [resetAddCard]);

  const add = (match: { id: string; name: string }) => {
    if (!collection) return;
    const target = { collectionId: collection.id, collectionName: collectionName ?? "" };

    addCard.mutate(
      { collectionId: target.collectionId, cardId: match.id },
      {
        onSuccess: () => {
          setAdded((list) => [...list, { cardId: match.id, name: match.name, ...target }]);
          setAddedName(match.name);
          saveLastCollectionId(target.collectionId);
          void utils.collection.cards.invalidate({ collectionId: target.collectionId });
        },
      },
    );
  };

  const undo = () => {
    const last = added[added.length - 1];
    if (!last) return;
    removeCard.mutate(
      { collectionId: last.collectionId, cardId: last.cardId },
      {
        onSuccess: () => {
          setAdded((list) => list.slice(0, -1));
          setAddedName(null);
          void utils.collection.cards.invalidate({ collectionId: last.collectionId });
        },
      },
    );
  };

  return {
    auth,
    signInUrl,
    collectionsQuery,
    collections,
    collectionId,
    chooseCollection,
    collection,
    collectionName,
    added,
    addedName,
    setAddedName,
    clearAdded,
    add,
    undo,
    adding: addCard.isLoading,
    addError: addCard.error?.message ?? null,
    undoing: removeCard.isLoading,
    undoError: removeCard.error?.message ?? null,
  };
}

export type ScanCollection = ReturnType<typeof useScanCollection>;
