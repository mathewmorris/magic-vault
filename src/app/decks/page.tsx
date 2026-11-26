"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import Button from "~/components/Button";
import Spinner from "~/components/Spinner";
import { DeckFormatSelect, validateDeckName } from "~/components/deck/DeckName";
import { api } from "~/utils/api";
import { FORMAT_LABELS, isDeckFormat, type DeckFormat } from "~/utils/deck/checkDeck";

function formatLabel(format: string) {
  return isDeckFormat(format) ? FORMAT_LABELS[format] : format;
}

function CreateDeckForm() {
  const router = useRouter();
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<DeckFormat>("commander");
  const [touched, setTouched] = useState(false);

  const create = api.deck.create.useMutation({
    onSuccess: async (deck) => {
      await utils.deck.getAll.invalidate();
      router.push(`/deck/${deck.id}`);
    },
  });

  const nameError = touched ? validateDeckName(name) : null;
  const serverError = create.error?.data?.zodError?.fieldErrors.name?.[0] ?? create.error?.message;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (validateDeckName(name)) return;
    create.mutate({ name: name.trim(), format });
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <h2 className="text-xl">New deck</h2>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          Name
          <input
            className="rounded px-2 py-1 text-black"
            type="text"
            value={name}
            aria-invalid={nameError != null}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </label>
        <DeckFormatSelect value={format} onChange={setFormat} />
        <Button type="submit" disabled={create.isLoading || nameError != null}>
          {create.isLoading ? "Creating..." : "Create Deck"}
        </Button>
      </div>
      {(nameError ?? serverError) && (
        <p role="alert" className="text-red-500">
          {nameError ?? serverError}
        </p>
      )}
    </form>
  );
}

export default function DecksPage() {
  const decksQuery = api.deck.getAll.useQuery();
  const decks = decksQuery.data ?? [];

  return (
    <div className="flex flex-col gap-8 p-4">
      <h1 className="text-2xl">My Decks</h1>

      <CreateDeckForm />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl">Your decks</h2>
        {decksQuery.isLoading ? (
          <Spinner label="Loading decks" />
        ) : decksQuery.isError ? (
          <div className="flex items-center gap-4">
            <p>Couldn&apos;t load your decks.</p>
            <Button type="button" onClick={() => void decksQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : decks.length === 0 ? (
          <p>No decks yet. Make one above.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {decks.map((deck) => (
              <li key={deck.id}>
                <Link
                  href={`/deck/${deck.id}`}
                  className="flex flex-wrap items-baseline gap-x-4 rounded p-2 dark:hover:bg-gray-800"
                >
                  <span className="text-lg font-semibold">{deck.name}</span>
                  <span className="text-sm dark:text-gray-400">
                    {formatLabel(deck.format)} · {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
