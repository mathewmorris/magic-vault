/**
 * Nearest-neighbour search over CardEmbedding (pgvector), plus the exact
 * set + collector number lookup that OCR of a card's bottom line feeds.
 *
 * Everything goes through an injected executor so the same SQL runs on
 * Prisma (`prisma.$queryRawUnsafe`) in the app and on PGlite in tests.
 */

import { EMBED_MODEL } from "../../utils/recognition/model";
import { toVectorLiteral } from "../../utils/recognition/vector";

/** Runs one SQL statement with $1, $2, ... parameters and returns its rows. */
export type SqlExecutor = <Row = Record<string, unknown>>(
  sql: string,
  params: unknown[],
) => Promise<Row[]>;

/**
 * Optional: runs `fn` inside a transaction, handing it an executor bound to
 * that transaction. HNSW returns at most hnsw.ef_search rows (default 40),
 * so when a search wants more candidates than that it raises ef_search with
 * SET LOCAL inside one. Smaller searches skip the transaction (one round
 * trip instead of four). Without it, big searches just get fewer candidates.
 */
export type SqlTransaction = <T>(fn: (exec: SqlExecutor) => Promise<T>) => Promise<T>;

export type NearestCard = { cardId: string; face: number; similarity: number };

export const MAX_MATCH_LIMIT = 50;

/** HNSW returns at most ef_search rows, so candidates can't exceed it. */
const DEFAULT_EF_SEARCH = 40;

function assertEmbedding(embedding: readonly number[], dims: number): string {
  if (embedding.length !== dims) {
    throw new Error(`Embedding has ${embedding.length} values, expected ${dims}`);
  }
  return toVectorLiteral(embedding);
}

function assertLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MATCH_LIMIT) {
    throw new Error(`limit must be a whole number from 1 to ${MAX_MATCH_LIMIT}`);
  }
  return limit;
}

/**
 * How many raw neighbours to pull for `limit` cards. Double-faced cards can
 * put two rows (one per face) in the neighbourhood, so fetch extra and keep
 * the best face of each card.
 */
export function candidateCount(limit: number): number {
  return Math.min(assertLimit(limit) * 2, MAX_MATCH_LIMIT * 2);
}

/**
 * The search SQL. $1 is the query vector, $2 the model id. The inner query
 * is the plain `ORDER BY embedding <=> $1 LIMIT n` shape the HNSW index
 * serves; deduping and re-sorting happen on its small result.
 */
export function buildNearestSql(limit: number, dims: number = EMBED_MODEL.dims): string {
  const candidates = candidateCount(limit);
  const vector = `$1::halfvec(${dims})`;
  return `
WITH candidates AS (
  SELECT "cardId", "face", "embedding" <=> ${vector} AS distance
  FROM "CardEmbedding"
  WHERE "modelId" = $2
  ORDER BY "embedding" <=> ${vector}
  LIMIT ${candidates}
),
best_face AS (
  SELECT DISTINCT ON ("cardId") "cardId", "face", distance
  FROM candidates
  ORDER BY "cardId", distance, "face"
)
SELECT "cardId", "face", (1 - distance)::float8 AS similarity
FROM best_face
ORDER BY distance, "cardId"
LIMIT ${limit}`.trim();
}

type NearestRow = { cardId: string; face: number | bigint; similarity: number | string };

export async function findNearestCards(
  exec: SqlExecutor,
  input: { embedding: readonly number[]; modelId: string; limit: number; dims?: number },
  options: { transaction?: SqlTransaction } = {},
): Promise<NearestCard[]> {
  const dims = input.dims ?? EMBED_MODEL.dims;
  const literal = assertEmbedding(input.embedding, dims);
  const sql = buildNearestSql(input.limit, dims);
  const params = [literal, input.modelId];
  const efSearch = Math.max(DEFAULT_EF_SEARCH, candidateCount(input.limit));

  const rows =
    options.transaction && efSearch > DEFAULT_EF_SEARCH
      ? await options.transaction(async (tx) => {
          // efSearch is a whole number we computed, never user text.
          await tx(`SET LOCAL hnsw.ef_search = ${efSearch}`, []);
          return tx<NearestRow>(sql, params);
        })
      : await exec<NearestRow>(sql, params);

  return rows.map((row) => ({
    cardId: row.cardId,
    face: Number(row.face),
    similarity: Number(row.similarity),
  }));
}

/** "0157" -> "157", " 12a " -> "12a", "0" stays "0". */
export function normalizeCollectorNumber(value: string): string {
  return value.trim().replace(/^0+(?=.)/, "");
}

/**
 * Exact printing lookup. Set codes match case-insensitively (Scryfall stores
 * them lowercase, so the input is lowercased and the (set, collector_number)
 * index still applies); collector numbers match after trimming and dropping
 * leading zeros on both sides. If several rows share a set and number (other
 * languages), English wins, then the lowest id.
 */
export function buildPrintingSql(): string {
  return `
SELECT "id"
FROM "Card"
WHERE "set" = $1
  AND regexp_replace(btrim("collector_number"), '^0+(?=.)', '') = $2
ORDER BY ("lang" = 'en') DESC NULLS LAST, "id"
LIMIT 1`.trim();
}

export async function findPrinting(
  exec: SqlExecutor,
  input: { set: string; collectorNumber: string },
): Promise<{ id: string } | null> {
  const set = input.set.trim().toLowerCase();
  const collectorNumber = normalizeCollectorNumber(input.collectorNumber);
  if (!set || !collectorNumber) return null;
  const rows = await exec<{ id: string }>(buildPrintingSql(), [set, collectorNumber]);
  return rows[0] ? { id: rows[0].id } : null;
}
