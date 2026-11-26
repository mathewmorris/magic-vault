import prismaMock from "singleton";
import { buildCard } from "~/server/testing/cardFixture";

import { FEATURED_CARD_NAMES, getCardCount, getFeaturedCards } from "./featuredCards";

const withImage = (name: string, id: string) =>
  buildCard({
    id,
    name,
    image_uris: { small: `https://cards.scryfall.io/small/${id}.jpg`, normal: `https://cards.scryfall.io/normal/${id}.jpg` },
  });

describe("getFeaturedCards", () => {
  test("returns the cards in FEATURED_CARD_NAMES order with normal images", async () => {
    // Arrange: the query returns them alphabetically.
    prismaMock.card.findMany.mockResolvedValue([
      withImage("Black Lotus", "lotus"),
      withImage("Counterspell", "counter"),
      withImage("Lightning Bolt", "bolt"),
    ]);

    // Act
    const cards = await getFeaturedCards(prismaMock);

    // Assert
    expect(cards.map((card) => card.name)).toEqual([...FEATURED_CARD_NAMES]);
    expect(cards[0]).toEqual({
      id: "bolt",
      name: "Lightning Bolt",
      imageUrl: "https://cards.scryfall.io/normal/bolt.jpg",
    });
  });

  test("skips cards that are missing or have no image", async () => {
    prismaMock.card.findMany.mockResolvedValue([
      withImage("Black Lotus", "lotus"),
      buildCard({ id: "bolt", name: "Lightning Bolt", image_uris: null }),
    ]);

    const cards = await getFeaturedCards(prismaMock);

    expect(cards.map((card) => card.id)).toEqual(["lotus"]);
  });

  test("uses the front face of a double-faced card", async () => {
    prismaMock.card.findMany.mockResolvedValue([
      buildCard({
        id: "dfc",
        name: "Counterspell",
        card_faces: [{ image_uris: { normal: "https://cards.scryfall.io/normal/front.jpg" } }],
      }),
    ]);

    const cards = await getFeaturedCards(prismaMock);

    expect(cards[0]?.imageUrl).toBe("https://cards.scryfall.io/normal/front.jpg");
  });

  test("returns nothing instead of throwing when the database fails", async () => {
    prismaMock.card.findMany.mockRejectedValue(new Error("db down"));

    await expect(getFeaturedCards(prismaMock)).resolves.toEqual([]);
  });
});

describe("getCardCount", () => {
  test("returns the card count", async () => {
    prismaMock.card.count.mockResolvedValue(120276);

    await expect(getCardCount(prismaMock)).resolves.toBe(120276);
  });

  test("returns null when the database fails", async () => {
    prismaMock.card.count.mockRejectedValue(new Error("db down"));

    await expect(getCardCount(prismaMock)).resolves.toBeNull();
  });
});
