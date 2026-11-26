"use client";

import { useState } from "react";
import Button from "~/components/Button";
import { formatMissingList, type DeckOwnership } from "~/utils/deck/ownership";

type CopyState = "idle" | "copied" | "failed";

export default function MissingCards({ ownership }: { ownership: DeckOwnership }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const { missing, needed } = ownership.totals;
  const list = formatMissingList(ownership.cards);

  async function copy() {
    try {
      await navigator.clipboard.writeText(list);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  if (needed === 0) {
    return null;
  }

  if (missing === 0) {
    return <p className="text-green-400">You own every card in this deck.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p>
        Missing {missing} {missing === 1 ? "card" : "cards"} of {needed}.
      </p>
      <textarea
        aria-label="Missing cards"
        className="h-40 w-full max-w-md rounded p-2 font-mono text-sm text-black"
        readOnly
        value={list}
        onFocus={(e) => e.target.select()}
      />
      <div className="flex items-center gap-4">
        <Button type="button" onClick={() => void copy()}>
          Copy missing list
        </Button>
        {copyState === "copied" && <span role="status">Copied.</span>}
        {copyState === "failed" && (
          <span role="alert" className="text-red-500">
            Couldn&apos;t copy. Select the list and copy it by hand.
          </span>
        )}
      </div>
    </div>
  );
}
