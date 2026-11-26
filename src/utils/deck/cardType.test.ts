import { cardTypeGroup } from "./cardType";

describe("cardTypeGroup", () => {
  test.each([
    ["Legendary Creature — Elf Druid", "creatures"],
    ["Artifact Creature — Golem", "creatures"],
    ["Land Creature — Forest Dryad", "creatures"],
    ["Instant", "instants"],
    ["Kindred Instant — Elf", "instants"],
    ["Sorcery", "sorceries"],
    ["Artifact", "artifacts"],
    ["Legendary Enchantment Artifact", "artifacts"],
    ["Enchantment — Aura", "enchantments"],
    ["Legendary Planeswalker — Jace", "planeswalkers"],
    ["Basic Land — Forest", "lands"],
    ["Artifact Land", "lands"],
    ["Battle — Siege", "other"],
    ["Instant // Land", "instants"],
    ["Land // Creature — Elf", "lands"],
  ])("%s goes under %s", (typeLine, group) => {
    expect(cardTypeGroup(typeLine)).toBe(group);
  });

  test("a subtype that looks like a type doesn't count", () => {
    // Not a real card: the type is Enchantment, "Creature" is only a subtype.
    expect(cardTypeGroup("Enchantment — Creature")).toBe("enchantments");
  });

  test("an unknown type line goes under other", () => {
    expect(cardTypeGroup(null)).toBe("other");
    expect(cardTypeGroup("")).toBe("other");
  });
});
