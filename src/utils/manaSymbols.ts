/**
 * Splits Scryfall's symbol text ("{2}{W/U}{T}", or oracle text like
 * "{T}: Add {G}.") into plain text and symbol tokens, so the UI can swap each
 * symbol for Scryfall's SVG.
 *
 * Symbol list: https://scryfall.com/docs/api/card-symbols
 */

export type SymbolSegment =
  | { type: "text"; value: string }
  | { type: "symbol"; value: string };

export const SYMBOL_IMAGE_BASE = "https://svgs.scryfall.io/card-symbols/";

// Letters, digits, "/" and the two odd symbols Scryfall uses ({½}, {∞}).
// Anything else in braces stays plain text.
const SYMBOL = /\{[A-Za-z0-9/½∞]{1,12}\}/g;

/** Break text into text and symbol segments, in order, dropping empty text. */
export function splitSymbols(text: string): SymbolSegment[] {
  const segments: SymbolSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(SYMBOL)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", value: text.slice(last, index) });
    segments.push({ type: "symbol", value: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

/** Just the symbol tokens of a mana cost: "{2}{W/U}{T}" -> ["{2}", "{W/U}", "{T}"]. */
export function parseSymbols(cost: string): string[] {
  return splitSymbols(cost).flatMap((segment) =>
    segment.type === "symbol" ? [segment.value] : [],
  );
}

/**
 * Scryfall's SVG for a token: braces and "/" removed, uppercased.
 * "{W/U}" -> WU.svg, "{2/W}" -> 2W.svg, "{T}" -> T.svg.
 */
export function symbolImageUrl(token: string): string {
  const name = token.replace(/[{}/]/g, "").toUpperCase();
  return `${SYMBOL_IMAGE_BASE}${encodeURIComponent(name)}.svg`;
}

/**
 * Oracle text as lines of segments. Scryfall separates abilities with "\n",
 * so each line becomes its own paragraph in the UI.
 */
export function splitOracleText(text: string): SymbolSegment[][] {
  return text.split("\n").map((line) => splitSymbols(line));
}
