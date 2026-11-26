/**
 * A running tally of the cards added during one scanning session, kept in
 * the order they were added so the last one can be undone.
 */

export interface AddedCard {
  cardId: string;
  name: string;
  collectionId: string;
  collectionName: string;
}

export interface TallyRow {
  cardId: string;
  name: string;
  collectionId: string;
  collectionName: string;
  count: number;
}

/** Group the adds by card and collection, most recently added first. */
export function summarizeSession(added: readonly AddedCard[]): TallyRow[] {
  const rows = new Map<string, TallyRow>();

  for (let i = added.length - 1; i >= 0; i--) {
    const entry = added[i]!;
    const key = `${entry.collectionId}:${entry.cardId}`;
    const row = rows.get(key);
    if (row) {
      row.count += 1;
    } else {
      rows.set(key, { ...entry, count: 1 });
    }
  }

  return [...rows.values()];
}
