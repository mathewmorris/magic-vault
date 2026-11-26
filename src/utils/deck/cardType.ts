/** The sections a deck list is split into, in the order they're shown. */
export const CARD_TYPE_GROUPS = [
  "creatures",
  "instants",
  "sorceries",
  "artifacts",
  "enchantments",
  "planeswalkers",
  "lands",
  "other",
] as const;
export type CardTypeGroup = (typeof CARD_TYPE_GROUPS)[number];

export const CARD_TYPE_GROUP_LABELS: Record<CardTypeGroup, string> = {
  creatures: "Creatures",
  instants: "Instants",
  sorceries: "Sorceries",
  artifacts: "Artifacts",
  enchantments: "Enchantments",
  planeswalkers: "Planeswalkers",
  lands: "Lands",
  other: "Other",
};

// When a card has several types, the first match here wins: an artifact
// creature is a creature, an artifact land is a land.
const PRECEDENCE: [CardTypeGroup, string][] = [
  ["creatures", "Creature"],
  ["planeswalkers", "Planeswalker"],
  ["lands", "Land"],
  ["instants", "Instant"],
  ["sorceries", "Sorcery"],
  ["artifacts", "Artifact"],
  ["enchantments", "Enchantment"],
];

/**
 * Which deck section a card goes in, from its type line. Double-faced and
 * split cards go by their front face ("Instant // Land" is an instant).
 */
export function cardTypeGroup(typeLine: string | null): CardTypeGroup {
  const front = typeLine?.split(" // ")[0] ?? "";
  // Only the types before the dash, so a subtype can't be mistaken for one.
  const types = (front.split("—")[0] ?? "").split(/\s+/);

  for (const [group, type] of PRECEDENCE) {
    if (types.includes(type)) return group;
  }
  return "other";
}
