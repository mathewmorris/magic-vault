import type { ScanCard } from "~/server/api/routers/scan";
import type { CollectorInfo } from "./collectorLine";
import { faceName, MAX_CANDIDATES, rankRecognition, type EmbeddingMatch } from "./fuse";

function card(id: string, name: string, set: string, number: string, extra: Partial<ScanCard> = {}): ScanCard {
  return {
    id,
    name,
    set,
    set_name: set.toUpperCase(),
    collector_number: number,
    lang: "en",
    rarity: "rare",
    layout: "normal",
    image_uris: null,
    card_faces: null,
    ...extra,
  };
}

function match(c: ScanCard, similarity: number, face = 0): EmbeddingMatch {
  return { card: c, face, similarity };
}

function collector(setCode: string | null, collectorNumber: string | null, extra: Partial<CollectorInfo> = {}): CollectorInfo {
  return { setCode, collectorNumber, lang: "en", rarity: null, total: null, ...extra };
}

const boltM11 = card("bolt-m11", "Lightning Bolt", "m11", "149");
const bolt2xm = card("bolt-2xm", "Lightning Bolt", "2xm", "141");
const boltSta = card("bolt-sta", "Lightning Bolt", "sta", "42");
const blast = card("blast", "Lightning Blast", "m10", "146");
const shock = card("shock", "Shock", "m21", "159");
const delver = card("delver-isd", "Delver of Secrets // Insectile Aberration", "isd", "51", {
  layout: "transform",
  card_faces: [{ name: "Delver of Secrets" }, { name: "Insectile Aberration" }],
});

describe("rankRecognition", () => {
  test("a clear image match with an agreeing name is confident", () => {
    const result = rankRecognition({
      matches: [match(shock, 0.88), match(blast, 0.41), match(boltM11, 0.38)],
      printing: null,
      ocrName: "Shock",
      collector: null,
    });

    expect(result.candidates[0]!.card.id).toBe("shock");
    expect(result.candidates[0]!.nameScore).toBe(1);
    expect(result.candidates[0]!.reasons).toEqual(expect.arrayContaining(["name read 100%"]));
    expect(result.confident).toBe(true);
  });

  describe("reprints with identical art", () => {
    const matches = [match(bolt2xm, 0.84), match(boltM11, 0.838), match(boltSta, 0.7), match(blast, 0.45)];

    test("without a collector read, the printing is a toss-up and not confident", () => {
      const result = rankRecognition({ matches, printing: null, ocrName: "Lightning Bolt", collector: null });

      expect(result.candidates[0]!.card.name).toBe("Lightning Bolt");
      expect(result.confident).toBe(false);
    });

    test("the set and number OCR picks the right printing", () => {
      const result = rankRecognition({
        matches,
        printing: boltM11,
        ocrName: "Lightning Bolt",
        collector: collector("m11", "149"),
      });

      expect(result.candidates[0]!.card.id).toBe("bolt-m11");
      expect(result.candidates[0]!.reasons).toContain("set and number match");
      expect(result.confident).toBe(true);
    });

    test("a set code alone breaks the tie between same-named printings", () => {
      const result = rankRecognition({
        matches,
        printing: null,
        ocrName: null,
        collector: collector("m11", null),
      });

      expect(result.candidates[0]!.card.id).toBe("bolt-m11");
      expect(result.candidates[0]!.reasons).toContain("set matches");
    });

    test("collector numbers compare without leading zeros and set codes without case", () => {
      const result = rankRecognition({
        matches,
        printing: null,
        ocrName: null,
        collector: collector("M11", "0149"),
      });

      expect(result.candidates[0]!.card.id).toBe("bolt-m11");
    });
  });

  test("a DFC matched on its back face scores the back face's name", () => {
    const result = rankRecognition({
      matches: [match(delver, 0.8, 1), match(shock, 0.5)],
      printing: null,
      ocrName: "Insectile Aberration",
      collector: null,
    });

    const top = result.candidates[0]!;
    expect(top.card.id).toBe("delver-isd");
    expect(top.face).toBe(1);
    expect(top.nameScore).toBe(1);
    expect(top.reasons).toContain("back face");
    expect(result.confident).toBe(true);
  });

  test("a DFC matched on both faces appears once, with its better face", () => {
    const result = rankRecognition({
      matches: [match(delver, 0.6, 0), match(delver, 0.82, 1)],
      printing: null,
      ocrName: null,
      collector: null,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.face).toBe(1);
    expect(result.candidates[0]!.similarity).toBe(0.82);
  });

  test("a wrong OCR name doesn't beat a strong image match", () => {
    const result = rankRecognition({
      matches: [match(boltM11, 0.86), match(blast, 0.42)],
      printing: null,
      ocrName: "Lightning Blast",
      collector: null,
    });

    expect(result.candidates[0]!.card.id).toBe("bolt-m11");
    expect(result.confident).toBe(true);
  });

  test("garbage OCR adds nothing and takes nothing away", () => {
    const withGarbage = rankRecognition({
      matches: [match(shock, 0.7), match(blast, 0.5)],
      printing: null,
      ocrName: "Wrnn Ilqx",
      collector: null,
    });
    const withoutName = rankRecognition({
      matches: [match(shock, 0.7), match(blast, 0.5)],
      printing: null,
      ocrName: null,
      collector: null,
    });

    expect(withGarbage.candidates.map((c) => c.score)).toEqual(withoutName.candidates.map((c) => c.score));
    expect(withoutName.candidates[0]!.nameScore).toBeNull();
  });

  test("when the image is unsure, an exact printing read wins and is confident", () => {
    const result = rankRecognition({
      matches: [match(blast, 0.46), match(boltSta, 0.44), match(shock, 0.43)],
      printing: boltM11,
      ocrName: "Lightning Bolt",
      collector: collector("m11", "149"),
    });

    const top = result.candidates[0]!;
    expect(top.card.id).toBe("bolt-m11");
    expect(top.similarity).toBeNull();
    expect(top.reasons).toContain("found by set and number");
    // It borrows the image score of the other Bolt printing it shares art with.
    expect(top.score).toBeGreaterThan(0.44 + 0.25);
    expect(result.confident).toBe(true);
  });

  test("the printing lookup joins when it agrees with the top image match even with no name", () => {
    const result = rankRecognition({
      matches: [match(bolt2xm, 0.8), match(blast, 0.4)],
      printing: boltM11,
      ocrName: null,
      collector: collector("m11", "149"),
    });

    expect(result.candidates[0]!.card.id).toBe("bolt-m11");
    expect(result.confident).toBe(true);
  });

  test("a printing lookup that agrees with nothing is left out", () => {
    // OCR misread the number and the lookup found some unrelated card.
    const result = rankRecognition({
      matches: [match(shock, 0.82), match(blast, 0.4)],
      printing: card("random", "Grizzly Bears", "m21", "189"),
      ocrName: "Shock",
      collector: collector("m21", "189"),
    });

    expect(result.candidates.map((c) => c.card.id)).not.toContain("random");
    expect(result.candidates[0]!.card.id).toBe("shock");
  });

  test("the printing lookup isn't duplicated when the image search returned it too", () => {
    const result = rankRecognition({
      matches: [match(boltM11, 0.8), match(bolt2xm, 0.79)],
      printing: boltM11,
      ocrName: null,
      collector: collector("m11", "149"),
    });

    expect(result.candidates.filter((c) => c.card.id === "bolt-m11")).toHaveLength(1);
    expect(result.candidates[0]!.similarity).toBe(0.8);
  });

  test("nothing good: low similarities and no OCR are not confident", () => {
    const result = rankRecognition({
      matches: [match(shock, 0.31), match(blast, 0.29), match(boltM11, 0.28)],
      printing: null,
      ocrName: null,
      collector: null,
    });

    expect(result.confident).toBe(false);
    expect(result.candidates).toHaveLength(3);
  });

  test("nothing at all", () => {
    expect(rankRecognition({ matches: [], printing: null, ocrName: null, collector: null })).toEqual({
      candidates: [],
      confident: false,
    });
  });

  test("an exact printing read with a disagreeing name and image is not confident", () => {
    const result = rankRecognition({
      matches: [match(blast, 0.5), match(shock, 0.49)],
      printing: null,
      ocrName: null,
      collector: collector("m21", "159"),
    });

    expect(result.candidates[0]!.card.id).toBe("shock");
    expect(result.confident).toBe(false);
  });

  test("the language read is a small tie-breaker", () => {
    const boltJa = card("bolt-m11-ja", "Lightning Bolt", "m11", "149", { lang: "ja" });
    const result = rankRecognition({
      matches: [match(boltM11, 0.8), match(boltJa, 0.8)],
      printing: null,
      ocrName: null,
      collector: collector("m11", "149", { lang: "ja" }),
    });

    expect(result.candidates[0]!.card.id).toBe("bolt-m11-ja");
  });

  test("returns at most MAX_CANDIDATES, best first", () => {
    const many = Array.from({ length: 25 }, (_, i) => match(card(`c${i}`, `Card ${i}`, "m21", String(i)), i / 100));
    const result = rankRecognition({ matches: many, printing: null, ocrName: null, collector: null });

    expect(result.candidates).toHaveLength(MAX_CANDIDATES);
    expect(result.candidates[0]!.card.id).toBe("c24");
  });
});

describe("faceName", () => {
  test("uses the face's own name, falling back to the card name", () => {
    expect(faceName(delver, 1)).toBe("Insectile Aberration");
    expect(faceName(delver, 5)).toBe(delver.name);
    expect(faceName(shock, 0)).toBe("Shock");
  });
});
