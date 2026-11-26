import Link from "next/link";

import FanContentNotice from "~/components/FanContentNotice";
import { type FeaturedCard } from "~/server/featuredCards";
import { signInHref } from "~/utils/signInHref";

import { BinderWindow, DeckCheck, ImportDemo, OwnedCards, SearchDemo } from "./ProductShots";
import QuickSearch from "./QuickSearch";
import { mutedText, primaryAction, secondaryAction } from "./styles";

type LandingProps = {
  featuredCards: FeaturedCard[];
  /** Cards in the database, or null if it couldn't be counted. */
  cardCount: number | null;
};

type Moment = {
  id: string;
  tag: string;
  hook: string;
  body: string;
  link: { href: string; label: string };
  visual: React.ReactNode;
};

const linkText =
  "inline-flex items-center gap-1 font-semibold text-pink-600 hover:underline dark:text-pink-400 dark:hover:drop-shadow-glow";

/** The home page for signed-out visitors. */
export default function Landing({ featuredCards, cardCount }: LandingProps) {
  const signIn = signInHref("/");

  const proof = [
    cardCount ? `${cardCount.toLocaleString("en-US")} cards to search` : null,
    "Scryfall-style search syntax",
    "Imports from Moxfield, Archidekt, ManaBox and Deckbox",
    "Prices refresh daily",
    "Free, no catch",
  ].filter((item): item is string => item !== null);

  const moments: Moment[] = [
    {
      id: "search",
      tag: "search",
      hook: "Type what you mean. Get exactly that.",
      body: "Names, types, rules text, colors, mana value, sets and formats, in the search syntax you already know from Scryfall. No account needed.",
      link: { href: "/search", label: "Open search" },
      visual: <SearchDemo />,
    },
    {
      id: "collection",
      tag: "collections",
      hook: "Every copy, counted.",
      body: "Counts, foils, condition and language for each card, with prices that refresh every day. \"Do I have one of those?\" takes two seconds, not twenty minutes in the bulk box.",
      link: { href: signInHref("/collections"), label: "Start a collection" },
      visual: <OwnedCards featuredCards={featuredCards} />,
    },
    {
      id: "decks",
      tag: "decks",
      hook: "Brew from the binder, not the shopping cart.",
      body: "Build for Commander, Modern, Pauper and more. The deck gets checked against the format's rules, and you see which cards you still need to go find.",
      link: { href: signInHref("/decks"), label: "Build a deck" },
      visual: <DeckCheck />,
    },
    {
      id: "import",
      tag: "import",
      hook: "Already tracking somewhere? Bring it.",
      body: "Paste a list or drop in a CSV from Moxfield, Archidekt, ManaBox or Deckbox, and export it back out whenever you want. Got a stack to add? Hold each card up to your camera and it reads the name for you.",
      link: { href: signInHref("/collections"), label: "Import your cards" },
      visual: <ImportDemo />,
    },
  ];

  return (
    <div className="space-y-24 sm:space-y-32">
      <section className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Your binder has a search bar now
            <span
              aria-hidden="true"
              className="ml-2 inline-block h-[0.8em] w-[0.4em] translate-y-[0.08em] animate-pulse bg-pink-500"
            />
          </h1>
          <p className={`max-w-lg text-lg ${mutedText}`}>
            Magic Vault keeps track of every card you own, what it&apos;s worth today, and what
            you&apos;re short for the next brew. Free, and nobody has to touch a spreadsheet again.
          </p>
          <QuickSearch placeholder="Try t:dragon c:r mv<=4" />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href={signIn} className={primaryAction}>
              Start your vault
            </Link>
            <Link href="/about" className={linkText}>
              Why this exists <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
          <p className={`text-sm ${mutedText}`}>
            Search works without an account. Go ahead, poke around.
          </p>
        </div>
        <BinderWindow featuredCards={featuredCards} />
      </section>

      <section aria-label="The short version">
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3 border-y border-purple-100 py-5 font-mono text-xs text-gray-600 sm:text-sm dark:border-purple-900/70 dark:text-gray-400">
          {proof.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {moments.map((moment, index) => (
        <section
          key={moment.id}
          aria-labelledby={`${moment.id}-heading`}
          className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
        >
          <div className={`space-y-4 ${index % 2 === 1 ? "lg:order-last" : ""}`}>
            <p className="font-mono text-sm text-pink-600 dark:text-pink-400">/{moment.tag}</p>
            <h2
              id={`${moment.id}-heading`}
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              {moment.hook}
            </h2>
            <p className={`max-w-md text-lg ${mutedText}`}>{moment.body}</p>
            <Link href={moment.link.href} className={linkText}>
              {moment.link.label} <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
          <div className="mx-auto w-full max-w-lg">{moment.visual}</div>
        </section>
      ))}

      <section
        aria-labelledby="closing-heading"
        className="relative isolate mx-auto max-w-3xl space-y-6 text-center"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-10 top-1/2 -z-10 h-32 -translate-y-1/2 rounded-full bg-purple-500/20 blur-3xl dark:bg-pink-600/20"
        />
        <h2 id="closing-heading" className="text-4xl font-bold tracking-tight sm:text-5xl">
          Go find that one card.
        </h2>
        <p className={`mx-auto max-w-xl text-lg ${mutedText}`}>
          You know the one. You&apos;re sure you own it, and it&apos;s in a box somewhere. Make a
          vault, add the box, and next time it takes one search.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={signIn} className={primaryAction}>
            Start your vault
          </Link>
          <Link href="/search" className={secondaryAction}>
            Just search for now
          </Link>
        </div>
      </section>

      <FanContentNotice className="mx-auto max-w-3xl text-center" />
    </div>
  );
}
