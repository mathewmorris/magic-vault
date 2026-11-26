import { faceImageUrl, printingDetail } from "./display";

describe("printingDetail", () => {
  test("set, number and language", () => {
    expect(printingDetail({ set: "m21", collector_number: "157", lang: "en" })).toBe("M21 #157 · EN");
  });

  test("leaves out what isn't known", () => {
    expect(printingDetail({ set: "m21", collector_number: null, lang: "en" })).toBe("M21 · EN");
    expect(printingDetail({ set: null, collector_number: "7★", lang: null })).toBe("#7★");
    expect(printingDetail({ set: null, collector_number: null, lang: null })).toBeNull();
  });
});

describe("faceImageUrl", () => {
  const dfc = {
    image_uris: null,
    card_faces: [{ image_uris: { small: "front.jpg" } }, { image_uris: { small: "back.jpg" } }],
  };

  test("shows the face that matched", () => {
    expect(faceImageUrl(dfc, 1)).toBe("back.jpg");
    expect(faceImageUrl(dfc, 0)).toBe("front.jpg");
  });

  test("falls back to the card's own image", () => {
    expect(faceImageUrl({ image_uris: { small: "card.jpg" }, card_faces: null }, 1)).toBe("card.jpg");
  });
});
