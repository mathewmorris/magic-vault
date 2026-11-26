import { type Finish } from "~/utils/price";
import {
  MAX_ROW_QUANTITY,
  type ImportLineError,
  type ImportRow,
  type ParsedImport,
} from "./types";

/**
 * Plain text card lists, one card per line, the way Moxfield, Archidekt,
 * MTG Arena and MTGO write them:
 *
 *   4 Lightning Bolt
 *   4x Lightning Bolt
 *   1 Lightning Bolt (2ED) 162
 *   1 Lightning Bolt (2ED) 162 *F*
 *
 * Blank lines, comments ("//" or "#") and section headers ("Deck",
 * "Sideboard", "Commander", ...) are skipped: a collection doesn't care
 * which part of a deck a card was in. Text lists say nothing about
 * condition or language, so those are always NM and English.
 */

const SECTION_HEADERS = new Set([
  "deck",
  "main",
  "maindeck",
  "main deck",
  "mainboard",
  "sideboard",
  "side board",
  "side",
  "commander",
  "commanders",
  "companion",
  "companions",
  "maybeboard",
  "maybe",
  "considering",
  "attractions",
  "stickers",
  "tokens",
  "about",
]);

// "Sideboard", "SIDEBOARD:", "Commander (1)".
function isSectionHeader(line: string): boolean {
  const word = line.toLowerCase().replace(/\s*\(\d+\)\s*$/, "").replace(/:$/, "").trim();
  return SECTION_HEADERS.has(word);
}

// Markers after the card: *F* (foil), *E* (etched), *CMDR* and others.
const MARKER = /(?:^|\s+)\*([A-Za-z]+)\*$/;
// Archidekt's trailing "^Have,#37d67a^" tags and "[Category]" labels, and
// Moxfield's "#tag" tags.
const ARCHIDEKT_TAGS = /\s+\^[^^]*\^$/;
const CATEGORY = /\s+\[[^\]]*\]$/;
const HASH_TAGS = /\s+#\S.*$/;
// "(2ED) 162" or "(2ED)" at the end; set codes are 2 to 6 letters and digits.
const PRINTING = /^(.*?)\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?$/;
// "[2ED]" at the end, when there's no "(2ED)".
const BRACKET_SET = /^(.*?)\s+\[([A-Za-z0-9]{2,6})\]$/;
const LEADING_COUNT = /^(\d+)\s*[xX]?\s+(.+)$/;
const TRAILING_COUNT = /^(.+?)\s+[xX](\d+)$/;

export function parseTextLine(line: string, lineNumber: number): ImportRow | ImportLineError {
  const raw = line;
  let rest = line.trim();
  let finish: Finish = "nonfoil";

  let quantityText: string | undefined;
  const leading = LEADING_COUNT.exec(rest);
  if (leading?.[1] && leading[2]) {
    quantityText = leading[1];
    rest = leading[2];
  } else {
    const trailing = TRAILING_COUNT.exec(rest);
    if (trailing?.[1] && trailing[2]) {
      rest = trailing[1];
      quantityText = trailing[2];
    }
  }
  const quantity = quantityText === undefined ? 1 : Number(quantityText);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { lineNumber, raw, message: "The count has to be at least 1." };
  }
  if (quantity > MAX_ROW_QUANTITY) {
    return { lineNumber, raw, message: `The count can be at most ${MAX_ROW_QUANTITY}.` };
  }

  rest = rest.replace(ARCHIDEKT_TAGS, "").replace(HASH_TAGS, "");

  // Markers and categories can come in any order, so peel them off the end
  // until there are none left.
  for (;;) {
    const marker = MARKER.exec(rest);
    if (marker) {
      const word = (marker[1] ?? "").toUpperCase();
      if (word === "F" || word === "FOIL") finish = "foil";
      if (word === "E" || word === "ETCHED") finish = "etched";
      rest = rest.slice(0, marker.index);
      continue;
    }
    // A bracketed label is a category unless it's the only set code on the line.
    const category = CATEGORY.exec(rest);
    if (category && (PRINTING.test(rest.slice(0, category.index)) || !BRACKET_SET.test(rest))) {
      rest = rest.slice(0, category.index);
      continue;
    }
    break;
  }

  let setCode: string | undefined;
  let collectorNumber: string | undefined;
  const printing = PRINTING.exec(rest) ?? BRACKET_SET.exec(rest);
  if (printing?.[1] && printing[2]) {
    rest = printing[1];
    setCode = printing[2].toLowerCase();
    collectorNumber = printing[3];
  }

  const name = rest.trim();
  if (name === "") {
    return { lineNumber, raw, message: "There's no card name on this line." };
  }

  return {
    lineNumber,
    quantity,
    name,
    ...(setCode ? { setCode } : {}),
    ...(collectorNumber ? { collectorNumber } : {}),
    finish,
    condition: "NM",
    language: "en",
    raw,
  };
}

export function parseTextList(text: string): ParsedImport {
  const rows: ImportRow[] = [];
  const errors: ImportLineError[] = [];
  // Arena puts the deck's name under "About" ("Name My Deck"); skip that.
  let inAbout = false;

  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("#")) return;
    if (isSectionHeader(trimmed)) {
      inAbout = trimmed.toLowerCase().startsWith("about");
      return;
    }
    if (inAbout && /^name\s/i.test(trimmed)) return;

    const parsed = parseTextLine(line, index + 1);
    if ("message" in parsed) {
      errors.push(parsed);
    } else {
      rows.push(parsed);
    }
  });

  return { format: "text", rows, errors };
}
