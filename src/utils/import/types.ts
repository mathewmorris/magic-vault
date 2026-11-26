import { type Finish } from "~/utils/price";

/** Card conditions, best first, using TCGplayer's grades. */
export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export type Condition = (typeof CONDITIONS)[number];

/** The most rows one import takes, and the most text (in characters). */
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_TEXT_LENGTH = 1_000_000;
/** The most copies one row can add. */
export const MAX_ROW_QUANTITY = 9999;

export const CSV_FORMATS = ["moxfield", "archidekt", "manabox", "deckbox"] as const;
export type CsvFormat = (typeof CSV_FORMATS)[number];
export type ImportFormat = "text" | CsvFormat;

/** What the user picks: let the parser decide, or force one kind. */
export const IMPORT_FORMAT_CHOICES = ["auto", "text", "csv"] as const;
export type ImportFormatChoice = (typeof IMPORT_FORMAT_CHOICES)[number];

/** One card line from an import, before it's matched to a card. */
export interface ImportRow {
  /** 1-based line the row starts on in the pasted text or file. */
  lineNumber: number;
  quantity: number;
  name: string;
  /** Lower-case set code, like "2ed". */
  setCode?: string;
  /** Set name, for CSVs that only give that (Deckbox). */
  setName?: string;
  collectorNumber?: string;
  /** Lower-case Scryfall card id. */
  scryfallId?: string;
  finish: Finish;
  condition: Condition;
  /** Scryfall language code, like "en". */
  language: string;
  /** The line (or CSV record) as it was written. */
  raw: string;
}

/** A line that couldn't be read as a card. */
export interface ImportLineError {
  lineNumber: number;
  raw: string;
  message: string;
}

export interface ParsedImport {
  format: ImportFormat;
  rows: ImportRow[];
  errors: ImportLineError[];
}

/** The text can't be read at all, like a CSV with columns we don't know. */
export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportParseError";
  }
}
