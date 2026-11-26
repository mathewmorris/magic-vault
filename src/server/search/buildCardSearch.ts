import { Prisma } from "@prisma/client";

import {
  COLOR_ORDER,
  RARITY_ORDER,
  type Color,
  type ColorField,
  type Comparison,
  type SearchTerm,
} from "~/utils/search/parseQuery";
import { SEARCH_PAGE_SIZE, type SearchSort } from "~/utils/search/searchOptions";

/** One search result: the newest matching printing of a card. */
export type CardSearchRow = {
  id: string;
  name: string;
  scryfall_uri: string;
  mana_cost: string | null;
  type_line: string | null;
  set: string | null;
  set_name: string | null;
  rarity: string | null;
  image_uris: Prisma.JsonValue | null;
  card_faces: Prisma.JsonValue | null;
};

export type CardSearchOptions = {
  sort?: SearchSort;
  /** 1-based. */
  page?: number;
  pageSize?: number;
};

// Every user-supplied value below goes in as a query parameter. The only
// SQL text built from strings is from these fixed tables.
const OPERATORS: Record<Comparison, Prisma.Sql> = {
  "=": Prisma.raw("="),
  "<": Prisma.raw("<"),
  ">": Prisma.raw(">"),
  "<=": Prisma.raw("<="),
  ">=": Prisma.raw(">="),
};

/**
 * Double-faced cards keep their colors and rules text on each face rather
 * than on the card, so fall back to the faces when the card has none.
 */
const CARD_COLORS = Prisma.sql`COALESCE("colors", jsonb_path_query_array("card_faces", '$[*].colors[*]'))`;
const FACE_ORACLE_TEXT = Prisma.sql`(SELECT string_agg("face"."text", ' ') FROM jsonb_array_elements_text(jsonb_path_query_array("card_faces", '$[*].oracle_text')) AS "face"("text"))`;

const COLOR_COLUMNS: Record<ColorField, Prisma.Sql> = {
  colors: CARD_COLORS,
  color_identity: Prisma.sql`"color_identity"`,
};

/** Rarity as a number in RARITY_ORDER, for comparisons and sorting. */
const RARITY_RANK = Prisma.raw(
  `(CASE "rarity" ${RARITY_ORDER.map((rarity, rank) => `WHEN '${rarity}' THEN ${rank}`).join(" ")} END)`,
);

/** Most of the Card table is English already; keep stray translated printings out. */
const ENGLISH_ONLY = Prisma.sql`("lang" = 'en' OR "lang" IS NULL)`;

const ORDER_BY: Record<SearchSort, Prisma.Sql> = {
  name: Prisma.sql`"name" ASC, "id" ASC`,
  mv: Prisma.sql`"cmc" ASC NULLS LAST, "name" ASC, "id" ASC`,
  released: Prisma.sql`"released_at" DESC NULLS LAST, "name" ASC, "id" ASC`,
  rarity: Prisma.sql`${RARITY_RANK} DESC NULLS LAST, "name" ASC, "id" ASC`,
};

/**
 * An ILIKE pattern for "contains value". Backslash is ILIKE's default escape
 * character, so escaping it, % and _ makes them match literally.
 */
export function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const jsonbColors = (colors: Color[]) => Prisma.sql`${JSON.stringify(colors)}::jsonb`;

function colorCondition(field: ColorField, operator: Comparison, colors: Color[]): Prisma.Sql {
  const column = COLOR_COLUMNS[field];
  const set = jsonbColors(colors);
  switch (operator) {
    case ">=":
      return Prisma.sql`${column} @> ${set}`;
    case "<=":
      return Prisma.sql`${column} <@ ${set}`;
    case "=":
      return Prisma.sql`(${column} @> ${set} AND ${column} <@ ${set})`;
    case ">":
      return Prisma.sql`(${column} @> ${set} AND NOT (${column} <@ ${set}))`;
    case "<":
      return Prisma.sql`(${column} <@ ${set} AND NOT (${column} @> ${set}))`;
  }
}

/** Two or more colors: not within any single color (which also rules out colorless). */
function multicolorCondition(field: ColorField): Prisma.Sql {
  const column = COLOR_COLUMNS[field];
  const notMono = COLOR_ORDER.map((color) => Prisma.sql`NOT (${column} <@ ${jsonbColors([color])})`);
  return Prisma.sql`(${Prisma.join(notMono, " AND ")})`;
}

function termCondition(term: SearchTerm): Prisma.Sql {
  switch (term.kind) {
    case "name":
      return Prisma.sql`"name" ILIKE ${containsPattern(term.value)}`;
    case "type":
      return Prisma.sql`"type_line" ILIKE ${containsPattern(term.value)}`;
    case "oracle": {
      const pattern = containsPattern(term.value);
      return Prisma.sql`("oracle_text" ILIKE ${pattern} OR ("oracle_text" IS NULL AND ${FACE_ORACLE_TEXT} ILIKE ${pattern}))`;
    }
    case "color":
      return colorCondition(term.field, term.operator, term.colors);
    case "multicolor":
      return multicolorCondition(term.field);
    case "manaValue":
      return Prisma.sql`"cmc" ${OPERATORS[term.operator]} ${term.value}`;
    case "rarity":
      if (term.operator === "=") return Prisma.sql`"rarity" = ${term.value}`;
      return Prisma.sql`${RARITY_RANK} ${OPERATORS[term.operator]} ${RARITY_ORDER.indexOf(term.value)}`;
    case "set":
      return Prisma.sql`"set" = ${term.value.toLowerCase()}`;
    case "legality": {
      const status = Prisma.sql`"legalities"->>(${term.format}::text)`;
      // Like Scryfall, f:vintage includes cards restricted there.
      if (term.status === "legal") return Prisma.sql`${status} IN ('legal', 'restricted')`;
      return Prisma.sql`${status} = ${term.status}`;
    }
  }
}

/** The WHERE conditions for a list of terms, all of which must match. */
export function buildSearchConditions(terms: SearchTerm[]): Prisma.Sql {
  const conditions = terms.map((term) => {
    const condition = termCondition(term);
    // A NULL column (say, a card with no oracle text) doesn't match the term,
    // so it does match the negated term.
    return term.negated ? Prisma.sql`NOT COALESCE(${condition}, FALSE)` : condition;
  });
  return Prisma.join([ENGLISH_ONLY, ...conditions], " AND ");
}

/**
 * Search the Card table. Each card shows up once, as its newest matching
 * printing (cards without an oracle_id are grouped by their own id). Returns
 * up to pageSize + 1 rows: if the extra row is there, there's another page.
 */
export function buildCardSearch(
  terms: SearchTerm[],
  { sort = "name", page = 1, pageSize = SEARCH_PAGE_SIZE }: CardSearchOptions = {},
): Prisma.Sql {
  const offset = (Math.max(1, Math.floor(page)) - 1) * pageSize;

  return Prisma.sql`SELECT "id", "name", "scryfall_uri", "mana_cost", "type_line", "set", "set_name", "rarity", "image_uris", "card_faces"
FROM (
  SELECT DISTINCT ON (COALESCE("oracle_id", "id"))
    "id", "name", "scryfall_uri", "mana_cost", "type_line", "set", "set_name", "rarity", "image_uris", "card_faces", "cmc", "released_at"
  FROM "Card"
  WHERE ${buildSearchConditions(terms)}
  ORDER BY COALESCE("oracle_id", "id"), "released_at" DESC NULLS LAST, "id" ASC
) AS "printing"
ORDER BY ${ORDER_BY[sort]}
LIMIT ${pageSize + 1} OFFSET ${offset}`;
}
