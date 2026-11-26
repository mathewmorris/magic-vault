import { type Finish } from "~/utils/price";
import { CONDITIONS, type Condition } from "./types";

/**
 * Turning the words other sites use for condition, finish and language into
 * this app's values. Every site spells these differently (Moxfield writes
 * "Near Mint", ManaBox "near_mint", Archidekt "NM"), so matching is loose:
 * case, spaces, dashes and underscores don't matter. Blank or unknown values
 * fall back to the defaults (NM, non-foil, English) rather than failing the
 * whole line.
 */

const squash = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, " ");

const CONDITION_WORDS: Record<string, Condition> = {
  "": "NM",
  m: "NM",
  mt: "NM",
  mint: "NM",
  nm: "NM",
  "near mint": "NM",
  nearmint: "NM",
  "nm m": "NM",
  "nm/m": "NM",
  "near mint/mint": "NM",
  lp: "LP",
  "lightly played": "LP",
  "light played": "LP",
  "slightly played": "LP",
  sp: "LP",
  ex: "LP",
  excellent: "LP",
  "good (lightly played)": "LP",
  mp: "MP",
  "moderately played": "MP",
  played: "MP",
  pl: "MP",
  good: "MP",
  gd: "MP",
  hp: "HP",
  "heavily played": "HP",
  "heavy played": "HP",
  dmg: "DMG",
  d: "DMG",
  damaged: "DMG",
  poor: "DMG",
  po: "DMG",
};

export function isCondition(value: unknown): value is Condition {
  return typeof value === "string" && (CONDITIONS as readonly string[]).includes(value);
}

/** "Near Mint", "near_mint", "NM" and friends to NM, LP, MP, HP or DMG. */
export function normalizeCondition(value: string | undefined): Condition {
  return CONDITION_WORDS[squash(value ?? "")] ?? "NM";
}

const CONDITION_LABELS: Record<Condition, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

/** The long name for a condition, the way Moxfield writes it. */
export function conditionLabel(condition: string): string {
  return isCondition(condition) ? CONDITION_LABELS[condition] : condition;
}

const FINISH_WORDS: Record<string, Finish> = {
  "": "nonfoil",
  nonfoil: "nonfoil",
  "non foil": "nonfoil",
  normal: "nonfoil",
  regular: "nonfoil",
  no: "nonfoil",
  n: "nonfoil",
  false: "nonfoil",
  "0": "nonfoil",
  foil: "foil",
  foiled: "foil",
  f: "foil",
  yes: "foil",
  y: "foil",
  true: "foil",
  "1": "foil",
  etched: "etched",
  "etched foil": "etched",
  "foil etched": "etched",
  e: "etched",
};

/** "foil", "Etched", "normal", "" and friends to nonfoil, foil or etched. */
export function normalizeFinish(value: string | undefined): Finish {
  return FINISH_WORDS[squash(value ?? "")] ?? "nonfoil";
}

// Scryfall's language codes (https://scryfall.com/docs/api/languages).
const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  zhs: "Chinese Simplified",
  zht: "Chinese Traditional",
  he: "Hebrew",
  la: "Latin",
  grc: "Ancient Greek",
  ar: "Arabic",
  sa: "Sanskrit",
  ph: "Phyrexian",
};

const LANGUAGE_WORDS: Record<string, string> = {
  "": "en",
  jp: "ja",
  kr: "ko",
  cn: "zhs",
  zh: "zhs",
  "zh cn": "zhs",
  "zh hans": "zhs",
  "simplified chinese": "zhs",
  tw: "zht",
  "zh tw": "zht",
  "zh hant": "zht",
  "traditional chinese": "zht",
  "brazilian portuguese": "pt",
  "portuguese (brazil)": "pt",
};
for (const [code, label] of Object.entries(LANGUAGE_LABELS)) {
  LANGUAGE_WORDS[code] = code;
  LANGUAGE_WORDS[squash(label)] = code;
}

/** "English", "EN", "ja", "Japanese" and friends to Scryfall's language codes. */
export function normalizeLanguage(value: string | undefined): string {
  return LANGUAGE_WORDS[squash(value ?? "")] ?? "en";
}

/** The English name of a language code, the way Moxfield writes it. */
export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code;
}
