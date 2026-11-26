"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Button from "~/components/Button";
import SearchFilters from "~/components/SearchFilters";
import Spinner from "~/components/Spinner";
import { api, type RouterOutputs } from "~/utils/api";
import { smallImageUrl } from "~/utils/cardImage";
import { appendTerms } from "~/utils/search/filterTerms";
import {
  isSearchSort,
  MAX_QUERY_LENGTH,
  parsePageParam,
  SEARCH_SORTS,
  searchHref,
  SORT_LABELS,
  type SearchSort,
} from "~/utils/search/searchOptions";

type SearchCard = RouterOutputs["card"]["searchAdvanced"]["items"][number];

const SYNTAX_EXAMPLES: { example: string; meaning: string }[] = [
  { example: 'bolt  "lightning bolt"', meaning: "Name contains a word or a phrase" },
  { example: "-goblin", meaning: "A leading - leaves matches out" },
  { example: "c:rg  c=u  c<=wub  c:c  c:m", meaning: "Colors: at least, exactly, at most, colorless, multicolor" },
  { example: "id:wub", meaning: "Color identity within these colors (for Commander)" },
  { example: 't:creature  t:"legendary goblin"', meaning: "Type line contains" },
  { example: 'o:flying  o:"draw a card"', meaning: "Rules text contains" },
  { example: "mv=3  mv>=5  cmc<2", meaning: "Mana value" },
  { example: "r:mythic  r>=rare", meaning: "Rarity (common, uncommon, rare, special, mythic, bonus)" },
  { example: "s:lea  e:dmu", meaning: "Set code" },
  { example: "f:modern  banned:legacy  restricted:vintage", meaning: "Format legality" },
];

function SyntaxHelp() {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold">Search syntax help</summary>
      <div className="mt-2 grid gap-2">
        <p>
          Every term has to match. This is a subset of{" "}
          <a
            href="https://scryfall.com/docs/syntax"
            className="font-bold underline"
            target="_blank"
            rel="noreferrer"
          >
            Scryfall&apos;s search syntax
          </a>
          ; anything it doesn&apos;t understand shows up as a warning.
        </p>
        <table className="text-left">
          <tbody>
            {SYNTAX_EXAMPLES.map(({ example, meaning }) => (
              <tr key={example} className="align-top">
                <td className="whitespace-pre pr-4 font-mono">{example}</td>
                <td>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CardTile({ card }: { card: SearchCard }) {
  const image = smallImageUrl(card);
  return (
    <div className="grid gap-1">
      <Link href={`/card/${card.id}`} className="dark:hover:drop-shadow-glow">
        {image ? (
          <Image
            src={image}
            width={146}
            height={204}
            alt={card.name}
            className="h-auto w-full rounded-lg"
          />
        ) : (
          <div className="flex aspect-[146/204] w-full items-center justify-center rounded-lg bg-gray-800 p-2 text-center font-semibold text-white">
            {card.name}
          </div>
        )}
      </Link>
      <a
        href={card.scryfall_uri}
        target="_blank"
        rel="noreferrer"
        className="truncate text-xs text-gray-400 hover:underline"
        title={`${card.name} on Scryfall`}
      >
        {card.name} on Scryfall
      </a>
    </div>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get("q") ?? "";
  const sortParam = searchParams?.get("sort");
  const sort: SearchSort = isSearchSort(sortParam) ? sortParam : "name";
  const page = parsePageParam(searchParams?.get("page"));

  const [draft, setDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Keep the box in step with the URL (back/forward, links, filters).
  useEffect(() => {
    setDraft(q);
  }, [q]);

  const query = q.trim().slice(0, MAX_QUERY_LENGTH);
  const search = api.card.searchAdvanced.useQuery(
    { q: query, sort, page },
    { enabled: query !== "", keepPreviousData: true },
  );

  const go = (next: { q: string; sort?: SearchSort; page?: number }) =>
    router.push(searchHref({ sort, ...next }));

  const result = query ? search.data : undefined;
  const items = result?.items ?? [];

  return (
    <div className="grid gap-4 p-4">
      <h1 className="text-4xl">Card search</h1>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: draft, page: 1 });
        }}
      >
        <input
          type="search"
          aria-label="Search cards"
          className="min-w-0 flex-1 rounded px-3 py-2 text-black"
          placeholder='e.g. goblin c:r mv<=2 or o:"draw a card" f:commander'
          maxLength={MAX_QUERY_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <select
          aria-label="Sort by"
          className="rounded px-2 py-2 text-black"
          value={sort}
          onChange={(e) => {
            const next = e.target.value;
            if (isSearchSort(next)) go({ q, sort: next, page: 1 });
          }}
        >
          {SEARCH_SORTS.map((option) => (
            <option key={option} value={option}>
              Sort: {SORT_LABELS[option]}
            </option>
          ))}
        </select>
        <Button type="submit">Search</Button>
        <Button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="search-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? "Hide filters" : "Filters"}
        </Button>
      </form>

      {filtersOpen && (
        <div id="search-filters">
          <SearchFilters onApply={(terms) => go({ q: appendTerms(draft, terms), page: 1 })} />
        </div>
      )}

      <SyntaxHelp />

      {result && result.warnings.length > 0 && (
        <ul className="list-inside list-disc rounded border border-yellow-600 p-3 text-yellow-500">
          {result.warnings.map((warning, index) => (
            <li key={`${index}-${warning}`}>{warning}</li>
          ))}
        </ul>
      )}

      {!query && (
        <p className="text-gray-400">
          Search every card by name, color, type, rules text and more. Try{" "}
          <Link href={searchHref({ q: "t:dragon r:mythic" })} className="underline">
            t:dragon r:mythic
          </Link>
          .
        </p>
      )}

      {search.isError && (
        <p className="text-red-500">Something went wrong with that search. Try again in a bit.</p>
      )}

      {query && search.isLoading && <Spinner label="Searching for cards" />}

      {result && items.length === 0 && (
        <p className="text-gray-400">
          {page > 1 ? "No more cards for this search." : "No cards match that search."}
        </p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </div>
      )}

      {result && (page > 1 || result.hasMore) && (
        <nav aria-label="Search pages" className="flex items-center justify-center gap-4">
          {page > 1 && (
            <Link href={searchHref({ q, sort, page: page - 1 })} className="underline">
              Previous
            </Link>
          )}
          <span>Page {page}</span>
          {result.hasMore && (
            <Link href={searchHref({ q, sort, page: page + 1 })} className="underline">
              Next
            </Link>
          )}
        </nav>
      )}

      <p className="text-xs text-gray-500">
        Card data and images come from{" "}
        <a href="https://scryfall.com" className="underline" target="_blank" rel="noreferrer">
          Scryfall
        </a>
        .
      </p>
    </div>
  );
}

export default function SearchPage() {
  // useSearchParams needs a Suspense boundary so the page can still be
  // prerendered.
  return (
    <Suspense fallback={<Spinner label="Loading search" />}>
      <SearchContent />
    </Suspense>
  );
}
