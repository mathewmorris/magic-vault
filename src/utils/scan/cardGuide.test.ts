import { CARD_ASPECT_RATIO, cardGuideRect, titleStripRect } from "./cardGuide";

describe("cardGuideRect", () => {
  test("is limited by height on a landscape frame", () => {
    const rect = cardGuideRect(1280, 720);
    expect(rect.height).toBeCloseTo(720 * 0.85);
    expect(rect.width).toBeCloseTo(720 * 0.85 * CARD_ASPECT_RATIO);
  });

  test("is limited by width on a narrow portrait frame", () => {
    const rect = cardGuideRect(400, 1000);
    expect(rect.width).toBeCloseTo(400 * 0.85);
    expect(rect.height).toBeCloseTo((400 * 0.85) / CARD_ASPECT_RATIO);
  });

  test("keeps the card's aspect ratio", () => {
    for (const [w, h] of [
      [1280, 720],
      [720, 1280],
      [640, 480],
      [300, 900],
    ] as const) {
      const rect = cardGuideRect(w, h);
      expect(rect.width / rect.height).toBeCloseTo(CARD_ASPECT_RATIO);
    }
  });

  test("is centered and fits inside the frame", () => {
    const rect = cardGuideRect(1280, 720);
    expect(rect.x).toBeCloseTo((1280 - rect.width) / 2);
    expect(rect.y).toBeCloseTo((720 - rect.height) / 2);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1280);
    expect(rect.y + rect.height).toBeLessThanOrEqual(720);
  });

  test("honors a custom fill", () => {
    expect(cardGuideRect(1000, 1000, 0.5).height).toBeCloseTo(500);
  });
});

describe("titleStripRect", () => {
  const card = { x: 100, y: 50, width: 630, height: 880 };

  test("sits at the top of the card", () => {
    const strip = titleStripRect(card);
    expect(strip.y).toBeCloseTo(50 + 880 * 0.025);
    expect(strip.height).toBeCloseTo(88);
  });

  test("spans most of the card's width and stays inside it", () => {
    const strip = titleStripRect(card);
    expect(strip.x).toBeGreaterThan(card.x);
    expect(strip.x + strip.width).toBeLessThan(card.x + card.width);
    expect(strip.width).toBeCloseTo(630 * 0.92);
  });
});
