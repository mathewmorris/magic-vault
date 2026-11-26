import { type Finish } from "~/utils/price";
import { type Condition } from "./types";

/** A confirmed import row: which card, how many and in what shape. */
export interface ImportEntry {
  cardId: string;
  finish: Finish;
  condition: Condition;
  language: string;
  quantity: number;
}

/**
 * Folds rows for the same card and finish into one, adding their counts,
 * since a collection keeps one entry per card and finish. The first row's
 * condition and language win. Entries keep the order each first showed up in.
 */
export function mergeImportEntries(rows: ImportEntry[]): ImportEntry[] {
  const merged = new Map<string, ImportEntry>();
  for (const row of rows) {
    const key = `${row.cardId}\u0000${row.finish}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      merged.set(key, { ...row });
    }
  }
  return Array.from(merged.values());
}
