"use client";

import Link from "next/link";

/** What a first scan's collection is called when the user has none yet. */
export const DEFAULT_COLLECTION_NAME = "My collection";

export interface PickerCollection {
  id: string;
  name: string | null;
}

interface CollectionPickerProps {
  collections: PickerCollection[];
  value: string | null;
  onChange: (collectionId: string) => void;
  disabled?: boolean;
}

/** A collection's name for display, with a stand-in for a blank one. */
export function collectionLabel(name: string | null): string {
  return name?.trim() ? name : "Untitled collection";
}

/** Choose which collection scanned cards go into. */
export default function CollectionPicker({
  collections,
  value,
  onChange,
  disabled = false,
}: CollectionPickerProps) {
  if (collections.length === 0) {
    return (
      <p className="text-sm">
        Cards you scan go into a new collection called {DEFAULT_COLLECTION_NAME}. You can rename it later or{" "}
        <Link href="/collection/create" className="underline">
          make a different one
        </Link>
        .
      </p>
    );
  }

  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">Add cards to</span>
      <select
        className="rounded px-2 py-1 text-black"
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collectionLabel(collection.name)}
          </option>
        ))}
      </select>
    </label>
  );
}
