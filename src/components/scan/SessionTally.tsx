"use client";

import Button from "~/components/Button";
import { summarizeSession, type AddedCard } from "~/utils/scan/scanSession";

interface SessionTallyProps {
  added: AddedCard[];
  onUndo: () => void;
  undoing?: boolean;
}

/** How many cards were added this session, and which. */
export default function SessionTally({ added, onUndo, undoing = false }: SessionTallyProps) {
  if (added.length === 0) return null;

  const rows = summarizeSession(added);
  const last = added[added.length - 1]!;

  return (
    <section aria-label="Added this session" className="flex flex-col gap-2 rounded-lg border border-gray-700 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          Added this session: {added.length} {added.length === 1 ? "card" : "cards"}
        </h2>
        <Button type="button" onClick={onUndo} disabled={undoing}>
          {undoing ? "Undoing..." : `Undo ${last.name}`}
        </Button>
      </div>
      <ul className="text-sm">
        {rows.map((row) => (
          <li key={`${row.collectionId}:${row.cardId}`}>
            {row.count}x {row.name} <span className="text-gray-400">in {row.collectionName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
