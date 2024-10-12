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
`python db_updater.py`

## Crontab
```20 16 * * *```

