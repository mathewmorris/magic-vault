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
- only the columns the Card table stores are written, all in one transaction, in batches (`--batch-size`, default 500)
- cards removed from Scryfall are logged and skipped, since Card has no soft-delete column

Run the tests (stdlib only) from this folder
`python3 -I -m unittest`

## Crontab
```20 16 * * *```

