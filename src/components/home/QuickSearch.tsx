"use client";

import { MAX_QUERY_LENGTH } from "~/utils/search/searchOptions";

import { useTapCard } from "./TapCard";

/**
 * A card search box that sends you to /search?q=... It's a plain GET form,
 * so it works before the page's JavaScript loads. On a card (inside a
 * TapCard), searching taps the card first.
 */
export default function QuickSearch({
  autoFocus = false,
  placeholder = 'Try "lightning bolt" or t:dragon c:r',
}: {
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const card = useTapCard();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!card) return;
    event.preventDefault();
    // The same URL the form would go to on its own.
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string") params.append(key, value);
    });
    card.tap(`/search?${params.toString()}`);
  }

  return (
    <form action="/search" method="get" role="search" onSubmit={onSubmit} className="flex w-full max-w-xl gap-2">
      <label htmlFor="quick-search" className="sr-only">
        Search cards
      </label>
      <input
        id="quick-search"
        type="search"
        name="q"
        required
        maxLength={MAX_QUERY_LENGTH}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-full border border-purple-200 bg-white px-4 py-2.5 text-black placeholder:text-gray-500 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/40 dark:border-purple-800"
      />
      <button
        type="submit"
        className="rounded-full bg-purple-500 px-5 py-2.5 font-semibold text-white transition hover:bg-pink-600 hover:drop-shadow-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 dark:bg-purple-500"
      >
        Search
      </button>
    </form>
  );
}
