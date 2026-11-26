/**
 * Helpers for the card detail page that read the loosely typed JSON columns
 * (card_faces, image_uris, legalities) into something the UI can trust.
 */

export interface CardImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
}

/** The parts of a Scryfall card face the detail page shows. */
export interface CardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  flavor_text?: string;
  artist?: string;
  image_uris?: CardImageUris;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function readImageUris(value: unknown): CardImageUris | undefined {
  if (!isRecord(value)) return undefined;
  const uris: CardImageUris = {
    small: optionalString(value.small),
    normal: optionalString(value.normal),
    large: optionalString(value.large),
    png: optionalString(value.png),
  };
  const first = uris.small ?? uris.normal ?? uris.large ?? uris.png;
  return first ? uris : undefined;
}

/** card_faces as typed faces; anything that isn't a face object is skipped. */
export function readCardFaces(value: unknown): CardFace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((face: unknown): CardFace[] => {
    if (!isRecord(face) || typeof face.name !== "string") return [];
    return [
      {
        name: face.name,
        mana_cost: optionalString(face.mana_cost),
        type_line: optionalString(face.type_line),
        oracle_text: optionalString(face.oracle_text),
        power: optionalString(face.power),
        toughness: optionalString(face.toughness),
        loyalty: optionalString(face.loyalty),
        flavor_text: optionalString(face.flavor_text),
        artist: optionalString(face.artist),
        image_uris: readImageUris(face.image_uris),
      },
    ];
  });
}

/** Biggest image that still loads quickly: large, then normal, then the rest. */
export function bestImage(uris: CardImageUris | undefined): string | undefined {
  return uris?.large ?? uris?.normal ?? uris?.png ?? uris?.small;
}

/**
 * The images to show, one per side. Double-faced cards keep an image on each
 * face; split, flip and adventure cards share one image at the top level.
 */
export function cardImages(card: { image_uris: unknown; card_faces: unknown }): string[] {
  const top = bestImage(readImageUris(card.image_uris));
  if (top) return [top];
  return readCardFaces(card.card_faces).flatMap((face) => {
    const image = bestImage(face.image_uris);
    return image ? [image] : [];
  });
}

/** Small thumbnail for lists, falling back to the front face. */
export function smallImage(card: { image_uris: unknown; card_faces: unknown }): string | undefined {
  const top = readImageUris(card.image_uris);
  if (top) return top.small ?? bestImage(top);
  const front = readCardFaces(card.card_faces)[0]?.image_uris;
  return front?.small ?? bestImage(front);
}

export type Legality = "legal" | "not_legal" | "banned" | "restricted";

/** The formats the legality grid shows, in Scryfall's order. */
export const LEGALITY_FORMATS = [
  { key: "standard", label: "Standard" },
  { key: "pioneer", label: "Pioneer" },
  { key: "modern", label: "Modern" },
  { key: "legacy", label: "Legacy" },
  { key: "vintage", label: "Vintage" },
  { key: "commander", label: "Commander" },
  { key: "pauper", label: "Pauper" },
  { key: "brawl", label: "Brawl" },
  { key: "historic", label: "Historic" },
  { key: "timeless", label: "Timeless" },
  { key: "oathbreaker", label: "Oathbreaker" },
] as const;

export const LEGALITY_LABELS: Record<Legality, string> = {
  legal: "Legal",
  not_legal: "Not legal",
  banned: "Banned",
  restricted: "Restricted",
};

function isLegality(value: unknown): value is Legality {
  return value === "legal" || value === "not_legal" || value === "banned" || value === "restricted";
}

/** One row per format in LEGALITY_FORMATS; unknown or missing values read as not legal. */
export function legalityRows(
  legalities: unknown,
): { key: string; label: string; legality: Legality }[] {
  const values = isRecord(legalities) ? legalities : {};
  return LEGALITY_FORMATS.map(({ key, label }) => {
    const value = values[key];
    return { key, label, legality: isLegality(value) ? value : "not_legal" };
  });
}

/** "common" -> "Common", "mythic" -> "Mythic". */
export function formatRarity(rarity: string | null | undefined): string | undefined {
  if (!rarity) return undefined;
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}
