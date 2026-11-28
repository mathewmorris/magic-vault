/**
 * What Magic Vault does today, shown on the home and about pages.
 *
 * Only list things that work with every feature flag off. The AI scanner
 * (NEXT_PUBLIC_FEATURE_AI_SCAN) and affiliate links are off in production,
 * so they stay out of here until they're on.
 */
export type Feature = {
  id: "search" | "collections" | "prices" | "decks" | "import" | "scan";
  title: string;
  body: string;
  /** Where the feature lives. Signed-in pages send signed-out people to sign in. */
  href: string;
  signedIn: boolean;
};

export const FEATURES: Feature[] = [
  {
    id: "search",
    title: "Search every card",
    body: "Find any card by name, color, type, rules text, mana value, set or format, using Scryfall-style search.",
    href: "/search",
    signedIn: false,
  },
  {
    id: "collections",
    title: "Track what you own",
    body: "Keep collections with counts, foils, condition and language, so you always know what's in the box.",
    href: "/collections",
    signedIn: true,
  },
  {
    id: "prices",
    title: "Know what it's worth",
    body: "Prices update every day, and every collection shows its total value.",
    href: "/collections",
    signedIn: true,
  },
  {
    id: "decks",
    title: "Build decks",
    body: "Build for Commander, Modern, Pauper and more. Magic Vault checks the rules and shows which cards you still need.",
    href: "/decks",
    signedIn: true,
  },
  {
    id: "import",
    title: "Bring your cards with you",
    body: "Import a list or a CSV from Moxfield, Archidekt, ManaBox or Deckbox, and export any collection back out.",
    href: "/collections",
    signedIn: true,
  },
  {
    id: "scan",
    title: "Scan with your camera",
    body: "Hold a card up to your phone or webcam, and Magic Vault reads the name and adds it to a collection.",
    href: "/scan",
    signedIn: true,
  },
];
