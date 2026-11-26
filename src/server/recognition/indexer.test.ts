/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { type PGlite } from "@electric-sql/pglite";

import { createMigratedDatabase, pgliteExecutor } from "../../test/pglite";
import {
  buildPendingCardsSql,
  buildPendingCountSql,
  buildUpsert,
  chunk,
  DEFAULT_RETRY_POLICY,
  downloadImage,
  ImageDownloadError,
  imageJobsForCard,
  isRetryableStatus,
  mapWithConcurrency,
  parseCalibrateArgs,
  parseIndexerArgs,
  PRUNE_OTHER_MODELS_SQL,
  retryDelayMs,
  SCRYFALL_IMAGE_HEADERS,
  type CardImageRow,
} from "./indexer";

const img = (name: string) => ({
  small: `https://cards.scryfall.io/small/${name}.jpg`,
  normal: `https://cards.scryfall.io/normal/${name}.jpg`,
});

describe("imageJobsForCard", () => {
  const base: CardImageRow = { id: "c1", image_status: "highres_scan", image_uris: null, card_faces: null };

  it("uses the top-level normal image as face 0", () => {
    expect(imageJobsForCard({ ...base, image_uris: img("front") })).toEqual([
      { cardId: "c1", face: 0, url: "https://cards.scryfall.io/normal/front.jpg" },
    ]);
  });

  it("prefers the top-level image even when faces have their own (adventure, split)", () => {
    const card = { ...base, image_uris: img("whole"), card_faces: [{ image_uris: img("a") }, {}] };
    expect(imageJobsForCard(card).map((j) => j.face)).toEqual([0]);
  });

  it("makes one job per face for double-faced cards", () => {
    const card = { ...base, card_faces: [{ image_uris: img("front") }, { image_uris: img("back") }] };
    expect(imageJobsForCard(card)).toEqual([
      { cardId: "c1", face: 0, url: "https://cards.scryfall.io/normal/front.jpg" },
      { cardId: "c1", face: 1, url: "https://cards.scryfall.io/normal/back.jpg" },
    ]);
  });

  it("skips faces that are already done or have no image", () => {
    const card = {
      ...base,
      card_faces: [{ image_uris: img("front") }, { name: "no image" }, { image_uris: img("third") }],
      done_faces: [0],
    };
    expect(imageJobsForCard(card).map((j) => j.face)).toEqual([2]);
  });

  it.each(["missing", "placeholder"])("skips cards whose image_status is %s", (status) => {
    expect(imageJobsForCard({ ...base, image_status: status, image_uris: img("x") })).toEqual([]);
  });

  it("ignores junk JSON and non-https links", () => {
    expect(imageJobsForCard({ ...base, image_uris: "nope", card_faces: { 0: 1 } })).toEqual([]);
    expect(imageJobsForCard({ ...base, image_uris: { normal: "http://insecure/x.jpg" } })).toEqual([]);
  });
});

describe("SQL against the real migrations", () => {
  let db: PGlite;
  const MODEL = "m1";
  const vec = (axis: number) => Array.from({ length: 256 }, (_, i) => (i === axis ? 1 : 0));

  async function addCard(id: string, fields: { status?: string; image_uris?: unknown; card_faces?: unknown }) {
    await db.query(
      `INSERT INTO "Card" (id, name, scryfall_uri, image_status, layout, image_uris, card_faces)
       VALUES ($1, $1, 'https://scryfall.test', $2, 'normal', $3::jsonb, $4::jsonb)`,
      [
        id,
        fields.status ?? "highres_scan",
        fields.image_uris === undefined ? null : JSON.stringify(fields.image_uris),
        fields.card_faces === undefined ? null : JSON.stringify(fields.card_faces),
      ],
    );
  }

  async function write(rows: { cardId: string; face: number; axis: number }[], modelId = MODEL) {
    const { sql, params } = buildUpsert(
      rows.map((r) => ({ cardId: r.cardId, face: r.face, embedding: vec(r.axis) })),
      modelId,
      256,
    );
    await db.query(sql, params);
  }

  beforeAll(async () => {
    db = await createMigratedDatabase();
    await addCard("a-single", { image_uris: img("a") });
    await addCard("b-dfc", { card_faces: [{ image_uris: img("b0") }, { image_uris: img("b1") }] });
    await addCard("c-missing", { status: "missing", image_uris: img("c") });
    await addCard("d-noimage", {});
    await addCard("e-done", { image_uris: img("e") });
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("finds pending cards oldest id first, with the faces already done", async () => {
    await write([{ cardId: "e-done", face: 0, axis: 1 }]);
    await write([{ cardId: "b-dfc", face: 0, axis: 2 }]);
    // Another model's rows don't count as done for MODEL.
    await write([{ cardId: "a-single", face: 0, axis: 3 }], "other-model");

    const rows = await pgliteExecutor(db)<CardImageRow>(buildPendingCardsSql(100), [MODEL]);

    expect(rows.map((r) => [r.id, r.done_faces])).toEqual([
      ["a-single", []],
      ["b-dfc", [0]],
    ]);
    expect(rows.flatMap(imageJobsForCard).map((j) => `${j.cardId}:${j.face}`)).toEqual([
      "a-single:0",
      "b-dfc:1",
    ]);
    const [count] = await pgliteExecutor(db)<{ cards: number }>(buildPendingCountSql(), [MODEL]);
    expect(count!.cards).toBe(2);

    const limited = await pgliteExecutor(db)<CardImageRow>(buildPendingCardsSql(1), [MODEL]);
    expect(limited.map((r) => r.id)).toEqual(["a-single"]);
  });

  it("upserts: a second write of the same face replaces the vector", async () => {
    await write([
      { cardId: "a-single", face: 0, axis: 4 },
      { cardId: "b-dfc", face: 1, axis: 5 },
    ]);
    await write([{ cardId: "a-single", face: 0, axis: 6 }]);

    const rows = await db.query<{ cardId: string; face: number; hot: number }>(
      `SELECT "cardId", face, (embedding::vector::real[])[7] AS hot
       FROM "CardEmbedding" WHERE "modelId" = $1 AND "cardId" = 'a-single'`,
      [MODEL],
    );
    expect(rows.rows).toEqual([{ cardId: "a-single", face: 0, hot: 1 }]);
    const pending = await pgliteExecutor(db)(buildPendingCardsSql(100), [MODEL]);
    expect(pending).toEqual([]);
  });

  it("prunes only other models", async () => {
    await db.query(PRUNE_OTHER_MODELS_SQL, [MODEL]);
    const models = await db.query<{ modelId: string }>(`SELECT DISTINCT "modelId" FROM "CardEmbedding"`);
    expect(models.rows).toEqual([{ modelId: MODEL }]);
  });

  it("drops a card's embeddings when the card is deleted", async () => {
    await db.query(`DELETE FROM "Card" WHERE id = 'a-single'`);
    const left = await db.query(`SELECT 1 FROM "CardEmbedding" WHERE "cardId" = 'a-single'`);
    expect(left.rows).toEqual([]);
  });
});

describe("buildUpsert", () => {
  it("numbers params with the model id first", () => {
    const { sql, params } = buildUpsert(
      [
        { cardId: "x", face: 0, embedding: [1, 0] },
        { cardId: "y", face: 1, embedding: [0, 1] },
      ],
      "m",
      2,
    );
    expect(params).toEqual(["m", "x", 0, "[1,0]", "y", 1, "[0,1]"]);
    expect(sql).toContain("($2, $3::integer, $1, $4::halfvec(2))");
    expect(sql).toContain("($5, $6::integer, $1, $7::halfvec(2))");
    expect(sql).toContain('ON CONFLICT ("cardId", "face", "modelId")');
  });

  it("rejects wrong sizes, bad faces and empty batches", () => {
    expect(() => buildUpsert([{ cardId: "x", face: 0, embedding: [1] }], "m", 2)).toThrow("expected 2");
    expect(() => buildUpsert([{ cardId: "x", face: -1, embedding: [1, 0] }], "m", 2)).toThrow("face");
    expect(() => buildUpsert([{ cardId: "x", face: 0, embedding: [NaN, 0] }], "m", 2)).toThrow("non-finite");
    expect(() => buildUpsert([], "m", 2)).toThrow();
  });
});

describe("chunk and mapWithConcurrency", () => {
  it("chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 200)).toEqual([]);
  });

  it("keeps order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, n));
      running--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 0, 60]);
    expect(peak).toBe(3);
  });
});

describe("retry policy", () => {
  it("retries only 429 and 5xx", () => {
    expect([429, 500, 502, 503, 599].map(isRetryableStatus)).toEqual([true, true, true, true, true]);
    expect([400, 403, 404, 410].map(isRetryableStatus)).toEqual([false, false, false, false]);
  });

  it("backs off exponentially up to the cap", () => {
    const policy = { maxAttempts: 9, baseDelayMs: 100, maxDelayMs: 1000 };
    expect([1, 2, 3, 4, 5].map((n) => retryDelayMs(n, null, policy))).toEqual([100, 200, 400, 800, 1000]);
  });

  it("honors Retry-After in seconds or as a date", () => {
    const now = Date.parse("2026-11-26T10:00:00Z");
    expect(retryDelayMs(1, "3", DEFAULT_RETRY_POLICY, now)).toBe(3000);
    expect(retryDelayMs(1, "Thu, 26 Nov 2026 10:00:05 GMT", DEFAULT_RETRY_POLICY, now)).toBe(5000);
    expect(retryDelayMs(1, "9999", DEFAULT_RETRY_POLICY, now)).toBe(DEFAULT_RETRY_POLICY.maxDelayMs);
  });
});

describe("downloadImage", () => {
  const ok = (bytes: number[]) => ({
    ok: true,
    status: 200,
    headers: { get: (_name: string): string | null => null },
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
  });
  const fail = (status: number, retryAfter: string | null = null) => ({
    ok: false,
    status,
    headers: { get: (name: string) => (name === "retry-after" ? retryAfter : null) },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
  const policy = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 };

  it("sends the Scryfall headers and returns the bytes", async () => {
    const fetch = jest.fn(() => Promise.resolve(ok([1, 2, 3])));
    await expect(downloadImage("https://x.test/a.jpg", { fetch, policy })).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fetch).toHaveBeenCalledWith("https://x.test/a.jpg", { headers: { ...SCRYFALL_IMAGE_HEADERS } });
  });

  it("retries 429 and 5xx and network errors, waiting between tries", async () => {
    const fetch = jest
      .fn<() => Promise<ReturnType<typeof ok>>>()
      .mockResolvedValueOnce(fail(429, "2"))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(ok([9]));
    const sleep = jest.fn((_ms: number) => Promise.resolve());
    await expect(downloadImage("https://x.test/a.jpg", { fetch, sleep, policy })).resolves.toEqual(
      new Uint8Array([9]),
    );
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 20]);
  });

  it("gives up after maxAttempts", async () => {
    const fetch = jest.fn(() => Promise.resolve(fail(503)));
    const sleep = jest.fn((_ms: number) => Promise.resolve());
    const err = await downloadImage("https://x.test/a.jpg", { fetch, sleep, policy }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImageDownloadError);
    expect((err as ImageDownloadError).status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 404", async () => {
    const fetch = jest.fn(() => Promise.resolve(fail(404)));
    await expect(downloadImage("https://x.test/a.jpg", { fetch, policy })).rejects.toThrow("HTTP 404");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("argument parsing", () => {
  it("has sensible defaults", () => {
    expect(parseIndexerArgs([])).toEqual({
      limit: 20000,
      modelCache: ".cache/models",
      modelPath: undefined,
      dryRun: false,
      pruneOldModels: false,
    });
    expect(parseCalibrateArgs([])).toEqual({
      sample: 300,
      modelCache: ".cache/models",
      modelPath: undefined,
      seed: 1,
    });
  });

  it("reads values with a space or =", () => {
    expect(
      parseIndexerArgs(["--limit", "50", "--model-path=/tmp/m.onnx", "--dry-run", "--prune-old-models"]),
    ).toEqual({
      limit: 50,
      modelCache: ".cache/models",
      modelPath: "/tmp/m.onnx",
      dryRun: true,
      pruneOldModels: true,
    });
    expect(parseCalibrateArgs(["--sample=25", "--seed", "7"])).toMatchObject({ sample: 25, seed: 7 });
  });

  it("rejects unknown options and bad numbers", () => {
    expect(() => parseIndexerArgs(["--limt", "5"])).toThrow("Unknown option");
    expect(() => parseIndexerArgs(["--limit", "0"])).toThrow("--limit");
    expect(() => parseIndexerArgs(["--limit", "abc"])).toThrow("--limit");
    expect(() => parseIndexerArgs(["--limit"])).toThrow("needs a value");
    expect(() => parseIndexerArgs(["--dry-run=yes"])).toThrow("takes no value");
  });
});
