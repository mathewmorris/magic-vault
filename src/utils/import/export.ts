import { writeCsv } from "./csv";
import { conditionLabel, languageLabel } from "./values";

/**
 * Writing a collection out. The CSV uses Moxfield's column names, so the
 * file can be imported into Moxfield (and back into this app); the text
 * list uses the "4 Lightning Bolt (2ED) 162 *F*" form most sites read.
 */

export const EXPORT_FORMATS = ["csv", "text"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportEntry {
  count: number;
  finish: string;
  condition: string;
  language: string;
  card: {
    id: string;
    name: string;
    set: string | null;
    collector_number: string | null;
  };
}

export const EXPORT_CSV_HEADER = [
  "Count",
  "Name",
  "Edition",
  "Collector Number",
  "Foil",
  "Condition",
  "Language",
  "Scryfall ID",
];

const foilColumn = (finish: string) => (finish === "foil" || finish === "etched" ? finish : "");

export function toCsvExport(entries: ExportEntry[]): string {
  return writeCsv([
    EXPORT_CSV_HEADER,
    ...entries.map(({ count, finish, condition, language, card }) => [
      count,
      card.name,
      card.set ?? "",
      card.collector_number ?? "",
      foilColumn(finish),
      conditionLabel(condition),
      languageLabel(language),
      card.id,
    ]),
  ]);
}

export function toTextLine({ count, finish, card }: ExportEntry): string {
  let line = `${count} ${card.name}`;
  if (card.set) {
    line += ` (${card.set.toUpperCase()})`;
    if (card.collector_number) line += ` ${card.collector_number}`;
  }
  if (finish === "foil") line += " *F*";
  if (finish === "etched") line += " *E*";
  return line;
}

export function toTextExport(entries: ExportEntry[]): string {
  return entries.map(toTextLine).join("\n") + (entries.length > 0 ? "\n" : "");
}

/** A file name for a collection's export, like "my-collection.csv". */
export function exportFilename(collectionName: string | null | undefined, format: ExportFormat): string {
  const base = (collectionName ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "collection"}.${format === "csv" ? "csv" : "txt"}`;
}
