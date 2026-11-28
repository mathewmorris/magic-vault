# Card recognition (AI scan)

AI scan identifies a card from a camera photo. The browser finds the card,
flattens it and turns it into a 256-number "embedding" with a small image
model. The server compares that embedding with embeddings of every card
image it has indexed and returns the closest cards. It's behind the
`aiScan` feature flag (`NEXT_PUBLIC_FEATURE_AI_SCAN`, see
`src/utils/featureFlags.ts`).

A second flag, `aiScanDebug` (`NEXT_PUBLIC_FEATURE_AI_SCAN_DEBUG`), turns on
the scanner's debug view: the detector's raw corners labeled TL/TR/BR/BL, which
detector found them (pose, opencv or guide) and its score, live over the
camera, plus a panel after each capture with the flattened card, OCR output
and top server matches. Both flags are read at build time.

The model files load from Hugging Face, pinned to a commit
(`EMBED_REVISION` and `POSE_REVISION` in `model.ts`). The ONNX Runtime wasm
loads from jsDelivr. Both can be self-hosted later; the model URLs can be
overridden with `NEXT_PUBLIC_SCAN_EMBED_MODEL_URL` and
`NEXT_PUBLIC_SCAN_POSE_MODEL_URL`. OpenCV is the fallback detector and only
loads if the pose model fails.

This page covers the server side.

## Pieces

| What | Where |
| --- | --- |
| Model spec (URL, input size, normalization, id) | `src/utils/recognition/model.ts` |
| Image to model input, shared by browser and indexer | `src/utils/recognition/preprocess.ts` |
| `CardEmbedding` table (pgvector `halfvec(256)`, HNSW index) | `prisma/schema.prisma`, migration `20261126060000_add_card_embeddings` |
| Nearest-neighbour and printing lookup SQL | `src/server/recognition/matchEmbeddings.ts` |
| tRPC `scan.status` and `scan.match` | `src/server/api/routers/scan.ts` |
| Indexer | `scripts/embed-cards.ts` (logic in `src/server/recognition/indexer.ts`) |
| Calibration report | `scripts/calibrate-embedder.ts` |
| Daily workflow | `.github/workflows/card-embeddings.yml` |
| Border and rarity colour cues (not wired in yet) | `src/utils/recognition/colourCues.ts` |

`scan.match` takes the embedding, the client's model id and, when OCR read
one, the set code and collector number. It returns the closest cards (best
face of double-faced cards, with cosine similarity) and the exact printing if
the set and number match a card. It answers NOT_FOUND while the flag is off,
and BAD_REQUEST when the client's model id isn't the server's (the page is
out of date).

## How the index is built

`npm run embed:cards` finds cards with no embedding for the current
`EMBED_MODEL.id`, downloads Scryfall's "normal" JPEG for each face, runs the
same preprocessing as the browser, embeds it with onnxruntime-node and
upserts 200 rows at a time. Cards with `image_status` `missing` or
`placeholder` are skipped. Double-faced cards get one row per face. It's
safe to stop and rerun: it only picks up what's missing.

Options: `--limit N` (default 20000 cards per run), `--dry-run` (counts
only), `--model-path file.onnx` or `--model-cache dir` (default
`.cache/models`), `--prune-old-models` (delete rows from other model ids).

The workflow runs it daily at 10:17 UTC, an hour after the Scryfall sync, and
can be started by hand with a limit, a dry run or calibrate. **It does
nothing until the repo variable `AI_SCAN_INDEX_ENABLED` is `true`**
(Settings > Secrets and variables > Actions > Variables). At 20000 cards a
day, a first full index of about 120k printings takes about a week of runs.

## Storage

Each vector is about 0.5 KB (256 half-precision floats), a bit more per row
with its keys. For about 120k printings that's roughly 80 MB of table plus a
similar amount for the HNSW index (it keeps its own copy of each vector), so
120-200 MB all in. The database is about 323 MB today, so it
fits in Neon's 1 GB free tier with room to spare. While two model ids are
stored at once (after a bump, until `--prune-old-models`), it's double.

## Databases

The migration runs `CREATE EXTENSION IF NOT EXISTS vector`. Neon has
pgvector built in. Local (`compose.yaml`), the homelab
(`compose.homelab.yaml`) and CI use the `pgvector/pgvector:pg16` image.

Prisma can't describe the HNSW index, so it lives only in the migration. If
a later `prisma migrate dev` generates `DROP INDEX
"CardEmbedding_embedding_hnsw_idx"`, delete that line from the new
migration.

## Calibrating

The model card doesn't say which input normalization the embedder was
trained with. `npm run embed:calibrate -- --sample 300` (or the workflow with
`calibrate` ticked) embeds a sample of clean Scryfall images as the gallery
and photo-like copies (slightly off crop, lighting change, glare spot, mild
blur) as queries, for every option in `NORMALIZATIONS` and both tensor
layouts, and prints Recall@1 and Recall@5 for each. It writes nothing. With a
few hundred cards the numbers are optimistic next to the full index, so use
them to compare options, not as the real hit rate.

## When to bump `EMBED_MODEL.id`

Bump it whenever the vectors would change: a different model file
(including moving `EMBED_REVISION` to a commit with new weights), a
different normalization or layout, different input size, or a change to
`preprocess.ts` that changes pixels. The id is stored on every row, so the
indexer then builds a fresh set and the server only matches the new one.
Clients with the old id get BAD_REQUEST until they reload. Matching quality
drops while the new index fills in, so start the workflow by hand with a
high limit, and run with `--prune-old-models` once it's done to free the old
rows.

## Colour cues

Reprints often share art, so the embedding can't tell them apart. Two
things a person looks at can: the border and the set symbol's colour.
`src/utils/recognition/colourCues.ts` reads both off the flattened card.
They're pure functions on RGBA bytes and aren't used by the scan pipeline
or `fuse.ts` yet.

Each returns `{ value, quality }` or null. Quality (0 to 1) says how far to
trust the reading and drops with glare (blown highlights), a strip or
symbol that isn't one clean colour, a dark image and a blurry one. Null
means "can't tell", not "doesn't match": use it as no evidence.

| Cue | Reads | Compare with | Good for |
| --- | --- | --- | --- |
| `sampleBorder` | thin strips just inside all four edges | `border_color` | white-bordered core set and early reprints (Unlimited, Revised, 4th to 9th Edition) against the black-bordered originals; silver (Un-sets) and gold (World Championship decks) borders; borderless printings |
| `sampleRarityColour` | the set symbol at the right end of the type line | `rarity` | reprints at different rarities (a common in one set, an uncommon or rare in another) |

Both scale colours by the card's brightest 2% first (white balance), so a
warm lamp doesn't turn a white border or a silver symbol gold.

`scan.match` now returns `border_color`, `frame`, `frame_effects`,
`promo_types` and `finishes` with each card so the client can compare.

Known failure modes:

- **Foil glare and sleeves.** Fully blown pixels are left out and lower the
  quality, but a glossy sleeve or foil also adds broad highlights that
  aren't fully blown. Those can wash a gold symbol out to silver or break
  up a border so it reads borderless.
- **Rarity on old cards.** Pre-Exodus cards print every symbol black, and
  pre-2003 frames (`frame` "1993" and "1997") put the symbol elsewhere.
  Only use the rarity cue for candidates whose `frame` is "2003" or later.
  Special rarities (timeshifted purple, bonus) give null.
- **Borderless art that's dark at every edge** reads as a black border.
- **A loose crop** (the warp includes some table past the card's edge) can
  make a bordered card look borderless.
- The thresholds and the set symbol region were set from the frame's
  printed proportions and typical printed colours on synthetic images, not
  calibrated on real photos or Scryfall images yet. Check them against real
  scans before giving these cues much weight.

The new Card columns (`border_color`, `frame`, `frame_effects`,
`promo_types`, `security_stamp`, `illustration_id`) are filled by every
writer: the daily sync, the search fallback cache and the seed. The sync
hashes the stored columns of each card to find changes, so the first sync
after migration `20261128080000_add_card_printing_look` sees every card as
changed and rewrites each row once. That's expected; after that only real
changes are written. Until that sync runs, existing rows have null
`border_color` and `frame` and empty lists, so treat those as unknown.
