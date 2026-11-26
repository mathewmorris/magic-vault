/**
 * Measures which preprocessing the card embedder actually wants.
 *
 *   npm run embed:calibrate -- [--sample 300] [--seed 1]
 *                              [--model-cache .cache/models | --model-path model.onnx]
 *
 * Takes a sample of cards with images, embeds each clean Scryfall image as
 * the gallery and a photo-like copy (corner jitter, lighting, glare, blur)
 * as the query, for every normalization in NORMALIZATIONS and both tensor
 * layouts. Prints Recall@1 and Recall@5 for each. Reads the database, writes
 * nothing. A layout the model's input shape rejects shows as n/a.
 *
 * The gallery here is a few hundred cards, so the numbers are optimistic
 * next to the full ~120k (reprints share art); use them to compare options,
 * not as the real-world hit rate.
 */

import { PrismaClient } from "@prisma/client";

import { augmentCard, seededRng } from "../src/server/recognition/augment";
import {
  DOWNLOAD_CONCURRENCY,
  downloadImage,
  imageJobsForCard,
  mapWithConcurrency,
  parseCalibrateArgs,
  SKIP_IMAGE_STATUSES,
  type CardImageRow,
} from "../src/server/recognition/indexer";
import { decodeJpeg, ensureModelFile, loadEmbedder, type InputSpec } from "../src/server/recognition/nodeEmbedder";
import { scoreRetrieval } from "../src/server/recognition/retrievalScore";
import { EMBED_MODEL, NORMALIZATIONS } from "../src/utils/recognition/model";

type Config = { name: string; layout: "NCHW" | "NHWC"; spec: InputSpec };

const configs: Config[] = Object.entries(NORMALIZATIONS).flatMap(([name, norm]) =>
  (["NCHW", "NHWC"] as const).map((layout) => ({
    name,
    layout,
    spec: { ...EMBED_MODEL, ...norm, layout },
  })),
);

const sameNumbers = (a: readonly number[], b: readonly number[]) => a.every((v, i) => v === b[i]);
const isCurrent = (config: Config) =>
  config.layout === EMBED_MODEL.layout &&
  sameNumbers(config.spec.mean, EMBED_MODEL.mean) &&
  sameNumbers(config.spec.std, EMBED_MODEL.std);

async function main() {
  const args = parseCalibrateArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const skip = SKIP_IMAGE_STATUSES.map((s) => `'${s}'`).join(", ");
    const cards = await prisma.$queryRawUnsafe<CardImageRow[]>(
      `SELECT "id", "image_status", "image_uris", "card_faces" FROM "Card"
       WHERE "image_status" NOT IN (${skip}) AND "image_uris"->>'normal' IS NOT NULL
       ORDER BY md5("id" || $1) LIMIT ${args.sample}`,
      String(args.seed),
    );
    const jobs = cards.flatMap(imageJobsForCard);
    console.log(`Sampled ${jobs.length} cards (seed ${args.seed})`);

    const downloads = await mapWithConcurrency(jobs, DOWNLOAD_CONCURRENCY, async (job) => {
      try {
        return { job, bytes: await downloadImage(job.url, { fetch }) };
      } catch (err) {
        console.warn(`Skipped ${job.cardId}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    });
    const images = downloads.filter((d): d is NonNullable<typeof d> => d !== null);
    if (images.length < 2) throw new Error("Not enough images to calibrate with");

    const modelPath =
      args.modelPath ??
      (await ensureModelFile({ url: EMBED_MODEL.url, modelId: EMBED_MODEL.id, cacheDir: args.modelCache }));
    const embedder = await loadEmbedder(modelPath);

    const gallery = configs.map(() => [] as number[][]);
    const queries = configs.map(() => [] as number[][]);
    const unusable = new Map<number, string>();

    try {
      for (const [n, { job, bytes }] of images.entries()) {
        const clean = decodeJpeg(bytes);
        // Same damage for every config, so they're compared on equal terms.
        const photo = augmentCard(clean, seededRng(args.seed * 100003 + n));
        for (const [c, config] of configs.entries()) {
          if (unusable.has(c)) continue;
          try {
            gallery[c]!.push(await embedder.embed(clean, config.spec));
            queries[c]!.push(await embedder.embed(photo, config.spec));
          } catch (err) {
            unusable.set(c, err instanceof Error ? err.message.split("\n")[0]! : String(err));
          }
        }
        if ((n + 1) % 50 === 0) console.log(`embedded ${n + 1}/${images.length} (${job.cardId})`);
      }
    } finally {
      await embedder.release();
    }

    const header = ["normalization", "layout", "recall@1", "recall@5", "true sim", "best other"];
    const lines = [header];
    for (const [c, config] of configs.entries()) {
      const label = `${config.name}${isCurrent(config) ? " *" : ""}`;
      const reason = unusable.get(c);
      if (reason !== undefined) {
        lines.push([label, config.layout, "n/a", "n/a", "", ""]);
        continue;
      }
      const score = scoreRetrieval(queries[c]!, gallery[c]!);
      lines.push([
        label,
        config.layout,
        score.recallAt1.toFixed(3),
        score.recallAt5.toFixed(3),
        score.medianTrueSimilarity.toFixed(3),
        score.medianBestOtherSimilarity.toFixed(3),
      ]);
    }

    const widths = header.map((_, i) => Math.max(...lines.map((line) => line[i]!.length)));
    console.log("");
    for (const line of lines) console.log(line.map((cell, i) => cell.padEnd(widths[i]!)).join("  "));
    console.log(`\n* = current EMBED_MODEL settings. ${images.length} cards; sims are medians.`);
    for (const [c, reason] of unusable) {
      console.log(`${configs[c]!.name} ${configs[c]!.layout} n/a: ${reason}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
