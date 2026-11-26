import Image from "next/image";
import Link from "next/link";

import { FEATURED_CARD_NAMES, type FeaturedCard } from "~/server/featuredCards";
import { formatUsd } from "~/utils/price";

/**
 * Mock screens of the app for the signed-out home page, drawn in markup
 * rather than screenshots so they follow light and dark mode. The numbers
 * in them are made-up samples, and each window says so.
 */

const cardShape = "rounded-[4.75%/3.5%]";

function Window({
  title,
  tag,
  children,
  className,
}: {
  title: string;
  tag?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border border-purple-200 bg-white shadow-xl shadow-purple-900/10 dark:border-purple-800/80 dark:bg-gray-950 dark:shadow-pink-950/30",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center gap-3 border-b border-purple-100 px-4 py-2.5 dark:border-purple-900/70">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-pink-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-purple-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-purple-100/80 dark:bg-purple-400/80" />
        </span>
        <span className="truncate font-mono text-xs text-gray-600 dark:text-gray-400">{title}</span>
        {tag ? (
          <span className="ml-auto shrink-0 rounded-full border border-purple-200 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:border-purple-800">
            {tag}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** A card image, or a purple frame with the card's name if it didn't load. */
function CardArt({
  card,
  name,
  alt,
  sizes,
  priority = false,
}: {
  card?: FeaturedCard;
  name: string;
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  if (!card) {
    return (
      <div
        className={`flex aspect-[488/680] items-center justify-center border-2 border-purple-300 bg-gradient-to-br from-purple-500 via-purple-700 to-pink-700 p-2 text-center text-xs font-semibold text-white sm:text-sm ${cardShape}`}
      >
        {name}
      </div>
    );
  }
  return (
    <Image
      src={card.imageUrl}
      width={488}
      height={680}
      sizes={sizes}
      alt={alt}
      priority={priority}
      className={`h-auto w-full ${cardShape}`}
    />
  );
}

const BINDER_ROWS = [
  { name: "Lightning Bolt", set: "2XM", qty: 4, foil: false, cents: 760 },
  { name: "Counterspell", set: "MH2", qty: 2, foil: true, cents: 1180 },
  { name: "Sol Ring", set: "C21", qty: 3, foil: false, cents: 450 },
  { name: "Swords to Plowshares", set: "STA", qty: 1, foil: true, cents: 2240 },
  { name: "Thoughtseize", set: "2XM", qty: 2, foil: false, cents: 2490 },
];

/** The hero shot: a trade binder with counts, foils, prices and a total. */
export function BinderWindow({ featuredCards }: { featuredCards: FeaturedCard[] }) {
  const bolt = featuredCards.find((card) => card.name === "Lightning Bolt");
  const cardTotal = BINDER_ROWS.reduce((sum, row) => sum + row.qty, 0);
  const totalCents = BINDER_ROWS.reduce((sum, row) => sum + row.cents, 0);

  return (
    <figure className="relative isolate">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-full bg-pink-500/20 blur-3xl dark:bg-pink-600/25"
      />
      <figcaption className="sr-only">
        A sample collection in Magic Vault: a trade binder listing each card with its set, count,
        foil tag and value, and a running total at the bottom.
      </figcaption>
      <Window title="collections / trade-binder" tag="sample" className="relative">
        <div aria-hidden="true" className="flex">
          <div className="hidden w-36 shrink-0 border-r border-purple-100 p-3 sm:block dark:border-purple-900/70">
            <CardArt card={bolt} name="Lightning Bolt" alt="" sizes="144px" priority />
            <p className="mt-2 text-center font-mono text-[11px] text-gray-500">2XM · NM · ×4</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-purple-100 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-gray-500 sm:grid-cols-[1fr_auto_auto_auto] dark:border-purple-900/70">
              <span>Card</span>
              <span className="hidden sm:block">Set</span>
              <span className="text-right">Qty</span>
              <span className="w-16 text-right">Value</span>
            </div>
            <ul className="divide-y divide-purple-100 dark:divide-purple-900/60">
              {BINDER_ROWS.map((row, index) => (
                <li
                  key={row.name}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[1fr_auto_auto_auto] ${
                    index === 0 ? "bg-pink-500/10" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{row.name}</span>
                    {row.foil ? (
                      <span className="shrink-0 rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Foil
                      </span>
                    ) : null}
                  </span>
                  <span className="hidden font-mono text-xs text-gray-500 sm:block">{row.set}</span>
                  <span className="text-right font-mono text-xs">×{row.qty}</span>
                  <span className="w-16 text-right font-mono text-xs">{formatUsd(row.cents)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-purple-200 bg-purple-100/20 px-4 py-3 dark:border-purple-800 dark:bg-purple-950/40">
              <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{cardTotal} cards</span>
              <span className="font-mono text-sm font-bold text-pink-600 dark:text-pink-400">
                {formatUsd(totalCents)}
              </span>
            </div>
          </div>
        </div>
      </Window>
    </figure>
  );
}

const DEMO_QUERY = "t:dragon c:r mv<=4";
const DEMO_TERMS = [
  { term: "t:dragon", meaning: "type has Dragon" },
  { term: "c:r", meaning: "color is red" },
  { term: "mv<=4", meaning: "mana value 4 or less" },
];

/** A search query broken into what each part means, with a real link to run it. */
export function SearchDemo() {
  return (
    <Window title="search">
      <div className="space-y-4 p-4 sm:p-5">
        <p className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-100/10 px-3 py-2.5 font-mono text-sm dark:border-purple-800 dark:bg-purple-950/40">
          <span aria-hidden="true" className="text-pink-500">
            &gt;
          </span>
          <span className="min-w-0 break-all">{DEMO_QUERY}</span>
          <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-pink-500" />
        </p>
        <ul className="space-y-2">
          {DEMO_TERMS.map((item) => (
            <li key={item.term} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <code className="rounded-md bg-pink-500/10 px-2 py-0.5 font-mono text-pink-600 dark:text-pink-300">
                {item.term}
              </code>
              <span className="text-gray-600 dark:text-gray-400">{item.meaning}</span>
            </li>
          ))}
        </ul>
        <Link
          href={`/search?q=${encodeURIComponent(DEMO_QUERY)}`}
          className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-pink-600 hover:underline dark:text-pink-400 dark:hover:drop-shadow-glow"
        >
          Run this search <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </Window>
  );
}

const OWNED: Record<(typeof FEATURED_CARD_NAMES)[number], { count: string; note: string }> = {
  "Lightning Bolt": { count: "×4", note: "NM, one foil" },
  "Black Lotus": { count: "×0", note: "a player can dream" },
  Counterspell: { count: "×3", note: "LP, English" },
};

/**
 * The featured cards side by side with how many "you" own. Nothing overlaps
 * a card, so every artist credit and copyright line stays visible.
 */
export function OwnedCards({ featuredCards }: { featuredCards: FeaturedCard[] }) {
  const byName = new Map(featuredCards.map((card) => [card.name, card]));

  return (
    <ul className="grid grid-cols-3 gap-3 sm:gap-5">
      {FEATURED_CARD_NAMES.map((name) => {
        const card = byName.get(name);
        const owned = OWNED[name];
        return (
          <li key={name} className="space-y-2">
            {card ? (
              <Link
                href={`/card/${card.id}`}
                className={`block shadow-lg shadow-purple-950/30 transition hover:-translate-y-1 hover:drop-shadow-glow ${cardShape}`}
              >
                <CardArt card={card} name={name} alt={name} sizes="(min-width: 1024px) 160px, 30vw" />
              </Link>
            ) : (
              <CardArt name={name} alt={name} sizes="30vw" />
            )}
            <p className="text-center">
              <span className="block font-mono text-lg font-bold text-pink-600 dark:text-pink-400">
                {owned.count}
              </span>
              <span className="block text-xs text-gray-600 dark:text-gray-400">{owned.note}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

const DECK_CHECKS = [
  { ok: true, text: "100 cards counting the commander" },
  { ok: true, text: "One copy of each, basics aside" },
  { ok: true, text: "Everything inside the color identity" },
  { ok: false, text: "3 cards you don't own yet" },
];

const MISSING = ["Rhystic Study", "Smothering Tithe", "Cyclonic Rift"];

/** A Commander deck's rules check, with the cards still to track down. */
export function DeckCheck() {
  return (
    <Window title="decks / the-blue-one" tag="sample">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold">Commander</p>
          <p className="font-mono text-xs text-gray-500">97 / 100 owned</p>
        </div>
        <ul className="space-y-2 text-sm">
          {DECK_CHECKS.map((check) => (
            <li key={check.text} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  check.ok
                    ? "bg-purple-500 text-white"
                    : "bg-pink-500/15 text-pink-600 dark:text-pink-300"
                }`}
              >
                {check.ok ? "✓" : "!"}
              </span>
              <span className={check.ok ? "" : "font-semibold text-pink-600 dark:text-pink-300"}>
                <span className="sr-only">{check.ok ? "Passes: " : "Heads up: "}</span>
                {check.text}
              </span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-2 border-t border-purple-100 pt-4 dark:border-purple-900/70">
          {MISSING.map((name) => (
            <li
              key={name}
              className="rounded-full border border-dashed border-pink-400 px-3 py-1 text-xs font-medium dark:border-pink-700"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}

const PASTED = ["4 Lightning Bolt", "1 Sol Ring", "3 Counterspell", "2 Swords to Plowshares"];

/** A pasted list turning into cards in a collection. */
export function ImportDemo() {
  return (
    <Window title="import" tag="sample">
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:p-5">
        <pre className="overflow-x-auto rounded-xl border border-purple-200 bg-purple-100/10 p-3 font-mono text-xs leading-6 dark:border-purple-800 dark:bg-purple-950/40">
          {PASTED.join("\n")}
        </pre>
        <span aria-hidden="true" className="text-center font-mono text-pink-500 sm:text-lg">
          <span className="sm:hidden">&darr;</span>
          <span className="hidden sm:inline">&rarr;</span>
        </span>
        <div className="space-y-1 rounded-xl bg-pink-500/10 p-3 text-sm">
          <p className="font-semibold">10 cards added</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">to Trade binder, prices and all</p>
        </div>
      </div>
    </Window>
  );
}
