import { type PrismaClient } from "@prisma/client";

import { normalImageUrl } from "~/utils/cardImage";

/** The cards shown on the signed-out home page, left to right. */
export const FEATURED_CARD_NAMES = ["Lightning Bolt", "Black Lotus", "Counterspell"] as const;

export type FeaturedCard = {
  id: string;
  name: string;
  imageUrl: string;
};

/**
 * One printing of each featured card, for the home page. Uses the oldest
 * English high-res scan, which for these is the original art.
 *
 * Never throws: if the database is down or a card is missing, the home page
 * just shows placeholders for the missing ones.
 */
export async function getFeaturedCards(
  db: Pick<PrismaClient, "card">,
): Promise<FeaturedCard[]> {
  try {
    const rows = await db.card.findMany({
      where: {
        name: { in: [...FEATURED_CARD_NAMES] },
        lang: "en",
        image_status: "highres_scan",
      },
      select: { id: true, name: true, image_uris: true, card_faces: true },
      orderBy: [{ name: "asc" }, { released_at: "asc" }],
      distinct: ["name"],
    });

    const byName = new Map<string, FeaturedCard>();
    for (const row of rows) {
      const imageUrl = normalImageUrl(row);
      if (imageUrl) byName.set(row.name, { id: row.id, name: row.name, imageUrl });
    }

    return FEATURED_CARD_NAMES.flatMap((name) => {
      const card = byName.get(name);
      return card ? [card] : [];
    });
  } catch {
    return [];
  }
}

/** How many cards are in the database, or null if it can't be counted. */
export async function getCardCount(db: Pick<PrismaClient, "card">): Promise<number | null> {
  try {
    return await db.card.count();
  } catch {
    return null;
  }
}
