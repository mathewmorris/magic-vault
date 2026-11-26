/**
 * Builds the AI scan index: one image embedding per card face, stored in
 * CardEmbedding for EMBED_MODEL.id.
 *
 *   npm run embed:cards -- [--limit 20000] [--dry-run] [--prune-old-models]
 *                          [--model-cache .cache/models | --model-path model.onnx]
 *
 * Picks up cards with no embedding yet for the current model (so it is safe
 * to run daily and to stop at any time), downloads Scryfall's "normal" JPEG,
 * preprocesses it with the same code the browser uses, runs the ONNX model
 * and upserts in batches. See docs/card-recognition.md.
 */

import { PrismaClient } from "@prisma/client";

import {
  buildPendingCardsSql,
  buildPendingCountSql,
  buildUpsert,
  chunk,
  DOWNLOAD_CONCURRENCY,
  downloadImage,
  imageJobsForCard,
  mapWithConcurrency,
  parseIndexerArgs,
  PRUNE_OTHER_MODELS_SQL,
  UPSERT_BATCH_SIZE,
  type CardImageRow,
  type EmbeddingRow,
} from "../src/server/recognition/indexer";
import { decodeJpeg, ensureModelFile, loadEmbedder } from "../src/server/recognition/nodeEmbedder";
import { EMBED_MODEL } from "../src/utils/recognition/model";

async function main() {
  const args = parseIndexerArgs(process.argv.slice(2));
  const spec = EMBED_MODEL;
  const prisma = new PrismaClient();
  const started = Date.now();

  try {
    console.log(`Model ${spec.id}`);

    if (args.pruneOldModels) {
      if (args.dryRun) {
        const [row] = await prisma.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM "CardEmbedding" WHERE "modelId" <> $1`,
          spec.id,
        );
        console.log(`Would delete ${row?.n ?? 0} embeddings from other models`);
      } else {
        const deleted = await prisma.$executeRawUnsafe(PRUNE_OTHER_MODELS_SQL, spec.id);
        console.log(`Deleted ${deleted} embeddings from other models`);
      }
    }

    const [pending] = await prisma.$queryRawUnsafe<{ cards: number }[]>(buildPendingCountSql(), spec.id);
    const rows = await prisma.$queryRawUnsafe<CardImageRow[]>(buildPendingCardsSql(args.limit), spec.id);
    const jobs = rows.flatMap(imageJobsForCard);
    console.log(
      `${pending?.cards ?? 0} cards need embeddings; this run takes ${rows.length} cards (${jobs.length} images, --limit ${args.limit})`,
    );
    if (args.dryRun || jobs.length === 0) return;

    const modelPath =
      args.modelPath ?? (await ensureModelFile({ url: spec.url, modelId: spec.id, cacheDir: args.modelCache }));
    const embedder = await loadEmbedder(modelPath);
    console.log(`Loaded ${modelPath} (input ${embedder.inputName}, output ${embedder.outputName})`);

    let written = 0;
    let failed = 0;
    try {
      for (const batch of chunk(jobs, UPSERT_BATCH_SIZE)) {
        const results = await mapWithConcurrency(batch, DOWNLOAD_CONCURRENCY, async (job): Promise<EmbeddingRow | null> => {
          try {
            const image = decodeJpeg(await downloadImage(job.url, { fetch }));
            const embedding = await embedder.embed(image, spec);
            return { cardId: job.cardId, face: job.face, embedding };
          } catch (err) {
            failed += 1;
            console.warn(`Skipped ${job.cardId} face ${job.face}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
          }
        });
        const ok = results.filter((r): r is EmbeddingRow => r !== null);
        if (ok.length > 0) {
          const { sql, params } = buildUpsert(ok, spec.id, spec.dims);
          await prisma.$executeRawUnsafe(sql, ...params);
          written += ok.length;
        }
        const minutes = (Date.now() - started) / 60000;
        console.log(
          `${written + failed}/${jobs.length} images (${written} written, ${failed} skipped, ${minutes.toFixed(1)} min)`,
        );
      }
    } finally {
      await embedder.release();
    }

    console.log(`Done: wrote ${written} embeddings, skipped ${failed}`);
    // A run where most downloads fail is a problem worth a red X, not a log line.
    if (failed > 0 && failed >= jobs.length / 2) {
      throw new Error(`${failed} of ${jobs.length} images failed`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
