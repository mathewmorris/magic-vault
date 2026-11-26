/**
 * Turn the search page's filter panel into search syntax, so whatever the
 * panel picks shows up in the search box and the URL like typed terms do.
 */
import { COLOR_ORDER, type Color, type Format, type Rarity } from "./parseQuery";

export type ColorMode = "including" | "exactly" | "atMost";

export type SearchFilters = {
  colors: Color[];
  colorMode: ColorMode;
  identity: Color[];
  type: string;
  rarity: Rarity | "";
  set: string;
  format: Format | "";
  mvMin: string;
  mvMax: string;
};

export const EMPTY_FILTERS: SearchFilters = {
  colors: [],
  colorMode: "including",
  identity: [],
  type: "",
  rarity: "",
  set: "",
  format: "",
  mvMin: "",
  mvMax: "",
};

const COLOR_MODE_OPERATORS: Record<ColorMode, string> = {
  including: ":",
  exactly: "=",
  atMost: "<=",
};

const letters = (colors: Color[]) =>
  COLOR_ORDER.filter((color) => colors.includes(color)).join("").toLowerCase();

/** A value as it would be typed: quotes dropped, and quoted if it has spaces. */
function typedValue(value: string): string {
  const clean = value.replace(/"/g, "").replace(/\s+/g, " ").trim();
  return clean.includes(" ") ? `"${clean}"` : clean;
}

function manaValue(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function filterTerms(filters: SearchFilters): string[] {
  const terms: string[] = [];

  if (filters.colors.length > 0) {
    terms.push(`c${COLOR_MODE_OPERATORS[filters.colorMode]}${letters(filters.colors)}`);
  }
  if (filters.identity.length > 0) terms.push(`id:${letters(filters.identity)}`);

  const type = typedValue(filters.type);
  if (type) terms.push(`t:${type}`);

  if (filters.rarity) terms.push(`r:${filters.rarity}`);

  const set = filters.set.replace(/[\s"]/g, "").toLowerCase();
  if (set) terms.push(`s:${set}`);

  if (filters.format) terms.push(`f:${filters.format}`);

  const min = manaValue(filters.mvMin);
  const max = manaValue(filters.mvMax);
  if (min !== null && min === max) {
    terms.push(`mv=${min}`);
  } else {
    if (min !== null) terms.push(`mv>=${min}`);
    if (max !== null) terms.push(`mv<=${max}`);
  }

  return terms;
}

/** Add terms to the end of a query. */
export function appendTerms(query: string, terms: string[]): string {
  return [query.trim(), ...terms].filter(Boolean).join(" ");
}
