"use client";

import Link from "next/link";
import CollectionPicker from "~/components/scan/CollectionPicker";
import SessionTally from "~/components/scan/SessionTally";
import type { ScanCollection } from "~/utils/scan/useScanCollection";

/**
 * The sign-in prompt, collection picker and session tally shown above the
 * camera on /scan. Renders siblings so they sit in the page's own layout.
 */
export default function ScanCollectionControls({ scan }: { scan: ScanCollection }) {
  const { auth, signInUrl, collectionsQuery, collections, collectionId } = scan;

  return (
    <>
      {auth === "signed-out" && (
        <p className="text-sm">
          <Link href={signInUrl} className="font-semibold underline">
            Sign in
          </Link>{" "}
          to add the cards you scan to a collection.
        </p>
      )}

      {auth === "signed-in" &&
        (collectionsQuery.isError ? (
          <p className="text-sm text-red-400">
            Couldn&apos;t load your collections.{" "}
            <button type="button" className="underline" onClick={() => void collectionsQuery.refetch()}>
              Try again
            </button>
          </p>
        ) : collectionsQuery.data ? (
          <CollectionPicker
            collections={collections}
            value={collectionId}
            onChange={scan.chooseCollection}
            disabled={scan.adding}
          />
        ) : (
          <p className="text-sm text-gray-400">Loading your collections...</p>
        ))}

      <SessionTally added={scan.added} onUndo={scan.undo} undoing={scan.undoing} />
      {scan.undoError && (
        <p role="alert" className="text-red-400">
          Couldn&apos;t undo: {scan.undoError}
        </p>
      )}
    </>
  );
}
