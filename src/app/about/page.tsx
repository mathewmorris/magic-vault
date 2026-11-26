import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import FanContentNotice from "~/components/FanContentNotice";
import { artWindow, cardBar, cardFrame, cardInner, flavorText, Gem, SetSymbol, textBox } from "~/components/home/cardParts";
import { FEATURES } from "~/components/home/features";
import { mutedText, panel, primaryAction, secondaryAction } from "~/components/home/styles";
import SupportLink from "~/components/SupportLink";
import { env } from "~/env";
import { DECK_FORMATS, FORMAT_LABELS } from "~/utils/deck/checkDeck";

export const metadata: Metadata = {
  title: "About | Magic Vault",
  description:
    "Magic Vault is a free web app for tracking your Magic: The Gathering collection and building decks from the cards you own.",
};

const PROJECT_BOARD_URL = "https://github.com/users/mathewmorris/projects/2?pane=info";
const NEW_ISSUE_URL = "https://github.com/mathewmorris/magic-vault/issues/new/choose";
const DISCUSSIONS_URL = "https://github.com/mathewmorris/magic-vault/discussions";
const CONTRIBUTING_URL = "https://github.com/mathewmorris/magic-vault/blob/main/CONTRIBUTING.md";

const linkClass = "font-semibold text-pink-600 underline dark:text-pink-400";

/** The page's "card image": Magic Vault itself, drawn as a card. */
function VaultCard() {
  return (
    <div className={`mx-auto w-full max-w-xs ${cardFrame}`}>
      <div className={cardInner}>
        <div className={cardBar}>
          <span className="font-bold">Magic Vault</span>
          <Gem tone="plain">0</Gem>
        </div>
        <div className={`flex aspect-[4/3] items-center justify-center ${artWindow}`}>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(250,10,169,0.35),transparent_60%)]"
          />
          <Image
            src="/magicvault-logo.png"
            alt=""
            width={128}
            height={128}
            className="relative h-28 w-28 [image-rendering:pixelated]"
          />
        </div>
        <div className={cardBar}>
          <span className="text-xs font-semibold">Legendary Artifact &mdash; Collection Tracker</span>
          <SetSymbol />
        </div>
        <div className={`text-sm ${textBox}`}>
          <p className={flavorText}>
            It doesn&apos;t judge your bulk. It just counts it.
          </p>
        </div>
        <p className="px-1 text-[0.65rem] text-gray-400">MV &middot; 001 &middot; EN &middot; Illus. 8-bit purple circle</p>
      </div>
    </div>
  );
}

export default function About() {
  return (
    <div className="mx-auto max-w-5xl space-y-16">
      <header className="grid items-start gap-10 lg:grid-cols-[20rem_1fr]">
        <VaultCard />
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold sm:text-5xl">About Magic Vault</h1>
            <p className={`text-lg ${mutedText}`}>
              A free web app for the cards you own. Look up any card, log what&apos;s in your
              binders and boxes, see what it&apos;s all worth, and build decks out of it.
            </p>
          </div>

          <section aria-labelledby="oracle-heading" className={`space-y-4 ${panel}`}>
            <h2 id="oracle-heading" className="text-sm font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-400">
              Oracle text
            </h2>
            <ul className="space-y-3">
              {FEATURES.map((feature) => (
                <li key={feature.id} className="leading-relaxed">
                  <span className="font-bold">{feature.title}.</span>{" "}
                  <span className={mutedText}>{feature.body}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="legal-heading" className="space-y-3">
            <h2 id="legal-heading" className="text-sm font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-400">
              Legalities
            </h2>
            <p className={`text-sm ${mutedText}`}>
              Formats the deck checker knows the rules for. The kitchen table is always legal.
            </p>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {DECK_FORMATS.map((format) => (
                <li
                  key={format}
                  className="flex items-center justify-between gap-2 rounded-lg border border-purple-100 px-3 py-1.5 dark:border-purple-900/70"
                >
                  <span>{FORMAT_LABELS[format]}</span>
                  <span className="rounded bg-pink-600 px-1.5 py-0.5 text-xs font-semibold text-white">Legal</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </header>

      <section aria-labelledby="story-heading" className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-400">
          Story spotlight
        </p>
        <h2 id="story-heading" className="text-3xl font-bold sm:text-4xl">
          The Pile
        </h2>
        <div className={`space-y-4 text-lg leading-relaxed ${mutedText}`}>
          <p>
            Every player has one. A trade binder nobody has updated in two sets. A long box of bulk.
            Three Commander decks passing one Sol Ring around. Maybe a spreadsheet that was right
            once, for about a week.
          </p>
          <p>
            The vault is where The Pile gets sorted. Put your cards in once, by searching, scanning
            or importing a list, and the questions that used to mean digging through boxes get easy.
            Do I own this? Which printing? Is it foil? What&apos;s it worth today? Can I build this
            deck without buying anything?
          </p>
          <p>
            No formulas to fix, no guessing at prices, and no taking a deck apart just to find out
            you already had the card.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/search" className={primaryAction}>
            Search cards
          </Link>
          <Link href="/" className={secondaryAction}>
            Back to home
          </Link>
        </div>
      </section>

      <section aria-labelledby="building-heading" className={`mx-auto max-w-3xl space-y-3 ${panel}`}>
        <h2 id="building-heading" className="text-2xl font-bold">
          Next set: in development
        </h2>
        <p className={mutedText}>
          Magic Vault is built in the open. The{" "}
          <a href={PROJECT_BOARD_URL} className={linkClass} target="_blank" rel="noreferrer">
            project board
          </a>{" "}
          shows what&apos;s being worked on and what&apos;s coming next. Found a bug, or thought of
          a card this set is missing?{" "}
          <a href={NEW_ISSUE_URL} className={linkClass} target="_blank" rel="noreferrer">
            Open an issue on GitHub
          </a>
          .
        </p>
        <p className={mutedText}>
          Want to playtest an idea before it&apos;s a card, or just say how it&apos;s going? Pull up a
          seat in{" "}
          <a href={DISCUSSIONS_URL} className={linkClass} target="_blank" rel="noreferrer">
            GitHub Discussions
          </a>
          . Want to design a card yourself? The{" "}
          <a href={CONTRIBUTING_URL} className={linkClass} target="_blank" rel="noreferrer">
            contributing guide
          </a>{" "}
          has the rules for getting your code into the next set.
        </p>
        {env.NEXT_PUBLIC_DONATION_URL && (
          <p className={mutedText}>
            Want to help keep the lights on?{" "}
            <SupportLink href={env.NEXT_PUBLIC_DONATION_URL} className="font-semibold" />
          </p>
        )}
      </section>

      <section aria-labelledby="credits-heading" className="mx-auto max-w-3xl space-y-3">
        <h2 id="credits-heading" className="text-2xl font-bold">
          Credits
        </h2>
        <p className={mutedText}>
          Card data, prices, rulings, mana symbols and card images all come from{" "}
          <a href="https://scryfall.com" className={linkClass} target="_blank" rel="noreferrer">
            Scryfall
          </a>
          , who make all of it free to use. If you like Magic Vault, go give them some love too.
        </p>
        <FanContentNotice />
      </section>
    </div>
  );
}
