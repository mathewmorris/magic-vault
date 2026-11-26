import { ImportParseError, looksLikeCsv, parseImport } from "./index";

describe("looksLikeCsv", () => {
  test("spots a CSV header row", () => {
    expect(looksLikeCsv("Count,Name,Edition\n4,Lightning Bolt,2ed")).toBe(true);
    expect(looksLikeCsv('﻿\n\n"Quantity","Name","Finish"\n')).toBe(true);
    expect(looksLikeCsv("Qty,Card,Set")).toBe(false);
  });

  test("doesn't take a card name with a comma for a CSV", () => {
    expect(looksLikeCsv("4 Borborygmos, Enraged")).toBe(false);
    expect(looksLikeCsv("1 Name, the Unnamed")).toBe(false);
  });

  test("is false for empty text or a broken first line", () => {
    expect(looksLikeCsv("")).toBe(false);
    expect(looksLikeCsv('"Count,Name')).toBe(false);
  });
});

describe("parseImport", () => {
  test("auto reads a CSV as a CSV", () => {
    expect(parseImport("Count,Name,Edition\n4,Lightning Bolt,2ed").format).toBe("moxfield");
  });

  test("auto reads anything else as a text list", () => {
    const parsed = parseImport("4 Lightning Bolt\n2 Borborygmos, Enraged");

    expect(parsed.format).toBe("text");
    expect(parsed.rows.map((row) => row.name)).toStrictEqual(["Lightning Bolt", "Borborygmos, Enraged"]);
  });

  test("auto reads a CSV with columns it doesn't know as a CSV, so the error says why", () => {
    expect(() => parseImport("Count,Card Title,Set\n4,Lightning Bolt,2ed")).toThrow(ImportParseError);
  });

  test("can be told which kind the text is", () => {
    expect(parseImport("Count,Name,Edition", "text").rows[0]?.name).toBe("Count,Name,Edition");
    expect(() => parseImport("4 Lightning Bolt", "csv")).toThrow(ImportParseError);
  });
});
