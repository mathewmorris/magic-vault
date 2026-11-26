/**
 * Parse a Scryfall-style search query (https://scryfall.com/docs/syntax) into
 * a flat list of terms that all have to match. This is a subset of Scryfall's
 * syntax: there's no OR or parentheses yet.
 *
 * Pure and shared by the server (which turns the terms into SQL) and the
 * search page. Anything it doesn't understand comes back as a warning and is
 * left out of the search, never as an error.
 */

/** Comparison operators after the keyword is resolved. ":" never survives parsing. */
export type Comparison = "=" | "<" | ">" | "<=" | ">=";

export type Color = "W" | "U" | "B" | "R" | "G";

export const COLOR_ORDER: readonly Color[] = ["W", "U", "B", "R", "G"];

export type Rarity = "common" | "uncommon" | "rare" | "special" | "mythic" | "bonus";

/** Rarities from most to least common, the order comparisons like r>=rare use (same as Scryfall). */
export const RARITY_ORDER: readonly Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "special",
  "mythic",
  "bonus",
];

/** Format keys in Scryfall's legalities object. */
export const FORMATS = [
  "standard",
  "future",
  "historic",
  "timeless",
  "gladiator",
  "pioneer",
  "explorer",
  "modern",
  "legacy",
  "pauper",
  "vintage",
  "penny",
  "commander",
  "oathbreaker",
  "standardbrawl",
  "brawl",
  "alchemy",
  "paupercommander",
  "duel",
  "oldschool",
  "premodern",
  "predh",
] as const;

export type Format = (typeof FORMATS)[number];

/** Which color column a color term checks. */
export type ColorField = "colors" | "color_identity";

export type LegalityStatus = "legal" | "banned" | "restricted";

export type SearchTerm = { negated: boolean } & (
  | { kind: "name"; value: string }
  | { kind: "type"; value: string }
  | { kind: "oracle"; value: string }
  /** An empty color list means colorless. */
  | { kind: "color"; field: ColorField; operator: Comparison; colors: Color[] }
  /** Two or more colors. */
  | { kind: "multicolor"; field: ColorField }
  | { kind: "manaValue"; operator: Comparison; value: number }
  | { kind: "rarity"; operator: Comparison; value: Rarity }
  | { kind: "set"; value: string }
  | { kind: "legality"; format: Format; status: LegalityStatus }
);

export type ParsedQuery = {
  terms: SearchTerm[];
  warnings: string[];
};

type Keyword =
  | "colors"
  | "identity"
  | "type"
  | "oracle"
  | "manaValue"
  | "rarity"
  | "set"
  | "legal"
  | "banned"
  | "restricted";

const KEYWORDS: Record<string, Keyword> = {
  c: "colors",
  color: "colors",
  colors: "colors",
  id: "identity",
  identity: "identity",
  ci: "identity",
  t: "type",
  type: "type",
  o: "oracle",
  oracle: "oracle",
  mv: "manaValue",
  cmc: "manaValue",
  manavalue: "manaValue",
  r: "rarity",
  rarity: "rarity",
  s: "set",
  set: "set",
  e: "set",
  edition: "set",
  f: "legal",
  format: "legal",
  legal: "legal",
  banned: "banned",
  restricted: "restricted",
};

const COLOR_NAMES: Record<string, Color> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

const RARITY_ALIASES: Record<string, Rarity> = {
  c: "common",
  u: "uncommon",
  r: "rare",
  s: "special",
  m: "mythic",
  b: "bonus",
};

const FORMAT_ALIASES: Record<string, Format> = {
  edh: "commander",
  pdh: "paupercommander",
  historicbrawl: "brawl",
};

type RawOperator = ":" | Comparison;

// Longest operators first so ">=" isn't read as ">" followed by "=".
const KEYWORD_PATTERN = /^([a-zA-Z]+)(>=|<=|:|=|<|>)([\s\S]*)$/;

/**
 * Split the query into tokens on whitespace, keeping quoted text (which may
 * contain spaces) inside its token. Quotes are left in place.
 */
function tokenize(query: string): { tokens: string[]; unclosedQuote: boolean } {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;

  for (const char of query) {
    if (char === '"') {
      inQuote = !inQuote;
      current += char;
    } else if (/\s/.test(char) && !inQuote) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);

  return { tokens, unclosedQuote: inQuote };
}

/** Drop the quote marks from a value and tidy its spacing. */
function unquote(value: string): string {
  return value.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

function parseColors(value: string): Color[] | "multicolor" | null {
  const lower = value.toLowerCase();
  if (lower === "c" || lower === "colorless") return [];
  if (lower === "m" || lower === "multicolor") return "multicolor";

  const named = COLOR_NAMES[lower];
  if (named) return [named];

  const found = new Set<Color>();
  for (const letter of lower.toUpperCase()) {
    if (!(COLOR_ORDER as readonly string[]).includes(letter)) return null;
    found.add(letter as Color);
  }
  return COLOR_ORDER.filter((color) => found.has(color));
}

function parseRarity(value: string): Rarity | null {
  const lower = value.toLowerCase();
  if ((RARITY_ORDER as readonly string[]).includes(lower)) return lower as Rarity;
  return RARITY_ALIASES[lower] ?? null;
}

function parseFormat(value: string): Format | null {
  const lower = value.toLowerCase().replace(/[\s_-]/g, "");
  if ((FORMATS as readonly string[]).includes(lower)) return lower as Format;
  return FORMAT_ALIASES[lower] ?? null;
}

function parseKeywordTerm(
  keyword: Keyword,
  name: string,
  operator: RawOperator,
  value: string,
  negated: boolean,
): SearchTerm | string {
  const isEquality = operator === ":" || operator === "=";
  const textOnly = () => `"${name}" only works with ":", so "${name}${operator}${value}" was ignored.`;

  switch (keyword) {
    case "type":
    case "oracle":
      if (!isEquality) return textOnly();
      return { kind: keyword, value, negated };

    case "set":
      if (!isEquality) return textOnly();
      return { kind: "set", value: value.toLowerCase(), negated };

    case "legal":
    case "banned":
    case "restricted": {
      if (!isEquality) return textOnly();
      const format = parseFormat(value);
      if (!format) return `Unknown format "${value}" was ignored.`;
      return {
        kind: "legality",
        format,
        status: keyword === "legal" ? "legal" : keyword,
        negated,
      };
    }

    case "colors":
    case "identity": {
      const field: ColorField = keyword === "colors" ? "colors" : "color_identity";
      const colors = parseColors(value);
      if (colors === null) {
        return `"${value}" isn't a color (use w, u, b, r, g, c or m), so "${name}${operator}${value}" was ignored.`;
      }
      if (colors === "multicolor") return { kind: "multicolor", field, negated };
      // Like Scryfall, "c:" means "at least these colors" and "id:" means
      // "within these colors". "c:c" means exactly colorless.
      let resolved: Comparison;
      if (operator !== ":") resolved = operator;
      else if (field === "color_identity") resolved = "<=";
      else resolved = colors.length === 0 ? "=" : ">=";
      return { kind: "color", field, operator: resolved, colors, negated };
    }

    case "manaValue": {
      const number = Number(value);
      if (value.trim() === "" || !Number.isFinite(number)) {
        return `"${value}" isn't a number, so "${name}${operator}${value}" was ignored.`;
      }
      return {
        kind: "manaValue",
        operator: operator === ":" ? "=" : operator,
        value: number,
        negated,
      };
    }

    case "rarity": {
      const rarity = parseRarity(value);
      if (!rarity) return `Unknown rarity "${value}" was ignored.`;
      return {
        kind: "rarity",
        operator: operator === ":" ? "=" : operator,
        value: rarity,
        negated,
      };
    }
  }
}

export function parseQuery(query: string): ParsedQuery {
  const terms: SearchTerm[] = [];
  const warnings: string[] = [];
  const { tokens, unclosedQuote } = tokenize(query);

  if (unclosedQuote) warnings.push("A quote wasn't closed, so it runs to the end of the search.");

  for (const token of tokens) {
    const negated = token.startsWith("-") && token.length > 1;
    const body = negated ? token.slice(1) : token;
    if (body === "-") continue;

    const match = KEYWORD_PATTERN.exec(body);
    if (match) {
      const [, rawName = "", operator = ":", rawValue = ""] = match;
      const name = rawName.toLowerCase();
      const keyword = KEYWORDS[name];
      const value = unquote(rawValue);

      if (!keyword) {
        warnings.push(`Unknown keyword "${rawName}" was ignored.`);
        continue;
      }
      if (!value) {
        warnings.push(`"${rawName}${operator}" needs a value, so it was ignored.`);
        continue;
      }

      const term = parseKeywordTerm(keyword, name, operator as RawOperator, value, negated);
      if (typeof term === "string") warnings.push(term);
      else terms.push(term);
      continue;
    }

    const isQuoted = body.startsWith('"');
    const value = unquote(body);
    if (!value) continue;
    if (!isQuoted && value.toLowerCase() === "or") {
      warnings.push('"or" isn\'t supported yet, so every term has to match.');
      continue;
    }
    terms.push({ kind: "name", value, negated });
  }

  return { terms, warnings };
}
