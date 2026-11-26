/**
 * Deck legality checks that need nothing but the cards themselves, so they
 * run the same on the server and in the browser.
 */

export const DECK_BOARDS = ["main", "side", "commander"] as const;
export type DeckBoard = (typeof DECK_BOARDS)[number];

export function parseBoard(board: string): DeckBoard {
  return (DECK_BOARDS as readonly string[]).includes(board) ? (board as DeckBoard) : "main";
}

/** Formats a deck can be built for. Keys match Scryfall's legalities keys. */
export const DECK_FORMATS = [
  "commander",
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "vintage",
  "pauper",
  "historic",
  "timeless",
  "brawl",
  "oathbreaker",
] as const;
export type DeckFormat = (typeof DECK_FORMATS)[number];

export const FORMAT_LABELS: Record<DeckFormat, string> = {
  commander: "Commander",
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  legacy: "Legacy",
  vintage: "Vintage",
  pauper: "Pauper",
  historic: "Historic",
  timeless: "Timeless",
  brawl: "Brawl",
  oathbreaker: "Oathbreaker",
};

export function isDeckFormat(format: string): format is DeckFormat {
  return (DECK_FORMATS as readonly string[]).includes(format);
}

type FormatRules = {
  /** Most copies of one card (by name) a deck may hold. */
  maxCopies: number;
  /** Smallest main deck allowed (60-card formats). */
  minMain?: number;
  /** Exact size of main deck plus commander board (singleton formats). */
  exactSize?: number;
  /** Largest sideboard allowed. Formats without it ignore the side board. */
  sideboardMax?: number;
  /** How many cards the commander board needs, if the format has one. */
  commanders?: { min: number; max?: number };
};

const CONSTRUCTED: FormatRules = { maxCopies: 4, minMain: 60, sideboardMax: 15 };

const FORMAT_RULES: Record<DeckFormat, FormatRules> = {
  standard: CONSTRUCTED,
  pioneer: CONSTRUCTED,
  modern: CONSTRUCTED,
  legacy: CONSTRUCTED,
  vintage: CONSTRUCTED,
  pauper: CONSTRUCTED,
  historic: CONSTRUCTED,
  timeless: CONSTRUCTED,
  commander: { maxCopies: 1, exactSize: 100, commanders: { min: 1, max: 2 } },
  brawl: { maxCopies: 1, exactSize: 100, commanders: { min: 1, max: 2 } },
  // The oathbreaker and its signature spell both go on the commander board.
  oathbreaker: { maxCopies: 1, exactSize: 60, commanders: { min: 1 } },
};

export type DeckCheckCard = {
  name: string;
  type_line: string | null;
  /** Scryfall legalities: format -> "legal" | "not_legal" | "restricted" | "banned". */
  legalities: Record<string, string> | null;
  color_identity: string[] | null;
  oracle_text: string | null;
  count: number;
  board: DeckBoard;
};

export type DeckProblem = { message: string } & (
  | { kind: "unknown_format"; format: string }
  | { kind: "not_legal"; cardName: string }
  | { kind: "banned"; cardName: string }
  | { kind: "restricted"; cardName: string; count: number }
  | { kind: "too_many_copies"; cardName: string; count: number; max: number }
  | { kind: "deck_too_small"; count: number; min: number }
  | { kind: "deck_wrong_size"; count: number; expected: number }
  | { kind: "sideboard_too_large"; count: number; max: number }
  | { kind: "commander_count"; count: number; min: number; max?: number }
  | { kind: "color_identity"; cardName: string; outside: string[] }
);

const COLOR_ORDER = ["W", "U", "B", "R", "G"];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

/** Basic lands, Snow-Covered basics and Wastes all have "Basic" in their type line. */
export function isBasicLand(typeLine: string | null): boolean {
  return typeLine?.includes("Basic") ?? false;
}

/**
 * How many copies of this card the card itself allows, ignoring the format:
 * Infinity for basics and "any number of cards named" cards, N for
 * "up to N cards named" ones (Seven Dwarves, Nazgûl), or null when the
 * format's own limit applies.
 */
export function ownCopyLimit(card: Pick<DeckCheckCard, "type_line" | "oracle_text">): number | null {
  if (isBasicLand(card.type_line)) return Infinity;

  const text = card.oracle_text ?? "";
  if (/A deck can have any number of cards named/i.test(text)) return Infinity;

  const upTo = /A deck can have up to (\w+) cards named/i.exec(text);
  const word = upTo?.[1]?.toLowerCase();
  if (word) {
    const n = NUMBER_WORDS[word] ?? Number.parseInt(word, 10);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function sumCounts(cards: DeckCheckCard[]) {
  return cards.reduce((total, card) => total + card.count, 0);
}

function sortColors(colors: Iterable<string>) {
  return Array.from(colors).sort((a, b) => {
    const ia = COLOR_ORDER.indexOf(a);
    const ib = COLOR_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

/**
 * Lists what keeps a deck from being legal in a format. An empty list means
 * nothing we can check is wrong. Cards whose legalities or color identity
 * haven't been synced yet (null) are skipped for those checks rather than
 * flagged.
 *
 * Formats without a sideboard (commander, brawl, oathbreaker) ignore the side
 * board entirely, so it can be used as a maybeboard there.
 */
export function checkDeck(format: string, cards: DeckCheckCard[]): DeckProblem[] {
  if (!isDeckFormat(format)) {
    return [{ kind: "unknown_format", format, message: `"${format}" isn't a format we can check` }];
  }

  const rules = FORMAT_RULES[format];
  const label = FORMAT_LABELS[format];
  const problems: DeckProblem[] = [];

  const usesSideboard = rules.sideboardMax !== undefined;
  const counted = cards.filter((card) => card.count > 0 && (usesSideboard || card.board !== "side"));
  const main = counted.filter((card) => card.board === "main");
  const side = counted.filter((card) => card.board === "side");
  const commanders = rules.commanders ? counted.filter((card) => card.board === "commander") : [];
  // Without a commander rule, anything left on the commander board still
  // counts as part of the main deck.
  const mainDeck = rules.commanders ? main : counted.filter((card) => card.board !== "side");

  // Group every printing and board of a card by name, so two printings of
  // the same card share one copy limit.
  const byName = new Map<string, DeckCheckCard[]>();
  for (const card of counted) {
    const group = byName.get(card.name);
    if (group) group.push(card);
    else byName.set(card.name, [card]);
  }

  for (const [name, group] of byName) {
    const first = group[0]!;
    const total = sumCounts(group);
    const legality = group.find((card) => card.legalities)?.legalities?.[format];

    if (legality === "banned") {
      problems.push({ kind: "banned", cardName: name, message: `${name} is banned in ${label}` });
      continue;
    }
    if (legality === "not_legal") {
      problems.push({ kind: "not_legal", cardName: name, message: `${name} isn't legal in ${label}` });
      continue;
    }

    if (legality === "restricted") {
      if (total > 1) {
        problems.push({
          kind: "restricted",
          cardName: name,
          count: total,
          message: `${name} is restricted in ${label}: at most 1 copy, the deck has ${total}`,
        });
      }
      continue;
    }

    const max = ownCopyLimit(first) ?? rules.maxCopies;
    if (total > max) {
      problems.push({
        kind: "too_many_copies",
        cardName: name,
        count: total,
        max,
        message: `${name}: ${total} copies, at most ${max} allowed in ${label}`,
      });
    }
  }

  if (rules.minMain !== undefined) {
    const size = sumCounts(mainDeck);
    if (size < rules.minMain) {
      problems.push({
        kind: "deck_too_small",
        count: size,
        min: rules.minMain,
        message: `Main deck has ${size} cards, ${label} needs at least ${rules.minMain}`,
      });
    }
  }

  if (rules.exactSize !== undefined) {
    const size = sumCounts(mainDeck) + sumCounts(commanders);
    if (size !== rules.exactSize) {
      problems.push({
        kind: "deck_wrong_size",
        count: size,
        expected: rules.exactSize,
        message: `Deck has ${size} cards counting the commander, ${label} needs exactly ${rules.exactSize}`,
      });
    }
  }

  if (rules.sideboardMax !== undefined) {
    const size = sumCounts(side);
    if (size > rules.sideboardMax) {
      problems.push({
        kind: "sideboard_too_large",
        count: size,
        max: rules.sideboardMax,
        message: `Sideboard has ${size} cards, ${label} allows at most ${rules.sideboardMax}`,
      });
    }
  }

  if (rules.commanders) {
    const { min, max } = rules.commanders;
    const count = sumCounts(commanders);
    if (count < min || (max !== undefined && count > max)) {
      const wanted = max === undefined ? `at least ${min}` : min === max ? `${min}` : `${min} or ${max}`;
      problems.push({
        kind: "commander_count",
        count,
        min,
        ...(max !== undefined ? { max } : {}),
        message: `${label} needs ${wanted} on the commander board, the deck has ${count}`,
      });
    }

    // Only check color identity once every commander's identity is known.
    if (commanders.length > 0 && commanders.every((card) => card.color_identity)) {
      const allowed = new Set(commanders.flatMap((card) => card.color_identity ?? []));
      const reported = new Set<string>();

      for (const card of main) {
        if (!card.color_identity || reported.has(card.name)) continue;
        const outside = card.color_identity.filter((color) => !allowed.has(color));
        if (outside.length > 0) {
          reported.add(card.name);
          const colors = sortColors(new Set(outside));
          problems.push({
            kind: "color_identity",
            cardName: card.name,
            outside: colors,
            message: `${card.name} is outside the commander's color identity (${colors.join("")})`,
          });
        }
      }
    }
  }

  return problems;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : null;
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") record[key] = item;
  }
  return record;
}

/** Builds a checkable card from a Card row's fields (JSON columns come in as unknown). */
export function toDeckCheckCard(
  card: {
    name: string;
    type_line: string | null;
    oracle_text: string | null;
    legalities: unknown;
    color_identity: unknown;
  },
  count: number,
  board: DeckBoard,
): DeckCheckCard {
  return {
    name: card.name,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    legalities: stringRecord(card.legalities),
    color_identity: stringArray(card.color_identity),
    count,
    board,
  };
}
