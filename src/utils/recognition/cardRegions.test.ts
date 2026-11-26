import { CARD_HEIGHT, CARD_WIDTH } from "./model";
import { CARD_REGIONS, regionRect, type CardRegion } from "./cardRegions";

describe("CARD_REGIONS", () => {
  const entries = Object.entries(CARD_REGIONS) as [string, CardRegion][];

  test.each(entries)("%s lies inside the card", (_name, region) => {
    expect(region.left).toBeGreaterThanOrEqual(0);
    expect(region.top).toBeGreaterThanOrEqual(0);
    expect(region.width).toBeGreaterThan(0);
    expect(region.height).toBeGreaterThan(0);
    expect(region.left + region.width).toBeLessThanOrEqual(1);
    expect(region.top + region.height).toBeLessThanOrEqual(1);
  });

  test.each(entries)("%s fits inside a flat card in pixels", (_name, region) => {
    const rect = regionRect(region, CARD_WIDTH, CARD_HEIGHT);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(CARD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(CARD_HEIGHT);
    expect(Number.isInteger(rect.x + rect.y + rect.width + rect.height)).toBe(true);
  });

  test("the title is at the top and the collector info at the bottom left", () => {
    const title = regionRect(CARD_REGIONS.title, CARD_WIDTH, CARD_HEIGHT);
    const collector = regionRect(CARD_REGIONS.collector, CARD_WIDTH, CARD_HEIGHT);
    expect(title.y + title.height).toBeLessThan(CARD_HEIGHT * 0.15);
    expect(collector.y).toBeGreaterThan(CARD_HEIGHT * 0.85);
    expect(collector.x + collector.width).toBeLessThanOrEqual(CARD_WIDTH * 0.55);
  });

  test("covers where the M15 name and collector lines actually print", () => {
    // Pixel positions measured on Scryfall's 488x680 images: the name's
    // cap height spans about y=32..62 starting near x=36, and the two
    // collector lines span about y=614..648 starting near x=20.
    const title = regionRect(CARD_REGIONS.title, CARD_WIDTH, CARD_HEIGHT);
    expect(title.x).toBeLessThanOrEqual(30);
    expect(title.y).toBeLessThanOrEqual(28);
    expect(title.y + title.height).toBeGreaterThanOrEqual(70);

    const collector = regionRect(CARD_REGIONS.collector, CARD_WIDTH, CARD_HEIGHT);
    expect(collector.x).toBeLessThanOrEqual(15);
    expect(collector.y).toBeLessThanOrEqual(605);
    expect(collector.y + collector.height).toBeGreaterThanOrEqual(655);
  });

  test("the old frame title rect is at least as big as the modern one", () => {
    const modern = CARD_REGIONS.title;
    const old = CARD_REGIONS.titleOldFrame;
    expect(old.width * old.height).toBeGreaterThan(modern.width * modern.height);
    expect(old.top).toBeLessThanOrEqual(modern.top);
  });
});

describe("regionRect", () => {
  test("scales fractions to pixels", () => {
    expect(regionRect({ left: 0.25, top: 0.5, width: 0.5, height: 0.25 }, 100, 200)).toEqual({
      x: 25,
      y: 100,
      width: 50,
      height: 50,
    });
  });

  test("rounds outward and clamps to the image", () => {
    expect(regionRect({ left: 0.333, top: 0.9, width: 0.8, height: 0.2 }, 10, 10)).toEqual({
      x: 3,
      y: 9,
      width: 7,
      height: 1,
    });
  });
});
