/**
 * What Magic Vault does today, shown on the home and about pages. Each
 * feature is dressed up as a card in the "set list" on the home page, so it
 * carries a type line, a mana cost and a line of flavor text too.
 *
 * Only list things that work with every feature flag off. The AI scanner
 * (NEXT_PUBLIC_FEATURE_AI_SCAN) and affiliate links are off in production,
 * so they stay out of here until they're on.
 */
export type GemTone = "pink" | "purple" | "plain";

export type Feature = {
  id: "search" | "collections" | "prices" | "decks" | "import" | "scan";
  /** The card name. */
  title: string;
  typeLine: string;
  /** Colored gems in the corner. Decoration only, not real mana symbols. */
  cost: GemTone[];
  /** The rules text: what the feature actually does. */
  body: string;
  flavor: string;
  /** Power/toughness, for the one feature that's a creature. */
  pt?: string;
  /** Where the feature lives. Signed-in pages send signed-out people to sign in. */
  href: string;
  signedIn: boolean;
};

export const FEATURES: Feature[] = [
  {
    id: "search",
    title: "Search Every Card",
    typeLine: "Instant",
    cost: ["pink"],
    body: "Find any card by name, color, type, rules text, mana value, set or format. Scryfall-style search works too, and you don't need an account.",
    flavor: "“Wait, they printed that?”",
    href: "/search",
    signedIn: false,
  },
  {
    id: "collections",
    title: "Track What You Own",
    typeLine: "Enchantment — Binder",
    cost: ["plain", "purple"],
    body: "Keep collections with counts, foils, condition and language. Split them however you like: trade binder, bulk box, the shoebox under the bed.",
    flavor: "Finally, a real answer to “do I have one of these?”",
    href: "/collections",
    signedIn: true,
  },
  {
    id: "prices",
    title: "Know What It's Worth",
    typeLine: "Artifact — Treasure",
    cost: ["plain", "pink"],
    body: "Prices update every day, and every collection shows its total value.",
    flavor: "Unlike other Treasure, you don't have to sacrifice it to find out.",
    href: "/collections",
    signedIn: true,
  },
  {
    id: "decks",
    title: "Build Decks",
    typeLine: "Sorcery",
    cost: ["plain", "purple", "pink"],
    body: "Brew for Commander, Modern, Pauper and more. Magic Vault checks the rules and shows which cards you still need.",
    flavor: "Sorcery speed. Take your time, nobody's waiting on priority.",
    href: "/decks",
    signedIn: true,
  },
  {
    id: "import",
    title: "Bring Your Cards With You",
    typeLine: "Instant",
    cost: ["purple"],
    body: "Import a list or a CSV from Moxfield, Archidekt, ManaBox or Deckbox, and export any collection back out.",
    flavor: "Exile your spreadsheet. Return it to the battlefield as a vault.",
    href: "/collections",
    signedIn: true,
  },
  {
    id: "scan",
    title: "Scan With Your Camera",
    typeLine: "Artifact Creature — Scanner",
    cost: ["plain", "pink"],
    body: "Hold a card up to your phone or webcam. Magic Vault reads the card name and adds it to a collection.",
    flavor: "It reads the name. You still have to sleeve it.",
    pt: "1/1",
    href: "/scan",
    signedIn: true,
  },
];
