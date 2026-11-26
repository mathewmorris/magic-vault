"use client";

import { useParams, useRouter } from "next/navigation";
import Button from "~/components/Button";
import CollectionCards from "~/components/CollectionCards";
import CollectionName from "~/components/CollectionName";
import SearchBar from "~/components/SearchBar";
import { useToast } from "~/components/toast";
import { api } from "~/utils/api";
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
  // and a count change doesn't touch that.
  async function changeCachedCount(cardId: string, change: number | "remove") {
    await utils.collection.cards.cancel({ collectionId: id });
    const previous = utils.collection.cards.getData({ collectionId: id });

    utils.collection.cards.setData({ collectionId: id }, (cards) =>
      cards?.flatMap((entry) => {
        if (entry.card.id !== cardId) return [entry];
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
    onMutate: ({ cardId }) => changeCachedCount(cardId, 1),
    onError: (_error, _input, context) => rollback(context),
    onSettled: () => refreshCards(),
  });

  const removeCard = api.collection.removeCard.useMutation({
    onMutate: ({ cardId, all }) => changeCachedCount(cardId, all ? "remove" : -1),
    onError: (_error, _input, context) => rollback(context),
    onSettled: () => refreshCards(),
  });

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
  const actionError = addCard.error ?? removeCard.error;

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <CollectionName
          name={collection.name ?? ""}
          editable={!isDeleted}
          onSave={(name) => rename.mutateAsync({ id: collection.id, name })}
        />
        <div className="flex gap-2">
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

      {actionError && (
        <p role="alert" className="text-red-500">
          Something went wrong: {actionError.message}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl">Cards</h2>
        {cardsQuery.isError ? (
          <div className="flex items-center gap-4">
            <p>Couldn&apos;t load the cards in this collection.</p>
            <Button type="button" onClick={() => void cardsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : cardsQuery.data ? (
          <CollectionCards
            cards={cardsQuery.data}
            editable={!isDeleted}
            onIncrement={(cardId) => addCard.mutate({ collectionId: collection.id, cardId })}
            onDecrement={(cardId) => removeCard.mutate({ collectionId: collection.id, cardId })}
            onRemove={(cardId) => removeCard.mutate({ collectionId: collection.id, cardId, all: true })}
          />
        ) : (
          <p>Loading cards...</p>
        )}
      </section>

      {!isDeleted && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl">Add cards</h2>
          <SearchBar
            onAddCard={(cardId) => addCard.mutate({ collectionId: collection.id, cardId })}
          />
        </section>
      )}
    </div>
  );
}
