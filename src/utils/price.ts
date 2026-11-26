/**
 * Card prices from Scryfall's `prices` object
 * (https://scryfall.com/docs/api/cards#card-prices). Scryfall gives each
 * price as a decimal string in dollars, or null when it has none, and keys
 * them by finish: usd (non-foil), usd_foil and usd_etched. Prices are kept in
 * whole cents here so sums don't pick up floating point noise.
 */

export const FINISHES = ["nonfoil", "foil", "etched"] as const;
export type Finish = (typeof FINISHES)[number];

const FINISH_LABELS: Record<Finish, string> = {
  nonfoil: "Non-foil",
  foil: "Foil",
  etched: "Etched",
};

const PRICE_KEYS: Record<Finish, string> = {
  nonfoil: "usd",
  foil: "usd_foil",
  etched: "usd_etched",
};

const DOLLARS = /^\d+(\.\d{1,2})?$/;

export function isFinish(value: unknown): value is Finish {
  return typeof value === "string" && (FINISHES as readonly string[]).includes(value);
}

export function finishLabel(finish: string): string {
  return isFinish(finish) ? FINISH_LABELS[finish] : finish;
}

/**
 * The finishes a card comes in, from its stored `finishes` list, in
 * Scryfall's order. Unknown values are dropped. Empty when the card has no
 * list yet (rows from before the field was stored).
 */
export function cardFinishes(finishes: unknown): Finish[] {
  if (!Array.isArray(finishes)) return [];
  return finishes.filter(isFinish);
}

/** The finish to use when none is picked: non-foil, unless the card has no non-foil printing. */
export function defaultFinish(finishes: unknown): Finish {
  const known = cardFinishes(finishes);
  if (known.length === 0 || known.includes("nonfoil")) return "nonfoil";
  return known[0] ?? "nonfoil";
}

/**
 * The USD price of one copy in `finish`, in cents, or null when Scryfall has
 * no price for that finish. Never falls back to another finish's price,
 * since a foil and a non-foil copy can be worth very different amounts.
 */
export function priceFor(prices: unknown, finish: string): number | null {
  if (!isFinish(finish)) return null;
  if (typeof prices !== "object" || prices === null || Array.isArray(prices)) return null;
  const value = (prices as Record<string, unknown>)[PRICE_KEYS[finish]];
  if (typeof value !== "string" || !DOLLARS.test(value)) return null;
  return Math.round(Number(value) * 100);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Format cents as US dollars, like "$1,234.50". */
export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}

export interface ValuedEntry {
  prices: unknown;
  finish: string;
  count: number;
}

export interface CollectionValue {
  /** Sum of price × count over the entries that have a price, in cents. */
  totalCents: number;
  /** How many entries have no price for their finish. */
  unpriced: number;
}

export function collectionValue(entries: Iterable<ValuedEntry>): CollectionValue {
  let totalCents = 0;
  let unpriced = 0;
  for (const entry of entries) {
    const cents = priceFor(entry.prices, entry.finish);
    if (cents === null) {
      unpriced += 1;
    } else {
      totalCents += cents * entry.count;
    }
  }
  return { totalCents, unpriced };
}

/** "1 card without a price", "3 cards without a price". */
export function unpricedLabel(unpriced: number): string {
  return `${unpriced} ${unpriced === 1 ? "card" : "cards"} without a price`;
}
