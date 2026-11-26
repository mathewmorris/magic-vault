import { csvField, readCsv, writeCsv } from "./csv";
import { ImportParseError } from "./types";

describe("readCsv", () => {
  test("splits plain fields and records", () => {
    expect(readCsv("Count,Name\n4,Lightning Bolt\n1,Counterspell\n")).toStrictEqual([
      { lineNumber: 1, fields: ["Count", "Name"], raw: "Count,Name" },
      { lineNumber: 2, fields: ["4", "Lightning Bolt"], raw: "4,Lightning Bolt" },
      { lineNumber: 3, fields: ["1", "Counterspell"], raw: "1,Counterspell" },
    ]);
  });

  test("keeps commas inside quoted fields", () => {
    expect(readCsv('"Count","Name"\n"1","Borborygmos, Enraged"')[1]?.fields).toStrictEqual([
      "1",
      "Borborygmos, Enraged",
    ]);
  });

  test('reads "" inside quotes as one quote', () => {
    expect(readCsv('1,"The ""Ultimate"" Nightmare"')[0]?.fields).toStrictEqual([
      "1",
      'The "Ultimate" Nightmare',
    ]);
  });

  test("keeps line breaks inside quoted fields and counts lines past them", () => {
    const records = readCsv('Name,Tags\n"Fire // Ice","burn\nmulti"\nOpt,\n');

    expect(records.map(({ lineNumber, fields }) => ({ lineNumber, fields }))).toStrictEqual([
      { lineNumber: 1, fields: ["Name", "Tags"] },
      { lineNumber: 2, fields: ["Fire // Ice", "burn\nmulti"] },
      { lineNumber: 4, fields: ["Opt", ""] },
    ]);
    expect(records[1]?.raw).toBe('"Fire // Ice","burn\nmulti"');
  });

  test("handles CRLF line endings and a missing final line break", () => {
    expect(readCsv("a,b\r\n1,2").map((record) => record.fields)).toStrictEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("keeps empty fields, including trailing ones", () => {
    expect(readCsv("1,,Opt,")[0]?.fields).toStrictEqual(["1", "", "Opt", ""]);
  });

  test("skips blank lines but keeps their line numbers counted", () => {
    expect(readCsv("a\n\n\nb\n").map(({ lineNumber, fields }) => [lineNumber, fields])).toStrictEqual([
      [1, ["a"]],
      [4, ["b"]],
    ]);
  });

  test("keeps a record that is just an empty quoted field", () => {
    expect(readCsv('""')).toStrictEqual([{ lineNumber: 1, fields: [""], raw: '""' }]);
  });

  test("drops a byte order mark", () => {
    expect(readCsv("﻿Count,Name")[0]?.fields).toStrictEqual(["Count", "Name"]);
  });

  test("keeps a quote in the middle of an unquoted field", () => {
    expect(readCsv('1,6" Ruler')[0]?.fields).toStrictEqual(["1", '6" Ruler']);
  });

  test("throws on a quote that's never closed", () => {
    expect(() => readCsv('Name\n"Lightning Bolt\n')).toThrow(ImportParseError);
    expect(() => readCsv('Name\n"Lightning Bolt\n')).toThrow("Line 2 has a quote that's never closed.");
  });

  test("returns nothing for empty text", () => {
    expect(readCsv("")).toStrictEqual([]);
  });
});

describe("csvField", () => {
  test("leaves plain values alone", () => {
    expect(csvField("Lightning Bolt")).toBe("Lightning Bolt");
    expect(csvField(4)).toBe("4");
  });

  test("quotes commas, quotes, line breaks and edge spaces", () => {
    expect(csvField("Borborygmos, Enraged")).toBe('"Borborygmos, Enraged"');
    expect(csvField('The "Ultimate" Nightmare')).toBe('"The ""Ultimate"" Nightmare"');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField(" padded")).toBe('" padded"');
  });
});

describe("writeCsv", () => {
  test("writes rows with CRLF endings that readCsv reads back", () => {
    const rows = [
      ["Count", "Name"],
      ["1", "Borborygmos, Enraged"],
      ["2", 'Kongming, "Sleeping Dragon"'],
    ];
    const text = writeCsv(rows);

    expect(text).toBe('Count,Name\r\n1,"Borborygmos, Enraged"\r\n2,"Kongming, ""Sleeping Dragon"""\r\n');
    expect(readCsv(text).map((record) => record.fields)).toStrictEqual(rows);
  });
});
