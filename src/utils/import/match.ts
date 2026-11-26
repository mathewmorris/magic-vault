import { cardFinishes, defaultFinish, finishLabel, type Finish } from "~/utils/price";
import { type ImportRow } from "./types";

/**
 * Matching import rows to cards. The server looks cards up in a few batched
 * queries (by Scryfall id, by set and collector number, then by name) and
 * hands everything it found to resolveRows, which picks a card for each row
 * without any more database work. Each row tries, in order:
 *
 * 1. its Scryfall id;
 * 2. its set and collector number, as long as the name agrees;
 * 3. its name, without case mattering. "Front // Back" names match a
 *    double-faced, split or adventure card, and so does the front face's
 *    name alone. Among printings, the row's own set wins, then the row's
 *    language, then English, then the newest.
 */

/** The card columns matching reads. */
export interface MatchCard {
  id: string;
  name: string;
  set: string | null;
  set_name: string | null;
  collector_number: string | null;
  lang: string | null;
  released_at: string | null;
  finishes: unknown;
}

export type MatchedBy = "scryfallId" | "printing" | "name";

export interface MatchedRow<C extends MatchCard = MatchCard> {
  row: ImportRow;
  card: C;
  /** The row's finish, or the card's own when the row didn't ask for one it has. */
  finish: Finish;
  matchedBy: MatchedBy;
  /** Something the user should look at, like a printing that wasn't found. */
  note?: string;
}

export interface UnmatchedRow {
  row: ImportRow;
  reason: string;
}

export interface MatchResult<C extends MatchCard = MatchCard> {
  matched: MatchedRow<C>[];
  unmatched: UnmatchedRow[];
}

/** Tidies a name for comparing: case, extra spaces, curly quotes and "A/B" for "A // B". */
export function nameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s*\/\/?\s*/g, " // ")
    .replace(/\s+/g, " ");
}

/** The front face of "Front // Back", or null for a one-faced name. */
export function frontFaceKey(key: string): string | null {
  const at = key.indexOf(" // ");
  return at > 0 ? key.slice(0, at) : null;
}

const printingKey = (set: string, collectorNumber: string) =>
  `${set.toLowerCase()}|${collectorNumber.toLowerCase()}`;

export interface ImportLookups {
  /** Lower-case Scryfall ids. */
  scryfallIds: string[];
  /** Lower-case set codes with collector numbers. */
  printings: { set: string; collectorNumber: string }[];
  /** Name keys (see nameKey), one each. */
  names: string[];
}

/** What to look up for these rows, with duplicates taken out. */
export function importLookups(rows: ImportRow[]): ImportLookups {
  const scryfallIds = new Set<string>();
  const printings = new Map<string, { set: string; collectorNumber: string }>();
  const names = new Set<string>();

  for (const row of rows) {
    if (row.scryfallId) scryfallIds.add(row.scryfallId.toLowerCase());
    if (row.setCode && row.collectorNumber) {
      printings.set(printingKey(row.setCode, row.collectorNumber), {
        set: row.setCode.toLowerCase(),
        collectorNumber: row.collectorNumber,
      });
    }
    names.add(nameKey(row.name));
  }

  return {
    scryfallIds: Array.from(scryfallIds),
    printings: Array.from(printings.values()),
    names: Array.from(names),
  };
}

/** Whether a card is called `key`, by its full name or its front face. */
function nameMatches(card: MatchCard, key: string): boolean {
  const cardKey = nameKey(card.name);
  return cardKey === key || frontFaceKey(cardKey) === key || frontFaceKey(key) === cardKey;
}

class CardIndex<C extends MatchCard> {
  readonly byId = new Map<string, C>();
  readonly byPrinting = new Map<string, C[]>();
  readonly byName = new Map<string, C[]>();

  constructor(cards: Iterable<C>) {
    for (const card of cards) {
      if (this.byId.has(card.id)) continue;
      this.byId.set(card.id, card);
      if (card.set && card.collector_number) {
        push(this.byPrinting, printingKey(card.set, card.collector_number), card);
      }
      const key = nameKey(card.name);
      push(this.byName, key, card);
      const front = frontFaceKey(key);
      if (front) push(this.byName, front, card);
    }
  }
}

function push<C>(map: Map<string, C[]>, key: string, card: C) {
  const list = map.get(key);
  if (list) list.push(card);
  else map.set(key, [card]);
}

// Sorts better picks first, with the card id last so ties never shuffle.
function rank<C extends MatchCard>(cards: C[], scores: ((card: C) => boolean)[]): C[] {
  return [...cards].sort((a, b) => {
    for (const score of scores) {
      const diff = Number(score(b)) - Number(score(a));
      if (diff !== 0) return diff;
    }
    const released = (b.released_at ?? "").localeCompare(a.released_at ?? "");
    if (released !== 0) return released;
    return a.id.localeCompare(b.id);
  });
}

const describePrinting = (set: string, collectorNumber?: string) =>
  [set.toUpperCase(), collectorNumber].filter(Boolean).join(" ");

/**
 * Picks a card for each row from `cards` (see the top of this file). With
 * `useNames` off only Scryfall ids and printings count, which the server
 * uses to find out which rows still need a lookup by name.
 */
export function resolveRows<C extends MatchCard>(
  rows: ImportRow[],
  cards: Iterable<C>,
  { useNames = true }: { useNames?: boolean } = {},
): MatchResult<C> {
  const index = new CardIndex(cards);
  const matched: MatchedRow<C>[] = [];
  const unmatched: UnmatchedRow[] = [];

  for (const row of rows) {
    const key = nameKey(row.name);
    const setCode = row.setCode?.toLowerCase();
    const sameLanguage = (card: C) => card.lang === row.language;
    const english = (card: C) => card.lang === "en";

    let card: C | undefined;
    let matchedBy: MatchedBy = "name";
    let note: string | undefined;

    if (row.scryfallId) {
      card = index.byId.get(row.scryfallId.toLowerCase());
      if (card) matchedBy = "scryfallId";
    }

    if (!card && setCode && row.collectorNumber) {
      const printings = (index.byPrinting.get(printingKey(setCode, row.collectorNumber)) ?? [])
        .filter((candidate) => nameMatches(candidate, key));
      card = rank(printings, [sameLanguage, english])[0];
      if (card) matchedBy = "printing";
    }

    if (!card && useNames) {
      const exact = (candidate: C) => nameKey(candidate.name) === key;
      const sameSet = (candidate: C) =>
        (setCode !== undefined && candidate.set === setCode) ||
        (row.setName !== undefined && candidate.set_name?.toLowerCase() === row.setName.toLowerCase());
      const sameNumber = (candidate: C) =>
        row.collectorNumber !== undefined && candidate.collector_number === row.collectorNumber;
      const byName = index.byName.get(key) ?? [];
      card = rank(byName, [exact, sameSet, sameNumber, sameLanguage, english])[0];
      if (card) {
        matchedBy = "name";
        const asked = setCode ? describePrinting(setCode, row.collectorNumber) : row.setName;
        if (asked && !sameSet(card)) {
          note = `Couldn't find ${asked}, so this is ${describePrinting(card.set ?? "", card.collector_number ?? undefined)} instead`;
        }
      }
    }

    if (!card) {
      if (useNames) unmatched.push({ row, reason: unmatchedReason(row) });
      else unmatched.push({ row, reason: "Not matched by id or printing" });
      continue;
    }

    const finishes = cardFinishes(card.finishes);
    let finish = row.finish;
    if (finishes.length > 0 && !finishes.includes(finish)) {
      if (finish !== "nonfoil") {
        unmatched.push({
          row,
          reason: `${card.name} (${describePrinting(card.set ?? "", card.collector_number ?? undefined)}) doesn't come in ${finishLabel(finish).toLowerCase()}`,
        });
        continue;
      }
      // Non-foil is what a row gets when it doesn't say; use what the card has.
      finish = defaultFinish(card.finishes);
    }

    matched.push({ row, card, finish, matchedBy, ...(note ? { note } : {}) });
  }

  return { matched, unmatched };
}

function unmatchedReason(row: ImportRow): string {
  if (row.setCode) {
    return `No card named "${row.name}" was found (looked for ${describePrinting(row.setCode, row.collectorNumber)} too)`;
  }
  return `No card named "${row.name}" was found`;
}
