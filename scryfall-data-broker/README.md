# Scryfall Data Broker

A service that uses Python to get the bulk data from api.scryfall.com
Right now we're only grabbing Default Cards
[go here](https://scryfall.com/docs/api/bulk-data) to see the differences


How long does it take? TBD
## How does it work?
- grab download url from scryfall
- use url to download latest data dump
- log diff between current and newest data files

Fetch Scryfall Data
`python get_bulk_data_json_file.py`

Diff old set and new set, create file that notes changes
`python card_differ.py`

Update database & log changes made
`python db_updater.py events/events_YYYY_MM_DD.json --dry-run`

- `--dry-run` prints every insert/update/skip and never connects to a database
- without it, reads `DATABASE_URL` and needs `psycopg` or `psycopg2` installed
- `--cards scryfall_downloads/default_cards_YYYY_MM_DD.json` lets nested changes
  (`image_uris`, `card_faces`, `all_parts`) be applied; without it those cards are skipped
- only the columns the Card table stores (`STORED_FIELDS` in `apply_diff.py`) and prices (to CardPrice) are written, all in one transaction, in batches (`--batch-size`, default 500)
- cards removed from Scryfall are logged and skipped, since Card has no soft-delete column

Run the tests from this folder (stdlib only; the ijson test skips without it)
`python3 -I -m unittest`

The Postgres end-to-end test runs only when `BROKER_TEST_DATABASE_URL` points at a
throwaway database with the Prisma migrations applied. It deletes every Card row.
`BROKER_TEST_DATABASE_URL=postgresql://... python -m unittest tests.test_sync_postgres`

## Scheduled sync (`sync.py`)

`.github/workflows/scryfall-sync.yml` runs this daily at 09:17 UTC against the
production database (and on demand, dry run by default).

1. `python sync.py check --state-dir state` reads `default_cards` from
   https://api.scryfall.com/bulk-data. If its `updated_at` matches the last
   successful sync, the run stops: no download, no writes.
2. `python sync.py download <download_uri> --out default_cards.json`
3. `python sync.py apply default_cards.json --state-dir state --updated-at <updated_at> [--dry-run] [--full]`
   streams the file card by card (ijson), hashes the columns the Card table
   stores, and compares with `state/hashes.json` from the last run. Prices are
   hashed on their own (`state/price_hashes.json`) and written to the small
   CardPrice table, so the daily price refresh rewrites ~200 byte price rows
   instead of whole Card rows. New and changed cards and prices are upserted
   in batches (`--batch-size`, default 500), all in one transaction; a row
   whose values already match is left alone. Changes to unstored fields
   (ranks and the like) cause no writes.
   With no saved hashes (first run, lost cache) or `--full`, every card is
   sent, but only rows that differ are rewritten. Cards removed from Scryfall
   are logged; with `--prune` they're deleted (prices too) unless a
   collection uses them.
   `state/` is only rewritten after the commit succeeds, never on `--dry-run`.

The workflow keeps `state/` (about 10 MB) in the Actions cache between runs.
If the cache is evicted, the next run sends every card, which is safe and
only rewrites rows that changed.
`db_updater.py` and the DeepDiff differ above still work for one-off diffs.

