/**
 * Which collection the scanner adds cards to. The last one used is remembered
 * in localStorage so the next scanning session starts where the last one left
 * off. Storage can be missing or throw (private windows, blocked site data),
 * so every read and write is wrapped and failing quietly is fine.
 */

export const LAST_COLLECTION_KEY = "magic-vault:scan:last-collection";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLastCollectionId(storage: StorageLike | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(LAST_COLLECTION_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveLastCollectionId(
  collectionId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(LAST_COLLECTION_KEY, collectionId);
  } catch {
    // Not being able to remember the choice only costs a tap next time.
  }
}

/**
 * Pick the collection to start with: the one in the URL (the collection
 * page's "Scan cards" link), then the last one used, then the first one.
 * Ids that aren't in the user's list (deleted, someone else's, stale) are
 * skipped. Returns null when the user has no collections.
 */
export function pickInitialCollection(
  collections: readonly { id: string }[],
  { requested, remembered }: { requested?: string | null; remembered?: string | null },
): string | null {
  const ids = new Set(collections.map((collection) => collection.id));
  if (requested && ids.has(requested)) return requested;
  if (remembered && ids.has(remembered)) return remembered;
  return collections[0]?.id ?? null;
}
