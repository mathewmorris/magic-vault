/**
 * Read the collector info printed at the bottom left of a modern card out of
 * noisy OCR text.
 *
 * The two lines look like this:
 *   2015 to 2022:  "0157/280 R"   then  "M21 • EN  <brush> Artist Name"
 *   2023 onward:   "R 0157"       then  "MKM • EN  <brush> Artist Name"
 *
 * Tesseract on a 10-pixel-tall line from a phone photo gets a lot of this
 * wrong in predictable ways: O for 0, I/l/| for 1, S for 5, B for 8 in the
 * numbers; the "•" between set and language read as "*", "-", "+", ".", or a
 * lone "e"; stray pipes and quotes from the card border. This parser undoes
 * the predictable mistakes and refuses to guess at the rest: every field is
 * null unless something on the line plausibly is that field.
 *
 * setCode and lang come back in Scryfall's lowercase form ("m21", "en", "ja")
 * so they can be compared to card rows directly.
 *
 * Foil mark: on 2015+ cards the glyph between set code and language is a
 * star on foils ("M21 ★ EN") and a dot on non-foils ("M21 • EN"). OCR
 * mangles both, and the dot's most common misread, "*", is also what a
 * badly read star turns into, so foilMark is conservative: "foil" only for a
 * real star glyph (★ ☆), "nonfoil" only for a real dot (• · ∙ ● or "."),
 * and null for everything else ("*", "+", "-", a letter, no separator).
 */

export type Rarity = "C" | "U" | "R" | "M" | "S" | "T" | "L";

export type CollectorInfo = {
  /** As Scryfall writes it: no leading zeros, suffix kept ("157", "123a", "7★"). */
  collectorNumber: string | null;
  /** Lowercase set code, e.g. "m21", "2xm", "plst". */
  setCode: string | null;
  /** Scryfall language code, e.g. "en", "ja", "zhs". */
  lang: string | null;
  rarity: Rarity | null;
  /** The set size after the slash on 2015-2022 cards, e.g. "280". */
  total: string | null;
  /**
   * What the separator between set code and language says about the finish:
   * a star is printed on foils, a dot on non-foils. Null when it didn't read
   * clearly as either (see the header).
   */
  foilMark: FoilMark | null;
};

export type FoilMark = "foil" | "nonfoil";

/** Printed language code -> Scryfall's code. Cards print JP, CS and CT. */
const LANGUAGES: Record<string, string> = {
  EN: "en",
  ES: "es",
  FR: "fr",
  DE: "de",
  IT: "it",
  PT: "pt",
  JA: "ja",
  JP: "ja",
  KO: "ko",
  KR: "ko",
  RU: "ru",
  ZHS: "zhs",
  CS: "zhs",
  ZHT: "zht",
  CT: "zht",
  PH: "ph",
};

const RARITIES = new Set<string>(["C", "U", "R", "M", "S", "T", "L"]);

// Longest codes first so ZHS isn't read as an unknown "ZH" + "S".
const LANG_PATTERN = Object.keys(LANGUAGES)
  .sort((a, b) => b.length - a.length)
  .map((code) => [...code].map((ch) => `[${ch}${ch.toLowerCase()}]`).join(""))
  .join("|");

// What the "•" (or the foil "★") between set and language comes out as.
const SEPARATOR =
  "(?:\\s*[•·∙●◦○°★☆*+\\-–—.,:;~=_\"'`^»«]{1,2}\\s*|\\s+[eEoO]\\s+|[eo]|\\s+)?";

/** Glyphs that can only be the foil star. Not "*": the dot reads as "*" too. */
const STAR_GLYPHS = new Set(["★", "☆"]);
/** Glyphs that can only be the non-foil dot. */
const DOT_GLYPHS = new Set(["•", "·", "∙", "●", "."]);

/**
 * Read the separator between set code and language: "foil" when every
 * glyph in it is a star, "nonfoil" when every glyph is a dot, else null.
 */
export function readFoilMark(separator: string): FoilMark | null {
  const glyphs = [...separator.replace(/\s+/g, "")];
  if (glyphs.length === 0) return null;
  if (glyphs.every((glyph) => STAR_GLYPHS.has(glyph))) return "foil";
  if (glyphs.every((glyph) => DOT_GLYPHS.has(glyph))) return "nonfoil";
  return null;
}

/**
 * Set code, separator, language. The set code is upper case and digits only,
 * which keeps a lower case "e" separator out of it ("NEOeEN" -> NEO, EN).
 */
function setLangRegex(strictEnd: boolean): RegExp {
  return new RegExp(
    `(^|[^A-Za-z0-9])([A-Z0-9]{3,5})(${SEPARATOR})(${LANG_PATTERN})${strictEnd ? "(?![A-Za-z])" : ""}`,
    "g",
  );
}

/** Every real set code has at least one letter ("10E", "2XM", "40K"). */
function isPlausibleSetCode(code: string): boolean {
  return /[A-Z]/.test(code);
}

type SetLang = { setCode: string; lang: string; separator: string; start: number; end: number };

function findSetLang(text: string): SetLang | null {
  const attempts = [
    { source: text, strict: true },
    { source: text, strict: false },
    // All lower case OCR ("m21 • en"): try again upper-cased.
    { source: text.toUpperCase(), strict: true },
  ];
  for (const { source, strict } of attempts) {
    for (const match of source.matchAll(setLangRegex(strict))) {
      const prefix = match[1] ?? "";
      const code = match[2]!;
      const lang = match[4]!.toUpperCase();
      if (!isPlausibleSetCode(code)) continue;
      const start = (match.index ?? 0) + prefix.length;
      return {
        setCode: code.toLowerCase(),
        lang: LANGUAGES[lang]!,
        separator: match[3] ?? "",
        start,
        end: (match.index ?? 0) + match[0].length,
      };
    }
  }
  return null;
}

/** A set code on its own, when the language didn't read: "M21 •" or "M21 * E". */
function findBareSetCode(text: string): SetLang | null {
  const re = /(^|[^A-Za-z0-9])([A-Z0-9]{3,5})\s*([•·∙●★☆*+.\-])/g;
  for (const match of text.matchAll(re)) {
    const code = match[2]!;
    if (!isPlausibleSetCode(code)) continue;
    const start = (match.index ?? 0) + (match[1] ?? "").length;
    return {
      setCode: code.toLowerCase(),
      lang: "",
      separator: match[3] ?? "",
      start,
      end: start + code.length,
    };
  }
  return null;
}

// Characters OCR reads in place of digits. Only upper case S and B (a lower
// case s or b after a number is a real suffix, as in "123s").
const DIGIT_FIXES: Record<string, string> = {
  O: "0",
  o: "0",
  Q: "0",
  D: "0",
  I: "1",
  l: "1",
  "|": "1",
  "!": "1",
  i: "1",
  S: "5",
  B: "8",
  Z: "2",
};

const SUFFIX = /^[a-hps★☆†‡*]$/;

type NumberToken = { digits: string; suffix: string; realDigits: number };

/**
 * Turn a token like "O157", "0l57", "123a", "7★" into digits and a suffix.
 * Needs at least one real digit and at most four digits in all, which is as
 * many as any printed collector number has.
 */
function readNumber(raw: string): NumberToken | null {
  let token = raw;
  let suffix = "";
  const last = token.slice(-1);
  if (token.length > 1 && SUFFIX.test(last) && /[0-9OoIl]/.test(token.slice(-2, -1))) {
    suffix = last === "☆" || last === "*" ? "★" : last === "‡" ? "†" : last;
    token = token.slice(0, -1);
  }
  let digits = "";
  let realDigits = 0;
  for (const ch of token) {
    if (/[0-9]/.test(ch)) {
      digits += ch;
      realDigits++;
    } else if (DIGIT_FIXES[ch] !== undefined) {
      digits += DIGIT_FIXES[ch];
    } else {
      return null;
    }
  }
  if (realDigits === 0 || digits.length === 0 || digits.length > 4) return null;
  // Mostly-letter tokens like "lIl" or "SOS" aren't numbers.
  if (realDigits * 2 < digits.length) return null;
  return { digits, suffix, realDigits };
}

function stripZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

type Token = { text: string; line: number };

const SLASHES = /([0-9OoIlSB][a-hps★☆†]?)\s*[/\\|⁄]\s*([0-9OoIlSB])/g;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    // A slash between two number-ish runs. A pipe or backslash is the slash
    // only when there's no real one, since "|" is just as often a 1.
    const slash = line.includes("/") ? /([0-9OoIlSB][a-hps★☆†]?)\s*[/⁄]\s*([0-9OoIlSB])/g : SLASHES;
    const spaced = line
      .replace(slash, "$1 / $2")
      .replace(/[,;:"'`~_()[\]{}<>«»]/g, " ");
    for (const part of spaced.split(/\s+/)) {
      if (part) tokens.push({ text: part, line: index });
    }
  });
  return tokens;
}

/** A rarity letter stuck to a number: "280R", "R0157". */
function splitGluedRarity(text: string): { rarity: Rarity; rest: string; before: boolean } | null {
  const after = /^([0-9OoIlSB]{2,})([CURMTL])$/.exec(text);
  if (after && /[0-9]/.test(after[1]!)) {
    return { rarity: after[2] as Rarity, rest: after[1]!, before: false };
  }
  // Rarity-first cards (2023 onward) always print four digits: "R0157".
  const before = /^([CURMSTL])([0-9OoIlSB]{4})$/.exec(text);
  if (before && /[0-9]/.test(before[2]!)) {
    return { rarity: before[1] as Rarity, rest: before[2]!, before: true };
  }
  return null;
}

function asRarity(text: string): Rarity | null {
  const upper = text.replace(/[.*•]$/, "");
  if (upper.length !== 1) return null;
  if (RARITIES.has(upper)) return upper as Rarity;
  // OCR sometimes lower-cases these; s and l are too often noise to trust.
  if ("curm".includes(upper)) return upper.toUpperCase() as Rarity;
  return null;
}

const EMPTY: CollectorInfo = {
  collectorNumber: null,
  setCode: null,
  lang: null,
  rarity: null,
  total: null,
  foilMark: null,
};

/** True when nothing at all was read. */
export function isEmptyCollectorInfo(info: CollectorInfo): boolean {
  return Object.values(info).every((value) => value === null);
}

export function parseCollectorInfo(text: string): CollectorInfo {
  if (!text?.trim()) return { ...EMPTY };
  const result: CollectorInfo = { ...EMPTY };

  // Set and language first, then blank them out so their digits ("M21",
  // "2XM") can't be taken for a collector number.
  const setLang = findSetLang(text) ?? findBareSetCode(text);
  let rest = text;
  if (setLang) {
    result.setCode = setLang.setCode;
    result.lang = setLang.lang || null;
    result.foilMark = readFoilMark(setLang.separator);
    rest =
      text.slice(0, setLang.start) + " ".repeat(setLang.end - setLang.start) + text.slice(setLang.end);
  }

  // Copyright years are numbers too: "© 2020 Wizards". Drop them.
  rest = rest.replace(/(?:©|\([cC]\)|&|™)\s*(?:19|20)[0-9]{2}/g, " ");

  const tokens = tokenize(rest);

  type Candidate = { number: NumberToken; total: string | null; index: number; rarity: Rarity | null };
  const candidates: Candidate[] = [];
  const looseRarities: { rarity: Rarity; index: number }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!.text;

    const rarity = asRarity(token);
    if (rarity) {
      looseRarities.push({ rarity, index: i });
      continue;
    }

    const glued = splitGluedRarity(token);
    const numberText = glued ? glued.rest : token;
    let number = readNumber(numberText);
    // Right before the slash, a mark or two stuck to the front is the set
    // symbol or the frame read as letters: "P187 / 361", "$187 / 361".
    if (!number && tokens[i + 1]?.text === "/") {
      const trimmed = /^[^0-9]{1,2}([0-9].*)$/.exec(numberText);
      if (trimmed) number = readNumber(trimmed[1]!);
    }
    if (!number) continue;

    // "0157 / 280": this is the number and the next one is the total.
    if (tokens[i + 1]?.text === "/") {
      const totalToken = tokens[i + 2]?.text ?? "";
      const totalGlued = splitGluedRarity(totalToken);
      const total = readNumber(totalGlued ? totalGlued.rest : totalToken);
      candidates.push({
        number,
        total: total ? stripZeros(total.digits) : null,
        index: i,
        rarity: totalGlued?.rarity ?? glued?.rarity ?? null,
      });
      i += 2;
      continue;
    }
    if (token === "/") continue;
    candidates.push({ number, total: null, index: i, rarity: glued?.rarity ?? null });
  }

  // Prefer a number with a total, then one next to a rarity letter, then one
  // printed with leading zeros (they always are on modern cards), then the
  // first one.
  const nearRarity = (candidate: Candidate) =>
    candidate.rarity !== null ||
    looseRarities.some((entry) => Math.abs(entry.index - candidate.index) <= 3);
  const ranked = [...candidates].sort((a, b) => {
    const score = (c: Candidate) =>
      (c.total ? 4 : 0) +
      (nearRarity(c) ? 2 : 0) +
      (c.number.digits.length >= 3 && c.number.digits.startsWith("0") ? 1 : 0);
    return score(b) - score(a) || a.index - b.index;
  });
  const best = ranked[0];
  if (best) {
    result.collectorNumber = stripZeros(best.number.digits) + best.number.suffix;
    result.total = best.total;
    result.rarity = best.rarity;
    if (!result.rarity) {
      const closest = [...looseRarities].sort(
        (a, b) => Math.abs(a.index - best.index) - Math.abs(b.index - best.index),
      )[0];
      if (closest && Math.abs(closest.index - best.index) <= 3) result.rarity = closest.rarity;
    }
  } else {
    // A rarity letter with no number next to it is just as likely noise.
    result.rarity = null;
  }

  return result;
}
