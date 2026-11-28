/**
 * Link and button looks for the home and about pages. The shared Button
 * component has no light-mode style and takes no className, so these pages
 * use these instead.
 */
export const primaryAction =
  "inline-flex items-center justify-center gap-2 rounded-full bg-pink-600 px-5 py-2.5 font-semibold text-white no-underline transition hover:bg-pink-500 hover:drop-shadow-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300";

export const secondaryAction =
  "inline-flex items-center justify-center gap-2 rounded-full border border-purple-300 px-5 py-2.5 font-semibold no-underline transition hover:border-pink-500 hover:text-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 dark:border-purple-400 dark:hover:text-pink-300 dark:hover:drop-shadow-glow";

export const panel =
  "rounded-2xl border border-purple-100 bg-white p-5 shadow-sm dark:border-purple-900/70 dark:bg-gray-950/60 dark:shadow-none";

export const mutedText = "text-gray-600 dark:text-gray-400";
