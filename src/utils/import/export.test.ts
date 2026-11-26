import { exportFilename, toCsvExport, toTextExport, toTextLine, type ExportEntry } from "./export";
import { parseImport } from "./index";

const entry = (overrides: Partial<ExportEntry> & { card: ExportEntry["card"] }): ExportEntry => ({
  count: 1,
  finish: "nonfoil",
  condition: "NM",
  language: "en",
  ...overrides,
});

const ENTRIES: ExportEntry[] = [
  entry({
    count: 4,
    card: { id: "e3285e6b-3e79-4d7c-bf96-d920f973b80d", name: "Lightning Bolt", set: "2ed", collector_number: "162" },
  }),
  entry({
    finish: "foil",
    condition: "LP",
    language: "ja",
    card: { id: "0df55e3f-14de-46ef-b6b1-616618724d9e", name: "Borborygmos, Enraged", set: "dis", collector_number: "99" },
  }),
  entry({
    count: 2,
    finish: "etched",
    condition: "DMG",
    card: { id: "8f2b4c1e-0a6d-4c3b-9e7f-1d2c3b4a5e6f", name: "Fire // Ice", set: "apc", collector_number: "128" },
  }),
  entry({
    condition: "MP",
    language: "zhs",
    card: { id: "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b", name: 'Kongming, "Sleeping Dragon"', set: "ptk", collector_number: "8" },
  }),
];

describe("toCsvExport", () => {
  test("writes Moxfield's columns", () => {
    expect(toCsvExport(ENTRIES.slice(0, 2))).toBe(
      "Count,Name,Edition,Collector Number,Foil,Condition,Language,Scryfall ID\r\n" +
        "4,Lightning Bolt,2ed,162,,Near Mint,English,e3285e6b-3e79-4d7c-bf96-d920f973b80d\r\n" +
        '1,"Borborygmos, Enraged",dis,99,foil,Lightly Played,Japanese,0df55e3f-14de-46ef-b6b1-616618724d9e\r\n',
    );
  });

  test("leaves the set and number empty when a card has none", () => {
    expect(toCsvExport([entry({ card: { id: "x", name: "Opt", set: null, collector_number: null } })])).toContain(
      "1,Opt,,,,Near Mint,English,x\r\n",
    );
  });

  test("round-trips through the importer", () => {
    const parsed = parseImport(toCsvExport(ENTRIES));

    expect(parsed.format).toBe("moxfield");
    expect(parsed.errors).toStrictEqual([]);
    expect(
      parsed.rows.map(({ quantity, name, setCode, collectorNumber, scryfallId, finish, condition, language }) => ({
        quantity,
        name,
        setCode,
        collectorNumber,
        scryfallId,
        finish,
        condition,
        language,
      })),
    ).toStrictEqual(
      ENTRIES.map(({ count, finish, condition, language, card }) => ({
        quantity: count,
        name: card.name,
        setCode: card.set,
        collectorNumber: card.collector_number,
        scryfallId: card.id,
        finish,
        condition,
        language,
      })),
    );
  });
});

describe("toTextLine", () => {
  test("writes count, name, set, number and finish", () => {
    expect(toTextLine(ENTRIES[0]!)).toBe("4 Lightning Bolt (2ED) 162");
    expect(toTextLine(ENTRIES[1]!)).toBe("1 Borborygmos, Enraged (DIS) 99 *F*");
    expect(toTextLine(ENTRIES[2]!)).toBe("2 Fire // Ice (APC) 128 *E*");
  });

  test("leaves out what a card doesn't have", () => {
    expect(toTextLine(entry({ card: { id: "x", name: "Opt", set: null, collector_number: "1" } }))).toBe("1 Opt");
    expect(toTextLine(entry({ card: { id: "x", name: "Opt", set: "xln", collector_number: null } }))).toBe("1 Opt (XLN)");
  });
});

describe("toTextExport", () => {
  test("writes one line per entry", () => {
    expect(toTextExport(ENTRIES.slice(0, 2))).toBe("4 Lightning Bolt (2ED) 162\n1 Borborygmos, Enraged (DIS) 99 *F*\n");
    expect(toTextExport([])).toBe("");
  });

  test("round-trips through the importer (without condition and language, which text lists don't have)", () => {
    const parsed = parseImport(toTextExport(ENTRIES));

    expect(parsed.format).toBe("text");
    expect(
      parsed.rows.map(({ quantity, name, setCode, collectorNumber, finish }) => ({ quantity, name, setCode, collectorNumber, finish })),
    ).toStrictEqual(
      ENTRIES.map(({ count, finish, card }) => ({
        quantity: count,
        name: card.name,
        setCode: card.set,
        collectorNumber: card.collector_number,
        finish,
      })),
    );
  });
});

describe("exportFilename", () => {
  test("makes a tidy file name from the collection's name", () => {
    expect(exportFilename("My Collection", "csv")).toBe("my-collection.csv");
    expect(exportFilename("Lim-Dûl's Vault!", "text")).toBe("lim-dul-s-vault.txt");
  });

  test("falls back to collection when there's no usable name", () => {
    expect(exportFilename(null, "csv")).toBe("collection.csv");
    expect(exportFilename("???", "text")).toBe("collection.txt");
  });
});
