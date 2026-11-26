import { ImportParseError } from "./types";

/** One CSV record: its fields, the line it starts on and its original text. */
export interface CsvRecord {
  /** 1-based line the record starts on. */
  lineNumber: number;
  fields: string[];
  /** The record as written, without its line ending. */
  raw: string;
}

/**
 * Reads CSV text the way RFC 4180 describes it: comma-separated fields,
 * records ending in CRLF or LF, and fields in double quotes that can hold
 * commas, line breaks and "" for a literal quote ("Borborygmos, Enraged").
 * A leading byte order mark is dropped. Lines that are completely empty are
 * skipped. An opening quote with no closing quote is an error.
 */
export function readCsv(text: string): CsvRecord[] {
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const records: CsvRecord[] = [];

  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  // Whether the current field had quotes, so `""` stays an empty field
  // instead of making the line look blank.
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let recordStart = 0;
  let i = 0;

  const endRecord = (end: number) => {
    fields.push(field);
    const blank = fields.length === 1 && fields[0] === "" && !quoted;
    if (!blank) {
      records.push({ lineNumber: recordLine, fields, raw: input.slice(recordStart, end) });
    }
    fields = [];
    field = "";
    quoted = false;
  };

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (char === "\n") line += 1;
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      // A quote only opens a quoted field at the start of the field. One in
      // the middle (6" Ruler) is kept as it is, which is what most
      // spreadsheet apps do too.
      if (field === "" && !quoted) {
        inQuotes = true;
        quoted = true;
      } else {
        field += char;
      }
      i += 1;
      continue;
    }

    if (char === ",") {
      fields.push(field);
      field = "";
      quoted = false;
      i += 1;
      continue;
    }

    if (char === "\r" || char === "\n") {
      endRecord(i);
      i += char === "\r" && input[i + 1] === "\n" ? 2 : 1;
      line += 1;
      recordLine = line;
      recordStart = i;
      continue;
    }

    field += char;
    i += 1;
  }

  if (inQuotes) {
    throw new ImportParseError(`Line ${recordLine} has a quote that's never closed.`);
  }

  // The last record, unless the text ended with a line break.
  if (recordStart < input.length) {
    endRecord(input.length);
  }

  return records;
}

/** Quotes a CSV field when it needs it (commas, quotes, line breaks, edge spaces). */
export function csvField(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Writes rows as CSV text with CRLF line endings, ending in a line break. */
export function writeCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
