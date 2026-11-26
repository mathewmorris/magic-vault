import { smallImageUrl } from "./cardImage";

describe("smallImageUrl", () => {
  test("uses the card's own image when it has one", () => {
    expect(
      smallImageUrl({ image_uris: { small: "https://cards.scryfall.io/small/a.jpg" }, card_faces: null }),
    ).toBe("https://cards.scryfall.io/small/a.jpg");
  });

  test("falls back to the front face for double-faced cards", () => {
    expect(
      smallImageUrl({
        image_uris: null,
        card_faces: [
          { image_uris: { small: "https://cards.scryfall.io/small/front.jpg" } },
          { image_uris: { small: "https://cards.scryfall.io/small/back.jpg" } },
        ],
      }),
    ).toBe("https://cards.scryfall.io/small/front.jpg");
  });

  test("returns null when there's no image anywhere", () => {
    expect(smallImageUrl({ image_uris: null, card_faces: null })).toBeNull();
    expect(smallImageUrl({ image_uris: null, card_faces: [{ name: "Split half" }] })).toBeNull();
  });
});
