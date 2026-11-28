import Image from "next/image";
import Link from "next/link";

import { FEATURED_CARD_NAMES, type FeaturedCard } from "~/server/featuredCards";

import TapCardLink from "./TapCardLink";

// Tilt and lift for each slot, left to right. The cards never overlap, so
// no card covers another's artist credit or copyright line (Scryfall's image
// guidelines ask for that).
const SLOTS = [
  "-rotate-6 translate-y-4",
  "z-10 -translate-y-2",
  "rotate-6 translate-y-4",
];

/**
 * Three card images, fanned out a little, for the home page hero. Clicking
 * one taps it before it opens (Settings can turn that off). A card that
 * couldn't be loaded shows as an empty frame with its name.
 */
export default function CardSpread({ cards }: { cards: FeaturedCard[] }) {
  const byName = new Map(cards.map((card) => [card.name, card]));

  return (
    <div className="relative mx-auto w-full max-w-md py-6">
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-1/2 h-40 -translate-y-1/2 rounded-full bg-pink-500/25 blur-3xl dark:bg-pink-600/30"
      />
      <ul className="relative grid grid-cols-3 gap-3 sm:gap-5">
        {FEATURED_CARD_NAMES.map((name, index) => {
          const card = byName.get(name);
          return (
            <li key={name} className={`transition duration-300 hover:-translate-y-3 hover:rotate-0 ${SLOTS[index] ?? ""}`}>
              {card ? (
                <TapCardLink href={`/card/${card.id}`} className="rounded-[4.75%/3.5%] shadow-xl shadow-purple-950/40 hover:drop-shadow-glow">
                  <Image
                    src={card.imageUrl}
                    width={488}
                    height={680}
                    sizes="(min-width: 640px) 150px, 30vw"
                    alt={card.name}
                    priority
                    className="h-auto w-full rounded-[4.75%/3.5%]"
                  />
                </TapCardLink>
              ) : (
                <div className="flex aspect-[488/680] items-center justify-center rounded-[4.75%/3.5%] border-2 border-purple-300 bg-gradient-to-br from-purple-500 via-purple-700 to-pink-700 p-2 text-center text-xs font-semibold text-white shadow-xl shadow-purple-950/40 sm:text-sm">
                  {name}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="relative mt-8 text-center text-xs text-gray-500 dark:text-gray-400">
        Cards tap when you open them. Not your thing?{" "}
        <Link href="/settings" className="font-semibold text-pink-600 underline dark:text-pink-400">
          Turn it off in Settings
        </Link>
        .
      </p>
    </div>
  );
}
