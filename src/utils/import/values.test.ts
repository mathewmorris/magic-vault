import {
  conditionLabel,
  isCondition,
  languageLabel,
  normalizeCondition,
  normalizeFinish,
  normalizeLanguage,
} from "./values";

describe("normalizeCondition", () => {
  test.each([
    ["Near Mint", "NM"],
    ["near_mint", "NM"],
    ["NM", "NM"],
    ["nm-m", "NM"],
    ["Mint", "NM"],
    ["", "NM"],
    ["Lightly Played", "LP"],
    ["light_played", "LP"],
    ["LP", "LP"],
    ["Excellent", "LP"],
    ["Good (Lightly Played)", "LP"],
    ["Moderately Played", "MP"],
    ["Played", "MP"],
    ["good", "MP"],
    ["Heavily Played", "HP"],
    ["HP", "HP"],
    ["Damaged", "DMG"],
    ["poor", "DMG"],
    ["D", "DMG"],
  ])("%j is %s", (word, condition) => {
    expect(normalizeCondition(word)).toBe(condition);
  });

  test("falls back to NM for words it doesn't know or no value", () => {
    expect(normalizeCondition("Pristine-ish")).toBe("NM");
    expect(normalizeCondition(undefined)).toBe("NM");
  });
});

describe("conditionLabel", () => {
  test("spells conditions out the way Moxfield does", () => {
    expect(conditionLabel("NM")).toBe("Near Mint");
    expect(conditionLabel("DMG")).toBe("Damaged");
  });

  test("leaves unknown values alone", () => {
    expect(conditionLabel("??")).toBe("??");
  });

  test("every label reads back as its condition", () => {
    for (const condition of ["NM", "LP", "MP", "HP", "DMG"]) {
      expect(normalizeCondition(conditionLabel(condition))).toBe(condition);
    }
  });
});

describe("isCondition", () => {
  test("knows the five conditions", () => {
    expect(isCondition("MP")).toBe(true);
    expect(isCondition("mp")).toBe(false);
    expect(isCondition(3)).toBe(false);
  });
});

describe("normalizeFinish", () => {
  test.each([
    ["foil", "foil"],
    ["Foil", "foil"],
    ["true", "foil"],
    ["etched", "etched"],
    ["Etched", "etched"],
    ["nonfoil", "nonfoil"],
    ["Non-Foil", "nonfoil"],
    ["Normal", "nonfoil"],
    ["", "nonfoil"],
    ["false", "nonfoil"],
  ])("%j is %s", (word, finish) => {
    expect(normalizeFinish(word)).toBe(finish);
  });

  test("falls back to non-foil for words it doesn't know", () => {
    expect(normalizeFinish("galaxy")).toBe("nonfoil");
    expect(normalizeFinish(undefined)).toBe("nonfoil");
  });
});

describe("normalizeLanguage", () => {
  test.each([
    ["English", "en"],
    ["en", "en"],
    ["EN", "en"],
    ["Japanese", "ja"],
    ["jp", "ja"],
    ["German", "de"],
    ["Chinese Simplified", "zhs"],
    ["Simplified Chinese", "zhs"],
    ["zh-TW", "zht"],
    ["Phyrexian", "ph"],
    ["", "en"],
  ])("%j is %s", (word, code) => {
    expect(normalizeLanguage(word)).toBe(code);
  });

  test("falls back to English for languages it doesn't know", () => {
    expect(normalizeLanguage("Klingon")).toBe("en");
  });
});

describe("languageLabel", () => {
  test("names the language, and reads back as the same code", () => {
    expect(languageLabel("ja")).toBe("Japanese");
    expect(normalizeLanguage(languageLabel("zht"))).toBe("zht");
  });

  test("leaves unknown codes alone", () => {
    expect(languageLabel("xx")).toBe("xx");
  });
});
