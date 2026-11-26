/**
 * Helpers that turn raw Tesseract output from the title strip of a Magic card
 * into something that looks like a card name.
 *
 * OCR on a phone photo of a title bar usually gives us the name plus noise:
 * mana symbols read as letters/digits/symbols ("2UU", "{R}", "®", "@"),
 * stray pipes and quotes from the card frame, and sometimes extra lines.
 */

// Letters we keep, including accented Latin letters (e.g. "Lim-Dûl's Vault").
// × (×) and ÷ (÷) sit in the Latin-1 range but aren't letters.
const LETTER = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F";
const HAS_LETTER = new RegExp(`[${LETTER}]`);
const LETTER_GLOBAL = new RegExp(`[${LETTER}]`, "g");
const NOT_ALLOWED = new RegExp(`[^${LETTER}\\s',-]`, "g");

// A token made only of mana colour letters, like "UU", "WW", "RG" or "X".
// Digits are already gone by the time we check this, so "3WW" shows up as "WW".
const MANA_TOKEN = /^[WUBRGCX]{1,6}$/;

/** Turn curly quotes, long dashes and odd spaces into plain ASCII ones. */
function normalizePunctuation(text: string): string {
  return text
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[‐-―]/g, "-")
    .replace(/[  -​\t]/g, " ");
}

function cleanToken(token: string): string {
  // Strip quotes and dashes hanging off either end ("'-Dark" -> "Dark").
  // A trailing comma is real punctuation ("Jace, the Mind Sculptor"), so it
  // stays here and is dealt with once we know where the token sits.
  return token.replace(/^[',-]+/, "").replace(/['-]+$/, "");
}

/**
 * Clean a single OCR line into a likely card name. Returns "" when nothing
 * usable is left.
 */
export function cleanOcrLine(line: string): string {
  const stripped = normalizePunctuation(line)
    .replace(/\{[^}]*\}/g, " ") // mana written as {2}{U}
    .replace(/\([^)]{0,3}\)/g, " ") // mana read as (G) or (2)
    .replace(/[0-9]/g, " ") // generic mana and stray digits
    .replace(NOT_ALLOWED, " "); // ®, ©, @, |, ~, ., !, etc.

  const tokens = stripped
    .split(/\s+/)
    .map(cleanToken)
    .filter((token) => HAS_LETTER.test(token));

  // Leading one-letter tokens are almost always frame noise ("e Sol Ring"),
  // except the article "A" ("A Display of My Dark Power").
  while (tokens.length > 1 && tokens[0]!.length === 1 && tokens[0] !== "A") {
    tokens.shift();
  }

  // Trailing one-letter tokens and colour-letter runs are leftover mana cost.
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]!.replace(/,$/, "");
    if (last.length === 1 || MANA_TOKEN.test(last)) {
      tokens.pop();
    } else {
      break;
    }
  }

  // A line that is nothing but mana letters isn't a name.
  if (tokens.length === 1 && MANA_TOKEN.test(tokens[0]!)) {
    return "";
  }

  return tokens.join(" ").replace(/,$/, "").trim();
}

function letterCount(text: string): number {
  return text.length - text.replace(LETTER_GLOBAL, "").length;
}

/**
 * Pick the most likely card name out of raw OCR text from the title strip.
 *
 * The name is the top line of the card, so we take the first line that still
 * has at least three letters after cleaning. Returns "" if no line qualifies.
 */
export function extractCardName(rawText: string | null | undefined): string {
  if (!rawText) return "";

  for (const line of rawText.split(/\r?\n/)) {
    const cleaned = cleanOcrLine(line);
    if (letterCount(cleaned) >= 3) {
      return cleaned;
    }
  }

  return "";
}

/**
 * Normalize a name for comparison: lower case, no accents, no apostrophes,
 * any other punctuation turned into spaces, whitespace collapsed.
 *
 * "Lim-Dûl's Vault" -> "lim duls vault", "Æther Vial" -> "aether vial".
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
