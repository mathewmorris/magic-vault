import { detectCsvFormat, parseCsvList, SUPPORTED_FORMATS_MESSAGE } from "./csvFormats";
import { ImportParseError } from "./types";

// Sample exports written by hand in each site's column layout.
const MOXFIELD = [
  '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"',
  '"4","0","Lightning Bolt","2ed","Near Mint","English","","","2026-01-02 10:00:00.000000","162","False","False",""',
  '"1","0","Borborygmos, Enraged","dis","Lightly Played","Japanese","foil","","2026-01-02 10:00:00.000000","99","False","False",""',
  '"1","0","Sol Ring","cmm","Near Mint","English","etched","","2026-01-02 10:00:00.000000","464","False","False",""',
].join("\n");

const ARCHIDEKT = [
  "Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,MTGO ID,Collector Number",
  "2,Counterspell,Normal,NM,2026-03-01,EN,,,Alpha,lea,202,0df55e3f-14de-46ef-b6b1-616618724d9e,,54",
  '1,"Fire // Ice",Foil,MP,2026-03-01,EN,,,Apocalypse,apc,,,,128',
].join("\r\n");

const MANABOX = [
  "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency",
  "Lightning Bolt,m10,Magic 2010,146,normal,common,3,1234,e3285e6b-3e79-4d7c-bf96-d920f973b80d,0.5,false,false,near_mint,en,USD",
  "Tarmogoyf,fut,Future Sight,153,foil,rare,1,5678,,90.0,false,false,light_played,de,USD",
].join("\n");

const DECKBOX = [
  "Count,Tradelist Count,Name,Edition,Edition Code,Card Number,Condition,Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,Printing Id,Printing Note,Tags,My Price",
  "1,0,Swords to Plowshares,Ice Age,ice,54,Good (Lightly Played),English,,,,,,,,,,,$2.00",
  "2,0,Llanowar Elves,Magic 2019,m19,314,Near Mint,English,foil,,,,,,,,,,$0.25",
].join("\n");

const DECKBOX_NO_CODE = [
  "Count,Name,Edition,Card Number,Condition,Language,Foil",
  "1,Swords to Plowshares,Ice Age,54,Played,English,",
].join("\n");

describe("detectCsvFormat", () => {
  test.each([
    [["Count", "Name", "Edition", "Collector Number", "Foil"], "moxfield"],
    [["Quantity", "Name", "Finish", "Edition Code"], "archidekt"],
    [["Name", "Set code", "Collector number", "Foil", "Quantity"], "manabox"],
    [["Count", "Name", "Edition", "Card Number", "Foil"], "deckbox"],
    [["count", "NAME", "edition"], "moxfield"],
  ])("%j is %s", (header, format) => {
    expect(detectCsvFormat(header)).toBe(format);
  });

  test("returns null for a header it doesn't know", () => {
    expect(detectCsvFormat(["Qty", "Card", "Set"])).toBeNull();
    expect(detectCsvFormat(["Count", "Edition"])).toBeNull();
  });
});

describe("parseCsvList", () => {
  test("reads a Moxfield export", () => {
    const parsed = parseCsvList(MOXFIELD);

    expect(parsed.format).toBe("moxfield");
    expect(parsed.errors).toStrictEqual([]);
    expect(parsed.rows).toStrictEqual([
      {
        lineNumber: 2,
        quantity: 4,
        name: "Lightning Bolt",
        setCode: "2ed",
        collectorNumber: "162",
        finish: "nonfoil",
        condition: "NM",
        language: "en",
        raw: MOXFIELD.split("\n")[1],
      },
      {
        lineNumber: 3,
        quantity: 1,
        name: "Borborygmos, Enraged",
        setCode: "dis",
        collectorNumber: "99",
        finish: "foil",
        condition: "LP",
        language: "ja",
        raw: MOXFIELD.split("\n")[2],
      },
      expect.objectContaining({ name: "Sol Ring", finish: "etched", setCode: "cmm", collectorNumber: "464" }),
    ]);
  });

  test("reads an Archidekt export, with its Scryfall ids", () => {
    const parsed = parseCsvList(ARCHIDEKT);

    expect(parsed.format).toBe("archidekt");
    expect(parsed.rows).toStrictEqual([
      expect.objectContaining({
        lineNumber: 2,
        quantity: 2,
        name: "Counterspell",
        setCode: "lea",
        setName: "Alpha",
        collectorNumber: "54",
        scryfallId: "0df55e3f-14de-46ef-b6b1-616618724d9e",
        finish: "nonfoil",
        condition: "NM",
        language: "en",
      }),
      expect.objectContaining({
        lineNumber: 3,
        name: "Fire // Ice",
        setCode: "apc",
        finish: "foil",
        condition: "MP",
      }),
    ]);
    expect(parsed.rows[1]).not.toHaveProperty("scryfallId");
  });

  test("reads a ManaBox export", () => {
    const parsed = parseCsvList(MANABOX);

    expect(parsed.format).toBe("manabox");
    expect(parsed.rows).toStrictEqual([
      expect.objectContaining({
        quantity: 3,
        name: "Lightning Bolt",
        setCode: "m10",
        setName: "Magic 2010",
        collectorNumber: "146",
        scryfallId: "e3285e6b-3e79-4d7c-bf96-d920f973b80d",
        finish: "nonfoil",
        condition: "NM",
        language: "en",
      }),
      expect.objectContaining({
        quantity: 1,
        name: "Tarmogoyf",
        finish: "foil",
        condition: "LP",
        language: "de",
      }),
    ]);
  });

  test("reads a Deckbox export, taking the set code from Edition Code", () => {
    const parsed = parseCsvList(DECKBOX);

    expect(parsed.format).toBe("deckbox");
    expect(parsed.rows).toStrictEqual([
      expect.objectContaining({
        quantity: 1,
        name: "Swords to Plowshares",
        setCode: "ice",
        setName: "Ice Age",
        collectorNumber: "54",
        condition: "LP",
        finish: "nonfoil",
      }),
      expect.objectContaining({ quantity: 2, name: "Llanowar Elves", setCode: "m19", finish: "foil" }),
    ]);
  });

  test("keeps Deckbox's set name when there's no Edition Code column", () => {
    const [swords] = parseCsvList(DECKBOX_NO_CODE).rows;

    expect(swords).toMatchObject({ setName: "Ice Age", collectorNumber: "54", condition: "MP" });
    expect(swords).not.toHaveProperty("setCode");
  });

  test("skips blank records and reports rows without a name or with a bad count", () => {
    const text = ["Count,Name,Edition", "1,Opt,xln", ",,", "two,Shock,m19", "3,,m19", "", "0,Duress,m19"].join("\n");
    const parsed = parseCsvList(text);

    expect(parsed.rows.map((parsed) => parsed.name)).toStrictEqual(["Opt"]);
    expect(parsed.errors).toStrictEqual([
      { lineNumber: 4, raw: "two,Shock,m19", message: "The count has to be a whole number of at least 1." },
      { lineNumber: 5, raw: "3,,m19", message: "There's no card name on this line." },
      { lineNumber: 7, raw: "0,Duress,m19", message: "The count has to be a whole number of at least 1." },
    ]);
  });

  test("counts an empty count as one copy", () => {
    expect(parseCsvList("Count,Name,Edition\n,Opt,xln").rows[0]?.quantity).toBe(1);
  });

  test("ignores a Scryfall id that isn't one", () => {
    const [opt] = parseCsvList("Count,Name,Edition,Scryfall ID\n1,Opt,xln,not-an-id").rows;
    expect(opt).not.toHaveProperty("scryfallId");
  });

  test("lowercases set codes and Scryfall ids", () => {
    const [opt] = parseCsvList("Count,Name,Edition,Scryfall ID\n1,Opt,XLN,0DF55E3F-14DE-46EF-B6B1-616618724D9E").rows;
    expect(opt).toMatchObject({ setCode: "xln", scryfallId: "0df55e3f-14de-46ef-b6b1-616618724d9e" });
  });

  test("throws, naming the supported formats, for a header it doesn't know", () => {
    expect(() => parseCsvList("Qty,Card,Set\n4,Lightning Bolt,2ED")).toThrow(ImportParseError);
    expect(() => parseCsvList("Qty,Card,Set\n4,Lightning Bolt,2ED")).toThrow(SUPPORTED_FORMATS_MESSAGE);
  });

  test("throws for an empty file", () => {
    expect(() => parseCsvList("")).toThrow("This CSV is empty.");
  });
});
