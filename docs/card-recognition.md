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
camera, plus a panel after each capture with the flattened card, OCR output,
top server matches, and for the top three candidates every signal the fuser
weighed (agreement, quality, detail) and the suggested finish. Both flags are
read at build time.

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

`scan.match` takes the embedding, the client's model id and, when OCR read
one, the set code and collector number. It returns the closest cards (best
face of double-faced cards, with cosine similarity) and the exact printing if
the set and number match a card. It answers NOT_FOUND while the flag is off,
and BAD_REQUEST when the client's model id isn't the server's (the page is
out of date).

## How the scanner decides

`rankRecognition` in `src/utils/recognition/fuse.ts` judges a card the way a
person would: several independent cues, each with its own confidence. Every
candidate printing gets a `signals` list with one entry per cue that was read,
each with an `agreement` (-1 contradicts, 1 agrees) and a `quality` (0..1, how
readable the cue was):

| Signal | From | Compared with |
| --- | --- | --- |
| image | embedding similarity from `scan.match` | (the match itself) |
| name | title OCR, quality from tesseract's confidence when given | card and face names |
| collector | set code and number OCR | `set`, `collector_number` |
| rarity | rarity letter on the collector line, set symbol colour | `rarity` |
| border | border colour | `border_color` |
| foil | star (foil) or dot (non-foil) between set code and language | `finishes` |

A cue that wasn't read, or a card field that's missing, is no evidence, never
negative evidence. Pre-2015 cards have no collector line, so they're judged on
image, name and the colour cues.

The ranking score is the image similarity plus bonuses for the name and the
collector line (unchanged from before), plus small bonuses for agreeing
rarity, border and foil cues and small penalties when one of those clearly
contradicts (quality 0.6 or more). They're sized to separate two printings
with the same art, not to overrule a clear image match.

The result is **confident** when nothing with quality 0.6 or more contradicts
the top pick, and either it leads the runner-up by `CONFIDENT_MARGIN` and at
least two of image, name and collector agree with it at good quality, or it's
the exact printing the collector line names and its name agrees. Rarity,
border and foil never count toward the two (they only narrow things down a
little), but any of them can veto. A strong image match alone isn't enough.

Each candidate also gets a `suggestedFinish`: the printing's only finish if it
has one, else what the foil mark says if the printing comes in that finish,
else non-foil with low confidence. The foil mark is read conservatively: only
a real star glyph is "foil", only a real dot is "non-foil", and `*` (how both
often come out of OCR) is unknown.

All the weights are first guesses, exported from `fuse.ts`; the tests pin who
wins, not exact numbers.

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
