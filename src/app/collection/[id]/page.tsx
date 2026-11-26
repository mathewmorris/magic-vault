"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Button from "~/components/Button";
import { AffiliateDisclosure } from "~/components/BuyLinks";
import CollectionCards from "~/components/CollectionCards";
import CollectionName from "~/components/CollectionName";
import ExportMenu from "~/components/ExportMenu";
import ImportPanel, { type ImportSummary } from "~/components/ImportPanel";
import SearchBar from "~/components/SearchBar";
import { useToast } from "~/components/toast";
import { api } from "~/utils/api";
import { anyAffiliate } from "~/utils/buyLinks";
import { collectionValue, formatUsd, unpricedLabel, type Finish } from "~/utils/price";
import { collectionLabel, mutationErrorMessage } from "~/utils/toastMessages";

const NO_RETRY_CODES = ["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "BAD_REQUEST"];

// Retrying won't fix a missing or someone else's collection, so show that
// right away instead of after a few slow retries. Network blips still retry.
function shouldRetry(failureCount: number, error: { data?: { code?: string } | null }) {
  return !NO_RETRY_CODES.includes(error.data?.code ?? "") && failureCount < 3;
}

export default function Page() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const utils = api.useUtils();
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Both queries are keyed on the id from the URL rather than on each other's
  // results, so they start together on a reload or a client-side navigation,
  // and neither ever runs with an empty or undefined key.
  const collectionQuery = api.collection.byId.useQuery(
    { id },
    { enabled: id !== "", retry: shouldRetry },
  );
  const cardsQuery = api.collection.cards.useQuery(
    { collectionId: id },
    { enabled: id !== "", retry: shouldRetry },
  );

  function refreshCollectionLists() {
    return Promise.all([
      utils.collection.getAll.invalidate(),
      utils.collection.getDeletedCollections.invalidate(),
    ]);
  }

  function refreshCards() {
    return utils.collection.cards.invalidate({ collectionId: id });
  }

  // Shows a count change straight away, then lets the refetch confirm it.
  // Cards keep their spot because the server orders by when they were added,
  // and a count change doesn't touch that. Without a finish (adding from
  // search) the server picks the finish, so nothing changes until the refetch.
  async function changeCachedCount(cardId: string, finish: Finish | undefined, change: number | "remove") {
    await utils.collection.cards.cancel({ collectionId: id });
    const previous = utils.collection.cards.getData({ collectionId: id });
    if (finish === undefined) return { previous };

    utils.collection.cards.setData({ collectionId: id }, (cards) =>
      cards?.flatMap((entry) => {
        if (entry.card.id !== cardId || entry.finish !== finish) return [entry];
        if (change === "remove") return [];
        const count = entry.count + change;
        return count > 0 ? [{ ...entry, count }] : [];
      }),
    );

    return { previous };
  }

  function rollback(context: { previous?: ReturnType<typeof utils.collection.cards.getData> } | undefined) {
    if (context?.previous) {
      utils.collection.cards.setData({ collectionId: id }, context.previous);
    }
  }

  const rename = api.collection.rename.useMutation({
    onSuccess: (updated) => {
      utils.collection.byId.setData({ id }, updated);
      void refreshCollectionLists();
    },
  });

  const addCard = api.collection.addCard.useMutation({
    onMutate: ({ cardId, finish }) => changeCachedCount(cardId, finish, 1),
    onError: (_error, _input, context) => rollback(context),
    onSettled: () => Promise.all([refreshCards(), utils.collection.values.invalidate()]),
  });

  const removeCard = api.collection.removeCard.useMutation({
    onMutate: ({ cardId, finish, all }) => changeCachedCount(cardId, finish ?? "nonfoil", all ? "remove" : -1),
    onError: (_error, _input, context) => rollback(context),
    onSettled: () => Promise.all([refreshCards(), utils.collection.values.invalidate()]),
  });

  // Merging into an existing entry or keeping the old spot is the server's
  // call, so this waits for the refetch instead of guessing.
  const setFinish = api.collection.setFinish.useMutation({
    onSettled: () => Promise.all([refreshCards(), utils.collection.values.invalidate()]),
  });

  async function finishImport({ cards }: ImportSummary) {
    await Promise.all([refreshCards(), utils.collection.values.invalidate()]);
    setImporting(false);
    setImportMessage(`Added ${cards} ${cards === 1 ? "card" : "cards"}.`);
  }

  // Wait for the change to land and the lists to refresh before leaving, so
  // the page we go back to doesn't show stale collections. Callbacks live on
  // useMutation (not on mutate) so they still run after router.back()
  // unmounts this page, and the toast shows on the page we land on.
  function afterLifecycleChange(
    successMessage: (name: string | null) => string,
    action: string,
  ) {
    return {
      onSuccess: async (changed: { name: string | null }) => {
        toast.success(successMessage(changed.name));
        await refreshCollectionLists();
        router.back();
      },
      onError: (error: unknown) => {
        toast.error(mutationErrorMessage(action, error));
      },
    };
  }
  const softDelete = api.collection.softDelete.useMutation(
    afterLifecycleChange(
      (name) => `Deleted ${collectionLabel(name)}. You can recover it from Deleted Collections.`,
      "delete this collection",
    ),
  );
  const recover = api.collection.recover.useMutation(
    afterLifecycleChange((name) => `Recovered ${collectionLabel(name)}.`, "recover this collection"),
  );
  const destroy = api.collection.destroy.useMutation(
    afterLifecycleChange(
      (name) => `Permanently deleted ${collectionLabel(name)}.`,
      "permanently delete this collection",
    ),
  );

  if (collectionQuery.isError) {
    const notFound = collectionQuery.error?.data?.code === "NOT_FOUND";

    return (
      <div className="flex flex-col items-start gap-4 p-4">
        <p>{notFound ? "Collection not found." : "Couldn't load this collection."}</p>
        {!notFound && (
          <Button type="button" onClick={() => void collectionQuery.refetch()}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const collection = collectionQuery.data;

  if (!collection) {
    return <p className="p-4">Loading collection...</p>;
  }

  const isDeleted = collection.deletedAt != null;
  const lifecyclePending = softDelete.isLoading || recover.isLoading || destroy.isLoading;
  // Rename errors show next to the name field, and delete, recover and
  // permanent delete errors show as toasts, so they aren't repeated here.
  const actionError = addCard.error ?? removeCard.error ?? setFinish.error;
  const value = cardsQuery.data
    ? collectionValue(cardsQuery.data.map(({ card, finish, count }) => ({ prices: card.prices, finish, count })))
    : null;

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <CollectionName
          name={collection.name ?? ""}
          editable={!isDeleted}
          onSave={(name) => rename.mutateAsync({ id: collection.id, name })}
        />
        <div className="flex flex-wrap gap-2">
          {!isDeleted && (
            <Button
              type="button"
              aria-expanded={importing}
              onClick={() => {
                setImporting((current) => !current);
                setImportMessage(null);
              }}
            >
              Import
            </Button>
          )}
          <ExportMenu collectionId={collection.id} />
          {isDeleted ? (
            <>
              <Button
                type="button"
                disabled={lifecyclePending}
                onClick={() => recover.mutate({ collectionId: collection.id })}
              >
                Recover
              </Button>
              <Button
                type="button"
                disabled={lifecyclePending}
                onClick={() => destroy.mutate({ collectionId: collection.id })}
              >
                Delete Permanently
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={lifecyclePending}
              onClick={() => softDelete.mutate({ collectionId: collection.id })}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {importing && !isDeleted && (
        <ImportPanel
          collectionId={collection.id}
          onClose={() => setImporting(false)}
          onImported={finishImport}
        />
      )}

      {importMessage && (
        <p role="status" className="text-green-400">
          {importMessage}
        </p>
      )}

      {actionError && (
        <p role="alert" className="text-red-500">
          Something went wrong: {actionError.message}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl">Cards</h2>
        {value && cardsQuery.data && cardsQuery.data.length > 0 && (
          <div className="flex flex-col gap-1">
            <p>
              Total value: <span className="font-semibold">{formatUsd(value.totalCents)}</span>
              {value.unpriced > 0 && (
                <span className="text-gray-400"> ({unpricedLabel(value.unpriced)})</span>
              )}
            </p>
            <p className="text-sm text-gray-400">
              <a
                href="https://scryfall.com/docs/faqs"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Prices from Scryfall, updated daily
              </a>
            </p>
          </div>
        )}
        {cardsQuery.isError ? (
          <div className="flex items-center gap-4">
            <p>Couldn&apos;t load the cards in this collection.</p>
            <Button type="button" onClick={() => void cardsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : cardsQuery.data ? (
          <>
          {/* One line above the grid, so it's read before any store link. */}
          {cardsQuery.data.some(({ buyLinks }) => anyAffiliate(buyLinks)) && (
            <AffiliateDisclosure className="mb-4" />
          )}
          <CollectionCards
            cards={cardsQuery.data}
            editable={!isDeleted}
            disabled={setFinish.isLoading}
            onIncrement={(cardId, finish) => addCard.mutate({ collectionId: collection.id, cardId, finish })}
            onDecrement={(cardId, finish) => removeCard.mutate({ collectionId: collection.id, cardId, finish })}
            onRemove={(cardId, finish) => removeCard.mutate({ collectionId: collection.id, cardId, finish, all: true })}
            onChangeFinish={(cardId, from, to) => setFinish.mutate({ collectionId: collection.id, cardId, from, to })}
          />
          </>
        ) : (
          <p>Loading cards...</p>
        )}
      </section>

      {!isDeleted && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl">Add cards</h2>
            <Link
              href={`/scan?collection=${encodeURIComponent(collection.id)}`}
              className="rounded-full px-4 py-2 font-semibold transition dark:bg-purple-950 dark:hover:bg-pink-800 dark:hover:drop-shadow-glow dark:focus:bg-pink-800"
            >
              Scan cards
            </Link>
          </div>
          <SearchBar
            onAddCard={(cardId) => addCard.mutate({ collectionId: collection.id, cardId })}
          />
        </section>
      )}
    </div>
  );
}
