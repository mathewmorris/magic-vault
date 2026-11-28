import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import FanContentNotice from "~/components/FanContentNotice";
import FeatureIcon from "~/components/home/FeatureIcon";
import { FEATURES } from "~/components/home/features";
import { mutedText, panel, primaryAction, secondaryAction } from "~/components/home/styles";
import SupportLink from "~/components/SupportLink";
import { env } from "~/env";

export const metadata: Metadata = {
  title: "About | Magic Vault",
  description:
    "Magic Vault is a free web app for tracking your Magic: The Gathering collection and building decks from the cards you own.",
};

const PROJECT_BOARD_URL = "https://github.com/users/mathewmorris/projects/2?pane=info";
const ISSUES_URL = "https://github.com/mathewmorris/magic-vault/issues/new/choose";
const DISCUSSIONS_URL = "https://github.com/mathewmorris/magic-vault/discussions";
const CONTRIBUTING_URL = "https://github.com/mathewmorris/magic-vault/blob/main/CONTRIBUTING.md";

const AUDIENCE = [
  {
    title: "Collectors",
    body: "You've got binders and boxes and a rough idea what's in them. Now you can know exactly, and see what it's all worth.",
  },
  {
    title: "Deck builders",
    body: "You want to brew from what you already own, and only buy the few cards you're missing.",
  },
  {
    title: "Spreadsheet escapees",
    body: "You've been tracking cards in a sheet. Import it and let the app keep the prices and printings straight.",
  },
];

export default function About() {
  return (
    <div className="mx-auto max-w-4xl space-y-16">
      <header className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <Image
          src="/magicvault-logo.png"
          alt=""
          width={96}
          height={96}
          className="rounded-2xl shadow-lg shadow-purple-900/30"
        />
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-400">
            About
          </p>
          <h1 className="text-4xl font-bold sm:text-5xl">Your cards, sorted.</h1>
          <p className={`text-lg ${mutedText}`}>
            Magic Vault is a free web app for keeping track of your Magic: The Gathering cards. Look
            up any card, log what you own, see what it&apos;s worth, and build decks from your own
            collection.
          </p>
        </div>
      </header>

      <section aria-labelledby="audience-heading" className="space-y-6">
        <h2 id="audience-heading" className="text-2xl font-bold">
          Who it&apos;s for
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {AUDIENCE.map((item) => (
            <li key={item.title} className={panel}>
              <h3 className="font-semibold">{item.title}</h3>
              <p className={`mt-2 text-sm ${mutedText}`}>{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="features-heading" className="space-y-6">
        <h2 id="features-heading" className="text-2xl font-bold">
          What it does
        </h2>
        <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature.id} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-500 dark:bg-purple-950 dark:text-purple-100">
                <FeatureIcon id={feature.id} className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold">{feature.title}</span>
                <span className={`block text-sm ${mutedText}`}>{feature.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/search" className={primaryAction}>
            Search cards
          </Link>
          <Link href="/" className={secondaryAction}>
            Back to home
          </Link>
        </div>
      </section>

      <section aria-labelledby="building-heading" className={`space-y-3 ${panel}`}>
        <h2 id="building-heading" className="text-2xl font-bold">
          Built in the open
        </h2>
        <p className={mutedText}>
          Magic Vault is a one-person side project, and it gets better every week. You can see
          what&apos;s being worked on and what&apos;s next on the{" "}
          <a
            href={PROJECT_BOARD_URL}
            className="font-semibold text-pink-600 underline dark:text-pink-400"
            target="_blank"
            rel="noreferrer"
          >
            project board
          </a>
          . Found a bug or have an idea?{" "}
          <a
            href={ISSUES_URL}
            className="font-semibold text-pink-600 underline dark:text-pink-400"
            target="_blank"
            rel="noreferrer"
          >
            Open an issue on GitHub
          </a>
          .
        </p>
        <p className={mutedText}>
          Want to toss around an idea or just say how it&apos;s going? Come hang out in{" "}
          <a
            href={DISCUSSIONS_URL}
            className="font-semibold text-pink-600 underline dark:text-pink-400"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Discussions
          </a>
          . Want to help build it? Start with the{" "}
          <a
            href={CONTRIBUTING_URL}
            className="font-semibold text-pink-600 underline dark:text-pink-400"
            target="_blank"
            rel="noreferrer"
          >
            contributing guide
          </a>
          .
        </p>
        {env.NEXT_PUBLIC_DONATION_URL && (
          <p className={mutedText}>
            Want to help keep it running?{" "}
            <SupportLink href={env.NEXT_PUBLIC_DONATION_URL} className="font-semibold" />
          </p>
        )}
      </section>

      <section aria-labelledby="credits-heading" className="space-y-3">
        <h2 id="credits-heading" className="text-2xl font-bold">
          Credits
        </h2>
        <p className={mutedText}>
          Card data, prices, rulings, mana symbols and card images all come from{" "}
          <a
            href="https://scryfall.com"
            className="font-semibold text-pink-600 underline dark:text-pink-400"
            target="_blank"
            rel="noreferrer"
          >
            Scryfall
          </a>
          , who make all of it free to use. If you like Magic Vault, go give them some love too.
        </p>
        <FanContentNotice />
      </section>
    </div>
  );
}
