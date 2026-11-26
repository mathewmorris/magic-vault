import { normalImageUrl, smallImageUrl } from "./cardImage";

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

describe("normalImageUrl", () => {
  test("returns the top-level normal image", () => {
    expect(
      normalImageUrl({
        image_uris: { small: "https://cards.scryfall.io/small/a.jpg", normal: "https://cards.scryfall.io/normal/a.jpg" },
        card_faces: null,
      }),
    ).toBe("https://cards.scryfall.io/normal/a.jpg");
  });

  test("falls back to the front face", () => {
    expect(
      normalImageUrl({
        image_uris: null,
        card_faces: [
          { image_uris: { normal: "https://cards.scryfall.io/normal/front.jpg" } },
          { image_uris: { normal: "https://cards.scryfall.io/normal/back.jpg" } },
        ],
      }),
    ).toBe("https://cards.scryfall.io/normal/front.jpg");
  });

  test("returns null when there's no image anywhere", () => {
    expect(normalImageUrl({ image_uris: null, card_faces: null })).toBeNull();
  });
});
