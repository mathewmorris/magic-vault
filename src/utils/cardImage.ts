type ImageUris = { small?: string; normal?: string; large?: string } | null | undefined;

/** The card columns needed to pick an image. */
export type CardImageSource = {
  image_uris: unknown;
  card_faces: unknown;
};

/**
 * Small card image URL. Double-faced cards (transform, modal DFC, etc.) have
 * no top-level image_uris on Scryfall, only one per face, so fall back to the
 * front face.
 */
export function smallImageUrl(card: CardImageSource): string | null {
  const images = card.image_uris as ImageUris;
  if (images?.small) return images.small;
  const faces = card.card_faces as { image_uris?: ImageUris }[] | null | undefined;
  return faces?.[0]?.image_uris?.small ?? null;
}

/**
 * Normal-size card image URL (488 x 680), with the same front-face fallback
 * as smallImageUrl.
 */
export function normalImageUrl(card: CardImageSource): string | null {
  const images = card.image_uris as ImageUris;
  if (images?.normal) return images.normal;
  const faces = card.card_faces as { image_uris?: ImageUris }[] | null | undefined;
  return faces?.[0]?.image_uris?.normal ?? null;
}
