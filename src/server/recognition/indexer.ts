/**
 * The testable parts of the card image indexer (scripts/embed-cards.ts):
 * which images a card needs embedded, the SQL it runs, batching, the
 * download retry policy and argument parsing. No Prisma, ONNX or network
 * here; the script wires those in.
 */

import { toVectorLiteral } from "../../utils/recognition/vector";

/** Scryfall image_status values with no real card image behind them. */
export const SKIP_IMAGE_STATUSES = ["missing", "placeholder"] as const;

export const SCRYFALL_IMAGE_HEADERS = {
  "User-Agent": "MagicVault/1.0 (+https://github.com/mathewmorris/magic-vault)",
  Accept: "image/jpeg,image/*;q=0.9,*/*;q=0.8",
} as const;

export const UPSERT_BATCH_SIZE = 200;
export const DOWNLOAD_CONCURRENCY = 6;
export const DEFAULT_CARD_LIMIT = 20000;

/** A Card row as the pending-cards query returns it. */
export type CardImageRow = {
  id: string;
  image_status: string;
  image_uris: unknown;
  card_faces: unknown;
  /** Faces that already have an embedding for this model. */
  done_faces?: number[] | null;
};

export type ImageJob = { cardId: string; face: number; url: string };

function normalUrl(imageUris: unknown): string | null {
  if (!imageUris || typeof imageUris !== "object") return null;
  const url = (imageUris as Record<string, unknown>).normal;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

/**
 * The images to embed for one card: its top-level "normal" image as face 0,
 * or, for cards whose faces each have their own image (transform, modal_dfc,
 * ...), one job per face that has one. Faces already in `done_faces` are
 * left out.
 */
export function imageJobsForCard(card: CardImageRow): ImageJob[] {
  if ((SKIP_IMAGE_STATUSES as readonly string[]).includes(card.image_status)) return [];
  const done = new Set((card.done_faces ?? []).map(Number));

  const top = normalUrl(card.image_uris);
  const jobs: ImageJob[] = [];
  if (top) {
    jobs.push({ cardId: card.id, face: 0, url: top });
  } else if (Array.isArray(card.card_faces)) {
    card.card_faces.forEach((face: unknown, index) => {
      const url = face && typeof face === "object" ? normalUrl((face as { image_uris?: unknown }).image_uris) : null;
      if (url) jobs.push({ cardId: card.id, face: index, url });
    });
  }
  return jobs.filter((job) => !done.has(job.face));
}

function assertPositiveInt(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive whole number`);
  return value;
}

/**
 * Cards with at least one image that has no embedding for model $1. "How
 * many faces should it have" mirrors imageJobsForCard, so a double-faced
 * card with one face missing is picked up again.
 */
function pendingCardsWhere(): string {
  const skip = SKIP_IMAGE_STATUSES.map((s) => `'${s}'`).join(", ");
  return `
FROM "Card" c
WHERE c."image_status" NOT IN (${skip})
  AND (
    SELECT count(*) FROM "CardEmbedding" e WHERE e."cardId" = c."id" AND e."modelId" = $1
  ) < (
    CASE
      WHEN c."image_uris"->>'normal' IS NOT NULL THEN 1
      WHEN jsonb_typeof(c."card_faces") = 'array' THEN (
        SELECT count(*) FROM jsonb_array_elements(c."card_faces") f
        WHERE f->'image_uris'->>'normal' IS NOT NULL
      )
      ELSE 0
    END
  )`;
}

/** Pending cards (see pendingCardsWhere), oldest id first, with the faces already done. */
export function buildPendingCardsSql(limit: number): string {
  return `
SELECT c."id", c."image_status", c."image_uris", c."card_faces",
  COALESCE(
    (SELECT array_agg(e."face" ORDER BY e."face") FROM "CardEmbedding" e
     WHERE e."cardId" = c."id" AND e."modelId" = $1),
    '{}'
  ) AS done_faces${pendingCardsWhere()}
ORDER BY c."id"
LIMIT ${assertPositiveInt(limit, "limit")}`.trim();
}

/** How many cards still need an embedding for model $1, ignoring --limit. */
export function buildPendingCountSql(): string {
  return `SELECT count(*)::int AS cards${pendingCardsWhere()}`;
}

export type EmbeddingRow = { cardId: string; face: number; embedding: readonly number[] };

/**
 * One multi-row upsert. $1 is the model id; each row adds cardId, face and
 * the vector as halfvec text.
 */
export function buildUpsert(
  rows: readonly EmbeddingRow[],
  modelId: string,
  dims: number,
): { sql: string; params: unknown[] } {
  if (rows.length === 0) throw new Error("Nothing to write");
  const params: unknown[] = [modelId];
  const values = rows.map((row) => {
    if (row.embedding.length !== dims) {
      throw new Error(`Embedding for ${row.cardId} has ${row.embedding.length} values, expected ${dims}`);
    }
    if (!Number.isInteger(row.face) || row.face < 0) throw new Error(`Bad face index for ${row.cardId}`);
    params.push(row.cardId, row.face, toVectorLiteral(row.embedding));
    const n = params.length;
    return `($${n - 2}, $${n - 1}::integer, $1, $${n}::halfvec(${dims}))`;
  });
  const sql = `
INSERT INTO "CardEmbedding" ("cardId", "face", "modelId", "embedding")
VALUES ${values.join(",\n       ")}
ON CONFLICT ("cardId", "face", "modelId")
DO UPDATE SET "embedding" = EXCLUDED."embedding", "createdAt" = CURRENT_TIMESTAMP`.trim();
  return { sql, params };
}

/** Deletes embeddings made by any model other than $1. */
export const PRUNE_OTHER_MODELS_SQL = `DELETE FROM "CardEmbedding" WHERE "modelId" <> $1`;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  assertPositiveInt(size, "size");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `fn` over `items` with at most `concurrency` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  assertPositiveInt(concurrency, "concurrency");
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export type RetryPolicy = { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 60_000 };

/** 429 and 5xx are worth another try; other errors (404, 403, ...) aren't. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Delay before retry number `attempt` (1 = first retry): Retry-After when the
 * server sent one (seconds or an HTTP date), otherwise exponential backoff.
 * Capped at maxDelayMs either way.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter: string | null | undefined,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  now: number = Date.now(),
): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, policy.maxDelayMs);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(date - now, 0), policy.maxDelayMs);
  }
  return Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
}

export class ImageDownloadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ImageDownloadError";
  }
}

type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/**
 * Downloads one image, retrying 429/5xx and network errors with backoff.
 * Throws ImageDownloadError when it gives up or gets a status not worth
 * retrying.
 */
export async function downloadImage(
  url: string,
  deps: {
    fetch: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    policy?: RetryPolicy;
    headers?: Record<string, string>;
  },
): Promise<Uint8Array> {
  const policy = deps.policy ?? DEFAULT_RETRY_POLICY;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const headers = deps.headers ?? { ...SCRYFALL_IMAGE_HEADERS };

  for (let attempt = 1; ; attempt++) {
    let retryAfter: string | null = null;
    let reason: string;
    let status: number | undefined;
    try {
      const response = await deps.fetch(url, { headers });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      status = response.status;
      reason = `HTTP ${response.status}`;
      if (!isRetryableStatus(response.status)) throw new ImageDownloadError(`${reason} for ${url}`, status);
      retryAfter = response.headers.get("retry-after");
    } catch (err) {
      if (err instanceof ImageDownloadError) throw err;
      reason = err instanceof Error ? err.message : String(err);
    }
    if (attempt >= policy.maxAttempts) {
      throw new ImageDownloadError(`${reason} for ${url} after ${attempt} attempts`, status);
    }
    await sleep(retryDelayMs(attempt, retryAfter, policy));
  }
}

export type IndexerArgs = {
  limit: number;
  modelCache: string;
  modelPath?: string;
  dryRun: boolean;
  pruneOldModels: boolean;
};

export type CalibrateArgs = { sample: number; modelCache: string; modelPath?: string; seed: number };

function readFlags(argv: readonly string[], valued: readonly string[], booleans: readonly string[]) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [name, inline] = arg.split(/=(.*)/s, 2) as [string, string | undefined];
    if (booleans.includes(name)) {
      if (inline !== undefined) throw new Error(`${name} takes no value`);
      flags.add(name);
    } else if (valued.includes(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`${name} needs a value`);
      values.set(name, value);
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }
  return { values, flags };
}

function positiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return assertPositiveInt(n, name);
}

export function parseIndexerArgs(argv: readonly string[]): IndexerArgs {
  const { values, flags } = readFlags(
    argv,
    ["--limit", "--model-cache", "--model-path"],
    ["--dry-run", "--prune-old-models"],
  );
  return {
    limit: positiveInt(values.get("--limit"), "--limit", DEFAULT_CARD_LIMIT),
    modelCache: values.get("--model-cache") ?? ".cache/models",
    modelPath: values.get("--model-path"),
    dryRun: flags.has("--dry-run"),
    pruneOldModels: flags.has("--prune-old-models"),
  };
}

export function parseCalibrateArgs(argv: readonly string[]): CalibrateArgs {
  const { values } = readFlags(argv, ["--sample", "--model-cache", "--model-path", "--seed"], []);
  return {
    sample: positiveInt(values.get("--sample"), "--sample", 300),
    modelCache: values.get("--model-cache") ?? ".cache/models",
    modelPath: values.get("--model-path"),
    seed: positiveInt(values.get("--seed"), "--seed", 1),
  };
}
