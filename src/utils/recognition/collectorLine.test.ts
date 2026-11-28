import { isEmptyCollectorInfo, parseCollectorInfo, type CollectorInfo } from "./collectorLine";

type Expected = Partial<CollectorInfo>;

function expectInfo(text: string, expected: Expected) {
  const info = parseCollectorInfo(text);
  for (const [key, value] of Object.entries(expected)) {
    expect({ text, [key]: info[key as keyof CollectorInfo] }).toEqual({ text, [key]: value });
  }
}

describe("parseCollectorInfo", () => {
  describe("clean reads", () => {
    test.each<[string, Expected]>([
      [
        "0157/280 R\nM21 • EN",
        { collectorNumber: "157", total: "280", rarity: "R", setCode: "m21", lang: "en" },
      ],
      [
        "R 0157\nMKM • EN",
        { collectorNumber: "157", total: null, rarity: "R", setCode: "mkm", lang: "en" },
      ],
      [
        "035/264 C\nDOM • DE",
        { collectorNumber: "35", total: "264", rarity: "C", setCode: "dom", lang: "de" },
      ],
      [
        "0001/0281 M\nZNR • JP",
        { collectorNumber: "1", total: "281", rarity: "M", setCode: "znr", lang: "ja" },
      ],
      ["U 0042\nLTR • EN", { collectorNumber: "42", rarity: "U", setCode: "ltr", lang: "en" }],
      ["M 0332\nOTJ • FR", { collectorNumber: "332", rarity: "M", setCode: "otj", lang: "fr" }],
      ["0071/332 U\n2XM • EN", { collectorNumber: "71", setCode: "2xm", lang: "en" }],
      ["0017 C\nPLST • EN", { collectorNumber: "17", rarity: "C", setCode: "plst", lang: "en" }],
      ["S 0007\nSLD • EN", { collectorNumber: "7", rarity: "S", setCode: "sld", lang: "en" }],
      ["0230/264 L\nDMU • EN", { collectorNumber: "230", rarity: "L", total: "264" }],
      ["T 0003\nTMKM • EN", { collectorNumber: "3", rarity: "T", setCode: "tmkm" }],
      ["0284/383 R\n10E • IT", { collectorNumber: "284", setCode: "10e", lang: "it" }],
    ])("%j", (text, expected) => expectInfo(text, expected));
  });

  describe("languages", () => {
    test.each<[string, string]>([
      ["STX • ES", "es"],
      ["STX • PT", "pt"],
      ["STX • KO", "ko"],
      ["STX • RU", "ru"],
      ["STX • ZHS", "zhs"],
      ["STX • ZHT", "zht"],
      ["STX • CS", "zhs"],
      ["STX • CT", "zht"],
      ["STX • JA", "ja"],
      ["ONE • PH", "ph"],
    ])("%j -> %s", (text, lang) => expectInfo(`0001/0275 C\n${text}`, { lang }));
  });

  describe("the bullet between set and language", () => {
    test.each<[string]>([
      ["M21 * EN"],
      ["M21 - EN"],
      ["M21 + EN"],
      ["M21 e EN"],
      ["M21 . EN"],
      ["M21.EN"],
      ["M21eEN"],
      ["M21 · EN"],
      ["M21 °EN"],
      ["M21 EN"],
      ["M21EN"],
      ["M21 o EN"],
      ["M21 ** EN"],
      ["M21 •EN"],
    ])("%j", (line) => expectInfo(`0157/280 R\n${line}`, { setCode: "m21", lang: "en" }));

    test("a lower case e separator stays out of the set code", () => {
      expectInfo("0042/302 U\nNEOeEN", { setCode: "neo", lang: "en", collectorNumber: "42" });
    });

    test("language read in mixed case", () => {
      expectInfo("0157/280 R\nM21 • En", { setCode: "m21", lang: "en" });
    });

    test("everything read lower case", () => {
      expectInfo("0157/280 r\nm21 • en", { setCode: "m21", lang: "en", rarity: "R" });
    });
  });

  describe("the foil mark (star on foils, dot on non-foils)", () => {
    test.each<[string]>([["M21 ★ EN"], ["M21★EN"], ["M21 ☆ EN"], ["M21 ★EN"], ["M21 ★"]])(
      "a star is foil: %j",
      (line) => expectInfo(`0157/280 R\n${line}`, { setCode: "m21", foilMark: "foil" }),
    );

    test("a star on a 2023+ card still reads the set and language", () => {
      expectInfo("R 0157\nMKM ★ EN", { setCode: "mkm", lang: "en", collectorNumber: "157", foilMark: "foil" });
    });

    test.each<[string]>([["M21 • EN"], ["M21•EN"], ["M21 · EN"], ["M21 ● EN"], ["M21.EN"], ["M21 •"]])(
      "a dot is non-foil: %j",
      (line) => expectInfo(`0157/280 R\n${line}`, { setCode: "m21", foilMark: "nonfoil" }),
    );

    // "*" is how both the dot and a blurry star come out, so it says nothing.
    test.each<[string]>([
      ["M21 * EN"],
      ["M21 ** EN"],
      ["M21 - EN"],
      ["M21 + EN"],
      ["M21 e EN"],
      ["M21eEN"],
      ["M21 o EN"],
      ["M21 °EN"],
      ["M21 EN"],
      ["M21EN"],
      ["M21 ★• EN"],
    ])("anything else is unknown: %j", (line) =>
      expectInfo(`0157/280 R\n${line}`, { setCode: "m21", foilMark: null }),
    );

    test("a star suffix on the collector number is not the foil mark", () => {
      expectInfo("7★ R\nPM21 • EN", { collectorNumber: "7★", foilMark: "nonfoil" });
      expectInfo("7★ R", { collectorNumber: "7★", foilMark: null });
    });

    test("no set line, no foil mark", () => {
      expectInfo("0157/280 R", { foilMark: null });
    });
  });

  describe("digit confusions in the numbers", () => {
    test.each<[string, Expected]>([
      ["O157/28O R\nM21 • EN", { collectorNumber: "157", total: "280" }],
      ["0l57/280 R\nM21 • EN", { collectorNumber: "157" }],
      ["0I57/280 R\nM21 • EN", { collectorNumber: "157" }],
      ["O1S7/2B0 R\nM21 • EN", { collectorNumber: "157", total: "280" }],
      ["0|57/280 R", { collectorNumber: "157" }],
      ["R O1S7\nMKM • EN", { collectorNumber: "157", rarity: "R" }],
      ["R 0O42\nMKM * EN", { collectorNumber: "42" }],
    ])("%j", (text, expected) => expectInfo(text, expected));
  });

  describe("the slash", () => {
    test.each<[string, Expected]>([
      ["0157 / 280 R", { collectorNumber: "157", total: "280", rarity: "R" }],
      ["0157|280 R", { collectorNumber: "157", total: "280" }],
      ["0157\\280 R", { collectorNumber: "157", total: "280" }],
      ["0157/280R", { collectorNumber: "157", total: "280", rarity: "R" }],
    ])("%j", (text, expected) => expectInfo(text, expected));
  });

  describe("collector number suffixes", () => {
    test.each<[string, string]>([
      ["0123a/280 R\nM21 • EN", "123a"],
      ["0123b C\nMH2 • EN", "123b"],
      ["7★ R\nPM21 • EN", "7★"],
      ["7☆ R\nPM21 • EN", "7★"],
      ["0045† U\nKHM • EN", "45†"],
      ["0157s R\nPM21 • EN", "157s"],
      ["0157p R\nPM21 • EN", "157p"],
    ])("%j -> %s", (text, collectorNumber) => expectInfo(text, { collectorNumber }));
  });

  describe("noise around the text", () => {
    test.each<[string, Expected]>([
      [
        '"| 0157/280 R ,\n_ M21. EN ~ Lucas Graciano',
        { collectorNumber: "157", total: "280", rarity: "R", setCode: "m21", lang: "en" },
      ],
      [
        "| ' 0042/302 U\n—NEO * EN 7 Kekai Kotaki",
        { collectorNumber: "42", setCode: "neo", lang: "en", rarity: "U" },
      ],
      [
        "R 0157 .\nMKM • EN « Sidharth Chaturvedi\n",
        { collectorNumber: "157", setCode: "mkm", lang: "en", rarity: "R" },
      ],
      [
        "0157/280 R\nM21 • EN © 2020 Wizards of the Coast",
        { collectorNumber: "157", setCode: "m21" },
      ],
      ["  \n\n 0157/280 R \n\n M21 • EN \n", { collectorNumber: "157", setCode: "m21" }],
    ])("%j", (text, expected) => expectInfo(text, expected));
  });

  describe("partial reads", () => {
    test("only the number line", () => {
      expect(parseCollectorInfo("0157/280 R")).toEqual({
        collectorNumber: "157",
        setCode: null,
        lang: null,
        rarity: "R",
        total: "280",
        foilMark: null,
      });
    });

    test("only the set line", () => {
      expect(parseCollectorInfo("M21 • EN")).toEqual({
        collectorNumber: null,
        setCode: "m21",
        lang: "en",
        rarity: null,
        total: null,
        foilMark: "nonfoil",
      });
    });

    test("set with a bullet but no language", () => {
      expectInfo("0157/280 R\nM21 •", {
        setCode: "m21",
        lang: null,
        collectorNumber: "157",
        foilMark: "nonfoil",
      });
    });

    test("number without rarity", () => {
      expectInfo("0157/280\nM21 • EN", { collectorNumber: "157", rarity: null, total: "280" });
    });

    test("a lone rarity letter with no number is ignored", () => {
      expectInfo("R\nM21 • EN", { rarity: null, collectorNumber: null });
    });

    test("the set code's digits are not the collector number", () => {
      expectInfo("2XM • EN", { collectorNumber: null, setCode: "2xm" });
      expectInfo("M21 • EN", { collectorNumber: null });
    });

    test("a copyright year is not the collector number", () => {
      expectInfo("M21 • EN ™ & © 2020 Wizards", { collectorNumber: null });
    });
  });

  describe("nothing usable", () => {
    test.each<[string]>([[""], ["   "], ["~~~ ,,, ___"], ["Lucas Graciano"], ["lIl |!| ii"], ["SOS"]])(
      "%j",
      (text) => {
        const info = parseCollectorInfo(text);
        expect(info.collectorNumber).toBeNull();
        expect(info.rarity).toBeNull();
      },
    );

    test("empty text reads as empty", () => {
      expect(isEmptyCollectorInfo(parseCollectorInfo(""))).toBe(true);
      expect(isEmptyCollectorInfo(parseCollectorInfo("0157/280 R"))).toBe(false);
    });

    test("numbers too long to be collector numbers are skipped", () => {
      expectInfo("123456 R", { collectorNumber: null });
    });
  });
});
