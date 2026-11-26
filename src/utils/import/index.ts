import { readCsv } from "./csv";
import { headerKey, KNOWN_HEADERS, parseCsvList } from "./csvFormats";
import { parseTextList } from "./text";
import { type ImportFormatChoice, type ParsedImport } from "./types";

export * from "./types";
export { readCsv, writeCsv, csvField } from "./csv";
export { parseCsvList, detectCsvFormat, SUPPORTED_FORMATS_MESSAGE } from "./csvFormats";
export { parseTextList, parseTextLine } from "./text";

/**
 * Whether pasted text is a CSV: its first line has at least two
 * comma-separated fields and one of them is a column name some site's
 * export uses ("Count", "Name", ...). A text line like
 * "4 Borborygmos, Enraged" has a comma but no column names.
 */
export function looksLikeCsv(text: string): boolean {
  const firstLine = text
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .find((line) => line.trim() !== "");
  if (!firstLine) return false;

  let fields: string[];
  try {
    fields = readCsv(firstLine)[0]?.fields ?? [];
  } catch {
    return false;
  }
  return fields.length >= 2 && fields.some((field) => KNOWN_HEADERS.has(headerKey(field)));
}

/**
 * Reads an import as a CSV export or a plain text list. "auto" decides by
 * the first line. Throws ImportParseError when the text can't be read at
 * all (an unknown CSV header, an unclosed quote); lines that can't be read
 * as a card come back in `errors` instead.
 */
export function parseImport(text: string, format: ImportFormatChoice = "auto"): ParsedImport {
  const csv = format === "csv" || (format === "auto" && looksLikeCsv(text));
  return csv ? parseCsvList(text) : parseTextList(text);
}
