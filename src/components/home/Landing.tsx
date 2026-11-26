import Link from "next/link";

import FanContentNotice from "~/components/FanContentNotice";
import { type FeaturedCard } from "~/server/featuredCards";
import { signInHref } from "~/utils/signInHref";

import CardSpread from "./CardSpread";
import FeatureIcon from "./FeatureIcon";
import { FEATURES } from "./features";
import QuickSearch from "./QuickSearch";
import { mutedText, panel, primaryAction, secondaryAction } from "./styles";

const STEPS = [
  { title: "Sign in", body: "Use an account you already have. It's free." },
  { title: "Add your cards", body: "Search for them, scan them with your camera, or import a list you already have." },
  { title: "Put them to work", body: "See what your collection is worth and build decks from cards you own." },
];

type LandingProps = {
  featuredCards: FeaturedCard[];
  /** Cards in the database, or null if it couldn't be counted. */
  cardCount: number | null;
};

/** The home page for signed-out visitors. */
export default function Landing({ featuredCards, cardCount }: LandingProps) {
  const signIn = signInHref("/");

  return (
    <div className="space-y-20 sm:space-y-24">
      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-400">
            Free Magic: The Gathering collection tracker
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Every card you own,{" "}
            <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent dark:from-purple-300 dark:to-pink-400">
              in one vault.
            </span>
          </h1>
          <p className={`max-w-xl text-lg ${mutedText}`}>
            Search every Magic card, keep track of what you own and what it&apos;s worth, and build
            decks from the cards already in your binder.
          </p>
          <QuickSearch />
          <div className="flex flex-wrap items-center gap-3">
            <Link href={signIn} className={primaryAction}>
              Start your vault
            </Link>
            <Link href="/about" className={secondaryAction}>
              What is this?
            </Link>
          </div>
          {cardCount ? (
            <p className={`text-sm ${mutedText}`}>
              {cardCount.toLocaleString("en-US")} cards to search, updated every day.
            </p>
          ) : null}
        </div>
        <CardSpread cards={featuredCards} />
      </section>

      <section aria-labelledby="features-heading" className="space-y-8">
        <div className="space-y-2 text-center">
          <h2 id="features-heading" className="text-3xl font-bold">
            What you can do
          </h2>
          <p className={mutedText}>Everything here is free. Search works without an account.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.id}>
              <Link
                href={feature.signedIn ? signInHref(feature.href) : feature.href}
                className={`group flex h-full flex-col gap-3 transition hover:border-pink-400 dark:hover:border-pink-700 ${panel}`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-500 transition group-hover:bg-pink-100 group-hover:text-pink-600 dark:bg-purple-950 dark:text-purple-100 dark:group-hover:bg-pink-950 dark:group-hover:text-pink-300">
                  <FeatureIcon id={feature.id} />
                </span>
                <span className="text-lg font-semibold">{feature.title}</span>
                <span className={`text-sm ${mutedText}`}>{feature.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-heading" className="space-y-8">
        <h2 id="steps-heading" className="text-center text-3xl font-bold">
          How it works
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className={`flex gap-4 ${panel}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-600 font-bold text-white">
                {index + 1}
              </span>
              <span className="space-y-1">
                <span className="block font-semibold">{step.title}</span>
                <span className={`block text-sm ${mutedText}`}>{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-3xl bg-gradient-to-br from-purple-500 via-purple-700 to-pink-700 px-6 py-12 text-center text-white sm:px-12">
        <h2 className="text-3xl font-bold">Ready to open the vault?</h2>
        <p className="mx-auto mt-3 max-w-lg text-purple-100">
          Make a collection, add a few cards, and see what your pile is really worth.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={signIn}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 font-semibold text-purple-700 transition hover:bg-pink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
          >
            Sign in, it&apos;s free
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-full border border-white/70 px-5 py-2.5 font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
          >
            Just browse cards
          </Link>
        </div>
      </section>

      <FanContentNotice className="mx-auto max-w-3xl text-center" />
    </div>
  );
}
