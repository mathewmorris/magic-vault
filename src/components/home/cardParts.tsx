import { type GemTone } from "./features";

/**
 * Pieces for drawing things as if they were Magic cards: a frame, a name
 * bar, a type line and a text box. All of it is our own Tailwind styling,
 * not the real card frame, and the gems are plain colored dots, not mana
 * symbols.
 */

/** The colored border around a card. Put a `cardInner` element inside. */
export const cardFrame =
  "rounded-[1.6rem] bg-gradient-to-br from-pink-400 via-purple-500 to-pink-600 p-[3px] shadow-xl shadow-purple-950/30";

/** The black frame inside the border. Cards stay dark in light mode too. */
export const cardInner = "flex h-full flex-col gap-2 rounded-[1.45rem] bg-gray-950 p-2 text-white sm:p-3";

/** The bar holding the card's name and cost, and the type line bar. */
export const cardBar =
  "flex items-center justify-between gap-3 rounded-xl border border-purple-200/50 bg-gradient-to-r from-purple-700 via-purple-600 to-purple-800 px-3 py-1.5 shadow-inner shadow-black/40";

/** The window where a card's art goes. */
export const artWindow =
  "relative overflow-hidden rounded-lg border border-purple-200/40 bg-gradient-to-br from-purple-900 via-gray-950 to-pink-950";

/** The rules text box. Light like a real card's in light mode. */
export const textBox =
  "rounded-lg border border-purple-200/40 bg-white p-4 text-gray-900 dark:bg-gray-900 dark:text-gray-100";

export const flavorText = "font-serif italic text-purple-600 dark:text-purple-100";

const GEM_TONES: Record<GemTone, string> = {
  pink: "from-pink-200 via-pink-500 to-pink-700 text-white",
  purple: "from-purple-100 via-purple-400 to-purple-700 text-white",
  plain: "from-gray-100 via-gray-300 to-gray-500 text-gray-900",
};

/**
 * A round gem, like a mana symbol but not one. Give it a `label` when it
 * means something (like a cost of 0), and it's hidden from screen readers
 * otherwise.
 */
export function Gem({
  tone = "pink",
  children,
  label,
  size = "sm",
}: {
  tone?: GemTone;
  children?: React.ReactNode;
  label?: string;
  size?: "sm" | "lg";
}) {
  const sizing = size === "lg" ? "h-8 w-8 text-base sm:h-9 sm:w-9" : "h-5 w-5 text-[0.65rem]";
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold leading-none shadow-md shadow-black/40 ring-1 ring-white/40 ${sizing} ${GEM_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** The little diamond on the right of a type line, where a set symbol goes. */
export function SetSymbol() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rotate-45 rounded-[2px] bg-gradient-to-br from-pink-300 to-pink-600 ring-1 ring-white/50"
    />
  );
}
