import { CARD_REGIONS } from "./cardRegions";
import { CARD_HEIGHT, CARD_WIDTH } from "./model";
import { COLLECTOR_WHITELIST, interpretOcr, planCrop } from "./ocr";

describe("planCrop", () => {
  test("crops the region and upscales it between 2x and 3x", () => {
    for (const region of Object.values(CARD_REGIONS)) {
      const plan = planCrop(region, CARD_WIDTH, CARD_HEIGHT);
      expect(plan.scale).toBeGreaterThanOrEqual(2);
      expect(plan.scale).toBeLessThanOrEqual(3);
      expect(plan.sx + plan.sw).toBeLessThanOrEqual(CARD_WIDTH);
      expect(plan.sy + plan.sh).toBeLessThanOrEqual(CARD_HEIGHT);
      expect(plan.width).toBe(Math.round(plan.sw * plan.scale));
      expect(plan.height).toBe(Math.round(plan.sh * plan.scale));
    }
  });

  test("aims for the target width when that's within the scale limits", () => {
    const plan = planCrop({ left: 0, top: 0, width: 0.5, height: 0.1 }, 1000, 1000, { targetWidth: 1250 });
    expect(plan.scale).toBe(2.5);
    expect(plan.width).toBe(1250);
  });

  test("clamps the scale for tiny and huge regions", () => {
    expect(planCrop({ left: 0, top: 0, width: 0.1, height: 0.1 }, 100, 100).scale).toBe(3);
    expect(planCrop({ left: 0, top: 0, width: 1, height: 1 }, 4000, 4000).scale).toBe(2);
  });
});

describe("interpretOcr", () => {
  test("cleans the name and parses the collector block", () => {
    const result = interpretOcr("Lightning Bolt ®\n", "0149/249 C\nM11 • EN");
    expect(result.name).toBe("Lightning Bolt");
    expect(result.collector).toMatchObject({ setCode: "m11", collectorNumber: "149", rarity: "C" });
    expect(result.rawTitle).toBe("Lightning Bolt ®\n");
  });

  test("nulls when nothing was read", () => {
    const result = interpretOcr("~ |", "");
    expect(result.name).toBeNull();
    expect(result.collector).toBeNull();
  });
});

test("the collector whitelist covers what the block prints", () => {
  for (const ch of "0157/280 RM21•EN★†a".replace(/ /g, "")) {
    expect(COLLECTOR_WHITELIST).toContain(ch);
  }
});
