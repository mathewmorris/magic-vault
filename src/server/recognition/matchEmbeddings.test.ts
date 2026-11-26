/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { type PGlite } from "@electric-sql/pglite";

import { createMigratedDatabase, pgliteExecutor, pgliteTransaction } from "../../test/pglite";
import { toVectorLiteral } from "../../utils/recognition/vector";
import {
  buildNearestSql,
  findNearestCards,
  findPrinting,
  normalizeCollectorNumber,
  type SqlExecutor,
  type SqlTransaction,
} from "./matchEmbeddings";

const DIMS = 256;
const MODEL = "test-model";

/** A unit vector pointing mostly along axis `axis`, nudged along `nudge`. */
function unit(axis: number, nudge?: number, amount = 0.3): number[] {
  const v = new Array<number>(DIMS).fill(0);
  v[axis] = 1;
  if (nudge !== undefined) v[nudge] = amount;
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

let db: PGlite;
let exec: SqlExecutor;

async function addCard(
  id: string,
  fields: { set?: string; collector_number?: string; lang?: string } = {},
) {
  await db.query(
    `INSERT INTO "Card" (id, name, scryfall_uri, image_status, layout, "set", collector_number, lang)
     VALUES ($1, $1, 'https://scryfall.test', 'highres_scan', 'normal', $2, $3, $4)`,
    [id, fields.set ?? null, fields.collector_number ?? null, fields.lang ?? null],
  );
}

async function addEmbedding(cardId: string, face: number, vector: number[], modelId = MODEL) {
  await db.query(
    `INSERT INTO "CardEmbedding" ("cardId", face, "modelId", embedding) VALUES ($1, $2, $3, $4::halfvec)`,
    [cardId, face, modelId, toVectorLiteral(vector)],
  );
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  exec = pgliteExecutor(db);

  await addCard("a", { set: "m21", collector_number: "157", lang: "en" });
  await addCard("b", { set: "m21", collector_number: "0158", lang: "en" });
  await addCard("c", { set: "znr", collector_number: "12a", lang: "en" });
  await addCard("d-ja", { set: "war", collector_number: "1", lang: "ja" });
  await addCard("d-en", { set: "war", collector_number: "1", lang: "en" });

  await addEmbedding("a", 0, unit(0));
  // A double-faced card: both faces sit near axis 1, face 1 closest.
  await addEmbedding("b", 0, unit(1, 2, 0.6));
  await addEmbedding("b", 1, unit(1, 2, 0.1));
  await addEmbedding("c", 0, unit(1, 3, 0.8));
  // Same card under another model id: must never be returned for MODEL.
  await addEmbedding("a", 0, unit(1), "old-model");
}, 30_000);

afterAll(async () => {
  await db.close();
});

describe("findNearestCards", () => {
  it("returns cards best first with the best face of each and cosine similarity", async () => {
    const rows = await findNearestCards(exec, { embedding: unit(1), modelId: MODEL, limit: 10 });

    expect(rows.map((r) => [r.cardId, r.face])).toEqual([
      ["b", 1],
      ["c", 0],
      ["a", 0],
    ]);
    // halfvec stores float16, so allow a little rounding.
    expect(rows[0]!.similarity).toBeCloseTo(1 / Math.hypot(1, 0.1), 2);
    expect(rows[2]!.similarity).toBeCloseTo(0, 2);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.similarity).toBeGreaterThanOrEqual(rows[i]!.similarity);
    }
  });

  it("respects the limit after deduping faces", async () => {
    const rows = await findNearestCards(exec, { embedding: unit(1), modelId: MODEL, limit: 2 });
    expect(rows.map((r) => r.cardId)).toEqual(["b", "c"]);
  });

  it("only searches the requested model", async () => {
    const rows = await findNearestCards(exec, { embedding: unit(1), modelId: "old-model", limit: 5 });
    expect(rows).toEqual([{ cardId: "a", face: 0, similarity: expect.any(Number) }]);
    await expect(
      findNearestCards(exec, { embedding: unit(1), modelId: "nope", limit: 5 }),
    ).resolves.toEqual([]);
  });

  it("raises hnsw.ef_search inside a transaction for searches past 40 candidates", async () => {
    const statements: string[] = [];
    const transaction = pgliteTransaction(db);
    const rows = await findNearestCards(
      exec,
      { embedding: unit(0), modelId: MODEL, limit: 50 },
      {
        transaction: (fn) =>
          transaction((tx) =>
            fn(async (sql, params) => {
              statements.push(sql);
              return tx(sql, params);
            }),
          ),
      },
    );
    expect(rows[0]).toMatchObject({ cardId: "a", face: 0 });
    expect(statements[0]).toBe("SET LOCAL hnsw.ef_search = 100");
    // SET LOCAL ended with the transaction.
    const [setting] = await exec<{ ef: string }>("SELECT current_setting('hnsw.ef_search') AS ef", []);
    expect(setting!.ef).toBe("40");
  });

  it("skips the transaction when the default ef_search is enough", async () => {
    const transaction = jest.fn();
    const rows = await findNearestCards(
      exec,
      { embedding: unit(0), modelId: MODEL, limit: 20 },
      { transaction: transaction as unknown as SqlTransaction },
    );
    expect(rows[0]).toMatchObject({ cardId: "a" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("has the query shape the HNSW index can serve", async () => {
    // A handful of rows is always cheapest to scan and sort in full, so those
    // plans are discouraged (inside a rolled-back transaction) to see whether
    // HNSW can serve the query at all. At real
    // sizes (checked by hand at 10k and 20k rows, one or two models) the
    // planner picks HNSW on its own.
    const rollback = new Error("rollback");
    let plan = "";
    await expect(
      db.transaction(async (tx) => {
        for (const plan of ["seqscan", "bitmapscan", "sort"]) {
          await tx.query(`SET LOCAL enable_${plan} = off`);
        }
        const result = await tx.query<{ "QUERY PLAN": string }>(`EXPLAIN ${buildNearestSql(20)}`, [
          toVectorLiteral(unit(0)),
          MODEL,
        ]);
        plan = result.rows.map((r) => r["QUERY PLAN"]).join("\n");
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(plan).toContain('Index Scan using "CardEmbedding_embedding_hnsw_idx"');
  });

  it("rejects embeddings of the wrong size or with non-finite values", async () => {
    await expect(
      findNearestCards(exec, { embedding: [1, 2, 3], modelId: MODEL, limit: 5 }),
    ).rejects.toThrow("expected 256");
    const bad = unit(0);
    bad[5] = Number.NaN;
    await expect(findNearestCards(exec, { embedding: bad, modelId: MODEL, limit: 5 })).rejects.toThrow(
      "non-finite",
    );
  });

  it("rejects limits outside 1..50", async () => {
    for (const limit of [0, 51, 2.5]) {
      await expect(
        findNearestCards(exec, { embedding: unit(0), modelId: MODEL, limit }),
      ).rejects.toThrow("limit");
    }
  });
});

describe("findPrinting", () => {
  it("matches set codes case-insensitively", async () => {
    await expect(findPrinting(exec, { set: "M21", collectorNumber: "157" })).resolves.toEqual({ id: "a" });
  });

  it("ignores leading zeros and whitespace on either side", async () => {
    await expect(findPrinting(exec, { set: "m21", collectorNumber: "0157" })).resolves.toEqual({ id: "a" });
    await expect(findPrinting(exec, { set: " m21 ", collectorNumber: " 158 " })).resolves.toEqual({
      id: "b",
    });
  });

  it("needs the rest of the collector number to match exactly", async () => {
    await expect(findPrinting(exec, { set: "znr", collectorNumber: "12" })).resolves.toBeNull();
    await expect(findPrinting(exec, { set: "znr", collectorNumber: "12A" })).resolves.toBeNull();
    await expect(findPrinting(exec, { set: "znr", collectorNumber: "012a" })).resolves.toEqual({ id: "c" });
  });

  it("prefers the English printing", async () => {
    await expect(findPrinting(exec, { set: "war", collectorNumber: "001" })).resolves.toEqual({ id: "d-en" });
  });

  it("returns null for unknown or empty input without a query", async () => {
    await expect(findPrinting(exec, { set: "xyz", collectorNumber: "1" })).resolves.toBeNull();
    const spy = jest.fn();
    const spyExec = spy as unknown as SqlExecutor;
    await expect(findPrinting(spyExec, { set: " ", collectorNumber: "1" })).resolves.toBeNull();
    await expect(findPrinting(spyExec, { set: "m21", collectorNumber: "  " })).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("normalizeCollectorNumber", () => {
  it.each([
    ["0157", "157"],
    ["157", "157"],
    [" 007 ", "7"],
    ["0", "0"],
    ["000", "0"],
    ["12a", "12a"],
    ["★1", "★1"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeCollectorNumber(input)).toBe(expected);
  });
});
