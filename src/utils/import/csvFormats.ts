import { readCsv } from "./csv";
import {
  ImportParseError,
  MAX_ROW_QUANTITY,
  type CsvFormat,
  type ImportLineError,
  type ImportRow,
  type ParsedImport,
} from "./types";
import { normalizeCondition, normalizeFinish, normalizeLanguage } from "./values";

/**
 * Collection CSV exports from Moxfield, Archidekt, ManaBox and Deckbox.
 * Which one a file is comes from its header row; column order doesn't
 * matter and extra columns are ignored. The one real difference is the set:
 * Moxfield's "Edition" is a set code ("2ed") while Deckbox's is a set name
 * ("Unlimited Edition"), with the code in "Edition Code" when it's there.
 */

export const SUPPORTED_FORMATS_MESSAGE =
  "Supported formats are CSV exports from Moxfield, Archidekt, ManaBox and Deckbox, " +
  'or a plain text list like "4 Lightning Bolt (2ED) 162".';

/** Header names compared without case, spaces or underscores mattering. */
export const headerKey = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_]+/g, " ");

type Column =
  | "quantity"
  | "name"
  | "setCode"
  | "setName"
  | "collectorNumber"
  | "finish"
  | "condition"
  | "language"
  | "scryfallId";

type ColumnNames = Partial<Record<Column, string[]>>;

const COMMON: ColumnNames = {
  name: ["name", "card name"],
  condition: ["condition"],
  language: ["language", "lang"],
  scryfallId: ["scryfall id", "scryfallid"],
};

const FORMAT_COLUMNS: Record<CsvFormat, ColumnNames> = {
  moxfield: {
    ...COMMON,
    quantity: ["count"],
    setCode: ["edition"],
    collectorNumber: ["collector number"],
    finish: ["foil"],
  },
  archidekt: {
    ...COMMON,
    quantity: ["quantity"],
    setCode: ["edition code"],
    setName: ["edition name"],
    collectorNumber: ["collector number"],
    finish: ["finish"],
  },
  manabox: {
    ...COMMON,
    quantity: ["quantity"],
    setCode: ["set code"],
    setName: ["set name"],
    collectorNumber: ["collector number"],
    finish: ["foil"],
  },
  deckbox: {
    ...COMMON,
    quantity: ["count"],
    setCode: ["edition code"],
    setName: ["edition"],
    collectorNumber: ["card number"],
    finish: ["foil"],
  },
};

/** Every header name any format uses, to tell a CSV from a text list. */
export const KNOWN_HEADERS = new Set(
  Object.values(FORMAT_COLUMNS).flatMap((columns) => Object.values(columns).flat()),
);

/** Which site a CSV header row comes from, or null when it's none we know. */
export function detectCsvFormat(header: string[]): CsvFormat | null {
  const has = new Set(header.map(headerKey));
  if (!has.has("name")) return null;
  if (has.has("quantity") && has.has("finish")) return "archidekt";
  if (has.has("quantity") && has.has("set code")) return "manabox";
  if (has.has("count") && has.has("card number")) return "deckbox";
  if (has.has("count") && has.has("edition")) return "moxfield";
  return null;
}

const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseCsvList(text: string): ParsedImport {
  const records = readCsv(text);
  const header = records[0];
  if (!header) {
    throw new ImportParseError(`This CSV is empty. ${SUPPORTED_FORMATS_MESSAGE}`);
  }

  const format = detectCsvFormat(header.fields);
  if (!format) {
    throw new ImportParseError(
      `Couldn't tell which site this CSV came from from its header row. ${SUPPORTED_FORMATS_MESSAGE}`,
    );
  }

  const keys = header.fields.map(headerKey);
  const columns = FORMAT_COLUMNS[format];
  const indexOf = (column: Column) => {
    for (const name of columns[column] ?? []) {
      const index = keys.indexOf(name);
      if (index !== -1) return index;
    }
    return -1;
  };
  const index = {
    quantity: indexOf("quantity"),
    name: indexOf("name"),
    setCode: indexOf("setCode"),
    setName: indexOf("setName"),
    collectorNumber: indexOf("collectorNumber"),
    finish: indexOf("finish"),
    condition: indexOf("condition"),
    language: indexOf("language"),
    scryfallId: indexOf("scryfallId"),
  };

  const rows: ImportRow[] = [];
  const errors: ImportLineError[] = [];

  for (const record of records.slice(1)) {
    const { fields, lineNumber, raw } = record;
    if (fields.every((field) => field.trim() === "")) continue;

    const value = (column: keyof typeof index) => {
      const at = index[column];
      return at === -1 ? "" : (fields[at] ?? "").trim();
    };

    const name = value("name");
    if (name === "") {
      errors.push({ lineNumber, raw, message: "There's no card name on this line." });
      continue;
    }

    const quantityText = value("quantity");
    const quantity = quantityText === "" ? 1 : Number(quantityText);
    if (!Number.isInteger(quantity) || quantity < 1) {
      errors.push({ lineNumber, raw, message: "The count has to be a whole number of at least 1." });
      continue;
    }
    if (quantity > MAX_ROW_QUANTITY) {
      errors.push({ lineNumber, raw, message: `The count can be at most ${MAX_ROW_QUANTITY}.` });
      continue;
    }

    const setCode = value("setCode").toLowerCase();
    const setName = value("setName");
    const collectorNumber = value("collectorNumber");
    const scryfallId = value("scryfallId").toLowerCase();

    rows.push({
      lineNumber,
      quantity,
      name,
      ...(setCode ? { setCode } : {}),
      ...(setName ? { setName } : {}),
      ...(collectorNumber ? { collectorNumber } : {}),
      ...(SCRYFALL_ID.test(scryfallId) ? { scryfallId } : {}),
      finish: normalizeFinish(value("finish")),
      condition: normalizeCondition(value("condition")),
      language: normalizeLanguage(value("language")),
      raw,
    });
  }

  return { format, rows, errors };
}
