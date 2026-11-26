"use client";

import Link from "next/link";

import Spinner from "~/components/Spinner";
import { api } from "~/utils/api";
import { FORMAT_LABELS, isDeckFormat } from "~/utils/deck/checkDeck";
import { formatUsd } from "~/utils/price";

import FeatureIcon from "./FeatureIcon";
import QuickSearch from "./QuickSearch";
import { mutedText, panel } from "./styles";

/** How many collections and decks the home page lists before "See all". */
const LIST_LIMIT = 5;

const QUICK_ACTIONS = [
  { href: "/collection/create", label: "New collection", icon: "collections" },
  { href: "/decks", label: "New deck", icon: "decks" },
  { href: "/scan", label: "Scan cards", icon: "scan" },
  { href: "/search", label: "Advanced search", icon: "search" },
] as const;

function formatLabel(format: string) {
  return isDeckFormat(format) ? FORMAT_LABELS[format] : format;
}

function byNewest<T extends { updatedAt: Date }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={panel}>
      <p className={`text-sm ${mutedText}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold">{value ?? "..."}</p>
    </div>
  );
}

function ListPanel({
  title,
  seeAllHref,
  children,
}: {
  title: string;
  seeAllHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className={panel} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Link href={seeAllHref} className="text-sm font-semibold text-pink-600 hover:underline dark:text-pink-400">
          See all
        </Link>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className="space-y-2 py-4 text-center">
      <p className={mutedText}>{text}</p>
      <Link href={href} className="font-semibold text-pink-600 hover:underline dark:text-pink-400">
        {action}
      </Link>
    </div>
  );
}

/** The home page for signed-in users: quick search, shortcuts, and their stuff. */
export default function Dashboard({ name }: { name?: string | null }) {
  const collections = api.collection.getAll.useQuery();
  const values = api.collection.values.useQuery();
  const decks = api.deck.getAll.useQuery();

  const totalCents = values.data
    ? Object.values(values.data).reduce((sum, value) => sum + value.totalCents, 0)
    : null;
  const firstName = name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>
        <QuickSearch placeholder="Find a card" />
        <ul className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className="inline-flex items-center gap-2 rounded-full border border-purple-200 px-4 py-2 text-sm font-semibold transition hover:border-pink-500 hover:text-pink-600 dark:border-purple-800 dark:hover:border-pink-600 dark:hover:text-pink-300"
              >
                <FeatureIcon id={action.icon} className="h-4 w-4" />
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Your vault at a glance">
        <Stat label="Collections" value={collections.data ? String(collections.data.length) : null} />
        <Stat label="Decks" value={decks.data ? String(decks.data.length) : null} />
        <Stat label="Total value" value={totalCents === null ? null : formatUsd(totalCents)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="Your collections" seeAllHref="/collections">
          {collections.isLoading ? (
            <Spinner label="Loading collections" />
          ) : collections.isError ? (
            <p className="text-red-500">Couldn&apos;t load your collections. Try again in a bit.</p>
          ) : collections.data.length === 0 ? (
            <EmptyState
              text="No collections yet."
              href="/collection/create"
              action="Make your first collection"
            />
          ) : (
            <ul className="divide-y divide-purple-100 dark:divide-purple-900/60">
              {byNewest(collections.data)
                .slice(0, LIST_LIMIT)
                .map((collection) => {
                  const value = values.data?.[collection.id];
                  return (
                    <li key={collection.id}>
                      <Link
                        href={`/collection/${collection.id}`}
                        className="flex items-center justify-between gap-4 py-3 hover:text-pink-600 dark:hover:text-pink-300"
                      >
                        <span className="truncate font-medium">{collection.name ?? "My Collection"}</span>
                        <span className={`shrink-0 text-sm ${mutedText}`}>
                          {value ? formatUsd(value.totalCents) : "No cards yet"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </ListPanel>

        <ListPanel title="Your decks" seeAllHref="/decks">
          {decks.isLoading ? (
            <Spinner label="Loading decks" />
          ) : decks.isError ? (
            <p className="text-red-500">Couldn&apos;t load your decks. Try again in a bit.</p>
          ) : decks.data.length === 0 ? (
            <EmptyState text="No decks yet." href="/decks" action="Build your first deck" />
          ) : (
            <ul className="divide-y divide-purple-100 dark:divide-purple-900/60">
              {decks.data.slice(0, LIST_LIMIT).map((deck) => (
                <li key={deck.id}>
                  <Link
                    href={`/deck/${deck.id}`}
                    className="flex items-center justify-between gap-4 py-3 hover:text-pink-600 dark:hover:text-pink-300"
                  >
                    <span className="truncate font-medium">{deck.name}</span>
                    <span className={`shrink-0 text-sm ${mutedText}`}>
                      {formatLabel(deck.format)} · {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ListPanel>
      </div>
    </div>
  );
}
