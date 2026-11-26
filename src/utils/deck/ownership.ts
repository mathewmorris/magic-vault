/**
 * Works out how many copies of each deck card a user already owns, counting
 * every printing of the card (matched on Scryfall's oracle_id) across all of
 * their collections.
 */

export type OwnershipEntry = {
  /** oracle_id when the card has one, otherwise its card id. */
  key: string;
  name: string;
  /** The deck's card ids (printings) that share this key. */
  cardIds: string[];
  /** Copies the deck uses, across every board and printing. */
  needed: number;
  /** Copies the user owns in any printing, in any collection. */
  owned: number;
  /** Copies still to get: needed minus owned, never below 0. */
  missing: number;
};

export type DeckOwnership = {
  cards: OwnershipEntry[];
  /** owned here only counts copies the deck needs, so owned + missing = needed. */
  totals: { needed: number; owned: number; missing: number };
};

type KeyedCard = { id: string; oracle_id: string | null };

export function ownershipKey(card: KeyedCard): string {
  return card.oracle_id ? `oracle:${card.oracle_id}` : `card:${card.id}`;
}

/**
 * @param deckEntries the deck's rows (any board)
 * @param deckCards Card rows for those entries; entries without one are skipped
 * @param collectionEntries the user's rows from their non-deleted collections
 * @param collectionCards Card rows for those collection entries
 */
export function computeOwnership(
  deckEntries: { cardId: string; count: number }[],
  deckCards: (KeyedCard & { name: string })[],
  collectionEntries: { cardId: string; count: number }[],
  collectionCards: KeyedCard[],
): DeckOwnership {
  const deckCardsById = new Map(deckCards.map((card) => [card.id, card]));
  const byKey = new Map<string, OwnershipEntry>();

  for (const entry of deckEntries) {
    const card = deckCardsById.get(entry.cardId);
    if (!card) continue;

    const key = ownershipKey(card);
    const existing = byKey.get(key);
    if (existing) {
      existing.needed += entry.count;
      if (!existing.cardIds.includes(card.id)) existing.cardIds.push(card.id);
    } else {
      byKey.set(key, { key, name: card.name, cardIds: [card.id], needed: entry.count, owned: 0, missing: 0 });
    }
  }

  const collectionKeys = new Map(collectionCards.map((card) => [card.id, ownershipKey(card)]));
  for (const entry of collectionEntries) {
    const key = collectionKeys.get(entry.cardId);
    const owned = key ? byKey.get(key) : undefined;
    if (owned) owned.owned += entry.count;
  }

  const cards = Array.from(byKey.values());
  const totals = { needed: 0, owned: 0, missing: 0 };
  for (const card of cards) {
    card.missing = Math.max(0, card.needed - card.owned);
    totals.needed += card.needed;
    totals.missing += card.missing;
    totals.owned += card.needed - card.missing;
  }

  return { cards, totals };
}

/** "1 Sol Ring" lines for every card still missing, ready to paste into a store or list. */
export function formatMissingList(cards: Pick<OwnershipEntry, "name" | "missing">[]): string {
  return cards
    .filter((card) => card.missing > 0)
    .map((card) => `${card.missing} ${card.name}`)
    .join("\n");
}
