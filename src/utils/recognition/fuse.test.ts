import type { ScanCard } from "~/server/api/routers/scan";
import type { CollectorInfo } from "./collectorLine";
import {
  faceName,
  FINISH_DEFAULT_CONFIDENCE,
  MAX_CANDIDATES,
  rankRecognition,
  suggestFinish,
  type EmbeddingMatch,
  type RecognitionCandidate,
  type RecognitionInput,
  type SignalName,
} from "./fuse";

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
  return { setCode, collectorNumber, lang: "en", rarity: null, total: null, foilMark: null, ...extra };
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

// ---- Per-signal evidence ----

/** Add the fields another change selects onto ScanCard (border_color, finishes). */
function withCues(c: ScanCard, cues: { border_color?: string | null; finishes?: string[] | null }): ScanCard {
  return { ...c, ...cues } as ScanCard;
}

function signal(candidate: RecognitionCandidate, name: SignalName) {
  return candidate.signals.filter((e) => e.signal === name);
}

function byId(result: { candidates: RecognitionCandidate[] }, id: string): RecognitionCandidate {
  const found = result.candidates.find((c) => c.card.id === id);
  if (!found) throw new Error(`no candidate ${id}`);
  return found;
}

describe("signals", () => {
  test("every candidate carries image evidence, plus one entry per cue that was read", () => {
    const result = rankRecognition({
      matches: [match(boltM11, 0.84), match(blast, 0.4)],
      printing: null,
      ocrName: "Lightning Bolt",
      collector: collector("m11", "149"),
    });

    const top = result.candidates[0]!;
    expect(top.signals.map((e) => e.signal)).toEqual(["image", "name", "collector"]);
    for (const e of top.signals) {
      expect(e.agreement).toBeGreaterThan(0);
      expect(e.quality).toBeGreaterThan(0);
      expect(e.detail).not.toBe("");
    }
    // Blast is in another set: the collector line counts against it.
    expect(signal(byId(result, "blast"), "collector")[0]!.agreement).toBeLessThan(0);
  });

  test("a very strong image match on its own is enough when no reprint is in the running", () => {
    const imageOnly = rankRecognition({
      matches: [match(shock, 0.9), match(blast, 0.4)],
      printing: null,
      ocrName: null,
      collector: null,
    });

    expect(imageOnly.candidates[0]!.card.id).toBe("shock");
    expect(imageOnly.confident).toBe(true);
  });

  test("a strong image match on its own isn't enough when a reprint shares the art", () => {
    const imageOnly = rankRecognition({
      matches: [match(boltM11, 0.9), match(bolt2xm, 0.7)],
      printing: null,
      ocrName: null,
      collector: null,
    });
    const withName = rankRecognition({
      matches: [match(shock, 0.7), match(blast, 0.4)],
      printing: null,
      ocrName: "Shock",
      collector: null,
    });
    const imageMiddling = rankRecognition({
      matches: [match(shock, 0.7), match(blast, 0.4)],
      printing: null,
      ocrName: null,
      collector: null,
    });

    expect(imageOnly.confident).toBe(false);
    expect(imageMiddling.confident).toBe(false);
    expect(withName.confident).toBe(true);
  });

  test("image plus a set code is two signals", () => {
    const result = rankRecognition({
      matches: [match(shock, 0.88), match(blast, 0.4)],
      printing: null,
      ocrName: null,
      collector: collector("m21", null),
    });

    expect(result.confident).toBe(true);
  });

  describe("missing cues change nothing", () => {
    const inputs: [string, RecognitionInput][] = [
      [
        "reprints with a collector read",
        {
          matches: [match(bolt2xm, 0.84), match(boltM11, 0.838), match(boltSta, 0.7), match(blast, 0.45)],
          printing: boltM11,
          ocrName: "Lightning Bolt",
          collector: collector("m11", "149"),
        },
      ],
      [
        "image only",
        { matches: [match(shock, 0.7), match(blast, 0.5)], printing: null, ocrName: null, collector: null },
      ],
      [
        "DFC back face",
        {
          matches: [match(delver, 0.8, 1), match(shock, 0.5)],
          printing: null,
          ocrName: "Insectile Aberration",
          collector: null,
        },
      ],
    ];

    test.each(inputs)("%s: absent and null cues give the same result", (_, input) => {
      const absent = rankRecognition(input);
      const nulls = rankRecognition({ ...input, ocrNameConfidence: null, rarityColour: null, border: null });
      expect(nulls).toEqual(absent);
    });

    test("scores are today's formula when no new cue is read", () => {
      const result = rankRecognition(inputs[0]![1]);
      // similarity + name + exact printing + language, as before.
      expect(byId(result, "bolt-m11").score).toBeCloseTo(0.838 + 0.15 + 0.25 + 0.02, 3);
      expect(byId(result, "bolt-2xm").score).toBeCloseTo(0.84 + 0.15 + 0.02, 3);
      expect(byId(result, "blast").score).toBeCloseTo(0.45 + 0.15 * ((0.8 - 0.6) / 0.4) + 0.02, 3);
    });

    test("a cue the card has no field for is no evidence, not a penalty", () => {
      const noRarity = card("shock-nr", "Shock", "m21", "159", { rarity: null });
      const input: RecognitionInput = {
        matches: [match(noRarity, 0.88), match(blast, 0.4)],
        printing: null,
        ocrName: "Shock",
        collector: collector(null, null, { foilMark: "foil" }),
      };
      const plain = rankRecognition(input);
      const withCuesRead = rankRecognition({
        ...input,
        rarityColour: { value: "mythic", quality: 1 },
        border: { value: "white", quality: 1 },
      });

      const top = withCuesRead.candidates[0]!;
      expect(top.card.id).toBe("shock-nr");
      expect(top.score).toBe(plain.candidates[0]!.score);
      // No rarity, no border_color, no finishes on the card: no evidence.
      expect(top.signals.map((e) => e.signal)).toEqual(["image", "name"]);
      expect(withCuesRead.confident).toBe(true);
    });
  });

  describe("rarity", () => {
    // Same art, same name: the image can't tell them apart.
    const boltCommon = card("bolt-common", "Lightning Bolt", "m11", "149", { rarity: "common" });
    const boltUncommon = card("bolt-uncommon", "Lightning Bolt", "2xm", "141", { rarity: "uncommon" });
    const boltMythic = card("bolt-mythic", "Lightning Bolt", "sld", "1", { rarity: "mythic" });

    test("the set symbol's colour separates a reprint pair with identical art", () => {
      const matches = [match(boltUncommon, 0.841), match(boltCommon, 0.839), match(blast, 0.4)];
      const without = rankRecognition({ matches, printing: null, ocrName: "Lightning Bolt", collector: null });
      const withColour = rankRecognition({
        matches,
        printing: null,
        ocrName: "Lightning Bolt",
        collector: null,
        rarityColour: { value: "common", quality: 0.9 },
      });

      expect(without.candidates[0]!.card.id).toBe("bolt-uncommon");
      expect(withColour.candidates[0]!.card.id).toBe("bolt-common");
      expect(withColour.candidates[0]!.reasons).toContain("rarity matches");
    });

    test("a clean mythic read doesn't let a common win on a hair of similarity", () => {
      const result = rankRecognition({
        matches: [match(boltCommon, 0.82), match(boltMythic, 0.8)],
        printing: null,
        ocrName: null,
        collector: null,
        rarityColour: { value: "mythic", quality: 0.9 },
      });

      expect(result.candidates[0]!.card.id).toBe("bolt-mythic");
      expect(byId(result, "bolt-common").reasons).toContain("rarity doesn't match");
    });

    test("a blurry colour read barely moves anything and costs nothing", () => {
      const result = rankRecognition({
        matches: [match(boltCommon, 0.84), match(boltMythic, 0.8)],
        printing: null,
        ocrName: null,
        collector: null,
        rarityColour: { value: "mythic", quality: 0.2 },
      });

      expect(result.candidates[0]!.card.id).toBe("bolt-common");
      expect(byId(result, "bolt-common").score).toBe(0.84);
    });

    test("the rarity letter on the collector line counts too", () => {
      const result = rankRecognition({
        matches: [match(boltUncommon, 0.841), match(boltCommon, 0.839)],
        printing: null,
        ocrName: null,
        collector: collector(null, "149", { rarity: "C" }),
      });

      expect(result.candidates[0]!.card.id).toBe("bolt-common");
      expect(signal(result.candidates[0]!, "rarity")[0]!.detail).toMatch(/letter C/);
    });

    test("token, land and mismatched special letters are no evidence", () => {
      for (const rarity of ["T", "L", "S"] as const) {
        const result = rankRecognition({
          matches: [match(boltCommon, 0.84)],
          printing: null,
          ocrName: null,
          collector: collector(null, "149", { rarity }),
        });
        expect(signal(result.candidates[0]!, "rarity")).toEqual([]);
      }
      const special = card("tsb", "Lightning Bolt", "tsb", "1", { rarity: "special" });
      const result = rankRecognition({
        matches: [match(special, 0.84)],
        printing: null,
        ocrName: null,
        collector: collector(null, "1", { rarity: "S" }),
      });
      expect(signal(result.candidates[0]!, "rarity")[0]!.agreement).toBe(1);
    });

    test("a colour one step off is a mild miss, not a veto", () => {
      const rare = card("rare", "Shock", "m21", "159", { rarity: "rare" });
      const result = rankRecognition({
        matches: [match(rare, 0.9), match(blast, 0.4)],
        printing: null,
        ocrName: "Shock",
        collector: null,
        rarityColour: { value: "mythic", quality: 0.9 },
      });

      const rarity = signal(result.candidates[0]!, "rarity")[0]!;
      expect(rarity.agreement).toBeLessThan(0);
      expect(rarity.agreement).toBeGreaterThan(-0.5);
      expect(result.confident).toBe(true);
    });
  });

  describe("contradictions", () => {
    const shockBlack = withCues(card("shock-b", "Shock", "m21", "159", { rarity: "common" }), {
      border_color: "black",
    });
    const base: RecognitionInput = {
      matches: [match(shockBlack, 0.88), match(blast, 0.41)],
      printing: null,
      ocrName: "Shock",
      collector: null,
    };

    test("the baseline is confident", () => {
      expect(rankRecognition(base).confident).toBe(true);
    });

    test.each<[string, Partial<RecognitionInput>]>([
      ["a clean white border on a black-bordered card", { border: { value: "white", quality: 0.9 } }],
      ["a clean mythic symbol on a common", { rarityColour: { value: "mythic", quality: 0.9 } }],
      ["a clean rarity letter that's another rarity", { collector: collector(null, "159", { rarity: "M" }) }],
      ["a set code a candidate is really in", { collector: collector("m10", null) }],
    ])("%s blocks confidence but keeps the ranking", (_, extra) => {
      const result = rankRecognition({ ...base, ...extra });
      expect(result.candidates[0]!.card.id).toBe("shock-b");
      expect(result.confident).toBe(false);
    });

    test.each<[string, Partial<RecognitionInput>]>([
      ["a blurry border read", { border: { value: "white", quality: 0.3 } }],
      ["a blurry symbol read", { rarityColour: { value: "mythic", quality: 0.4 } }],
      ["a set code nothing confirms (likely misread)", { collector: collector("qqq", null) }],
    ])("%s doesn't", (_, extra) => {
      expect(rankRecognition({ ...base, ...extra }).confident).toBe(true);
    });

    test("an OCR'd name that's clearly another candidate's contradicts the image pick", () => {
      const result = rankRecognition({
        matches: [match(shock, 0.9), match(blast, 0.5)],
        printing: null,
        ocrName: "Lightning Blast",
        collector: collector("m21", null),
      });

      expect(result.candidates[0]!.card.id).toBe("shock");
      expect(signal(result.candidates[0]!, "name")[0]!.agreement).toBeLessThan(0);
      expect(result.confident).toBe(false);
    });

    test("a contradiction also vetoes the exact-printing path", () => {
      const result = rankRecognition({
        matches: [match(blast, 0.46), match(boltSta, 0.44)],
        printing: boltM11,
        ocrName: "Lightning Bolt",
        collector: collector("m11", "149"),
        rarityColour: { value: "common", quality: 0.95 },
      });

      expect(result.candidates[0]!.card.id).toBe("bolt-m11");
      expect(result.confident).toBe(false);
    });
  });

  describe("OCR name confidence", () => {
    const matches = [match(shock, 0.75), match(blast, 0.41)];

    test("a confident read is the same as no confidence given", () => {
      const absent = rankRecognition({ matches, printing: null, ocrName: "Shock", collector: null });
      const sure = rankRecognition({ matches, printing: null, ocrName: "Shock", collector: null, ocrNameConfidence: 0.95 });
      expect(sure.candidates.map((c) => c.score)).toEqual(absent.candidates.map((c) => c.score));
      expect(sure.confident).toBe(true);
    });

    test("an unsure read counts for less and doesn't make it confident", () => {
      const absent = rankRecognition({ matches, printing: null, ocrName: "Shock", collector: null });
      const unsure = rankRecognition({ matches, printing: null, ocrName: "Shock", collector: null, ocrNameConfidence: 0.3 });

      expect(unsure.candidates[0]!.card.id).toBe("shock");
      expect(unsure.candidates[0]!.score).toBeLessThan(absent.candidates[0]!.score);
      expect(signal(unsure.candidates[0]!, "name")[0]!.quality).toBe(0.3);
      expect(unsure.confident).toBe(false);
    });
  });

  describe("printing lookup on double-faced cards", () => {
    test("a back-face name finds the printing and records the back face", () => {
      const result = rankRecognition({
        matches: [match(shock, 0.45), match(blast, 0.42)],
        printing: delver,
        ocrName: "Insectile Aberration",
        collector: collector("isd", "51"),
      });

      const top = result.candidates[0]!;
      expect(top.card.id).toBe("delver-isd");
      expect(top.face).toBe(1);
      expect(top.reasons).toContain("back face");
    });

    test("every face is checked, not just the first two", () => {
      const triple = card("triple", "One // Two // Three Thing", "abc", "7", {
        layout: "split",
        card_faces: [{ name: "One" }, { name: "Two" }, { name: "Three Thing" }],
      });
      const result = rankRecognition({
        matches: [match(shock, 0.45)],
        printing: triple,
        ocrName: "Three Thing",
        collector: collector("abc", "7"),
      });

      expect(result.candidates[0]!.card.id).toBe("triple");
      expect(result.candidates[0]!.face).toBe(2);
    });

    test("found through the image alone, it takes the image's face", () => {
      const delverDka = card("delver-dka", delver.name, "dka", "9", {
        layout: "transform",
        card_faces: delver.card_faces,
      });
      const result = rankRecognition({
        matches: [match(delver, 0.8, 1), match(shock, 0.4)],
        printing: delverDka,
        ocrName: null,
        collector: collector("dka", "9"),
      });

      expect(result.candidates[0]!.card.id).toBe("delver-dka");
      expect(result.candidates[0]!.face).toBe(1);
    });
  });

  describe("border", () => {
    test("a border read breaks a tie between same-art printings", () => {
      const black = withCues(card("bolt-black", "Lightning Bolt", "m11", "149"), { border_color: "black" });
      const white = withCues(card("bolt-white", "Lightning Bolt", "4ed", "208"), { border_color: "white" });
      const result = rankRecognition({
        matches: [match(black, 0.841), match(white, 0.84)],
        printing: null,
        ocrName: null,
        collector: null,
        border: { value: "white", quality: 0.8 },
      });

      expect(result.candidates[0]!.card.id).toBe("bolt-white");
    });
  });

  describe("foil mark", () => {
    const regular = withCues(card("regular", "Shock", "m21", "159"), { finishes: ["nonfoil", "foil"] });
    const foilOnly = withCues(card("promo", "Shock", "pm21", "159p"), { finishes: ["foil"] });

    test("a dot counts against a foil-only printing", () => {
      const result = rankRecognition({
        matches: [match(foilOnly, 0.841), match(regular, 0.84)],
        printing: null,
        ocrName: null,
        collector: collector(null, "159", { foilMark: "nonfoil" }),
      });

      expect(result.candidates[0]!.card.id).toBe("regular");
      expect(signal(byId(result, "promo"), "foil")[0]!.agreement).toBe(-1);
    });

    test("each candidate gets a suggested finish", () => {
      const result = rankRecognition({
        matches: [match(regular, 0.84), match(foilOnly, 0.8)],
        printing: null,
        ocrName: null,
        collector: collector(null, "159", { foilMark: "foil" }),
      });

      expect(byId(result, "regular").suggestedFinish).toMatchObject({ finish: "foil" });
      expect(byId(result, "promo").suggestedFinish).toMatchObject({ finish: "foil", confidence: 1 });
    });
  });
});

describe("suggestFinish", () => {
  const both = withCues(shock, { finishes: ["nonfoil", "foil"] });

  test("a printing with one finish is that finish, whatever the mark says", () => {
    const etchedOnly = withCues(shock, { finishes: ["etched"] });
    expect(suggestFinish(etchedOnly, collector("m21", "1", { foilMark: "nonfoil" }))).toMatchObject({
      finish: "etched",
      confidence: 1,
    });
  });

  test("otherwise the foil mark, when the printing comes in it", () => {
    const foil = suggestFinish(both, collector("m21", "1", { foilMark: "foil" }));
    const nonfoil = suggestFinish(both, collector("m21", "1", { foilMark: "nonfoil" }));
    expect(foil.finish).toBe("foil");
    expect(nonfoil.finish).toBe("nonfoil");
    expect(foil.confidence).toBeGreaterThan(FINISH_DEFAULT_CONFIDENCE);
  });

  test("a star on a printing with etched but no plain foil is etched", () => {
    const etched = withCues(shock, { finishes: ["nonfoil", "etched"] });
    expect(suggestFinish(etched, collector("m21", "1", { foilMark: "foil" })).finish).toBe("etched");
  });

  test("no mark, or a mark the printing doesn't come in: non-foil, low confidence", () => {
    for (const info of [null, collector("m21", "1")]) {
      expect(suggestFinish(both, info)).toEqual(
        expect.objectContaining({ finish: "nonfoil", confidence: FINISH_DEFAULT_CONFIDENCE }),
      );
    }
    // A dot on a printing that only came in foil and etched: the mark is wrong.
    const foilOrEtched = withCues(shock, { finishes: ["foil", "etched"] });
    expect(suggestFinish(foilOrEtched, collector("m21", "1", { foilMark: "nonfoil" }))).toEqual(
      expect.objectContaining({ finish: "foil", confidence: FINISH_DEFAULT_CONFIDENCE }),
    );
  });

  test("finishes unknown: trust the mark a little, else guess non-foil", () => {
    const foil = suggestFinish(shock, collector("m21", "1", { foilMark: "foil" }));
    expect(foil.finish).toBe("foil");
    expect(foil.confidence).toBeLessThan(1);
    expect(foil.confidence).toBeGreaterThan(FINISH_DEFAULT_CONFIDENCE);
    expect(suggestFinish(shock, null)).toMatchObject({ finish: "nonfoil", confidence: FINISH_DEFAULT_CONFIDENCE });
  });

  test("a printing without non-foil never suggests non-foil", () => {
    const foilOrEtched = withCues(shock, { finishes: ["foil", "etched"] });
    expect(suggestFinish(foilOrEtched, null).finish).toBe("foil");
  });
});
