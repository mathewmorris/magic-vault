"use client";

import Image from "next/image";
import Link from "next/link";
import Button from "~/components/Button";

export interface MatchOption {
  id: string;
  name: string;
  score: number;
  imageUrl: string | null;
  /** Which printing this is, e.g. "M21 #157 · EN". */
  detail?: string;
}

interface ScanMatchesProps {
  query: string;
  /** Replaces the "Best matches for ..." heading. */
  heading?: string;
  matches: MatchOption[];
  selectedId: string | null;
  onSelect: (cardId: string) => void;
  /** "loading" while the session is still being checked. */
  auth: "signed-in" | "signed-out" | "loading";
  /** Where the sign-in prompt links to. */
  signInUrl: string;
  /** The collection cards will be added to, or null if there isn't one. */
  collectionName: string | null;
  onAdd: () => void;
  adding?: boolean;
  /** Set once the selected card was added, to offer the next scan. */
  addedName?: string | null;
  onScanNext: () => void;
  error?: string | null;
}

/**
 * The best matches for a scan, best guess first and already selected. Tapping
 * another match selects it instead. Signed-in users get an Add button for the
 * selected card; signed-out users get a prompt to sign in.
 */
export default function ScanMatches({
  query,
  heading,
  matches,
  selectedId,
  onSelect,
  auth,
  signInUrl,
  collectionName,
  onAdd,
  adding = false,
  addedName = null,
  onScanNext,
  error = null,
}: ScanMatchesProps) {
  const selected = matches.find((match) => match.id === selectedId) ?? null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{heading ?? <>Best matches for &quot;{query}&quot;</>}</h2>
        <p className="text-sm text-gray-400">Not the right one? Tap the card you scanned.</p>
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {matches.map((match) => {
          const isSelected = match.id === selectedId;
          return (
            <li key={match.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(match.id)}
                className={`flex w-full flex-col items-center gap-1 rounded-lg border-2 p-2 text-center ${
                  isSelected ? "border-pink-500 bg-pink-500/10" : "border-transparent"
                }`}
              >
                {match.imageUrl ? (
                  <Image
                    src={match.imageUrl}
                    width={146}
                    height={204}
                    alt={match.name}
                    className="rounded-lg"
                  />
                ) : (
                  <div className="flex h-[204px] w-[146px] items-center justify-center rounded-lg bg-gray-800 text-sm">
                    No image
                  </div>
                )}
                <span className="font-semibold">{match.name}</span>
                {match.detail && <span className="text-xs text-gray-300">{match.detail}</span>}
                <span className="text-xs text-gray-400">{Math.round(match.score * 100)}% match</span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <Link href={`/card/${selected.id}`} className="text-sm underline">
          View {selected.name}&apos;s card page
        </Link>
      )}

      {auth === "signed-out" && (
        <p className="rounded-lg border border-purple-700 p-4">
          <Link href={signInUrl} className="font-semibold underline">
            Sign in
          </Link>{" "}
          to add scanned cards to your collections.
        </p>
      )}

      {auth === "signed-in" && (
        <div className="flex flex-col items-start gap-3">
          {addedName ? (
            <>
              <p role="status" className="text-green-400">
                Added {addedName}
                {collectionName ? ` to ${collectionName}` : ""}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onScanNext}>
                  Scan next card
                </Button>
                <Button type="button" onClick={onAdd} disabled={adding}>
                  {adding ? "Adding..." : "Add another copy"}
                </Button>
              </div>
            </>
          ) : collectionName ? (
            <Button type="button" onClick={onAdd} disabled={!selected || adding}>
              {adding
                ? "Adding..."
                : selected
                  ? `Add ${selected.name} to ${collectionName}`
                  : "Pick a card to add"}
            </Button>
          ) : (
            <p className="text-sm text-yellow-300">Pick or create a collection to add this card.</p>
          )}
          {error && (
            <p role="alert" className="text-red-400">
              Couldn&apos;t add the card: {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
