/** Small helpers for showing a recognized printing to the user. */

import { smallImageUrl } from "~/utils/cardImage";

type ImageUris = { small?: string } | null | undefined;

/**
 * Which printing this is, short: "M21 #157 · EN". Parts that aren't known are
 * left out; null when none are.
 */
export function printingDetail(card: {
  set: string | null;
  collector_number: string | null;
  lang: string | null;
}): string | null {
  const printing = [card.set?.toUpperCase(), card.collector_number ? `#${card.collector_number}` : null]
    .filter(Boolean)
    .join(" ");
  const parts = [printing, card.lang?.toUpperCase()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Small image of the face that matched, so a back-face match shows the back. */
export function faceImageUrl(
  card: { image_uris: unknown; card_faces: unknown },
  face: number,
): string | null {
  if (face > 0) {
    const faces = card.card_faces as { image_uris?: ImageUris }[] | null | undefined;
    const url = Array.isArray(faces) ? faces[face]?.image_uris?.small : undefined;
    if (url) return url;
  }
  return smallImageUrl(card);
}
