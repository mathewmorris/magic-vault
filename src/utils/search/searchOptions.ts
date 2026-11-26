/** Search options shared by the search page and card.searchAdvanced. */

export const SEARCH_SORTS = ["name", "mv", "released", "rarity"] as const;

export type SearchSort = (typeof SEARCH_SORTS)[number];

export const SORT_LABELS: Record<SearchSort, string> = {
  name: "Name",
  mv: "Mana value",
  released: "Newest",
  rarity: "Rarity",
};

export const SEARCH_PAGE_SIZE = 60;

export const MAX_QUERY_LENGTH = 500;

/** Deep offsets get slow, and nobody pages through 60,000 cards. */
export const MAX_SEARCH_PAGE = 1000;

export function isSearchSort(value: string | null | undefined): value is SearchSort {
  return (SEARCH_SORTS as readonly string[]).includes(value ?? "");
}

/** A ?page= value as a page number, falling back to 1 for anything odd. */
export function parsePageParam(value: string | null | undefined): number {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, MAX_SEARCH_PAGE);
}

/** The /search URL for a search, leaving out values that are the default. */
export function searchHref({
  q,
  sort = "name",
  page = 1,
}: {
  q: string;
  sort?: SearchSort;
  page?: number;
}): string {
  const params = new URLSearchParams();
  const query = q.trim();
  if (query) params.set("q", query);
  if (sort !== "name") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/search?${search}` : "/search";
}
