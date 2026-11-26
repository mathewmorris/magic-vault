import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import FanContentNotice from "~/components/FanContentNotice";
import { mutedText, panel, primaryAction, secondaryAction } from "~/components/home/styles";
import SupportLink from "~/components/SupportLink";
import { env } from "~/env";

export const metadata: Metadata = {
  title: "About | Magic Vault",
  description:
    "Magic Vault is a free web app for tracking your Magic: The Gathering collection and building decks from the cards you own.",
};

const PROJECT_BOARD_URL = "https://github.com/users/mathewmorris/projects/2?pane=info";
const ISSUES_URL = "https://github.com/mathewmorris/magic-vault/issues";

const inlineLink = "font-semibold text-pink-600 underline dark:text-pink-400";

const WHAT_IT_DOES = [
  {
    tag: "search",
    text: "Look up any card by name, type, rules text, colors, mana value, set or format, with Scryfall-style syntax. No account needed.",
  },
  {
    tag: "collections",
    text: "Log every copy you own with its count, foil, condition and language.",
  },
  {
    tag: "prices",
    text: "Prices refresh every day, and each collection keeps a running total.",
  },
  {
    tag: "decks",
    text: "Build for Commander, Modern, Pauper and more. The deck gets checked against the format's rules, and you see what you still need.",
  },
  {
    tag: "import",
    text: "Bring a list or CSV from Moxfield, Archidekt, ManaBox or Deckbox, and export it back out any time.",
  },
  {
    tag: "scan",
    text: "Hold a card up to your phone or webcam and it reads the name and adds it for you.",
  },
];

export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-16">
      <header className="space-y-8">
        <Image
          src="/magicvault-logo.png"
          alt=""
          width={72}
          height={72}
          className="rounded-2xl shadow-lg shadow-purple-900/30"
        />
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          It always starts with a spreadsheet.
        </h1>
      </header>

      <section aria-label="Why Magic Vault exists" className={`space-y-5 text-lg leading-relaxed ${mutedText}`}>
        <p>
          The collection outgrows the shoebox. Then the binder. Then the second binder. So you start
          a spreadsheet, and for about a week it&apos;s great.
        </p>
        <p>
          Then you crack a few packs and don&apos;t log them. Prices move. Somebody at the shop asks
          if you still have that card for their deck, and you honestly don&apos;t know. Is it in the
          trade binder? Did it go into a Commander deck? Did you trade it away last spring?
        </p>
        <p className="text-gray-900 dark:text-white">
          Magic Vault is the thing we wanted instead of the spreadsheet. One place that knows
          what&apos;s in the binder, what it&apos;s worth today, and which of those cards can go
          into the next brew.
        </p>
      </section>

      <section aria-labelledby="does-heading" className="space-y-6">
        <h2 id="does-heading" className="text-2xl font-bold">
          What it does
        </h2>
        <dl className="divide-y divide-purple-100 border-y border-purple-100 dark:divide-purple-900/60 dark:border-purple-900/60">
          {WHAT_IT_DOES.map((item) => (
            <div key={item.tag} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-6">
              <dt className="font-mono text-sm text-pink-600 dark:text-pink-400">/{item.tag}</dt>
              <dd className={mutedText}>{item.text}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-3">
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
          Magic Vault is a side project, and the whole thing happens in public. What&apos;s being
          worked on and what&apos;s coming next is all on the{" "}
          <a href={PROJECT_BOARD_URL} className={inlineLink} target="_blank" rel="noreferrer">
            project board
          </a>
          . Found a bug, or want something that isn&apos;t here yet?{" "}
          <a href={ISSUES_URL} className={inlineLink} target="_blank" rel="noreferrer">
            Open an issue on GitHub
          </a>
          .
        </p>
        {env.NEXT_PUBLIC_DONATION_URL && (
          <p className={mutedText}>
            The app is free. The servers aren&apos;t.{" "}
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
          <a href="https://scryfall.com" className={inlineLink} target="_blank" rel="noreferrer">
            Scryfall
          </a>
          , who make all of it free to use. None of this works without them, so go give them some
          love too.
        </p>
        <FanContentNotice />
      </section>
    </div>
  );
}
