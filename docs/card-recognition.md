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
| Trying the card turned other ways | `src/utils/recognition/orientation.ts` (shared pick rule in `variants.ts`) |
| Nearest-neighbour and printing lookup SQL | `src/server/recognition/matchEmbeddings.ts` |
| tRPC `scan.status` and `scan.match` | `src/server/api/routers/scan.ts` |
| Indexer | `scripts/embed-cards.ts` (logic in `src/server/recognition/indexer.ts`) |
| Calibration report | `scripts/calibrate-embedder.ts` |
| Daily workflow | `.github/workflows/card-embeddings.yml` |
| Border and rarity colour cues (not wired in yet) | `src/utils/recognition/colourCues.ts` |
| Hands-free scan loop rules (auto add threshold, retries, capture size) | `src/utils/recognition/scanLoop.ts` |
| Lock signal (buzz, chime) and the scanner's remembered settings | `src/utils/scan/lockSignal.ts` |

`scan.match` takes the embedding, the client's model id and, when OCR read
one, the set code and collector number. It returns the closest cards (best
face of double-faced cards, with cosine similarity) and the exact printing if
the set and number match a card. It answers NOT_FOUND while the flag is off,
and BAD_REQUEST when the client's model id isn't the server's (the page is
out of date).

It can also take `alternates`: up to 3 more embeddings of the same capture
(the card turned other ways, see "Card orientation" below). The server
searches each one, returns the matches of the one whose best match is most
similar, and adds `variant` (0 for `embedding`, i for `alternates[i - 1]`)
and `variantSimilarities` (each embedding's best similarity, null if it found
nothing). Ties go to `embedding`. Without `alternates` the answer is exactly
what it always was.

## Card orientation

The browser flattens every card into a portrait crop, upright only if the
card was (`orderCorners` in `geometry.ts` can't tell up from down, and
assumes a sideways card has its top on the left). `orientation.ts` tries
turns of that crop and keeps the one the index likes best. Orientation is
the clockwise turn applied to the crop, not to the photo:

| Orientation | What it is | Tried when |
| --- | --- | --- |
| 0 | the crop as warped | always |
| 180 | the crop upside down: a card held upside down, or sideways with its top on the right | always |
| 270 | the crop turned to landscape, which is the card as the camera saw it | the card lay sideways in the photo |
| 90 | the same, upside down | the card lay sideways in the photo |

The landscape turns are for index images whose content is landscape (a
battle's front, a Planechase plane). The embedder squashes a landscape crop
into its portrait input the same way the indexer squashes a landscape
Scryfall image, so the two still compare. A battle held portrait with its
front's text running sideways isn't covered (only 0 and 180 are tried for a
portrait quad).

The result's `orientation`, `orientationsTried` and `orientedCard` (the crop
OCR read) are on `RecognitionOutcome` in `useCardRecognizer.ts` for the debug
view.

**When it runs.** Only when the upright result isn't sure. Every scan embeds
the burst upright, OCRs it and calls `scan.match` once, exactly as before. If
the ranking isn't confident *and* its best image match is under
`UPRIGHT_SURE_SIMILARITY` (0.7; reprints that share art are unconfident but
match strongly, and are clearly the right way up), the other orientations
are embedded from the sharpest frame only and sent in one call with
`alternates`. If a turned orientation wins, OCR runs again on that turn, and
if it reads a set and number, one more call looks up that printing (the
upright read was of an upside-down card, so its printing is dropped). The
name OCR is ignored when a landscape turn wins, or when the best match is a
split, aftermath, battle (front) or planar card, whose names aren't on an
M15 title bar across the top (see `trustedOcrName`).

**What it costs.** Nothing was measured on a device: there's no model file
in CI and the tests use a fake session. By reasoning, the embedder
(EfficientNet-Lite0, 320x448 input) is about 1.1 billion multiply-adds per
crop, 2.9 times its usual 224x224 cost. On ONNX Runtime web (wasm, int8)
that's roughly 40-120 ms per crop on a phone and 15-40 ms on a laptop. Turning
a crop (`rotateImage`, 330k pixels) is a few ms. Per scan:

| Case | Embeds | OCR passes | `scan.match` calls | Searches on the server |
| --- | --- | --- | --- | --- |
| Upright and sure (most scans) | 3 (the burst) | 1 | 1 | 1 |
| Not sure, card portrait | 3 + 1 | 1, or 2 if 180 wins | 2, or 3 if 180 wins and OCR reads set and number | 1 + 2 |
| Not sure, card sideways | 3 + 3 | 1, or 2 if a turn wins | 2 or 3 | 1 + 4 |

Each server search is one HNSW query plus loading the winner's cards once,
a few ms. The extra round trip (100-300 ms on a phone network) is the main
cost of the fallback. Doing every orientation on every scan would add 1-3
embeds (a third to all of the burst's embedding time again) and 2-4 searches
to every scan, to help the few that are the wrong way up, and OCR would have
to wait for the winner or run once per orientation. The risk of the gate: a
wrong-way-up card whose upright crop happens to match some card confidently
is never turned round. Wrong-way crops should score low against everything,
but that's unmeasured; if it shows up, lower the gate or always try 180.

The alternates are single frames while the upright embedding is a burst
average, which is a little steadier. That tilts close calls toward upright,
the likelier answer anyway.

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

## The scanning loop

The scanner on /scan (`src/components/scan/AiScanner.tsx`) runs hands
free; there's no Capture button.

1. The live detector looks at about 4 small frames (640 px long side) a
   second. Once the outline holds still for 800 ms, `AutoCaptureTracker`
   (`liveTracking.ts`) fires a scan: a burst of 3 frames, then the steps
   above.
2. **Sure:** `sureMatch` in `scanLoop.ts` is the auto add threshold: the
   ranking is `confident` (see "How the scanner decides") and the top pick's
   score is at least `AUTO_ADD_MIN_SCORE` (0.55, the same as
   `CONFIDENT_SIMILARITY`). `confident` is the real decision; the floor is a
   backstop that almost never bites and is there as the one knob to turn if
   real scans show confident picks that are wrong. The scanner locks onto
   the top pick: a 60 ms buzz (`navigator.vibrate`, Android only), a short
   two-note chime made with Web Audio, a green flash on the video (static
   under prefers-reduced-motion) and the card's name in big type over the
   video. With "Auto add when sure" on (the default), a signed-in user with
   a collection gets a copy added through the same `collection.addCard` as
   the Add button. Signed out, or with no collection, it locks and selects
   the card and shows the usual sign-in or pick-a-collection prompt.
3. **Not sure:** it looks again while the card sits there, up to
   `MAX_SCAN_ATTEMPTS` (3) bursts, then shows the best of those looks (top
   score) as the matches list for a manual pick, with Rescan.
4. **Next card.** After a scan the tracker waits for the card to leave
   (`missesToLeave`, 4 ticks, about a second, so an outline blip doesn't
   count) or for the outline to jump by 15% of the frame diagonal (a
   different card put down). The tracker says which (`rearmedBy`): a card
   that left and came back is another copy and is added again; a jump that
   turns out to be the same card is a nudge and adds nothing.
5. **Undo** takes the auto-added copy back out with `collection.removeCard`
   (one copy, the same call as the session tally's Undo) and shows the
   matches so the right card can be picked. **Rescan** does the same Undo
   if this lock added a copy, then scans the card in view again.
6. With no outline for 3 seconds, a small "Scan now" button scans the
   frame anyway, using the on-screen guide if nothing is found.

The chime can only play after the user has touched the page (a browser
rule), so any tap on the scanner unlocks it. The Sound and Auto add
settings are remembered in localStorage.

**Photos aren't kept.** Frames and crops live only for the scan; the lock
banner and the matches show Scryfall's image. Only the embedding and the OCR
reads go to the server. The debug view alone keeps the last flattened card
as a data URL, to show it.

**Capture size.** `captureMaxSide` picks each burst's frame size from the
live outline. Everything the models see comes from the card warped to
488x680 (`CARD_WIDTH` x `CARD_HEIGHT`): the embedder squashes that to
320x448, and OCR reads the title and the collector line off it, upscaled 2
to 3 times. So the frame only needs the card at about 680 x 1.25 = 850 px
tall; past that the warp shrinks it without filtering, which reads small
print worse, not better. Frames are scaled so the card is about that tall,
between 640 (the corner model's input) and 1280 (`CAPTURE_MAX_SIDE`, kept
for a small or distant card) on the long side. Frames are drawn from the
video at that size straight away, so no full-resolution copy is made 4
times a second.

## How the index is built

`npm run embed:cards` finds cards with no embedding for the current
`EMBED_MODEL.id`, downloads Scryfall's "normal" JPEG for each face, runs the
same preprocessing as the browser, embeds it with onnxruntime-node and
upserts 200 rows at a time. Cards with `image_status` `missing` or
`placeholder` are skipped. Double-faced cards get one row per face. Every
image is resized to the embedder's 320x448 portrait input whatever its shape;
nothing turns a landscape image first. Whether Scryfall's "normal" image of
a battle front or a plane is a landscape file or a portrait one isn't checked
here, which is why the scanner tries both portrait and landscape turns of a
sideways card. It's
safe to stop and rerun: it only picks up what's missing.

Options: `--limit N` (default 20000 cards per run), `--dry-run` (counts
only), `--model-path file.onnx` or `--model-cache dir` (default
`.cache/models`), `--prune-old-models` (delete rows from other model ids).

The workflow runs it daily at 10:17 UTC, an hour after the Scryfall sync, and
can be started by hand with a limit, a dry run or calibrate. **It does
nothing until the repo variable `AI_SCAN_INDEX_ENABLED` is `true`**
(Settings > Secrets and variables > Actions > Variables). At 20000 cards a
day, a first full index of about 120k printings takes about a week of runs.
Newest printings go first, so a partial index covers recent sets.

To try the scanner on a PR preview, run the workflow by hand with `target`
set to `preview`. That indexes the Neon preview branch PR previews use,
from the PREVIEW_DATABASE_URL secret, and works while `AI_SCAN_INDEX_ENABLED`
is off. Without that secret the run stops rather than touch production.

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
