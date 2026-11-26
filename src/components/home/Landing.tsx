import Link from "next/link";

import FanContentNotice from "~/components/FanContentNotice";
import { type FeaturedCard } from "~/server/featuredCards";
import { signInHref } from "~/utils/signInHref";

import { artWindow, cardBar, cardFrame, cardInner, flavorText, Gem, SetSymbol, textBox } from "./cardParts";
import CardSpread from "./CardSpread";
import FeatureIcon from "./FeatureIcon";
import { FEATURES, type Feature } from "./features";
import QuickSearch from "./QuickSearch";
import { mutedText, primaryAction, secondaryAction } from "./styles";

/** Questions people ask before signing up, written up like card rulings. */
const RULINGS = [
  {
    question: "Is it actually free?",
    answer: "Yes. Searching doesn't need an account, and everything else just needs a free sign-in.",
  },
  {
    question: "Do I have to type in every card by hand?",
    answer:
      "Nope. Import a list or a CSV from Moxfield, Archidekt, ManaBox or Deckbox, scan cards with your camera, or search and add them one at a time.",
  },
  {
    question: "Where do the prices come from?",
    answer: "Scryfall. They update every day, so your collection's total keeps up with the market.",
  },
  {
    question: "Can I take my cards with me later?",
    answer: "Yes. Export any collection back out whenever you want. Your binder, your data.",
  },
  {
    question: "How do I sign in?",
    answer: "With an account you already have. No new password to forget.",
  },
];

// Seven face-down cards for the closing "opening hand", fanned a little.
const HAND = [
  "-rotate-12 translate-y-3",
  "-rotate-[8deg] translate-y-1",
  "-rotate-[4deg]",
  "",
  "rotate-[4deg]",
  "rotate-[8deg] translate-y-1",
  "rotate-12 translate-y-3",
];

type LandingProps = {
  featuredCards: FeaturedCard[];
  /** Cards in the database, or null if it couldn't be counted. */
  cardCount: number | null;
};

/** One line of rules text: a bold cost or keyword, then what it does. */
function Ability({ cost, children }: { cost: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="leading-relaxed">
      <span className="font-bold">{cost}</span> {children}
    </p>
  );
}

/** The hero: the pitch for Magic Vault, laid out as one big card. */
function VaultCard({ featuredCards, cardCount }: LandingProps) {
  return (
    <section aria-label="Magic Vault" className={`mx-auto max-w-5xl ${cardFrame}`}>
      <div className={cardInner}>
        <div className={cardBar}>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Magic Vault</h1>
          <Gem tone="plain" size="lg" label="Costs 0. It's free.">
            0
          </Gem>
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          <div className={`flex items-center px-3 ${artWindow}`}>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(250,10,169,0.25),transparent_55%)]"
            />
            <CardSpread cards={featuredCards} />
          </div>

          <div className="flex flex-col gap-2">
            <div className={cardBar}>
              <p className="text-sm font-semibold sm:text-base">Legendary Artifact &mdash; Collection Tracker</p>
              <SetSymbol />
            </div>
            <div className={`flex flex-1 flex-col gap-4 ${textBox}`}>
              <Ability cost="Free">
                <span className="italic">
                  (This costs nothing to cast. Searching doesn&apos;t even need an account.)
                </span>
              </Ability>

              <div className="space-y-2">
                <Ability
                  cost={
                    <>
                      <Gem tone="purple">T</Gem>:
                    </>
                  }
                >
                  Search every card ever printed.
                </Ability>
                <QuickSearch />
              </div>

              <div className="space-y-3">
                <Ability cost="Sign in:">
                  Open a vault of your own. Track what you own and what it&apos;s worth, and build
                  decks from the cards already in your binder.
                </Ability>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={signInHref("/")} className={primaryAction}>
                    Start your vault
                  </Link>
                  <Link href="/about" className={secondaryAction}>
                    What is this?
                  </Link>
                </div>
              </div>

              <p className={`mt-auto border-t border-purple-100/40 pt-3 ${flavorText}`}>
                Somewhere in that shoebox is a card worth more than the shoebox.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 text-xs text-gray-400">
          <span>MV &middot; 001 &middot; EN &middot; Illus. your binder</span>
          {cardCount ? (
            <span>{cardCount.toLocaleString("en-US")} cards to search, prices updated daily.</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** One feature, drawn as a small card that links to where it lives. */
function FeatureCard({ feature, number }: { feature: Feature; number: number }) {
  return (
    <Link
      href={feature.signedIn ? signInHref(feature.href) : feature.href}
      className={`group block h-full transition duration-300 hover:-translate-y-1 hover:drop-shadow-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${cardFrame}`}
    >
      <article className={cardInner}>
        <div className={cardBar}>
          <h3 className="font-bold leading-tight">{feature.title}</h3>
          <span className="flex gap-1">
            {feature.cost.map((tone, index) => (
              <Gem key={index} tone={tone} />
            ))}
          </span>
        </div>
        <div className={`flex h-24 items-center justify-center text-pink-300 ${artWindow}`}>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(250,10,169,0.35),transparent_60%)]"
          />
          <FeatureIcon id={feature.id} className="relative h-12 w-12 transition duration-300 group-hover:scale-110" />
        </div>
        <div className={cardBar}>
          <p className="text-sm font-semibold leading-tight">{feature.typeLine}</p>
          <SetSymbol />
        </div>
        <div className={`relative flex flex-1 flex-col gap-3 text-sm ${textBox}`}>
          <p className="leading-relaxed">{feature.body}</p>
          <p className={flavorText}>{feature.flavor}</p>
          {feature.pt ? (
            <span className="absolute -bottom-3 right-3 rounded-md border border-purple-200/60 bg-gradient-to-r from-purple-700 to-purple-800 px-2 py-0.5 text-sm font-bold text-white">
              {feature.pt}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 px-1 pt-1 text-xs text-gray-400">
          <span>{String(number).padStart(3, "0")}/006</span>
          <span className="font-semibold text-pink-300 group-hover:text-pink-200">
            {feature.signedIn ? "Sign in to use" : "Try it now"} &rarr;
          </span>
        </div>
      </article>
    </Link>
  );
}

/** The home page for signed-out visitors. */
export default function Landing({ featuredCards, cardCount }: LandingProps) {
  return (
    <div className="space-y-20 sm:space-y-28">
      <VaultCard featuredCards={featuredCards} cardCount={cardCount} />

      <section aria-labelledby="set-heading" className="space-y-8">
        <div className="max-w-2xl space-y-2">
          <h2 id="set-heading" className="text-3xl font-bold sm:text-4xl">
            The full set list
          </h2>
          <p className={`text-lg ${mutedText}`}>
            Six cards. No boosters, no chase rares, no paywall. Everybody gets the whole set.
          </p>
        </div>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <li key={feature.id}>
              <FeatureCard feature={feature} number={index + 1} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rulings-heading" className="grid gap-8 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-2">
          <h2 id="rulings-heading" className="text-3xl font-bold sm:text-4xl">
            Call a judge
          </h2>
          <p className={`text-lg ${mutedText}`}>Rulings on the questions you were about to ask.</p>
        </div>
        <ul className="space-y-5">
          {RULINGS.map((ruling) => (
            <li key={ruling.question} className="border-l-4 border-pink-500 pl-4">
              <h3 className="font-semibold">{ruling.question}</h3>
              <p className={`mt-1 ${mutedText}`}>{ruling.answer}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="hand-heading"
        className="rounded-3xl border border-purple-200 bg-white px-6 py-10 text-center shadow-sm dark:border-purple-800 dark:bg-gray-950 sm:px-12"
      >
        <ul aria-hidden="true" className="mx-auto flex max-w-md justify-center gap-1.5 sm:gap-3">
          {HAND.map((tilt, index) => (
            <li
              key={index}
              className={`flex aspect-[488/680] w-9 items-center justify-center rounded-md border border-pink-300/50 bg-gradient-to-br from-purple-500 via-purple-700 to-pink-700 shadow-lg shadow-purple-950/40 sm:w-14 ${tilt}`}
            >
              <span className="h-3 w-3 rotate-45 rounded-[2px] border border-pink-200/80 sm:h-5 sm:w-5" />
            </li>
          ))}
        </ul>
        <h2 id="hand-heading" className="mt-8 text-3xl font-bold sm:text-4xl">
          Keep or mulligan?
        </h2>
        <p className={`mx-auto mt-3 max-w-lg text-lg ${mutedText}`}>
          Sign in and start sorting your cards, or ship it back and search around first.
          Nobody&apos;s counting your mulligans.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={signInHref("/")} className={`flex-col !gap-0 px-8 ${primaryAction}`}>
            <span className="text-lg">Keep</span>
            <span className="text-xs font-medium text-pink-100">Sign in, it&apos;s free</span>
          </Link>
          <Link href="/search" className={`flex-col !gap-0 px-8 ${secondaryAction}`}>
            <span className="text-lg">Mulligan</span>
            <span className={`text-xs font-medium ${mutedText}`}>Just search cards</span>
          </Link>
        </div>
      </section>

      <FanContentNotice className="mx-auto max-w-3xl text-center" />
    </div>
  );
}
