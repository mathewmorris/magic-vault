"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Button from "~/components/Button";
import SearchBar from "~/components/SearchBar";
import Spinner from "~/components/Spinner";
import DeckCardList from "~/components/deck/DeckCardList";
import DeckName, { DeckFormatSelect } from "~/components/deck/DeckName";
import DeckProblems from "~/components/deck/DeckProblems";
import MissingCards from "~/components/deck/MissingCards";
import { api } from "~/utils/api";
import {
  checkDeck,
  toDeckCheckCard,
  type DeckBoard,
  type DeckFormat,
} from "~/utils/deck/checkDeck";
import { type OwnershipEntry } from "~/utils/deck/ownership";

const NO_RETRY_CODES = ["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "BAD_REQUEST"];

// Retrying won't fix a missing or someone else's deck, so show that right
// away instead of after a few slow retries. Network blips still retry.
function shouldRetry(failureCount: number, error: { data?: { code?: string } | null }) {
  return !NO_RETRY_CODES.includes(error.data?.code ?? "") && failureCount < 3;
}

const ADD_TO_OPTIONS: { board: DeckBoard; label: string }[] = [
  { board: "main", label: "Main deck" },
  { board: "side", label: "Sideboard" },
  { board: "commander", label: "Commander" },
];

export default function DeckPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const utils = api.useUtils();
  const [addTo, setAddTo] = useState<DeckBoard>("main");

  // Both queries are keyed on the id from the URL, so they start together.
  const deckQuery = api.deck.getById.useQuery({ id }, { enabled: id !== "", retry: shouldRetry });
  const ownershipQuery = api.deck.ownership.useQuery(
    { deckId: id },
    { enabled: id !== "", retry: shouldRetry },
  );

  function refreshDeck() {
    return Promise.all([
      utils.deck.getById.invalidate({ id }),
      utils.deck.ownership.invalidate({ deckId: id }),
      utils.deck.getAll.invalidate(),
    ]);
  }

  // Shows a count change straight away, then lets the refetch confirm it.
  async function changeCachedCount(cardId: string, board: DeckBoard, change: number) {
    await utils.deck.getById.cancel({ id });
    const previous = utils.deck.getById.getData({ id });

    utils.deck.getById.setData({ id }, (deck) =>
      deck && {
        ...deck,
        cards: deck.cards.flatMap((entry) => {
          if (entry.card.id !== cardId || entry.board !== board) return [entry];
          const count = entry.count + change;
          return count > 0 ? [{ ...entry, count }] : [];
        }),
      },
    );

    return { previous };
  }

  function rollback(context: { previous?: ReturnType<typeof utils.deck.getById.getData> } | undefined) {
    if (context?.previous) {
      utils.deck.getById.setData({ id }, context.previous);
    }
  }

  const rename = api.deck.rename.useMutation({
    onSuccess: (updated) => {
      utils.deck.getById.setData({ id }, (deck) => deck && { ...deck, ...updated });
      void utils.deck.getAll.invalidate();
    },
  });

  const setFormat = api.deck.setFormat.useMutation({
    onSuccess: (updated) => {
      utils.deck.getById.setData({ id }, (deck) => deck && { ...deck, ...updated });
      void utils.deck.getAll.invalidate();
    },
  });

  const addCard = api.deck.addCard.useMutation({
    onMutate: ({ cardId, board }) => changeCachedCount(cardId, board ?? "main", 1),
    onError: (_error, _input, context) => rollback(context),
    onSettled: () => refreshDeck(),
  });

  const removeCard = api.deck.removeCard.useMutation({
    onMutate: ({ cardId, board }) => changeCachedCount(cardId, board ?? "main", -1),
    onError: (_error, _input, context) => rollback(context),
    onSettled: () => refreshDeck(),
  });

  const softDelete = api.deck.softDelete.useMutation({
    onSuccess: async () => {
      await utils.deck.getAll.invalidate();
      router.push("/decks");
    },
  });

  const deck = deckQuery.data;

  const problems = useMemo(
    () =>
      deck
        ? checkDeck(
            deck.format,
            deck.cards.map(({ card, count, board }) => toDeckCheckCard(card, count, board)),
          )
        : [],
    [deck],
  );

  const ownershipByCardId = useMemo(() => {
    const byCardId = new Map<string, OwnershipEntry>();
    for (const entry of ownershipQuery.data?.cards ?? []) {
      for (const cardId of entry.cardIds) byCardId.set(cardId, entry);
    }
    return byCardId;
  }, [ownershipQuery.data]);

  if (deckQuery.isError) {
    const notFound = deckQuery.error?.data?.code === "NOT_FOUND";

    return (
      <div className="flex flex-col items-start gap-4 p-4">
        <p>{notFound ? "Deck not found." : "Couldn't load this deck."}</p>
        {!notFound && (
          <Button type="button" onClick={() => void deckQuery.refetch()}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (!deck) {
    return <Spinner label="Loading deck" />;
  }

  const isDeleted = deck.deletedAt != null;
  // Rename errors show next to the name field, so they aren't repeated here.
  const actionError = addCard.error ?? removeCard.error ?? setFormat.error ?? softDelete.error;

  return (
    <div className="flex flex-col gap-8 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <DeckName
          name={deck.name}
          editable={!isDeleted}
          onSave={(name) => rename.mutateAsync({ id: deck.id, name })}
        />
        <div className="flex flex-wrap items-center gap-4">
          <DeckFormatSelect
            value={deck.format}
            disabled={isDeleted || setFormat.isLoading}
            onChange={(format: DeckFormat) => setFormat.mutate({ id: deck.id, format })}
          />
          {!isDeleted && (
            <Button
              type="button"
              disabled={softDelete.isLoading}
              onClick={() => softDelete.mutate({ deckId: deck.id })}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {isDeleted && <p>This deck has been deleted.</p>}

      {actionError && (
        <p role="alert" className="text-red-500">
          Something went wrong: {actionError.message}
        </p>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="text-xl">Problems</h2>
          <DeckProblems problems={problems} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xl">Your collection</h2>
          {ownershipQuery.isError ? (
            <div className="flex items-center gap-4">
              <p>Couldn&apos;t check which cards you own.</p>
              <Button type="button" onClick={() => void ownershipQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : ownershipQuery.data ? (
            <MissingCards ownership={ownershipQuery.data} />
          ) : (
            <Spinner label="Checking which cards you own" />
          )}
        </section>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl">Cards</h2>
        <DeckCardList
          cards={deck.cards}
          ownership={ownershipByCardId}
          editable={!isDeleted}
          onIncrement={(cardId, board) => addCard.mutate({ deckId: deck.id, cardId, board })}
          onDecrement={(cardId, board) => removeCard.mutate({ deckId: deck.id, cardId, board })}
        />
      </section>

      {!isDeleted && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl">Add cards</h2>
          <label className="flex items-center gap-2">
            Add to
            <select
              className="rounded px-2 py-1 text-black"
              value={addTo}
              onChange={(e) => {
                const option = ADD_TO_OPTIONS.find(({ board }) => board === e.target.value);
                if (option) setAddTo(option.board);
              }}
            >
              {ADD_TO_OPTIONS.map(({ board, label }) => (
                <option key={board} value={board}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <SearchBar onAddCard={(cardId) => addCard.mutate({ deckId: deck.id, cardId, board: addTo })} />
        </section>
      )}
    </div>
  );
}
