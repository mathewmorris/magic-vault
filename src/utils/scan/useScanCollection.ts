"use client";

/**
 * The "add what you scan to a collection" side of /scan, shared by the
 * title-OCR scanner and the AI scanner: who's signed in, which collection
 * cards go to, adding and undoing, and the session tally.
 */

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectionLabel, DEFAULT_COLLECTION_NAME } from "~/components/scan/CollectionPicker";
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
  const createCollection = api.collection.create.useMutation();
  // The default collection being made, so two quick adds don't make two.
  const creatingRef = useRef<Promise<{ id: string; name: string | null }> | null>(null);
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
  // No collections yet: the first add makes one, so scanning needs no setup.
  const needsDefault = auth === "signed-in" && collectionsQuery.data !== undefined && collections.length === 0;
  const collectionName = collection
    ? collectionLabel(collection.name)
    : needsDefault
      ? DEFAULT_COLLECTION_NAME
      : null;

  const chooseCollection = useCallback((id: string) => {
    setCollectionId(id);
    saveLastCollectionId(id);
  }, []);

  /** Forget the last add's "Added X" message and error, e.g. for a new scan. */
  const clearAdded = useCallback(() => {
    setAddedName(null);
    resetAddCard();
  }, [resetAddCard]);

  const makeDefaultCollection = () => {
    creatingRef.current ??= createCollection
      .mutateAsync({ name: DEFAULT_COLLECTION_NAME, cards: [] })
      .then((created) => {
        setCollectionId(created.id);
        saveLastCollectionId(created.id);
        void utils.collection.getAll.invalidate();
        return created;
      })
      .finally(() => {
        creatingRef.current = null;
      });
    return creatingRef.current;
  };

  const add = (match: { id: string; name: string }) => {
    if (!collection) {
      if (!needsDefault) return;
      void makeDefaultCollection()
        .then((created) => addTo(match, { collectionId: created.id, collectionName: collectionLabel(created.name) }))
        .catch(() => undefined); // createCollection.error shows it
      return;
    }
    addTo(match, { collectionId: collection.id, collectionName: collectionName ?? "" });
  };

  const addTo = (
    match: { id: string; name: string },
    target: { collectionId: string; collectionName: string },
  ) => {
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
    adding: addCard.isLoading || createCollection.isLoading,
    addError: addCard.error?.message ?? createCollection.error?.message ?? null,
    undoing: removeCard.isLoading,
    undoError: removeCard.error?.message ?? null,
  };
}

export type ScanCollection = ReturnType<typeof useScanCollection>;
